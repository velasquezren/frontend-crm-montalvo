import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { ESTADO_PROMOCION, EstadoPromocion, FILTROS_ESTADO, PromocionResumen, rangoVigencia, VIGENCIA } from '../../promocion.model';
import { PromocionesService } from '../../promociones.service';
import { PromocionFichaComponent } from '../promocion-ficha/promocion-ficha.component';

/**
 * La pestaña «Promociones»: todas, filtradas por estado, con su ficha en un
 * cajón. Lo que espera revisión va primero en los filtros: es lo que un
 * administrador tiene que mirar.
 */
@Component({
  selector: 'app-promociones-lista',
  imports: [
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    PaginatorComponent,
    PromocionFichaComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promociones-lista.component.html',
  styleUrl: './promociones-lista.component.css',
})
export class PromocionesListaComponent {
  private readonly servicio = inject(PromocionesService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private readonly fichaTpl = viewChild.required<TemplateRef<unknown>>('fichaTpl');
  private cajon?: OverlayRef;

  /** «Nueva promoción» del estado vacío: la abre la página. */
  readonly nueva = output<void>();

  protected readonly puedeRedactar = inject(AuthService).puedeGestionComercial;
  protected readonly estados = ESTADO_PROMOCION;
  protected readonly vigencias = VIGENCIA;
  protected readonly filtros = FILTROS_ESTADO;
  protected readonly rangoVigencia = rangoVigencia;

  protected readonly estado = signal<EstadoPromocion | null>(null);
  protected readonly busqueda = signal('');
  private readonly busquedaAplicada = signal('');
  protected readonly pagina = signal(1);

  protected readonly promociones = httpResource<RespuestaPaginada<PromocionResumen>>(
    () => this.servicio.listarRequest({ estado: this.estado(), buscar: this.busquedaAplicada(), pagina: this.pagina() }),
    { defaultValue: paginaVacia<PromocionResumen>() },
  );
  protected readonly hayPromociones = computed(() => this.promociones.hasValue() && this.promociones.value().datos.length > 0);
  protected readonly filtrando = computed(() => this.estado() !== null || this.busquedaAplicada() !== '');

  protected readonly seleccionadaId = signal<string | null>(null);

  /** `?id=` abre su ficha: es a donde lleva la página al crear una promoción. */
  private readonly idEnRuta = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(p => p.get('id'))), { initialValue: null });

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

    effect(() => {
      const id = this.idEnRuta();
      if (!id) return;
      untracked(() => {
        void this.router.navigate([], { queryParams: { id: null }, queryParamsHandling: 'merge', replaceUrl: true });
        this.promociones.reload();
        this.abrir(id);
      });
    });
  }

  protected filtrar(estado: EstadoPromocion | null): void {
    this.estado.set(estado);
    this.pagina.set(1);
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
}
