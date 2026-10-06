import { inject, Injectable } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { ActualizarLinea, AvisoLinea } from './linea-whatsapp.model';
import { MenuAtencion, MenuEditable } from './menu-atencion.model';
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
  /** El menú de atención de una línea (solo SUPER_ADMIN). */
  menuRequest(lineaId: string) {
    return this.api.request(`/menu-atencion/${lineaId}`);
  }
  /** Reemplaza el menú entero. Un 400 trae en `message` la lista de lo que falta. */
  guardarMenu(lineaId: string, menu: MenuAtencion) {
    return this.api.put<MenuEditable>(`/menu-atencion/${lineaId}`, menu);
  }
  /** Idempotente: repetir la misma orden deja lo mismo. */
  fijarAviso(lineaId: string, suena: boolean) {
    return this.api.put<Pick<AvisoLinea, 'lineaId' | 'suena'>>(`/lineas-whatsapp/${lineaId}/avisos`, { suena });
  }
}
