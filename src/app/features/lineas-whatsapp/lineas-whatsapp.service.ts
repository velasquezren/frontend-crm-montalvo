import { inject, Injectable } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { ActualizarLinea } from './linea-whatsapp.model';
@Injectable({ providedIn: 'root' })
export class LineasWhatsappService {
  private readonly api = inject(ApiService);
  listarRequest(pagina = 1) {
    return this.api.request('/lineas-whatsapp', { pagina, limite: 100 });
  }
  actualizar(id: string, datos: ActualizarLinea) {
    return this.api.patch(`/lineas-whatsapp/${id}`, datos);
  }
}
