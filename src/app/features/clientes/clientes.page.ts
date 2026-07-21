import { httpResource } from '@angular/common/http';
import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
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
import { Cliente } from './cliente.model';
import { ClientesService } from './clientes.service';

type FiltroCategoria = CategoriaCliente | 'TODOS';

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
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    DatePipe,
  ],
  templateUrl: './clientes.page.html',
})
export class ClientesPage {
  private readonly clientesService = inject(ClientesService);
  private readonly toast = inject(ToastService);

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

  protected readonly clientes = httpResource<RespuestaPaginada<Cliente>>(
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

  /** Al cambiar filtro o búsqueda se vuelve a la primera página. */
  protected cambiarFiltro(nuevo: FiltroCategoria): void {
    this.filtro.set(nuevo);
    this.pagina.set(1);
  }

  /* ── Estado del Modal de Edición Ficha ───────────────────────── */
  protected readonly clienteSeleccionado = signal<Cliente | null>(null);
  protected readonly modalEditarAbierto = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editTelefono = signal('');
  protected readonly editEmpresa = signal('');
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

  /** Cerrar con Escape: comportamiento esperado en cualquier modal. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.modalEditarAbierto()) {
      this.cerrarEdicion();
    }
  }

  protected abrirEdicion(cliente: Cliente): void {
    this.clienteSeleccionado.set(cliente);
    this.editNombre.set(cliente.nombre);
    this.editEmail.set(cliente.email || '');
    this.editTelefono.set(cliente.telefono);
    this.editEmpresa.set(cliente.datosExtra?.empresa || '');
    this.editNotas.set(cliente.datosExtra?.notas || '');
    this.editTags.set((cliente.datosExtra?.tags || []).join(', '));
    this.modalEditarAbierto.set(true);
  }

  protected cerrarEdicion(): void {
    this.modalEditarAbierto.set(false);
    this.clienteSeleccionado.set(null);
  }

  protected async guardarEdicion(event: Event): Promise<void> {
    event.preventDefault();
    const cliente = this.clienteSeleccionado();
    if (!cliente || this.guardando()) return;

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

      await this.clientesService.actualizar(cliente.id, {
        nombre,
        telefono,
        email: this.editEmail().trim() || null,
        datosExtra: {
          empresa: this.editEmpresa().trim() || null,
          notas: this.editNotas().trim() || null,
          tags: tagsArray,
        },
      });
      this.toast.success('Ficha de cliente actualizada', 'Guardado');
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
}
