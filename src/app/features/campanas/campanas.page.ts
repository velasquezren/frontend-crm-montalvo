import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { CATEGORIA_BADGE, CATEGORIA_ICONO, CATEGORIA_LABEL } from '../../shared/models/cliente-categoria.model';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import {
  accionesDe,
  avance,
  Campana,
  dentroDeHorarioEnvio,
  HORARIO_ENVIO,
  DestinatarioCampana,
  ESTADO_CAMPANA,
  ESTADO_DESTINATARIO,
  EstadoDestinatario,
  porcentaje,
} from './campana.model';
import { CampanasService } from './campanas.service';

/**
 * Cada cuánto se refresca una campaña que está saliendo. El respaldo de todo
 * el CRM (`crm-rendimiento`): la entrega y la lectura llegan durante horas, y
 * una audiencia de Gold y Silver sale entera en menos de un minuto.
 */
const REFRESCO_MS = 60_000;

const FILTROS_DESTINATARIO: readonly (EstadoDestinatario | null)[] = [null, 'PENDIENTE', 'ENVIADO', 'OMITIDO', 'FALLIDO'];

/**
 * Campañas: qué se mandó, cómo va y qué pasó. Se lanzan desde Audiencias.
 *
 * Las métricas las cuenta el servidor sobre los mensajes, que el webhook de
 * Meta va marcando entregados y leídos; mientras una campaña sale, su ficha se
 * refresca sola. Pausar, reanudar y cancelar son del propietario.
 */
@Component({
  selector: 'app-campanas-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    DrawerComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    NombreClientePipe,
    PageHeaderComponent,
    PaginatorComponent,
    RouterLink,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campanas.page.html',
  styleUrl: './campanas.page.css',
})
export class CampanasPage {
  private readonly campanasService = inject(CampanasService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private readonly fichaTpl = viewChild.required<TemplateRef<unknown>>('fichaTpl');
  private cajon?: OverlayRef;

  protected readonly puedeControlar = inject(AuthService).isSuperAdmin;
  protected readonly estadoCampana = ESTADO_CAMPANA;
  protected readonly estadoDestinatario = ESTADO_DESTINATARIO;
  protected readonly filtrosDestinatario = FILTROS_DESTINATARIO;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcono = CATEGORIA_ICONO;
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly porcentaje = porcentaje;
  protected readonly accionesDe = accionesDe;
  protected readonly avance = avance;
  protected readonly horario = HORARIO_ENVIO;
  /** Se recalcula con cada refresco de la ficha: es la hora en que se miró. */
  protected readonly enHorario = computed(() => {
    this.detalle.value();
    return dentroDeHorarioEnvio(new Date());
  });

  /* ── Listado ───────────────────────────────────────────────────── */
  protected readonly pagina = signal(1);
  protected readonly campanas = httpResource<RespuestaPaginada<Campana>>(
    () => this.campanasService.listarRequest(this.pagina()),
    { defaultValue: paginaVacia<Campana>() },
  );

  /* ── Ficha de una campaña ──────────────────────────────────────── */
  protected readonly seleccionadaId = signal<string | null>(null);
  protected readonly detalle = httpResource<Campana>(() => {
    const id = this.seleccionadaId();
    return id ? this.campanasService.detalleRequest(id) : undefined;
  });
  protected readonly filtroDestinatario = linkedSignal<string | null, EstadoDestinatario | null>({
    source: this.seleccionadaId,
    computation: () => null,
  });
  protected readonly paginaDestinatarios = linkedSignal({
    source: () => [this.seleccionadaId(), this.filtroDestinatario()],
    computation: () => 1,
  });
  protected readonly destinatarios = httpResource<RespuestaPaginada<DestinatarioCampana>>(
    () => {
      const id = this.seleccionadaId();
      return id ? this.campanasService.destinatariosRequest(id, this.paginaDestinatarios(), this.filtroDestinatario()) : undefined;
    },
    { defaultValue: paginaVacia<DestinatarioCampana>() },
  );
  protected readonly ocupada = signal(false);
  /** Cancelar no se deshace: pide un segundo clic, en línea. */
  protected readonly confirmandoCancelacion = linkedSignal({ source: this.seleccionadaId, computation: () => false });

  /** `?id=` abre su ficha: es a donde lleva Audiencias al crear una. */
  private readonly idEnRuta = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(p => p.get('id'))), { initialValue: null });

  constructor() {
    effect(() => {
      const id = this.idEnRuta();
      if (!id) return;
      untracked(() => {
        void this.router.navigate([], { queryParams: { id: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.abrir(id);
      });
    });

    /* Mientras la abierta está saliendo, se refresca sola. */
    effect(onCleanup => {
      const estado = this.detalle.hasValue() ? this.detalle.value().estado : null;
      if (estado !== 'ENVIANDO' && estado !== 'PROGRAMADA') return;
      const temporizador = setInterval(() => {
        this.detalle.reload();
        this.destinatarios.reload();
        this.campanas.reload();
      }, REFRESCO_MS);
      onCleanup(() => clearInterval(temporizador));
    });
  }

  protected abrir(id: string): void {
    this.seleccionadaId.set(id);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.fichaTpl(), this.vcr, {
      onClose: () => {
        this.cajon = undefined;
        this.seleccionadaId.set(null);
      },
    });
  }

  protected cerrar(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
    this.seleccionadaId.set(null);
  }

  protected pausar(c: Campana): Promise<void> {
    return this.ejecutar(() => this.campanasService.pausar(c.id), 'Pausada: no sale nadie más hasta que la reanudes.');
  }

  protected reanudar(c: Campana): Promise<void> {
    return this.ejecutar(() => this.campanasService.reanudar(c.id), 'Reanudada.');
  }

  protected cancelar(c: Campana): Promise<void> {
    return this.ejecutar(() => this.campanasService.cancelar(c.id), 'Cancelada: las pendientes no saldrán.');
  }

  private async ejecutar(accion: () => Promise<Campana>, exito: string): Promise<void> {
    if (this.ocupada()) return;
    this.ocupada.set(true);
    try {
      await accion();
      this.toast.success(exito);
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo cambiar la campaña.'));
    } finally {
      this.ocupada.set(false);
      this.confirmandoCancelacion.set(false);
      this.detalle.reload();
      this.destinatarios.reload();
      this.campanas.reload();
    }
  }

  /** «Entregado», «Leído», el rechazo de Meta… lo que pasó con el mensaje de una paciente. */
  protected entregaDe(d: DestinatarioCampana): string {
    const m = d.mensaje;
    if (!m) return '—';
    if (m.leidoEn || m.estadoEnvio === 'LEIDO') return 'Leído';
    if (m.entregadoEn || m.estadoEnvio === 'ENTREGADO') return 'Entregado';
    if (m.estadoEnvio === 'FALLIDO') return m.codigoErrorEnvio === 131049 ? 'No entregado: tope de Meta' : 'No entregado';
    if (m.estadoEnvio === 'INCIERTO') return 'Sin confirmar';
    return 'Enviado';
  }

  protected readonly hayCampanas = computed(() => this.campanas.value().datos.length > 0);
}
