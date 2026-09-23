import { PlantillaResumen } from './conversacion.model';

/**
 * Reglas de una plantilla de WhatsApp vistas desde el chat.
 *
 * Son el espejo de `plantillas-whatsapp.ts` del backend, que es la autoridad:
 * allí se valida y se compone el texto que se guarda. Aquí existen para que la
 * agente vea, antes de pulsar Enviar, exactamente lo que va a leer el paciente
 * y qué le falta completar. Antes el selector enseñaba el cuerpo con sus
 * `{{1}}` y el historial guardaba eso mismo, sin sustituir.
 */

const VARIABLE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** «Dato 1» para una plantilla numerada; el nombre legible para una con nombres. */
export function etiquetaVariable(plantilla: PlantillaResumen, indice: number): string {
  const nombre = plantilla.nombresVariables[indice] ?? String(indice + 1);
  return plantilla.formato === 'NAMED' ? nombre.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : `Dato ${nombre}`;
}

/** Lo que se ve en el teléfono del paciente. Una variable vacía se deja visible como `[Dato 2]`. */
export function renderizarPlantilla(plantilla: PlantillaResumen, valores: readonly string[]): string {
  const cuerpo = plantilla.cuerpo.replace(VARIABLE, (original, nombre: string) => {
    const indice = plantilla.nombresVariables.indexOf(nombre);
    if (indice < 0) return original;
    return valores[indice]?.trim() || `[${etiquetaVariable(plantilla, indice)}]`;
  });
  return plantilla.pie ? `${cuerpo}\n\n${plantilla.pie}` : cuerpo;
}

/** Qué impide mandarla, en palabras de la agente; `null` si está lista. */
export function faltaParaEnviar(plantilla: PlantillaResumen, valores: readonly string[]): string | null {
  if (!plantilla.enviable) return plantilla.motivoNoEnviable ?? 'Esta plantilla no se puede enviar desde el chat.';
  for (let i = 0; i < plantilla.nombresVariables.length; i++) {
    const valor = valores[i]?.trim() ?? '';
    if (!valor) return `Completa «${etiquetaVariable(plantilla, i)}».`;
    if (/[\n\t]| {5,}/.test(valor)) return `«${etiquetaVariable(plantilla, i)}» no puede llevar saltos de línea.`;
  }
  return null;
}
