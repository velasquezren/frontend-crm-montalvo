import { MensajeApi } from './conversacion.model';

/**
 * Rechazos de Meta que reenviar NO arregla: la causa está del lado de la
 * paciente. Espejo de `reenvio-manual.ts` del backend, que es quien decide; aquí
 * solo evita ofrecer un botón que el servidor va a rechazar.
 */
const NO_SE_ARREGLA_REENVIANDO: ReadonlySet<number> = new Set([131050, 130497, 131026]);

/**
 * ¿Se ofrece «Reenviar» en este mensaje? Un mensaje de una persona que Meta
 * rechazó (FALLIDO) por algo que la clínica puede resolver: la cuenta de Meta,
 * la red, un adjunto. No las plantillas (se mandan otra vez desde «Plantilla»)
 * ni lo que manda el CRM solo. La ventana de 24 h la mira quien llama.
 */
export function sePuedeReenviar(m: MensajeApi): boolean {
  return m.direccion === 'SALIENTE'
    && m.estadoEnvio === 'FALLIDO'
    && !m.envioLocal
    && !m.automatico
    && !m.plantillaCategoria
    && !m.interaccion
    && !(m.codigoErrorEnvio != null && NO_SE_ARREGLA_REENVIANDO.has(m.codigoErrorEnvio));
}
