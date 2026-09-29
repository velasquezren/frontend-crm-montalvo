export interface LineaWhatsapp {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly activa: boolean;
  readonly comercial: boolean;
  readonly conectada: boolean;
  readonly phoneNumberId?: string | null;
  readonly wabaId?: string | null;
  readonly tokenEnv?: string;
}
export interface ActualizarLinea {
  nombre: string;
  telefono?: string;
  phoneNumberId?: string;
  wabaId?: string;
  tokenEnv?: string;
  activa: boolean;
}

/**
 * Una línea que la persona ve y si le suena, tal como lo devuelve
 * `GET /lineas-whatsapp/avisos`. Es de QUIEN PREGUNTA: no hay forma de pedir
 * los de otra.
 */
export interface AvisoLinea {
  readonly lineaId: string;
  readonly nombre: string;
  readonly telefono: string | null;
  /**
   * `false` = la ve, pero sus mensajes no le suenan (ni push ni aviso en la
   * pestaña), salvo los chats que tenga asignados. Ver
   * `LineasWhatsappService.audiencia` en el backend.
   */
  readonly suena: boolean;
}

/**
 * El silencio que se manda al guardar: solo el de líneas que siguen asignadas.
 *
 * El backend rechaza silenciar una línea que la cuenta no tiene —crearía un
 * acceso para guardar el silencio y de paso le daría la línea—. Filtrar aquí
 * evita ese 400 cuando el admin quita una línea que estaba silenciada.
 */
export function silencioParaGuardar(silenciadas: readonly string[], lineaIds: readonly string[]): string[] {
  return silenciadas.filter(id => lineaIds.includes(id));
}
