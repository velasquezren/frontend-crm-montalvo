import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { ToastService } from '../../core/toast/toast.service';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../shared/models/cliente-categoria.model';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { Cliente, HistorialPaciente } from './cliente.model';
import { ClientesService } from './clientes.service';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { OverlayRef } from '@angular/cdk/overlay';
import { TemplateRef, ViewContainerRef } from '@angular/core';

type FiltroCategoria = CategoriaCliente | 'TODOS';

/**
 * Clientes — listado real desde GET /clientes (RF-01/RF-03/RF-24).
 * El backend ya aplica visibilidad por rol: un agente ve sus clientes + pool sin asignar.
 */
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-clientes',
  imports: [
    MonedaPipe,
    PageHeaderComponent,
    InputComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    EmptyStateComponent,
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

  protected readonly clientesRaw = httpResource<RespuestaPaginada<Cliente>>(
    () => {
      const filtro = this.filtro();
      return this.clientesService.listarRequest({
        busqueda: this.busquedaAplicada(),
        categoria: filtro === 'TODOS' ? undefined : filtro,
        pagina: this.pagina(),
      });
    },
    { defaultValue: paginaVacia<Cliente>() },
  );

  /**
   * El recurso ya devuelve el sobre paginado del backend, así que esto solo
   * cubre el primer render, antes de que llegue la respuesta.
   *
   * Antes había aquí una normalización de dos formatos alternativos
   * (`raw.data` + `raw.meta`) que este backend nunca ha devuelto: era código
   * muerto que el `any` del recurso mantenía invisible al compilador.
   */
  protected readonly clientes = computed<RespuestaPaginada<Cliente>>(
    () => this.clientesRaw.value() ?? paginaVacia<Cliente>(),
  );

  /** Al cambiar filtro o búsqueda se vuelve a la primera página. */
  protected cambiarFiltro(nuevo: FiltroCategoria): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  /* ── Estado del Modal de Creación / Edición ────────────────────── */
  protected readonly clienteSeleccionado = signal<Cliente | null>(null);
  /** Ficha del paciente y su historial: se piden al abrir el detalle, no en la lista. */
  protected readonly historial = signal<HistorialPaciente | null>(null);
  protected readonly cargandoFicha = signal(false);
  protected readonly modalEditarAbierto = signal(false);
  protected readonly esCreacion = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editTelefono = signal('');
  protected readonly editEmpresa = signal('');
  /** Fecha de nacimiento (AAAA-MM-DD). Sustituye al campo de edad: la edad se
      calcula al mostrarla, así que editarla directamente no tenía sentido —
      escribía en un sitio y la ficha leía de otro. */
  protected readonly editFechaNacimiento = signal('');
  protected readonly editLugarNacimiento = signal('');
  protected readonly editCategoria = signal<CategoriaCliente>('PROSPECTO');
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

  /** Etiquetas/intereses combinados para la columna de la tabla */
  protected obtenerEtiquetas(cliente: Cliente): string[] {
    if (cliente.intereses && cliente.intereses.length > 0) {
      return cliente.intereses.map(i => i.descripcion);
    }
    const datosExtra = cliente.datosExtra as Record<string, any> | null;
    const tags = datosExtra?.['tags'];
    if (Array.isArray(tags)) {
      return tags.map(t => String(t));
    }
    return [];
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
    this.clienteSeleccionado.set(null);
    this.editNombre.set('');
    this.editEmail.set('');
    this.editTelefono.set('');
    this.editEmpresa.set('');
    this.editFechaNacimiento.set('');
    this.editLugarNacimiento.set('');
    this.editCategoria.set('PROSPECTO');
    this.editNotas.set('');
    this.editTags.set('');
    // Un cliente nuevo todavía no tiene ficha de paciente ni historial.
    this.historial.set(null);
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  protected abrirEdicion(cliente: Cliente, template?: TemplateRef<unknown>): void {
    this.esCreacion.set(false);
    this.clienteSeleccionado.set(cliente);
    this.editNombre.set(cliente.nombre);
    this.editEmail.set(cliente.email || '');
    this.editTelefono.set(cliente.telefono);
    const datosExtra = cliente.datosExtra as Record<string, any> | null;
    this.editFechaNacimiento.set((cliente.fechaNacimiento ?? '').slice(0, 10));
    this.editLugarNacimiento.set(cliente.datosExtra?.lugarNacimiento || '');
    this.editCategoria.set(cliente.categoria || 'PROSPECTO');
    this.editNotas.set(cliente.datosExtra?.notas || '');
    this.editTags.set((cliente.datosExtra?.tags || []).join(', '));
    this.modalEditarAbierto.set(true);
    // El listado no trae `datosExtra` (empresa, notas, tags): se pide la ficha
    // completa para que el formulario no abra vacío y los borre al guardar.
    void this.cargarFichaCompleta(cliente.id);
    void this.cargarHistorial(cliente.id);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  protected cerrarEdicion(): void {
    this.modalEditarAbierto.set(false);
    this.clienteSeleccionado.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
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

      const payload = {
        nombre,
        telefono,
        email: this.editEmail().trim() || null,
        categoria: this.editCategoria(),
        datosExtra: {
          empresa: this.editEmpresa().trim() || null,
          fechaNacimiento: this.editFechaNacimiento().trim() || null,
          lugarNacimiento: this.editLugarNacimiento().trim() || null,
          notas: this.editNotas().trim() || null,
          tags: tagsArray,
        },
      };

      if (this.esCreacion()) {
        await this.clientesService.crear(payload);
        this.toast.success('Cliente o prospecto creado exitosamente', 'Guardado');
      } else {
        const cliente = this.clienteSeleccionado();
        if (!cliente) return;
        await this.clientesService.actualizar(cliente.id, payload);
        this.toast.success('Ficha de cliente actualizada', 'Guardado');
      }

      this.cerrarEdicion();
      this.clientesRaw.reload();
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
   * Campos de la ficha que tienen valor. Se filtran los vacíos en vez de
   * pintar celdas con guiones: en FileMaker muchos pacientes solo traen dos o
   * tres datos, y una rejilla llena de huecos no comunica nada.
   */
  protected readonly datosFicha = computed(() => {
    // Sale del cliente que ya se tiene del listado: cero peticiones, cero espera.
    const p = this.clienteSeleccionado();
    if (!p) return [];
    const campos: Array<[string, string | number | null]> = [
      ['Edad', this.edad(p.fechaNacimiento)],
      ['Ocupación', p.ocupacion ?? null],
      ['CI', p.ci ? `${p.ci}${p.ciLugar ? ' ' + p.ciLugar : ''}` : null],
      ['Sexo', p.sexo === 'M' ? 'Masculino' : p.sexo === 'F' ? 'Femenino' : null],
      ['Estado civil', p.estadoCivil ?? null],
      ['Nacionalidad', p.nacionalidad ?? null],
      ['Dirección', p.direccion ?? null],
      ['Teléfono fijo', p.telefonoFijo ?? null],
      ['NIT', p.nit ?? null],
      ['Trabaja en', p.empresaTrabajo ?? null],
      ['Contacto de referencia', p.contactoRef
        ? `${p.contactoRef}${p.telefonoRef ? ' · ' + p.telefonoRef : ''}`
        : null],
      ['Teléfono oficina', p.telefonoOficina ?? null],
      ['Visitas previas', p.visitasPrevias ? `${p.visitasPrevias}` : null],
    ];
    return campos
      .filter(([, valor]) => valor !== null && valor !== '')
      .map(([etiqueta, valor]) => ({ etiqueta, valor: String(valor) }));
  });

  /**
   * Edad para la tabla. Sale de `fechaNacimiento`, que sí viaja en el listado.
   *
   * Antes leía `datosExtra`, que el listado dejó de enviar al aligerarlo: la
   * columna mostraba "Sin edad" para todos.
   */
  protected obtenerEdad(cliente: Cliente): string | null {
    return this.edad(cliente.fechaNacimiento);
  }


  /**
   * Edad calculada desde la fecha de nacimiento.
   *
   * La edad no se guarda en la base a propósito: el volcado de FileMaker traía
   * la del día de la exportación y hoy se desvía hasta 18 años. Esto siempre
   * dice la verdad, y además nunca hay que reimportar para corregirla.
   */
  protected edad(fechaNacimiento: string | null | undefined): string | null {
    if (!fechaNacimiento) return null;
    const nacimiento = new Date(fechaNacimiento);
    if (Number.isNaN(nacimiento.getTime())) return null;

    const hoy = new Date();
    let anios = hoy.getFullYear() - nacimiento.getFullYear();
    const mes = hoy.getMonth() - nacimiento.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) anios--;
    return anios >= 0 && anios < 130 ? `${anios} años` : null;
  }

  /**
   * Completa el formulario con los campos que solo viajan en la ficha.
   *
   * El listado se mantiene ligero a propósito, así que `empresa`, `notas` y
   * `tags` —que viven en `datosExtra`— llegan con esta llamada. Los datos del
   * paciente ya están en pantalla desde el primer momento: esto solo rellena
   * el formulario, no bloquea nada.
   */
  private async cargarFichaCompleta(id: string): Promise<void> {
    try {
      const ficha = await this.clientesService.obtener(id);
      const extra = ficha.datosExtra ?? {};
      this.editEmpresa.set(extra.empresa ?? '');
      this.editNotas.set(extra.notas ?? '');
      this.editTags.set((extra.tags ?? []).join(', '));
      this.clienteSeleccionado.set(ficha);
    } catch {
      // Si falla, el formulario conserva lo que trajo el listado.
    }
  }

  /**
   * Historial de servicios: la ÚNICA petición que hace la ficha.
   *
   * El resto de datos del paciente ya vienen con el cliente del listado, así
   * que el modal abre de inmediato y esto solo rellena el resumen del final.
   */
  private async cargarHistorial(id: string): Promise<void> {
    this.historial.set(null);
    this.cargandoFicha.set(true);
    try {
      this.historial.set(await this.clientesService.historial(id));
    } catch {
      // Sin historial la ficha sigue siendo editable: no se bloquea nada.
      this.historial.set(null);
    } finally {
      this.cargandoFicha.set(false);
    }
  }
}
