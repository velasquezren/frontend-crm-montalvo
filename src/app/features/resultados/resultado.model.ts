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
  /** La ficha del CRM a la que se enviaría. `null` = no se reconoció. */
  readonly paciente: { readonly id: string; readonly nombre: string; readonly telefono: string } | null;
  /** Por qué clave se reconoció. Con CI, la asistente compara el nombre. */
  readonly vinculo: 'PAC' | 'CI' | null;
  /** Por qué no se reconoció. */
  readonly sinFicha: 'SIN_COINCIDENCIA' | 'CI_REPETIDO' | null;
  /** Cómo figura el paciente en el portal de resultados. */
  readonly pacientePortal: { readonly nombre: string; readonly pac: string | null; readonly ci: string | null };
  /** `null` = todavía no se le avisó. */
  readonly aviso: { readonly enviadoEn: string; readonly estadoMensaje: EstadoMensaje | null } | null;
  /** Primera vez que el paciente abrió su informe. Entregado no es visto: esto sí. */
  readonly abiertoEn: string | null;
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
  /* Lo que de verdad importa va primero: si lo abrió, lo demás ya da igual. */
  if (fila.abiertoEn) return { texto: 'Abierto por el paciente', variant: 'success', icon: 'eye' };
  if (fila.aviso) {
    if (estado === 'FALLIDO') return { texto: 'No se entregó', variant: 'critical', icon: 'alert-circle' };
    if (estado === 'INCIERTO') return { texto: 'Sin confirmar', variant: 'neutral', icon: 'clock' };
    if (estado === 'ENTREGADO' || estado === 'LEIDO') return { texto: 'Entregado', variant: 'success', icon: 'check-check' };
    return { texto: 'Enviado', variant: 'info', icon: 'check' };
  }
  if (!fila.accesoVigente) return { texto: 'Enlace vencido', variant: 'neutral', icon: 'clock' };
  if (fila.sinFicha === 'CI_REPETIDO') return { texto: 'CI repetido', variant: 'critical', icon: 'alert-circle' };
  if (!fila.paciente) return { texto: 'Sin vincular', variant: 'neutral', icon: 'user-plus' };
  return { texto: 'Pendiente de avisar', variant: 'info', icon: 'clock' };
}

/**
 * El enlace venció y el paciente está reconocido: se puede extender y volver
 * a avisar en un paso. El enlace es el mismo, así que el mensaje anterior
 * también vuelve a abrir.
 */
export function sePuedeRenovar(fila: EntregaResultado): boolean {
  return fila.paciente !== null && !fila.accesoVigente;
}

/** Por qué no se puede, en las palabras que ve el asistente. */
export function motivoBloqueo(fila: EntregaResultado): string {
  if (fila.aviso?.estadoMensaje === 'INCIERTO') return 'Esperando confirmación de WhatsApp';
  if (fila.aviso) return 'Ya se le avisó';
  if (fila.sinFicha === 'CI_REPETIDO') return 'Su CI está en dos fichas: corrígelas';
  if (!fila.paciente) return 'Sin ficha con ese PAC o CI';
  if (!fila.accesoVigente) return 'Enlace vencido';
  return '';
}

/**
 * ¿El nombre del portal y el de la ficha parecen de personas distintas?
 *
 * Ignora mayúsculas, tildes y el orden de las palabras: «Andrea Avendaño» y
 * «AVENDANO ANDREA» son la misma persona escrita por dos manos. Solo avisa;
 * quien decide si enviar es la asistente.
 */
export function nombresDistintos(uno: string, otro: string): boolean {
  const palabras = (nombre: string) =>
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  return palabras(uno) !== palabras(otro);
}
