import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { AccionPromocion, CambiosPromocion, EstadoPromocion, FormatoBanner, PromocionDetalle } from './promocion.model';

export interface FiltroPromociones {
  readonly estado: EstadoPromocion | null;
  readonly buscar: string;
  readonly pagina: number;
}

/**
 * Promociones: la agente redacta, un ADMIN publica, la landing la muestra. El
 * backend vuelve a exigir el permiso según el estado de cada una.
 */
@Injectable({ providedIn: 'root' })
export class PromocionesService {
  private readonly api = inject(ApiService);

  listarRequest(filtro: FiltroPromociones): ResourceRequest {
    return this.api.request('/promociones', { estado: filtro.estado, buscar: filtro.buscar.trim(), pagina: filtro.pagina });
  }

  detalleRequest(id: string): ResourceRequest {
    return this.api.request(`/promociones/${id}`);
  }

  /** Todas las que pueden recibir un anuncio: para el selector de «Anuncios de Meta». */
  activasRequest(): ResourceRequest {
    return this.api.request('/promociones', { limite: 100 });
  }

  anunciosSinPromocionRequest(pagina: number): ResourceRequest {
    return this.api.request('/promociones/anuncios/sin-promocion', { pagina });
  }

  crear(cambios: CambiosPromocion & { titulo: string; resumen: string; vigenteDesde: string }): Promise<PromocionDetalle> {
    return this.api.post<PromocionDetalle>('/promociones', cambios);
  }

  actualizar(id: string, version: number, cambios: CambiosPromocion): Promise<PromocionDetalle> {
    return this.api.patch<PromocionDetalle>(`/promociones/${id}`, { ...cambios, version });
  }

  transicion(id: string, accion: AccionPromocion, motivo?: string): Promise<PromocionDetalle> {
    return this.api.post<PromocionDetalle>(`/promociones/${id}/${accion}`, accion === 'devolver' ? { motivo } : {});
  }

  subirBanner(id: string, formato: FormatoBanner, archivo: File, textoAlternativo: string): Promise<PromocionDetalle> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    datos.append('textoAlternativo', textoAlternativo);
    return this.api.put<PromocionDetalle>(`/promociones/${id}/banners/${formato}`, datos);
  }

  quitarBanner(id: string, formato: FormatoBanner): Promise<PromocionDetalle> {
    return this.api.delete<PromocionDetalle>(`/promociones/${id}/banners/${formato}`);
  }

  asignarAnuncio(id: string, anuncioId: string): Promise<PromocionDetalle> {
    return this.api.put<PromocionDetalle>(`/promociones/${id}/anuncios/${anuncioId}`);
  }

  quitarAnuncio(id: string, anuncioId: string): Promise<PromocionDetalle> {
    return this.api.delete<PromocionDetalle>(`/promociones/${id}/anuncios/${anuncioId}`);
  }
}
