import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { etiquetasDe, textoExtra, textoExtraOpcional } from '../../core/api/datos-extra';
import { cambiosDeFicha, valoresDeFicha } from './ficha-paciente';
import { edadDePaciente } from '../../core/api/edad';
import { mensajeDeError } from '../../core/api/http-error';
import { enlaceAlChat } from '../conversaciones/enlace-chat';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import {
  DireccionOrden,
  ThOrdenableComponent,
} from '../../shared/components/table/th-ordenable.component';
import { ToastService } from '../../core/toast/toast.service';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICONO,
  CATEGORIA_LABEL,
  CategoriaCliente,
  EstadoCategoria,
  origenDeCategoria,
} from '../../shared/models/cliente-categoria.model';
import { CategoriaPacienteComponent } from './components/categoria-paciente.component';
import { Cliente, PaginaClientes, paginaClientesVacia } from './cliente.model';
import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { ClientesService, OrdenCliente } from './clientes.service';
import { ConversacionesService } from '../conversaciones/conversaciones.service';
import { AgenteResumen } from '../../shared/models/agente';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { OverlayRef } from '@angular/cdk/overlay';
import { TemplateRef, ViewContainerRef } from '@angular/core';
import { AVISO_TELEFONO_INVALIDO, telefonoParaEscribir } from '../../shared/models/telefono';
import { Router, RouterLink } from '@angular/router';
import { InicialesClientePipe, NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { SelectComponent } from '../../shared/components/select/select.component';
import { valorOVacio } from '../../core/api/valor-o-vacio';

type FiltroCategoria = CategoriaCliente | 'TODOS';
type PestanaModal = 'EXPEDIENTE' | 'CONTACTO' | 'NOTAS';

/**
 * Clientes — listado real desde GET /clientes (RF-01/RF-03/RF-24).
 * El backend ya aplica visibilidad por rol: un agente ve sus clientes + pool sin asignar.
 */
@Component({
  selector: 'app-clientes',
  imports: [
    SelectComponent,
    InicialesClientePipe,
    NombreClientePipe,
    PageHeaderComponent,
    InputComponent,
    FilterChipComponent,
    TableComponent,
    ThOrdenableComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    CategoriaPacienteComponent,
    DrawerComponent,
    IconComponent,
    KpiCardComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    DatePipe,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clientes.page.html',
})
export class ClientesPage {
  private readonly clientesService = inject(ClientesService);
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);

  private activeOverlayRef?: OverlayRef;

  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcono = CATEGORIA_ICONO;
  protected readonly origenDeCategoria = origenDeCategoria;

  /* Un contacto que llegó por WhatsApp sin dar su nombre se guarda como
     "WhatsApp +591…", que no es un nombre. Ver `shared/models/nombre-cliente`. */
  protected sinNombre(cliente: Cliente): boolean {
    return esNombreProvisional(cliente.nombre);
  }

  /** Las tres pestañas de la ficha, en una tabla en vez de tres bloques iguales. */
  protected readonly pestanasFicha: readonly {
    id: PestanaModal;
    etiqueta: string;
    icono: IconName;
  }[] = [
    { id: 'EXPEDIENTE', etiqueta: 'Expediente Clínico', icono: 'file-text' },
    { id: 'CONTACTO', etiqueta: 'Datos de Contacto', icono: 'user' },
    { id: 'NOTAS', etiqueta: 'Perfil & Notas', icono: 'edit' },
  ];

  protected readonly busqueda = signal('');
  protected readonly filtro = signal<FiltroCategoria>('TODOS');

  /* Búsqueda con debounce de 300ms para no disparar una petición por tecla */
  private readonly busquedaAplicada = signal('');

  protected readonly filtros: readonly FiltroCategoria[] = [
    'TODOS',
    'GOLD',
    'SILVER',
    'BRONZE',
    'PROSPECTO',
  ];

  protected readonly pagina = signal(1);

  /* Sin orden explícito manda el del servidor (lo recién tocado primero), que
     es lo que quiere ver un agente al abrir la vista. */
  protected readonly orden = signal<OrdenCliente | undefined>(undefined);
  protected readonly direccion = signal<DireccionOrden>('asc');

  /* Lista de agentes / administradores para asignación */
  protected readonly agentes = httpResource<AgenteResumen[]>(
    () => this.conversacionesService.agentesRequest(),
    { defaultValue: [] },
  );

  /**
   * Garantiza que el agente asignado al cliente actual siempre figure en la lista,
   * incluso si el catálogo de agentes está cargando o el agente pertenece al historial.
   */
  protected readonly listaAgentes = computed(() => {
    const list = [...(this.agentes.value() || [])];
    const clienteAgente = this.clienteSeleccionado()?.agente;
    if (clienteAgente && !list.some(a => a.id === clienteAgente.id)) {
      list.unshift({ id: clienteAgente.id, nombre: clienteAgente.nombre, rol: 'AGENTE', lineasWhatsapp: [] });
    }
    return list;
  });

  protected readonly clientes = httpResource<PaginaClientes>(
    () => {
      const filtro = this.filtro();
      return this.clientesService.listarRequest({
        busqueda: this.busquedaAplicada(),
        categoria: filtro === 'TODOS' ? undefined : filtro,
        pagina: this.pagina(),
        orden: this.orden(),
        direccion: this.direccion(),
      });
    },
    { defaultValue: paginaClientesVacia() },
  );
  /** `clientes` sin lanzar si la carga falló: lo que se pinta fuera de su rama de contenido (ver `valorOVacio`). */
  protected readonly clientesVista = valorOVacio(this.clientes, paginaClientesVacia());

  /* ── Métricas y KPIs Superiores ────────────────────────────────── */
  /* Como los otros tres: todas las visibles, no lo que deja el filtro. El
     total filtrado ya lo dice el paginador. */
  protected readonly totalPacientes = computed(() =>
    Object.values(this.clientesVista().resumen.porCategoria).reduce((suma, n) => suma + n, 0),
  );
  /* Del servidor, sobre todo lo visible: ver `ResumenClientes`. */
  protected readonly totalGold = computed(() => this.clientesVista().resumen.porCategoria.GOLD);
  protected readonly totalProspectos = computed(() => this.clientesVista().resumen.porCategoria.PROSPECTO);
  protected readonly totalSinAsignar = computed(() => this.clientesVista().resumen.sinAsignar);

  /**
   * Cambiar el orden vuelve a la primera página: seguir en la 7 tras reordenar
   * deja al usuario en un tramo que ya no significa nada.
   */
  protected ordenarPor(evento: { orden: string; direccion: DireccionOrden }): void {
    this.orden.set(evento.orden as OrdenCliente);
    this.direccion.set(evento.direccion);
    this.pagina.set(1);
  }

  /** Al cambiar filtro o búsqueda se vuelve a la primera página. */
  protected cambiarFiltro(nuevo: FiltroCategoria): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  /* ── Estado del Modal de Creación / Edición ────────────────────── */
  protected readonly clienteSeleccionado = signal<Cliente | null>(null);
  protected readonly pestanaModal = signal<PestanaModal>('EXPEDIENTE');

  protected readonly modalEditarAbierto = signal(false);
  protected readonly esCreacion = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editTelefono = signal('');
  /**
   * Lo que se guarda: lo tecleado en formato internacional (`70012345` →
   * `+59170012345`), que es lo que exige el backend. Si no se tocó, va tal
   * cual — una ficha importada con un número raro no debe impedir corregir
   * su email.
   */
  protected readonly telefonoAGuardar = computed(() => {
    const tecleado = this.editTelefono().trim();
    if (!this.esCreacion() && tecleado === this.clienteSeleccionado()?.telefono) return tecleado;
    return telefonoParaEscribir(tecleado);
  });
  protected readonly errorTelefono = computed(() =>
    this.editTelefono().trim() && !this.telefonoAGuardar() ? AVISO_TELEFONO_INVALIDO : undefined,
  );
  protected readonly editPac = signal('');
  protected readonly editCi = signal('');
  protected readonly editEmpresa = signal('');
  protected readonly editFechaNacimiento = signal('');
  protected readonly editLugarNacimiento = signal('');
  protected readonly editAgenteId = signal<string | null>(null);
  protected readonly editNotas = signal('');
  protected readonly editTags = signal('');
  protected readonly guardando = signal(false);

  constructor() {
    /* Debounce de 300ms. onCleanup cancela el timer tanto al teclear de nuevo
       como al destruir el componente, evitando un set() sobre un signal huérfano. */
    effect(onCleanup => {
      const termino = this.busqueda();
      const timeout = setTimeout(() => {
        this.busquedaAplicada.set(termino.trim());
        this.pagina.set(1);
      }, 300);
      onCleanup(() => clearTimeout(timeout));
    });
  }

  /** Etiquetas ya limpias, para la vista previa bajo el campo. */
  protected readonly tagsPreview = computed(() =>
    this.editTags()
      .split(',')
      .map(t => t.trim())
      .filter(Boolean),
  );

  /** Etiquetas e intereses combinados. Una sola definición: `core/api/datos-extra.ts`. */
  protected readonly obtenerEtiquetas = etiquetasDe;

  /* ── Acciones rápidas de la ficha ────────────────────────────────
     Son comandos, no enlaces: además de navegar cierran el cajón y llevan al
     paciente ya cargado al otro módulo. Por eso van con <app-button> y no con
     <a routerLink>, que anunciaría un destino al que nunca se llega tal cual. */

  private irACon(ruta: string, queryParams: Record<string, string>): void {
    this.cerrarEdicion();
    void this.router.navigate([ruta], { queryParams });
  }

  /** Iba con `clienteId`, que la bandeja no lee: llegaba sin abrir nada. Ver `enlaceAlChat`. */
  protected irAConversacion(cliente: Cliente): void {
    this.irACon('/conversaciones', enlaceAlChat(cliente.telefono));
  }

  protected irARegistrarVenta(cliente: Cliente): void {
    this.irACon('/ventas', { ...this.contextoPaciente(cliente), nuevo: '1' });
  }

  protected irAAgendar(cliente: Cliente): void {
    this.irACon('/actividades', { ...this.contextoPaciente(cliente), nuevo: '1' });
  }

  /** Lo que Ventas y Actividades necesitan para precargar al paciente. */
  private contextoPaciente(cliente: Cliente): Record<string, string> {
    return {
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      clienteTelefono: cliente.telefono,
    };
  }

  protected abrirCreacion(template: TemplateRef<unknown>): void {
    this.esCreacion.set(true);
    this.pestanaModal.set('CONTACTO');
    this.clienteSeleccionado.set(null);
    this.editNombre.set('');
    this.editEmail.set('');
    this.editTelefono.set('');
    this.editPac.set('');
    this.editCi.set('');
    this.editEmpresa.set('');
    this.editFechaNacimiento.set('');
    this.editLugarNacimiento.set('');
    this.editAgenteId.set(null);
    this.editNotas.set('');
    this.editTags.set('');
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
        onClose: () => this.cerrarEdicion(),
      });
    }
  }

  protected abrirEdicion(cliente: Cliente, template?: TemplateRef<unknown>): void {
    this.esCreacion.set(false);
    this.pestanaModal.set('EXPEDIENTE');
    this.clienteSeleccionado.set(cliente);
    const ficha = valoresDeFicha(cliente);
    this.editNombre.set(ficha.nombre);
    this.editEmail.set(ficha.email);
    this.editTelefono.set(cliente.telefono);
    this.editPac.set(ficha.pac);
    this.editCi.set(ficha.ci);
    this.editAgenteId.set(cliente.agente?.id || cliente.agenteId || null);
    this.editEmpresa.set(ficha.empresa);
    this.editFechaNacimiento.set(ficha.fechaNacimiento);
    this.editLugarNacimiento.set(ficha.lugarNacimiento);
    this.editNotas.set(ficha.notas);
    this.editTags.set(ficha.etiquetas);
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
        onClose: () => this.cerrarEdicion(),
      });
    }
  }

  protected copiarTelefono(event: MouseEvent, telefono: string): void {
    event.stopPropagation();
    navigator.clipboard.writeText(telefono).then(() => {
      this.toast.success('Teléfono copiado al portapapeles.');
    });
  }

  protected cerrarEdicion(): void {
    this.modalEditarAbierto.set(false);
    this.clienteSeleccionado.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  /* `<app-select>` emite el valor ya, no el Event: el desempaquetado que había
     acá (`event.target as HTMLSelectElement`) lo hace el átomo una vez. Lo que
     queda es lo único propio de esta vista — el estrechamiento de tipo y que
     "sin agente" se guarda como null, no como cadena vacía. */
  /** La categoría se fijó o volvió a automática: la ficha abierta y la lista lo reflejan. */
  protected alCambiarCategoria(cliente: Cliente, estado: EstadoCategoria): void {
    this.clienteSeleccionado.set({ ...cliente, categoria: estado.categoria, categoriaFijadaEn: estado.categoriaFijadaEn });
    this.clientes.reload();
  }

  protected onCambiarAgente(valor: string): void {
    this.editAgenteId.set(valor || null);
  }

  protected async guardarEdicion(event: Event): Promise<void> {
    event.preventDefault();
    if (this.guardando()) return;

    const nombre = this.editNombre().trim();
    if (!nombre || !this.editTelefono().trim()) {
      this.toast.error('Nombre y teléfono son requeridos', 'Ficha Cliente');
      return;
    }
    const telefono = this.telefonoAGuardar();
    if (!telefono) return; // el aviso ya está en el campo

    this.guardando.set(true);
    try {
      const alta = this.esCreacion();
      const ficha = cambiosDeFicha(
        {
          nombre,
          email: this.editEmail(),
          pac: this.editPac(),
          ci: this.editCi(),
          empresa: this.editEmpresa(),
          fechaNacimiento: this.editFechaNacimiento(),
          lugarNacimiento: this.editLugarNacimiento(),
          notas: this.editNotas(),
          etiquetas: this.editTags(),
        },
        { alta },
      );

      if (alta) {
        await this.clientesService.crear({
          ...ficha,
          nombre,
          telefono,
          fechaNacimiento: ficha.fechaNacimiento ?? undefined,
          agenteId: this.editAgenteId() || undefined,
        });
        this.toast.success('Cliente o prospecto creado exitosamente', 'Guardado');
      } else {
        const cliente = this.clienteSeleccionado();
        if (!cliente) return;
        await this.clientesService.actualizar(cliente.id, {
          ...ficha,
          telefono,
          agenteId: this.editAgenteId() || null,
        });
        this.toast.success('Ficha de cliente actualizada', 'Guardado');
      }

      this.cerrarEdicion();
      this.clientes.reload();
    } catch (err) {
      this.toast.error(
        mensajeDeError(err, 'No se pudo guardar la información.'),
        'Error al Guardar',
      );
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * Campos de la ficha médica derivados síncronamente con micro-iconos.
   */
  protected readonly datosFicha = computed(() => {
    const cli = this.clienteSeleccionado();
    if (!cli) return [];

    const d = cli.datosExtra;
    const edadVal = this.obtenerEdad(cli);
    const ocupacion = cli.ocupacion ?? textoExtraOpcional(d, 'ocupacion', 'Profesion');
    const ciVal = cli.ci ? `${cli.ci}${cli.ciLugar ? ' ' + cli.ciLugar : ''}` : (textoExtra(d, 'CI.Pac') ? `${textoExtra(d, 'CI.Pac')} ${textoExtra(d, 'CI.Lug.Pac')}`.trim() : null);
    const sexo = cli.sexo ?? textoExtraOpcional(d, 'sexo', 'Sexo');
    const estadoCivil = cli.estadoCivil ?? textoExtraOpcional(d, 'estadoCivil', 'E_Civil');
    const nacionalidad = cli.nacionalidad ?? textoExtraOpcional(d, 'nacionalidad', 'Nacionalidad');
    const direccion = cli.direccion ?? textoExtraOpcional(d, 'direccion', 'Direccion');
    const telefonoFijo = cli.telefonoFijo ?? textoExtraOpcional(d, 'telefonoFijo', 'Telef.Dom');

    const campos: Array<[string, string | null, IconName]> = [
      ['Edad', edadVal, 'user'],
      ['Ocupación', ocupacion ? String(ocupacion) : null, 'briefcase'],
      ['CI', ciVal ? String(ciVal) : null, 'file-text'],
      ['Sexo', sexo ? String(sexo) : null, 'users'],
      ['Estado civil', estadoCivil ? String(estadoCivil) : null, 'shield'],
      ['Nacionalidad', nacionalidad ? String(nacionalidad) : null, 'database'],
      ['Dirección', direccion ? String(direccion) : null, 'map-pin'],
      ['Teléfono fijo', telefonoFijo ? String(telefonoFijo) : null, 'phone'],
    ];

    return campos
      .filter(([, valor]) => valor !== null && valor !== '')
      .map(([etiqueta, valor, icono]) => ({ etiqueta, valor: String(valor), icono }));
  });

  /** Ver `edadDePaciente`: nunca el `Edad.a` de FileMaker. */
  protected readonly obtenerEdad = edadDePaciente;
}
