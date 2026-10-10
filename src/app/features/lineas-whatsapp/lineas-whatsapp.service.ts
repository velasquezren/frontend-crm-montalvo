import { inject, Injectable } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { AsistenteEditable, GuardarAsistente, ResultadoPrueba } from './asistente-linea.model';
import { ActualizarLinea, AvisoLinea } from './linea-whatsapp.model';
import { MenuAtencion, MenuEditable } from './menu-atencion.model';
import { CobroEditable, GuardarCobro } from './cobro-linea.model';
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
  /** El QR de cobro de una línea (solo SUPER_ADMIN). */
  /** El asistente de IA de la línea (SUPER_ADMIN). */
  asistenteRequest(lineaId: string) {
    return this.api.request(`/asistente/lineas/${lineaId}`);
  }
  guardarAsistente(lineaId: string, datos: GuardarAsistente) {
    return this.api.put<AsistenteEditable>(`/asistente/lineas/${lineaId}`, datos);
  }
  /** Prueba de punta a punta contra Google, con datos sintéticos. */
  probarAsistente() {
    return this.api.post<ResultadoPrueba>('/asistente/probar', {});
  }
  cobroRequest(lineaId: string) {
    return this.api.request(`/cobros/${lineaId}`);
  }
  guardarCobro(lineaId: string, datos: GuardarCobro) {
    return this.api.put<CobroEditable>(`/cobros/${lineaId}`, datos);
  }
  /** La imagen del QR; reemplazarla crea otra. */
  subirQr(lineaId: string, archivo: File) {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return this.api.put<CobroEditable>(`/cobros/${lineaId}/qr`, datos);
  }
  /** Idempotente: repetir la misma orden deja lo mismo. */
  fijarAviso(lineaId: string, suena: boolean) {
    return this.api.put<Pick<AvisoLinea, 'lineaId' | 'suena'>>(`/lineas-whatsapp/${lineaId}/avisos`, { suena });
  }
}
