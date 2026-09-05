import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EffectCleanupRegisterFn,
  inject,
  linkedSignal,
  OnDestroy,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { ToastService } from '../../core/toast/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { esNombreProvisional } from '../../shared/models/nombre-cliente';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  ESTADO_LEAD_BADGE,
  ESTADO_LEAD_LABEL,
  EstadoLead,
} from '../../shared/models/estados.model';
import { Lead, ORIGEN_LABEL, OrigenLeadApi } from './lead.model';
import { FiltroLeads, LeadsService, ResumenLeads } from './leads.service';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { InicialesClientePipe, NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';

type FiltroOrigen = OrigenLeadApi | 'TODOS';

/**
 * Leads — Pipeline Kanban Drag-and-Drop + Vista Tabla.
 * Ref: CRM_MANIFESTO.md §1.2, §3
 */
@Component({
  selector: 'app-leads',
  imports: [
    InicialesClientePipe,
    NombreClientePipe,
    PageHeaderComponent,
    FilterChipComponent,
    TableComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    InputComponent,
    LoadingSkeletonComponent,
    IconComponent,
    PaginatorComponent,
    DatePipe,
    DragDropModule,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './leads.page.html',
  styleUrl: './leads.page.css',
})
export class LeadsPage implements OnDestroy {
  private readonly leadsService = inject(LeadsService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  private activeOverlayRef?: OverlayRef;
  protected readonly modalMotivoPerdida = viewChild<TemplateRef<unknown>>('modalMotivoPerdida');

  protected readonly leadSeleccionado = signal<Lead | null>(null);
  protected readonly estadosDisponibles: readonly EstadoLead[] = ['NUEVO', 'CONTACTADO', 'CONVERTIDO', 'PERDIDO'];

  /* ── Motivo de pérdida ─────────────────────────────────────────────
     El backend exige motivo al marcar un lead PERDIDO (queda en AuditLog),
     así que antes de llamar a cambiarEstado se pide con este modal — igual
     criterio que "Quitar comisión" en la planilla de FileMaker. */
  protected readonly leadParaPerder = signal<Lead | null>(null);
  protected readonly motivoPerdidaTexto = signal('');
  protected readonly guardandoMotivoPerdida = signal(false);
  private onConfirmarMotivoPerdida?: (motivo: string) => void;

  /* ── Alta rápida de Lead (Presencial / Entrada) ────────────────────── */
  protected readonly nuevoLeadNombre = signal('');
  protected readonly nuevoLeadTelefono = signal('');
  protected readonly nuevoLeadInteres = signal('');
  protected readonly guardandoLead = signal(false);
  protected readonly errorCrearLead = signal<string | null>(null);

  protected readonly interesesSugeridos: readonly string[] = [
    'Parto Humanizado',
    'Cesárea',
    'Ginecología',
    'Ecografía 5D',
    'Cirugía Plástica',
    'Pediatría',
    'Laboratorio',
    'Consulta Médica',
  ];

  ngOnDestroy(): void {
    this.activeOverlayRef?.dispose();
  }

  protected readonly estadoBadge = ESTADO_LEAD_BADGE;
  protected readonly estadoLabel = ESTADO_LEAD_LABEL;
  protected readonly origenLabel = ORIGEN_LABEL;

  /* Un contacto que llegó por WhatsApp sin dar su nombre se guarda como
     "WhatsApp +591…". Ver `shared/models/nombre-cliente`. */
  protected sinNombre(cliente: { nombre: string; telefono: string }): boolean {
    return esNombreProvisional(cliente.nombre);
  }

  /* Modos de vista: 'PIPELINE' (Kanban) o 'LISTA' (Tabla) */
  protected readonly modoVista = signal<'PIPELINE' | 'LISTA'>('PIPELINE');
  protected readonly filtro = signal<FiltroOrigen>('TODOS');
  protected readonly pagina = signal(1);
  protected readonly busqueda = signal('');
  private readonly busquedaDebounced = signal('');

  /**
   * "Importados" es el histórico de FileMaker: 15.000+ pacientes antiguos que
   * no son prospectos por trabajar. El backend los excluye salvo que se pidan,
   * así que el pipeline solo muestra captación real.
   */
  protected readonly filtros: readonly { valor: FiltroOrigen; label: string }[] = [
    { valor: 'TODOS', label: 'Captación activa' },
    { valor: 'PRESENCIAL', label: 'Presencial' },
    { valor: 'WHATSAPP_DIRECTO', label: 'WhatsApp' },
    { valor: 'FACEBOOK_LEAD_AD', label: 'Facebook' },
    { valor: 'INSTAGRAM_LEAD_AD', label: 'Instagram' },
    { valor: 'IMPORTACION', label: 'Histórico importado' },
  ];

  protected readonly viendoHistorico = computed(() => this.filtro() === 'IMPORTACION');

  private filtroActual(): FiltroLeads {
    const f = this.filtro();
    const q = this.busquedaDebounced().trim();
    const base: FiltroLeads = f === 'TODOS' ? {} : { origen: f };
    if (q) base.q = q;
    return base;
  }

  /* ── Datos del Servidor ────────────────────────────────────────── */

  /** Conteos reales por columna: la UI no debe contar solo lo que cargó. */
  protected readonly resumen = httpResource<ResumenLeads>(
    () => this.leadsService.resumenRequest(this.filtroActual()),
    {
      defaultValue: {
        porEstado: { NUEVO: 0, CONTACTADO: 0, CONVERTIDO: 0, PERDIDO: 0 },
        totalPipeline: 0,
        historicoImportado: 0,
      },
    },
  );

  /**
   * Kanban: se cargan hasta 100 tarjetas para arrastrar. Si una columna tiene
   * más, la cabecera muestra el total real y se avisa que hay más sin cargar
   * (arrastrar 15.000 tarjetas no es un flujo de trabajo viable).
   */
  protected readonly leads = httpResource<RespuestaPaginada<Lead>>(
    () => {
      const base = this.filtroActual();
      return this.modoVista() === 'PIPELINE'
        ? this.leadsService.listarRequest({ ...base, pagina: 1, limite: 100 })
        : this.leadsService.listarRequest({ ...base, pagina: this.pagina(), limite: 25 });
    },
    { defaultValue: paginaVacia<Lead>() },
  );

  /* ── Copia local reactiva auto-sincronizada con linkedSignal (Angular 19/21) ─────────── */
  protected readonly leadsLocales = linkedSignal<readonly Lead[]>(() => this.leads.value().datos);

  /* ── Columnas del Kanban derivadas síncronamente con computed() ────── */
  protected readonly nuevos = computed(() => this.leadsLocales().filter((l: Lead) => l.estado === 'NUEVO'));
  protected readonly contactados = computed(() => this.leadsLocales().filter((l: Lead) => l.estado === 'CONTACTADO'));
  protected readonly convertidos = computed(() => this.leadsLocales().filter((l: Lead) => l.estado === 'CONVERTIDO'));
  protected readonly perdidos = computed(() => this.leadsLocales().filter((l: Lead) => l.estado === 'PERDIDO'));

  /** Cuántas tarjetas hay sin cargar en cada columna (total real − cargadas). */
  protected ocultasEn(estado: EstadoLead, cargadas: number): number {
    return Math.max(0, this.resumen.value().porEstado[estado] - cargadas);
  }

  constructor() {
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busqueda().trim();
      const timer = setTimeout(() => {
        this.busquedaDebounced.set(texto);
        this.pagina.set(1);
      }, 200);
      onCleanup(() => clearTimeout(timer));
    });

    const origenParam = this.route.snapshot.queryParamMap.get('origen');
    if (origenParam) {
      this.filtro.set(origenParam as FiltroOrigen);
    }

    this.route.queryParams.subscribe(params => {
      if (params['origen']) {
        this.filtro.set(params['origen'] as FiltroOrigen);
      }
    });
  }

  protected cambiarFiltro(valor: FiltroOrigen): void {
    this.filtro.set(valor);
    this.pagina.set(1);
  }

  protected setVista(modo: 'PIPELINE' | 'LISTA'): void {
    this.modoVista.set(modo);
  }

  protected abrirFichaLead(lead: Lead, template: TemplateRef<unknown>): void {
    this.leadSeleccionado.set(lead);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => this.leadSeleccionado.set(null),
    });
  }

  protected cerrarFichaLead(): void {
    this.leadSeleccionado.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected abrirCrearLead(template: TemplateRef<unknown>): void {
    this.nuevoLeadNombre.set('');
    this.nuevoLeadTelefono.set('');
    this.nuevoLeadInteres.set('');
    this.errorCrearLead.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => this.cerrarCrearLead(),
    });
  }

  protected cerrarCrearLead(): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
    this.errorCrearLead.set(null);
  }

  protected elegirInteresSugerido(interes: string): void {
    this.nuevoLeadInteres.set(interes);
  }

  protected async guardarNuevoLead(event: Event): Promise<void> {
    event.preventDefault();
    if (this.guardandoLead()) return;

    const nombre = this.nuevoLeadNombre().trim();
    let telefono = this.nuevoLeadTelefono().trim();
    if (!nombre || !telefono) {
      this.errorCrearLead.set('Nombre y teléfono son requeridos.');
      return;
    }

    // Normalizar a formato E.164 (+591 para Bolivia) para satisfacer @IsPhoneNumber()
    if (!telefono.startsWith('+')) {
      const digitos = telefono.replace(/\D/g, '');
      if (digitos.length === 8) {
        telefono = `+591${digitos}`;
      } else if (digitos.startsWith('591') && digitos.length === 11) {
        telefono = `+${digitos}`;
      }
    }

    this.guardandoLead.set(true);
    this.errorCrearLead.set(null);

    try {
      const leadCreado = await this.leadsService.crearPresencial({
        nombre,
        telefono,
        interes: this.nuevoLeadInteres().trim() || undefined,
      });
      this.toastService.success(
        `Lead ${leadCreado.cliente.nombre} registrado correctamente`,
        'Lead Creado',
      );
      this.cerrarCrearLead();
      this.leads.reload();
      this.resumen.reload();
    } catch (err: unknown) {
      this.errorCrearLead.set(mensajeDeError(err, 'No se pudo registrar el lead.'));
    } finally {
      this.guardandoLead.set(false);
    }
  }

  protected cambiarEstadoLeadDirecto(nuevoEstado: EstadoLead): void {
    const lead = this.leadSeleccionado();
    if (!lead || lead.estado === nuevoEstado) return;

    if (nuevoEstado === 'PERDIDO') {
      this.abrirMotivoPerdida(lead, motivo => this.aplicarCambioEstado(lead, nuevoEstado, motivo));
      return;
    }

    void this.aplicarCambioEstado(lead, nuevoEstado);
  }

  /** Aplica el cambio en el estado local (optimista) y lo persiste. Único punto que llama al backend. */
  private async aplicarCambioEstado(
    lead: Lead,
    nuevoEstado: EstadoLead,
    motivoPerdida?: string,
  ): Promise<void> {
    this.leadsLocales.update(lista =>
      lista.map((l: Lead) => (l.id === lead.id ? { ...l, estado: nuevoEstado } : l)),
    );
    this.leadSeleccionado.update(l => (l && l.id === lead.id ? { ...l, estado: nuevoEstado } : l));

    try {
      await this.leadsService.cambiarEstado(lead.id, nuevoEstado, motivoPerdida);
      this.toastService.success(
        `Lead ${lead.cliente.nombre} actualizado a ${this.estadoLabel[nuevoEstado]}`,
        'Estado Actualizado',
      );
      this.resumen.reload();
    } catch (err: unknown) {
      this.toastService.error(
        mensajeDeError(err, 'Ocurrió un error al actualizar el estado del lead.'),
        'Error',
      );
      this.leads.reload();
    }
  }

  /**
   * Pide el motivo antes de marcar un lead PERDIDO — el backend lo exige y lo
   * deja en AuditLog. Reutiliza el `activeOverlayRef` de la ficha: abrir este
   * modal cierra la ficha si estaba abierta, igual que el resto de la página.
   */
  protected abrirMotivoPerdida(lead: Lead, onConfirmar: (motivo: string) => void): void {
    const template = this.modalMotivoPerdida();
    if (!template) return;

    this.leadParaPerder.set(lead);
    this.motivoPerdidaTexto.set('');
    this.onConfirmarMotivoPerdida = onConfirmar;

    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr, {
      onClose: () => this.cerrarMotivoPerdida(),
    });
  }

  protected cerrarMotivoPerdida(): void {
    this.leadParaPerder.set(null);
    this.onConfirmarMotivoPerdida = undefined;
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected confirmarMotivoPerdida(): void {
    const motivo = this.motivoPerdidaTexto().trim();
    if (motivo.length < 3) return;

    const confirmar = this.onConfirmarMotivoPerdida;
    this.cerrarMotivoPerdida();
    confirmar?.(motivo);
  }

  protected drop(event: CdkDragDrop<Lead[], Lead[], Lead>): void {
    if (event.previousContainer === event.container) {
      // Reordenamiento dentro de la misma columna usando leadsLocales de forma inmutable
      const itemsColumna = event.container.data;
      const prev = itemsColumna[event.previousIndex];
      const curr = itemsColumna[event.currentIndex];

      if (prev && curr) {
        this.leadsLocales.update(lista => {
          const copia = [...lista];
          const idxPrev = copia.findIndex(l => l.id === prev.id);
          const idxCurr = copia.findIndex(l => l.id === curr.id);
          if (idxPrev !== -1 && idxCurr !== -1) {
            moveItemInArray(copia, idxPrev, idxCurr);
          }
          return copia;
        });
      }
    } else {
      const item = event.previousContainer.data[event.previousIndex];
      const targetColumnId = event.container.id as EstadoLead;

      /* Soltar en "Perdido" pide el motivo antes de mover nada: como las
         columnas del Kanban se derivan de `leadsLocales` con `computed()`,
         no tocar la señal todavía significa que la tarjeta ni se mueve
         visualmente hasta que se confirme el modal — no hace falta "revertir"
         un movimiento que nunca se aplicó. */
      if (targetColumnId === 'PERDIDO') {
        this.abrirMotivoPerdida(item, motivo => this.moverLeadEnPipeline(item, targetColumnId, motivo));
        return;
      }

      this.moverLeadEnPipeline(item, targetColumnId);
    }
  }

  private moverLeadEnPipeline(item: Lead, targetColumnId: EstadoLead, motivoPerdida?: string): void {
    // 1. Actualización optimista pura sustituyendo la propiedad estado en la señal escribible linkedSignal
    this.leadsLocales.update(lista =>
      lista.map((l: Lead) => (l.id === item.id ? { ...l, estado: targetColumnId } : l)),
    );

    // 2. Persistir en el Backend
    this.leadsService
      .cambiarEstado(item.id, targetColumnId, motivoPerdida)
      .then(() => {
        this.toastService.success(
          `Lead ${item.cliente.nombre} movido a ${this.estadoLabel[targetColumnId]}`,
          'Pipeline Actualizado',
        );
        this.resumen.reload();
      })
      .catch((err: unknown) => {
        this.toastService.error(
          mensajeDeError(err, 'Ocurrió un error al actualizar el estado del lead.'),
          'Error al Mover',
        );
        this.leads.reload(); // Revertir cambios recargando
      });
  }
}
