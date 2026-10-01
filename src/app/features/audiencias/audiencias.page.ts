import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { Campana } from '../campanas/campana.model';
import { NuevaCampanaComponent } from '../campanas/nueva-campana/nueva-campana.component';

import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InfoHintComponent } from '../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { SelectComponent } from '../../shared/components/select/select.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { TableComponent } from '../../shared/components/table/table.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICONO,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../shared/models/cliente-categoria.model';
import { MonedaPipe } from '../../shared/pipes/moneda.pipe';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import {
  costoMaximoUsd,
  FiltroAudiencia,
  MOTIVOS_EXCLUSION,
  PaginaAudiencia,
  paginaAudienciaVacia,
  PLAZOS_SIN_CAMPANA,
  TARIFA_MARKETING_REFERENCIA_USD,
} from './audiencia.model';
import { AudienciasService } from './audiencias.service';

/** De más a menos valor: el orden en que se eligen. */
const CATEGORIAS: readonly CategoriaCliente[] = ['GOLD', 'SILVER', 'BRONZE', 'PROSPECTO'];

/**
 * Audiencias: a quién vale la pena mandarle una campaña HOY.
 *
 * Cruza cuánto vale cada paciente (su categoría por valor) con si conviene
 * escribirle ahora, y dice cuántas son, por qué quedó fuera el resto y cuánto
 * costaría. Todo lo decide el servidor (`GET /audiencias`); aquí solo se elige,
 * se pinta y se estima el costo. No envía nada.
 */
@Component({
  selector: 'app-audiencias-page',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    InfoHintComponent,
    InputComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    NuevaCampanaComponent,
    NombreClientePipe,
    PageHeaderComponent,
    PaginatorComponent,
    RouterLink,
    SelectComponent,
    SwitchComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audiencias.page.html',
})
export class AudienciasPage {
  private readonly audiencias = inject(AudienciasService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private readonly nuevaCampanaTpl = viewChild.required<TemplateRef<unknown>>('nuevaCampanaTpl');
  private cajon?: OverlayRef;

  /** Lanzar una campaña es del propietario: el backend lo exige (403). */
  protected readonly puedeLanzar = inject(AuthService).isSuperAdmin;

  protected readonly categoriasDisponibles = CATEGORIAS;
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcono = CATEGORIA_ICONO;
  protected readonly plazos = PLAZOS_SIN_CAMPANA;

  /* ── Filtros ───────────────────────────────────────────────────── */
  /** Por defecto, quien vale la pena: Gold y Silver (igual que el backend). */
  protected readonly categorias = signal<readonly CategoriaCliente[]>(['GOLD', 'SILVER']);
  protected readonly diasSinCampana = signal(30);
  protected readonly soloConversaron = signal(false);
  /** Vuelve a 1 con cada filtro: una página 4 de otra audiencia no significa nada. */
  protected readonly pagina = linkedSignal({
    source: () => [this.categorias(), this.diasSinCampana(), this.soloConversaron()],
    computation: () => 1,
  });
  /** Dólares por plantilla entregada; editable porque Meta cambia la tarifa. */
  protected readonly tarifa = signal(String(TARIFA_MARKETING_REFERENCIA_USD));

  private readonly filtro = computed<FiltroAudiencia>(() => ({
    categorias: this.categorias(),
    diasSinCampana: this.diasSinCampana(),
    soloConversaron: this.soloConversaron(),
    pagina: this.pagina(),
  }));

  protected readonly audiencia = httpResource<PaginaAudiencia>(
    () => this.audiencias.segmentarRequest(this.filtro()),
    { defaultValue: paginaAudienciaVacia() },
  );

  /* ── Derivados ─────────────────────────────────────────────────── */
  protected readonly resumen = computed(() => this.audiencia.value().resumen);
  /** Los pasos del embudo que aplican: «nunca escribió» solo si se pidió. */
  protected readonly motivos = computed(() =>
    MOTIVOS_EXCLUSION.filter(m => m.motivo !== 'SIN_CONVERSAR' || this.soloConversaron()),
  );
  protected readonly tarifaUsd = computed(() => Number(this.tarifa().replace(',', '.')));
  protected readonly tarifaInvalida = computed(() => !Number.isFinite(this.tarifaUsd()) || this.tarifaUsd() < 0);
  protected readonly costo = computed(() => costoMaximoUsd(this.resumen().elegibles, this.tarifaUsd()));

  /* ── Acciones ──────────────────────────────────────────────────── */
  protected estaElegida(categoria: CategoriaCliente): boolean {
    return this.categorias().includes(categoria);
  }

  /** Alterna una categoría; la última no se puede quitar: una audiencia sin categorías no es nada. */
  protected alternarCategoria(categoria: CategoriaCliente): void {
    const actuales = this.categorias();
    if (actuales.includes(categoria)) {
      if (actuales.length > 1) this.categorias.set(actuales.filter(c => c !== categoria));
      return;
    }
    this.categorias.set(CATEGORIAS.filter(c => c === categoria || actuales.includes(c)));
  }

  protected cambiarPlazo(valor: string): void {
    this.diasSinCampana.set(Number(valor));
  }

  /** El filtro que se está viendo, tal como viaja con la campaña. */
  protected readonly filtroCampana = computed(() => ({
    categorias: this.categorias(),
    diasSinCampana: this.diasSinCampana(),
    soloConversaron: this.soloConversaron(),
  }));

  protected abrirNuevaCampana(): void {
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.nuevaCampanaTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  protected cerrarNuevaCampana(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
  }

  /** Creada: a su ficha en Campañas, donde se sigue cómo sale. */
  protected alCrearCampana(campana: Campana): void {
    this.cerrarNuevaCampana();
    void this.router.navigate(['/campanas'], { queryParams: { id: campana.id } });
  }
}
