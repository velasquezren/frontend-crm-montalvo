import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ImageViewerComponent } from '../../../../shared/components/image-viewer/image-viewer.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PaginatorComponent } from '../../../../shared/components/paginator/paginator.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { AnuncioSinPromocion, PromocionResumen } from '../../promocion.model';
import { PromocionesService } from '../../promociones.service';
import { FechaClinicaPipe } from '../../../../core/fechas/fecha-clinica.pipe';

/**
 * «Anuncios de Meta»: los anuncios que ya trajeron pacientes por WhatsApp y
 * nadie enlazó a una promoción, con el titular y la imagen tal como llegaron.
 * Enlazar uno hace que el CRM sepa de qué promoción viene cada paciente que
 * entre por él. No usa la API de anuncios de Meta: sale de lo que el CRM ya
 * guarda de cada paciente que llegó por un anuncio.
 */
@Component({
  selector: 'app-anuncios-meta',
  imports: [
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
    ImageViewerComponent,
    LoadingSkeletonComponent,
    PaginatorComponent,
    SelectComponent,
    TableComponent, FechaClinicaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './anuncios-meta.component.html',
  styleUrl: './anuncios-meta.component.css',
})
export class AnunciosMetaComponent {
  private readonly servicio = inject(PromocionesService);
  private readonly toast = inject(ToastService);

  protected readonly pagina = signal(1);
  protected readonly anuncios = httpResource<RespuestaPaginada<AnuncioSinPromocion>>(
    () => this.servicio.anunciosSinPromocionRequest(this.pagina()),
    { defaultValue: paginaVacia<AnuncioSinPromocion>() },
  );
  protected readonly hayAnuncios = computed(() => this.anuncios.hasValue() && this.anuncios.value().datos.length > 0);

  /** A qué se puede enlazar: todo menos lo archivado. */
  private readonly promociones = httpResource<RespuestaPaginada<PromocionResumen>>(() => this.servicio.activasRequest(), {
    defaultValue: paginaVacia<PromocionResumen>(),
  });
  protected readonly destinos = computed(() =>
    this.promociones.hasValue() ? this.promociones.value().datos.filter(p => p.estado !== 'ARCHIVADA') : [],
  );
  protected readonly enlazando = signal<string | null>(null);

  /** La imagen abierta en el visor a pantalla completa. */
  protected readonly ampliada = signal<{ readonly url: string; readonly titulo: string } | null>(null);
  /**
   * Imágenes que no cargaron. Las URL que manda Meta en el referral son del CDN de
   * Facebook y caducan a las semanas: sin esto la celda quedaba vacía, sin decir nada.
   */
  protected readonly fallidas = signal<ReadonlySet<string>>(new Set());

  protected ampliar(a: AnuncioSinPromocion): void {
    if (a.imagenUrl && !this.fallidas().has(a.anuncioId)) this.ampliada.set({ url: a.imagenUrl, titulo: a.titular ?? `Anuncio ${a.anuncioId}` });
  }

  protected noCargo(anuncioId: string): void {
    this.fallidas.update(f => new Set(f).add(anuncioId));
  }

  protected async enlazar(anuncioId: string, promocionId: string): Promise<void> {
    if (!promocionId || this.enlazando()) return;
    this.enlazando.set(anuncioId);
    try {
      const p = await this.servicio.asignarAnuncio(promocionId, anuncioId);
      this.toast.success(`Enlazado a «${p.titulo}». Quien llegue por ese anuncio se atribuye a la promoción.`);
      this.anuncios.reload();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo enlazar el anuncio.'));
    } finally {
      this.enlazando.set(null);
    }
  }
}
