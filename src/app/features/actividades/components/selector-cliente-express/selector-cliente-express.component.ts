import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';

import { AuthService } from '../../../../core/auth/auth.service';
import { ActividadesService } from '../../actividades.service';
import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { ClientesService } from '../../../clientes/clientes.service';
import { Lead, ORIGEN_LABEL } from '../../../leads/lead.model';
import { LeadsService } from '../../../leads/leads.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';

/** Lo mínimo del paciente que hace falta mostrar y mandar. */
export interface ClienteMinimo {
  id: string;
  nombre: string;
  telefono: string;
  pac?: string | null;
}

/** Lo que este componente decide: a quién, y con qué lead del pipeline. */
export interface SeleccionPaciente {
  cliente: ClienteMinimo;
  leadId: string | null;
}

/**
 * El desenlace de `resolverSeleccion()`.
 *
 * Discriminado y sin mensajes dentro a propósito: los dos caminos que llaman a
 * esto los redactan distinto —y eso es producto, no descuido—, así que aquí se
 * dice QUÉ pasó y cada uno decide cómo contarlo.
 */
export type ResolucionSeleccion =
  | { ok: true; seleccion: SeleccionPaciente }
  | { ok: false; motivo: 'SIN_PACIENTE' }
  | { ok: false; motivo: 'NOMBRE_CORTO' }
  | { ok: false; motivo: 'TELEFONO_INVALIDO' }
  | { ok: false; motivo: 'FALLO_ALTA'; error: unknown };

/**
 * Elegir paciente —y su lead— o darlo de alta sin salir del formulario.
 *
 * Es dueño de toda la interacción: la búsqueda, los resultados, el paciente
 * elegido, los leads y el alta express con sus campos. Quien lo usa recibe el
 * resultado por `seleccionCambiada` y no guarda copia de nada más.
 *
 * **Lo que NO sabe:** que existen actividades. No las crea, ni las edita, ni
 * las completa; no conoce A2, ni la repetición, ni el agente, ni el cajón que
 * lo contiene. Devuelve a quién se le agenda algo, y ya.
 *
 * Vive en `features/actividades/` a propósito. Hoy lo consume un solo sitio, y
 * mudarlo a `shared/` antes de tener una segunda reutilización demostrada sería
 * decidir su forma sin conocer al segundo consumidor. El chat tiene un flujo
 * parecido («Actividad Rápida»); si algún día se le conecta, ese será el
 * momento de moverlo.
 */
@Component({
  selector: 'app-selector-cliente-express',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarComponent,
    ButtonComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    InicialesClientePipe,
    NombreClientePipe,
  ],
  templateUrl: './selector-cliente-express.component.html',
})
export class SelectorClienteExpressComponent {
  private readonly auth = inject(AuthService);
  protected readonly esRecepcion = computed(() => this.auth.user()?.rol === 'RECEPCION');
  private readonly actividadesService = inject(ActividadesService);
  private readonly clientesService = inject(ClientesService);
  private readonly leadsService = inject(LeadsService);
  private readonly toast = inject(ToastService);

  /** Con qué empieza. Al editar, el paciente y el lead que ya tenía. */
  readonly seleccionInicial = input<SeleccionPaciente | null>(null);

  /**
   * Si el paciente puede cambiarse.
   *
   * `false` al editar una actividad, donde el paciente es fijo: es UNA regla,
   * no dos. Gobierna a la vez el atajo «Registrar nuevo contacto» y la cruz de
   * «Cambiar cliente», que es exactamente lo que el formulario ocultaba —los
   * dos— cuando `actividadEditando()` tenía valor.
   */
  readonly permiteCambiarPaciente = input(true);

  readonly seleccionCambiada = output<SeleccionPaciente | null>();

  protected readonly origenLabel = ORIGEN_LABEL;

  protected readonly busquedaCliente = signal('');
  protected readonly clienteElegido = signal<ClienteMinimo | null>(null);
  protected readonly leadId = signal<string | null>(null);

  protected readonly modoNuevoCliente = signal(false);
  protected readonly nuevoClienteNombre = signal('');
  protected readonly nuevoClienteTelefono = signal('');
  protected readonly creandoCliente = signal(false);
  protected readonly errorNuevoCliente = signal('');

  /**
   * Búsqueda de cliente: solo consulta con 2+ caracteres.
   *
   * `GET /clientes` responde **paginado** (`{ datos, total, … }`), no un array.
   * Estuvo declarado como `Cliente[]`, así que `.value().length` era
   * `undefined`, `undefined > 0` daba `false` y la lista de sugerencias no se
   * pintaba NUNCA: parecía que el buscador no encontraba a nadie cuando el
   * backend sí devolvía resultados —busca por nombre, teléfono, email, CI y
   * PAC—.
   *
   * Funcionó hasta `f45894e`, que quitó un `httpResource<any>` (bien) y de paso
   * se llevó el `computed` que desenvolvía `.datos` (mal). TypeScript no lo ve:
   * el parámetro de tipo de `httpResource` es una afirmación sobre el JSON, no
   * una comprobación. Por eso el tipo ahora dice la verdad y el desenvuelto es
   * explícito.
   */
  protected readonly resultadosCliente = httpResource<RespuestaPaginada<ClienteMinimo>>(
    () => {
      const termino = this.busquedaCliente().trim();
      if (termino.length < 2 || this.clienteElegido()) return undefined;
      return this.esRecepcion()
        ? this.actividadesService.pacientesRequest(termino)
        : this.clientesService.buscarRequest(termino);
    },
    { defaultValue: paginaVacia<ClienteMinimo>() },
  );

  /** Los clientes encontrados, ya desenvueltos de la página. */
  protected readonly clientesEncontrados = computed(() => this.resultadosCliente.value().datos);


  protected readonly leadsDelCliente = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const cliente = this.clienteElegido();
      return cliente && !this.esRecepcion() ? this.leadsService.listarRequest({ clienteId: cliente.id, pagina: 1, limite: 10 }) : undefined;
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  /** «Abierto» es NUEVO o CONTACTADO: la regla de siempre, sin tocar. */
  protected readonly leadsAbiertosDelCliente = computed(() =>
    this.leadsDelCliente.value().datos.filter(l => l.estado === 'NUEVO' || l.estado === 'CONTACTADO'),
  );

  constructor() {
    effect(() => {
      const inicial = this.seleccionInicial();
      untracked(() => this.sembrar(inicial));
    });
  }

  private sembrar(inicial: SeleccionPaciente | null): void {
    this.modoNuevoCliente.set(false);
    this.nuevoClienteNombre.set('');
    this.nuevoClienteTelefono.set('');
    this.creandoCliente.set(false);
    this.errorNuevoCliente.set('');
    if (inicial) {
      this.clienteElegido.set(inicial.cliente);
      this.busquedaCliente.set(inicial.cliente.nombre);
      this.leadId.set(inicial.leadId);
    } else {
      this.clienteElegido.set(null);
      this.busquedaCliente.set('');
      this.leadId.set(null);
    }
    this.avisar();
  }

  private avisar(): void {
    const cliente = this.clienteElegido();
    this.seleccionCambiada.emit(cliente ? { cliente, leadId: this.leadId() } : null);
  }

  protected elegirCliente(cliente: ClienteMinimo): void {
    this.clienteElegido.set(cliente);
    this.busquedaCliente.set(cliente.nombre);
    /* Cambiar de paciente suelta su lead: el del anterior no es suyo. */
    this.leadId.set(null);
    this.modoNuevoCliente.set(false);
    this.avisar();
  }

  protected limpiarCliente(): void {
    this.clienteElegido.set(null);
    this.busquedaCliente.set('');
    this.leadId.set(null);
    this.modoNuevoCliente.set(false);
    this.errorNuevoCliente.set('');
    this.avisar();
  }

  protected elegirLead(id: string | null): void {
    this.leadId.set(id);
    this.avisar();
  }

  protected activarModoNuevoCliente(valorInicial?: string): void {
    this.modoNuevoCliente.set(true);
    this.errorNuevoCliente.set('');
    const texto = (valorInicial ?? this.busquedaCliente()).trim();
    const soloDigitos = texto.replace(/\D/g, '');
    if (soloDigitos.length >= 7) {
      this.nuevoClienteTelefono.set(texto);
      this.nuevoClienteNombre.set('');
    } else {
      this.nuevoClienteNombre.set(texto);
      this.nuevoClienteTelefono.set('');
    }
  }

  protected cancelarModoNuevoCliente(): void {
    this.modoNuevoCliente.set(false);
    this.errorNuevoCliente.set('');
  }

  private normalizarTelefono(valor: string): string | null {
    const limpio = valor.replace(/[^\d+]/g, '');
    if (/^\+\d{9,13}$/.test(limpio)) {
      return limpio;
    }
    if (/^\d{8}$/.test(limpio)) {
      return `+591${limpio}`;
    }
    return null;
  }

  /**
   * La mecánica del alta express, una sola vez.
   *
   * Normalizar, validar, pedir y dejar seleccionado al paciente creado era lo
   * mismo en los dos caminos que existían —el botón «Registrar» y el atajo de
   * guardar sin pulsarlo—; lo que cambia entre ellos es CÓMO se cuenta, y eso
   * sigue siendo de cada uno. Por eso aquí no hay ni un mensaje.
   */
  private async altaExpress(): Promise<ResolucionSeleccion> {
    const nombre = this.nuevoClienteNombre().trim();
    if (nombre.length < 2) return { ok: false, motivo: 'NOMBRE_CORTO' };

    const telefono = this.normalizarTelefono(this.nuevoClienteTelefono());
    if (!telefono) return { ok: false, motivo: 'TELEFONO_INVALIDO' };

    this.creandoCliente.set(true);
    try {
      const nuevo = await this.clientesService.crear({ nombre, telefono });
      const cliente = { id: nuevo.id, nombre: nuevo.nombre, telefono: nuevo.telefono };
      this.elegirCliente(cliente);
      return { ok: true, seleccion: { cliente, leadId: this.leadId() } };
    } catch (error: unknown) {
      return { ok: false, motivo: 'FALLO_ALTA', error };
    } finally {
      this.creandoCliente.set(false);
    }
  }

  /** Camino 1: el botón «Registrar». Avisa por campo y celebra con un toast. */
  protected async registrarNuevoClienteExpress(): Promise<void> {
    this.errorNuevoCliente.set('');
    const resultado = await this.altaExpress();

    if (resultado.ok) {
      this.toast.show(`Paciente "${resultado.seleccion.cliente.nombre}" registrado.`, 'success');
      this.modoNuevoCliente.set(false);
      return;
    }
    if (resultado.motivo === 'NOMBRE_CORTO') {
      this.errorNuevoCliente.set('El nombre requiere al menos 2 caracteres.');
      return;
    }
    if (resultado.motivo === 'TELEFONO_INVALIDO') {
      this.errorNuevoCliente.set('Ingresa un celular válido (8 dígitos locales o formato +591…).');
      return;
    }
    if (resultado.motivo === 'FALLO_ALTA') {
      this.errorNuevoCliente.set(mensajeDeError(resultado.error, 'No se pudo registrar el contacto.'));
    }
  }

  /**
   * Camino 2: quien va a guardar pide la selección definitiva.
   *
   * Es un método y no un output porque solo este componente puede terminar un
   * alta express a medias: los campos son suyos. Quien guarda no puede saber si
   * hay un paciente escrito y sin registrar — solo puede preguntar.
   */
  async resolverSeleccion(): Promise<ResolucionSeleccion> {
    const cliente = this.clienteElegido();
    if (cliente) return { ok: true, seleccion: { cliente, leadId: this.leadId() } };
    if (!this.modoNuevoCliente()) return { ok: false, motivo: 'SIN_PACIENTE' };
    return this.altaExpress();
  }
}
