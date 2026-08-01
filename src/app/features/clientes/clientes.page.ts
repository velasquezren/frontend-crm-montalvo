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

  protected readonly clientesRaw = httpResource<any>(
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

  protected readonly clientes = computed<RespuestaPaginada<Cliente>>(() => {
    const raw = this.clientesRaw.value();
    if (!raw) return paginaVacia<Cliente>();
    if (Array.isArray(raw.datos)) {
      return {
        datos: raw.datos,
        total: raw.total ?? raw.datos.length,
        pagina: raw.pagina ?? 1,
        limite: raw.limite ?? 25,
        totalPaginas: raw.totalPaginas ?? 1,
      };
    }
    if (Array.isArray(raw.data)) {
      return {
        datos: raw.data,
        total: raw.meta?.total ?? raw.total ?? raw.data.length,
        pagina: raw.meta?.page ?? raw.pagina ?? 1,
        limite: raw.meta?.limit ?? raw.limite ?? 25,
        totalPaginas: raw.meta?.lastPage ?? raw.totalPaginas ?? 1,
      };
    }
    return raw;
  });

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
  protected readonly editEdad = signal('');
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
    this.editEdad.set('');
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
    const edadValor = datosExtra?.['edad'] ?? datosExtra?.['Edad.a'];
    this.editEdad.set(edadValor != null ? String(edadValor) : '');
    this.editLugarNacimiento.set(cliente.datosExtra?.lugarNacimiento || '');
    this.editCategoria.set(cliente.categoria || 'PROSPECTO');
    this.editNotas.set(cliente.datosExtra?.notas || '');
    this.editTags.set((cliente.datosExtra?.tags || []).join(', '));
    this.modalEditarAbierto.set(true);
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
          edad: this.editEdad().trim() || null,
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
      ['Saldo pendiente', p.saldoTotal && Number(p.saldoTotal) > 0 ? `Bs ${p.saldoTotal}` : null],
    ];
    return campos
      .filter(([, valor]) => valor !== null && valor !== '')
      .map(([etiqueta, valor]) => ({ etiqueta, valor: String(valor) }));
  });

  protected obtenerEdad(cliente: Cliente): string | null {
    const d = cliente.datosExtra as Record<string, any> | null;
    if (!d) return null;
    const edad = d['edad'] ?? d['Edad.a'];
    return edad != null && edad !== '' ? `${edad} años` : null;
  }

  /**
   * Edad calculada desde la fecha de nacimiento.
   *
   * La edad no se guarda en la base a propósito: el volcado de FileMaker traía
   * la del día de la exportación y hoy se desvía hasta 18 años. Esto siempre
   * dice la verdad, y además nunca hay que reimportar para corregirla.
   */
  private edad(fechaNacimiento: string | null | undefined): string | null {
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
