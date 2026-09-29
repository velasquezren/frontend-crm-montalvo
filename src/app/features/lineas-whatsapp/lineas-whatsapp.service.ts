import { inject, Injectable } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { ActualizarLinea, AvisoLinea } from './linea-whatsapp.model';
@Injectable({ providedIn: 'root' })
export class LineasWhatsappService {
  private readonly api = inject(ApiService);
  listarRequest(pagina = 1) {
    return this.api.request('/lineas-whatsapp', { pagina, limite: 100 });
  }
  actualizar(id: string, datos: ActualizarLinea) {
    return this.api.patch(`/lineas-whatsapp/${id}`, datos);
  }
  /** Los avisos de la sesión actual, por línea. */
  avisosRequest(pagina = 1) {
    return this.api.request('/lineas-whatsapp/avisos', { pagina, limite: 100 });
  }
  /** Idempotente: repetir la misma orden deja lo mismo. */
  fijarAviso(lineaId: string, suena: boolean) {
    return this.api.put<Pick<AvisoLinea, 'lineaId' | 'suena'>>(`/lineas-whatsapp/${lineaId}/avisos`, { suena });
  }
}
