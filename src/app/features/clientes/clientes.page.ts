import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { listaExtra, textoExtra, textoExtraOpcional } from '../../core/api/datos-extra';
import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { generarIniciales } from '../../core/auth/user.model';
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
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../shared/models/cliente-categoria.model';
import { Cliente } from './cliente.model';
import { ClientesService, OrdenCliente } from './clientes.service';
import { ConversacionesService } from '../conversaciones/conversaciones.service';
import { AgenteResumen } from '../conversaciones/conversacion.model';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { OverlayRef } from '@angular/cdk/overlay';
import { TemplateRef, ViewContainerRef } from '@angular/core';
import { RouterLink } from '@angular/router';

type FiltroCategoria = CategoriaCliente | 'TODOS';
type PestanaModal = 'EXPEDIENTE' | 'CONTACTO' | 'NOTAS';

/**
 * Clientes — listado real desde GET /clientes (RF-01/RF-03/RF-24).
 * El backend ya aplica visibilidad por rol: un agente ve sus clientes + pool sin asignar.
 */
@Component({
  selector: 'app-clientes',
  imports: [
    PageHeaderComponent,
    InputComponent,
    FilterChipComponent,
    TableComponent,
    ThOrdenableComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
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

  private activeOverlayRef?: OverlayRef;

  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

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
      list.unshift({ id: clienteAgente.id, nombre: clienteAgente.nombre, rol: 'AGENTE' });
    }
    return list;
  });

  protected readonly clientes = httpResource<RespuestaPaginada<Cliente>>(
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
    { defaultValue: paginaVacia<Cliente>() },
  );

  /* ── Métricas y KPIs Superiores ────────────────────────────────── */
  protected readonly totalPacientes = computed(() => this.clientes.value().total);
  protected readonly totalGold = computed(() => this.clientes.value().datos.filter(c => c.categoria === 'GOLD').length);
  protected readonly totalProspectos = computed(() => this.clientes.value().datos.filter(c => c.categoria === 'PROSPECTO').length);
  protected readonly totalSinAsignar = computed(() => this.clientes.value().datos.filter(c => !c.agente).length);

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
  protected readonly editPac = signal('');
  protected readonly editCi = signal('');
  protected readonly editEmpresa = signal('');
  protected readonly editFechaNacimiento = signal('');
  protected readonly editLugarNacimiento = signal('');
  protected readonly editCategoria = signal<CategoriaCliente>('PROSPECTO');
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

  /** Etiquetas e intereses combinados para la columna de la tabla y ficha */
  protected obtenerEtiquetas(cliente: Cliente): string[] {
    const directIntereses = cliente.intereses?.map(i => i.descripcion) ?? [];
    const tagsExtra = listaExtra(cliente.datosExtra, 'tags', 'intereses');
    return [...new Set([...directIntereses, ...tagsExtra])];
  }

  /** Cerrar con Escape: comportamiento esperado en cualquier modal. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.modalEditarAbierto()) {
      this.cerrarEdicion();
    }
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
    this.editCategoria.set('PROSPECTO');
    this.editAgenteId.set(null);
    this.editNotas.set('');
    this.editTags.set('');
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  protected abrirEdicion(cliente: Cliente, template?: TemplateRef<unknown>): void {
    this.esCreacion.set(false);
    this.pestanaModal.set('EXPEDIENTE');
    this.clienteSeleccionado.set(cliente);
    this.editNombre.set(cliente.nombre);
    this.editEmail.set(cliente.email || '');
    this.editTelefono.set(cliente.telefono);
    this.editPac.set(cliente.pac || '');
    this.editCi.set(cliente.ci || '');
    this.editAgenteId.set(cliente.agente?.id || cliente.agenteId || null);
    const datosExtra = cliente.datosExtra;
    this.editEmpresa.set(cliente.empresaTrabajo || textoExtra(datosExtra, 'empresa'));
    const fn = cliente.fechaNacimiento || textoExtra(datosExtra, 'fechaNacimiento', 'fn');
    this.editFechaNacimiento.set(fn ? fn.slice(0, 10) : '');
    this.editLugarNacimiento.set(
      cliente.ciLugar || textoExtra(datosExtra, 'lugarNacimiento', 'CI.Lug.Pac'),
    );
    this.editCategoria.set(cliente.categoria || 'PROSPECTO');
    this.editNotas.set(textoExtra(datosExtra, 'notas'));
    const tags = datosExtra?.['tags'];
    const directTags = cliente.intereses?.map(i => i.descripcion) ?? [];
    const combinedTags = [...new Set([...(Array.isArray(tags) ? tags : []), ...directTags])];
    this.editTags.set(combinedTags.join(', '));
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
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

  protected onCambiarCategoria(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (target?.value) {
      this.editCategoria.set(target.value as CategoriaCliente);
    }
  }

  protected onCambiarAgente(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.editAgenteId.set(target?.value ? target.value : null);
  }

  protected async guardarEdicion(event: Event): Promise<void> {
    event.preventDefault();
    if (this.guardando()) return;

    const nombre = this.editNombre().trim();
    const telefono = this.editTelefono().trim();
    if (!nombre || !telefono) {
      this.toast.error('Nombre y teléfono son requeridos', 'Ficha Cliente');
      return;
    }

    this.guardando.set(true);
    try {
      const tagsArray = this.editTags()
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const pacTrim = this.editPac().trim().toUpperCase();
      const ciTrim = this.editCi().trim();

      const payload = {
        nombre,
        telefono,
        email: this.editEmail().trim() || null,
        categoria: this.editCategoria(),
        agenteId: this.editAgenteId() || null,
        pac: pacTrim || null,
        ci: ciTrim || null,
        /* Con columna propia: van al primer nivel para que el backend
           los guarde donde la ficha luego los lee. */
        empresa: this.editEmpresa().trim(),
        fechaNacimiento: this.editFechaNacimiento() || undefined,
        lugarNacimiento: this.editLugarNacimiento().trim(),
        /* Sin columna: se quedan en el JSON libre. */
        datosExtra: {
          notas: this.editNotas().trim() || null,
          tags: tagsArray,
        },
      };

      if (this.esCreacion()) {
        await this.clientesService.crear({
          ...payload,
          agenteId: this.editAgenteId() || undefined,
        });
        this.toast.success('Cliente o prospecto creado exitosamente', 'Guardado');
      } else {
        const cliente = this.clienteSeleccionado();
        if (!cliente) return;
        await this.clientesService.actualizar(cliente.id, {
          ...payload,
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

  /**
   * Siempre se calcula desde la fecha de nacimiento. El campo `Edad.a` que trae
   * FileMaker es la edad del día en que se capturó el registro y está desfasado
   * hasta 18 años, así que se ignora deliberadamente.
   */
  protected obtenerEdad(cliente: Cliente): string | null {
    const fn = cliente.fechaNacimiento || textoExtra(cliente.datosExtra, 'fechaNacimiento', 'fn');
    if (fn) {
      const nac = new Date(fn);
      if (!isNaN(nac.getTime())) {
        const hoy = new Date();
        let e = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) e--;
        if (e >= 0) return `${e} años`;
      }
    }
    return null;
  }
}
