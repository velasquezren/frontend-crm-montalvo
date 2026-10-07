import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia } from '../../core/api/pagination.model';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ImageViewerComponent } from '../../shared/components/image-viewer/image-viewer.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { ToastService } from '../../core/toast/toast.service';
import { enlaceWhatsApp } from '../../shared/models/telefono';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import {
  EstadoReserva,
  ESTADOS_FILTRO,
  estadoDeReserva,
  fechaDeReserva,
  PaginaReservas,
  PeriodoReservas,
  PERIODOS,
  precioEnBs,
  rangoDePeriodo,
  ReservaAgenda,
} from './reserva.model';
import { ReservasService } from './reservas.service';

/**
 * Reservas: todas las de la agenda de la clínica (las de la web y las de
 * ScriptCase), para quien gestiona las citas. Solo lectura: confirmar, cobrar
 * o anular se sigue haciendo en la agenda. Cada fila abre su ficha en un cajón,
 * con el comprobante y el acceso a su chat.
 */
@Component({
  selector: 'app-reservas-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    ImageViewerComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    PageHeaderComponent,
    PaginatorComponent,
    RouterLink,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reservas.page.html',
})
export class ReservasPage {
  private readonly servicio = inject(ReservasService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly toast = inject(ToastService);
  private readonly fichaTpl = viewChild.required<TemplateRef<unknown>>('fichaTpl');
  private cajon?: OverlayRef;

  protected readonly periodos = PERIODOS;
  protected readonly estadosFiltro = ESTADOS_FILTRO;
  protected readonly estadoDeReserva = estadoDeReserva;
  protected readonly fechaDeReserva = fechaDeReserva;
  protected readonly precioEnBs = precioEnBs;
  protected readonly enlaceWhatsApp = enlaceWhatsApp;

  protected readonly periodo = signal<PeriodoReservas>('mes');
  protected readonly estado = signal<EstadoReserva | null>(null);
  protected readonly busqueda = signal('');
  private readonly busquedaAplicada = signal('');
  protected readonly pagina = signal(1);

  protected readonly reservas = httpResource<PaginaReservas>(
    () => {
      const { desde, hasta } = rangoDePeriodo(this.periodo());
      return this.servicio.listarRequest({ desde, hasta, estado: this.estado(), buscar: this.busquedaAplicada(), pagina: this.pagina() });
    },
    { defaultValue: { ...paginaVacia<ReservaAgenda>(), porEstado: {}, desde: '', hasta: '' } },
  );
  protected readonly hayReservas = computed(() => this.reservas.hasValue() && this.reservas.value().datos.length > 0);
  protected readonly filtrando = computed(() => this.estado() !== null || this.busquedaAplicada() !== '');
  /** Todas las del rango, para el chip «Todas»: la suma de la cuenta por estado. */
  protected readonly totalDelRango = computed(() =>
    this.reservas.hasValue() ? Object.values(this.reservas.value().porEstado).reduce((a, b) => a + b, 0) : 0,
  );
  protected cuentaDe(estado: EstadoReserva): number {
    return this.reservas.hasValue() ? (this.reservas.value().porEstado[estado] ?? 0) : 0;
  }

  protected readonly seleccionada = signal<ReservaAgenda | null>(null);

  protected readonly abriendoComprobante = signal(false);
  protected readonly visorUrl = signal<string | null>(null);
  protected readonly visorTitulo = signal('Comprobante');

  constructor() {
    /* Debounce de 300 ms; onCleanup cancela el timer al teclear de nuevo o al destruir. */
    effect(onCleanup => {
      const termino = this.busqueda();
      const temporizador = setTimeout(() => {
        this.busquedaAplicada.set(termino.trim());
        this.pagina.set(1);
      }, 300);
      onCleanup(() => clearTimeout(temporizador));
    });
    /*
     * La agenda vive en MySQL y no avisa de lo nuevo por el socket del CRM: una
     * reserva hecha en la web aparecería recién al salir y volver. Se refresca
     * cada 2 minutos, solo con la pestaña a la vista, y al volver a ella si pasó
     * más de un minuto. Recargar no parpadea: la tabla se queda mientras llega.
     */
    let ultimaCarga = Date.now();
    const refrescar = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultimaCarga < 60_000) return;
      ultimaCarga = Date.now();
      this.reservas.reload();
    };
    const intervalo = setInterval(refrescar, 120_000);
    document.addEventListener('visibilitychange', refrescar);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', refrescar);
      /* El comprobante abierto vive en un objectURL: se libera al salir de la página. */
      this.liberarVisor();
    });
  }

  protected actualizar(): void {
    this.reservas.reload();
  }

  protected elegirPeriodo(periodo: PeriodoReservas): void {
    this.periodo.set(periodo);
    this.pagina.set(1);
  }

  protected filtrar(estado: EstadoReserva | null): void {
    this.estado.set(estado);
    this.pagina.set(1);
  }

  /** Ficha en memoria: la fila ya trae todo, abrirla no pide nada al servidor. */
  protected abrir(reserva: ReservaAgenda): void {
    this.seleccionada.set(reserva);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.fichaTpl(), this.vcr, {
      onClose: () => {
        this.cajon = undefined;
        this.seleccionada.set(null);
      },
    });
  }

  protected cerrar(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
    this.seleccionada.set(null);
  }

  /**
   * El comprobante: una imagen se ve en el visor; un PDF se abre en otra
   * pestaña, que es donde el navegador sabe mostrarlo.
   */
  protected async verComprobante(reserva: ReservaAgenda): Promise<void> {
    if (this.abriendoComprobante()) return;
    this.abriendoComprobante.set(true);
    try {
      const { blob } = await this.servicio.comprobante(reserva.id);
      const url = URL.createObjectURL(blob);
      if (blob.type === 'application/pdf') {
        window.open(url, '_blank', 'noopener');
        /* La pestaña nueva ya tiene su copia; se libera cuando haya terminado de leerla. */
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
      this.liberarVisor();
      this.visorTitulo.set(`Comprobante de la reserva ${reserva.id}`);
      this.visorUrl.set(url);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo abrir el comprobante.'), 'Comprobante');
    } finally {
      this.abriendoComprobante.set(false);
    }
  }

  protected cerrarVisor(): void {
    this.liberarVisor();
  }

  private liberarVisor(): void {
    const url = this.visorUrl();
    if (url) URL.revokeObjectURL(url);
    this.visorUrl.set(null);
  }
}
