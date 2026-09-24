import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { esRolOperativo } from '../../../../core/auth/roles';
import { ToastService } from '../../../../core/toast/toast.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { telefonoParaEscribir } from '../../../../shared/models/telefono';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
import { Cliente } from '../../../clientes/cliente.model';
import { ClientesService } from '../../../clientes/clientes.service';
import { PlantillaResumen } from '../../conversacion.model';
import { ConversacionesService } from '../../conversaciones.service';
import { faltaParaEnviar } from '../../plantillas';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { EnvioPlantillaComponent } from '../envio-plantilla/envio-plantilla.component';

/** A quién se le escribe: una ficha de la base o un número tecleado. */
type Destino =
  | { readonly tipo: 'PACIENTE'; readonly cliente: Pick<Cliente, 'id' | 'nombre' | 'telefono' | 'pac'> }
  | { readonly tipo: 'NUMERO'; readonly telefono: string };

/**
 * «Nuevo chat»: escribirle primero a una paciente o a un número nuevo, desde
 * la línea que se elija.
 *
 * El primer mensaje es SIEMPRE una plantilla aprobada: sin un mensaje de la
 * paciente no hay ventana de 24 h y Meta no entrega texto libre. Por eso el
 * cajón pide las tres cosas a la vez —línea, destino, plantilla— y un solo
 * botón las manda juntas: el servidor no crea ficha ni chat si algo falla, y
 * no quedan conversaciones vacías en la bandeja.
 *
 * Recepción y asistencia no tienen acceso a las fichas comerciales, así que
 * solo escriben el número; el servidor lo cruza con la ficha si ya existe.
 */
@Component({
  selector: 'app-nuevo-chat',
  imports: [
    AvatarComponent,
    ButtonComponent,
    DrawerComponent,
    EnvioPlantillaComponent,
    IconComponent,
    InicialesClientePipe,
    InputComponent,
    LoadingSkeletonComponent,
    NombreClientePipe,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nuevo-chat.component.html',
  styleUrl: './nuevo-chat.component.css',
})
export class NuevoChatComponent {
  private readonly state = inject(ConversacionesStateService);
  private readonly conversaciones = inject(ConversacionesService);
  private readonly clientes = inject(ClientesService);
  private readonly toast = inject(ToastService);

  /** Llega puesto cuando se vino desde la ficha de una paciente que aún no tiene chat. */
  readonly telefonoInicial = input<string | null>(null);

  readonly cerrar = output<void>();
  readonly iniciado = output<string>();

  /** Recepción y asistencia no buscan fichas: solo escriben el número. */
  protected readonly buscaPacientes = !esRolOperativo(inject(AuthService).user()?.rol);

  /** Solo las líneas desde las que de verdad se puede escribir. */
  protected readonly lineas = computed(() =>
    this.state.lineas.value().datos.filter(l => l.activa && l.conectada),
  );
  protected readonly lineaId = signal<string>('');
  protected readonly lineaElegida = computed(() => this.lineas().find(l => l.id === this.lineaId()) ?? null);

  protected readonly texto = signal('');
  private readonly termino = signal('');
  protected readonly destino = signal<Destino | null>(null);
  protected readonly nombreNuevo = signal('');

  protected readonly plantilla = signal<PlantillaResumen | null>(null);
  protected readonly valores = signal<readonly string[]>([]);
  private readonly refrescarPlantillas = signal(false);
  protected readonly enviando = signal(false);
  /** Una intención de envío por cajón: un doble clic no manda dos plantillas. */
  private readonly clave = crypto.randomUUID();

  protected readonly telefonoTecleado = computed(() => telefonoParaEscribir(this.texto()));

  protected readonly resultados = httpResource<RespuestaPaginada<Cliente>>(
    () => {
      const t = this.termino();
      return this.buscaPacientes && t.length >= 2 ? this.clientes.buscarRequest(t) : undefined;
    },
    { defaultValue: paginaVacia<Cliente>() },
  );
  protected readonly coincidencias = computed(() => this.resultados.value().datos.slice(0, 5));

  protected readonly plantillas = httpResource<PlantillaResumen[]>(
    () => {
      const id = this.lineaId();
      return id ? this.conversaciones.plantillasRequest(id, this.refrescarPlantillas()) : undefined;
    },
    { defaultValue: [] },
  );

  /** Lo primero que falta, dicho en una línea encima del botón. */
  protected readonly falta = computed(() => {
    if (!this.lineaElegida()) return 'Elige desde qué línea escribir.';
    if (!this.destino()) return this.buscaPacientes ? 'Elige una paciente o escribe un número.' : 'Escribe el número de WhatsApp.';
    const p = this.plantilla();
    if (!p) return 'Elige la plantilla del primer mensaje.';
    return faltaParaEnviar(p, this.valores());
  });

  /* Cada paso se marca con ✓ en cuanto está resuelto; el tercero, solo cuando
     la plantilla elegida ya se puede enviar (variables completas). */
  protected readonly pasoLineaHecho = computed(() => !!this.lineaElegida());
  protected readonly pasoDestinoHecho = computed(() => !!this.destino());
  protected readonly pasoMensajeHecho = computed(() => {
    const p = this.plantilla();
    return !!p && !faltaParaEnviar(p, this.valores());
  });

  constructor() {
    effect(() => {
      const telefono = this.telefonoInicial();
      if (telefono) untracked(() => this.elegirNumero(telefono));
    });

    /* Con una sola línea no hay nada que elegir. */
    effect(() => {
      const disponibles = this.lineas();
      if (!this.lineaId() && disponibles.length === 1) this.lineaId.set(disponibles[0]!.id);
    });

    /* Buscar mientras escribe, sin una petición por tecla. */
    effect(onCleanup => {
      const valor = this.texto().trim();
      const espera = setTimeout(() => this.termino.set(valor), 300);
      onCleanup(() => clearTimeout(espera));
    });
  }

  protected cambiarLinea(id: string): void {
    this.lineaId.set(id);
    /* Las plantillas son de cada WABA: lo elegido en otra línea no vale aquí. */
    this.plantilla.set(null);
    this.valores.set([]);
    this.refrescarPlantillas.set(false);
  }

  protected elegirPaciente(cliente: Cliente): void {
    this.destino.set({ tipo: 'PACIENTE', cliente });
  }

  protected elegirNumero(telefono: string): void {
    this.destino.set({ tipo: 'NUMERO', telefono });
  }

  protected cambiarDestino(): void {
    this.destino.set(null);
    this.nombreNuevo.set('');
  }

  protected actualizarPlantillas(): void {
    if (this.refrescarPlantillas()) this.plantillas.reload();
    else this.refrescarPlantillas.set(true);
  }

  protected async enviar(): Promise<void> {
    const linea = this.lineaElegida();
    const destino = this.destino();
    const p = this.plantilla();
    if (!linea || !destino || !p || this.falta() || this.enviando()) return;

    this.enviando.set(true);
    try {
      const { conversacionId } = await this.conversaciones.iniciarConversacion({
        lineaId: linea.id,
        ...(destino.tipo === 'PACIENTE'
          ? { clienteId: destino.cliente.id }
          : { telefono: destino.telefono, ...(this.nombreNuevo().trim() ? { nombre: this.nombreNuevo().trim() } : {}) }),
        plantilla: p.nombre,
        idioma: p.idioma,
        parametros: this.valores(),
        clientMessageId: this.clave,
      });
      this.toast.success(`Mensaje enviado desde ${linea.nombre}.`);
      this.iniciado.emit(conversacionId);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el mensaje.'));
    } finally {
      this.enviando.set(false);
    }
  }
}
