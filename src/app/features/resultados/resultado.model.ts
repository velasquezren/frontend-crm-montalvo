/**
 * Espejo de `FilaEntrega` (backend: modules/resultados/resultados.service.ts).
 *
 * El portal de resultados es otro sistema: el CRM solo recibe lo justo para
 * decidir a quién avisar. Nunca llega el código de acceso del paciente, ni el
 * PDF, ni nada clínico.
 */
export interface EntregaResultado {
  readonly informeId: string;
  readonly estudio: string;
  /** Fecha del estudio, ISO 8601. */
  readonly fechaEstudio: string;
  readonly publicadoEn: string | null;
  /** Si el acceso del paciente venció o fue revocado, no se puede avisar. */
  readonly accesoVigente: boolean;
  /** `null` = el PAC no cruza con ninguna ficha del CRM. */
  readonly paciente: { readonly id: string; readonly nombre: string; readonly telefono: string } | null;
  /** `null` = todavía no se le avisó. */
  readonly aviso: { readonly enviadoEn: string; readonly estadoMensaje: string | null } | null;
}

/**
 * ¿Se le puede avisar a este paciente? Vive aquí y no en la página porque la
 * prueba la fija y la plantilla la consulta: escrita dos veces, divergen.
 *
 * El backend vuelve a comprobarlo todo antes de enviar — esto solo evita
 * ofrecer un botón que iba a fallar.
 */
export function sePuedeEntregar(fila: EntregaResultado): boolean {
  return fila.paciente !== null && fila.accesoVigente && fila.aviso === null;
}

/** Por qué no se puede, en las palabras que ve el asistente. */
export function motivoBloqueo(fila: EntregaResultado): string {
  if (fila.aviso) return 'Ya se le avisó';
  if (!fila.paciente) return 'Sin ficha en el CRM';
  if (!fila.accesoVigente) return 'Acceso vencido';
  return '';
}
