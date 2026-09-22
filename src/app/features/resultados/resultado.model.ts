import { EstadoMensaje } from '../../core/api/db-enums';
import { BadgeVariant } from '../../shared/components/badge/badge.component';
import { IconName } from '../../shared/components/icon/icon.component';

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
  readonly aviso: { readonly enviadoEn: string; readonly estadoMensaje: EstadoMensaje | null } | null;
}

/**
 * ¿Se le puede avisar a este paciente? Vive aquí y no en la página porque la
 * prueba la fija y la plantilla la consulta: escrita dos veces, divergen.
 *
 * El backend vuelve a comprobarlo todo antes de enviar — esto solo evita
 * ofrecer un botón que iba a fallar.
 */
export function sePuedeEntregar(fila: EntregaResultado): boolean {
  return fila.paciente !== null && fila.accesoVigente && (fila.aviso === null || avisoFallido(fila));
}

/**
 * Meta rechazó el aviso DESPUÉS de que el CRM lo diera por enviado —el envío
 * va en segundo plano—, así que consta que el paciente no recibió nada y el
 * backend libera la reserva. INCIERTO no cuenta: pudo llegar.
 */
function avisoFallido(fila: EntregaResultado): boolean {
  return fila.aviso?.estadoMensaje === 'FALLIDO';
}

/**
 * La etiqueta de estado de la fila. Un aviso guardado no es un aviso
 * entregado: pintarlo "Avisado" en verde cuando Meta lo rechazó le dice al
 * asistente que el paciente ya sabe, y nadie vuelve a mirar.
 */
export function estadoEntrega(fila: EntregaResultado): { texto: string; variant: BadgeVariant; icon: IconName } {
  const estado = fila.aviso?.estadoMensaje;
  if (fila.aviso) {
    if (estado === 'FALLIDO') return { texto: 'No se entregó', variant: 'critical', icon: 'alert-circle' };
    if (estado === 'INCIERTO') return { texto: 'Sin confirmar', variant: 'neutral', icon: 'clock' };
    if (estado === 'ENTREGADO' || estado === 'LEIDO') return { texto: 'Entregado', variant: 'success', icon: 'check-check' };
    return { texto: 'Enviado', variant: 'info', icon: 'check' };
  }
  if (!fila.accesoVigente) return { texto: 'Acceso vencido', variant: 'critical', icon: 'alert-circle' };
  if (!fila.paciente) return { texto: 'Sin vincular', variant: 'neutral', icon: 'user-plus' };
  return { texto: 'Pendiente de avisar', variant: 'info', icon: 'clock' };
}

/** Por qué no se puede, en las palabras que ve el asistente. */
export function motivoBloqueo(fila: EntregaResultado): string {
  if (fila.aviso?.estadoMensaje === 'INCIERTO') return 'Esperando confirmación de WhatsApp';
  if (fila.aviso) return 'Ya se le avisó';
  if (!fila.paciente) return 'Sin ficha en el CRM';
  if (!fila.accesoVigente) return 'Acceso vencido';
  return '';
}
