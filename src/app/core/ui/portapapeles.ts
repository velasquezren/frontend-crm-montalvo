/**
 * Copia texto al portapapeles y dice la verdad sobre si lo logró.
 *
 * Había cinco copias de esto con tres comportamientos: Perfil anunciaba
 * «Copiado» sin esperar a la promesa, Pacientes callaba si fallaba, y el chat
 * caía a `execCommand('copy')` y anunciaba éxito sin mirar lo que devolvía
 * (`false` cuando el navegador no copia). Quien llama decide el aviso con el
 * booleano; aquí no se muestra nada.
 *
 * `navigator.clipboard` exige contexto seguro y, en Safari, gesto del usuario:
 * se llama desde el manejador del clic. El respaldo cubre cuando la API no
 * existe o rechaza (documento sin foco, permiso denegado); `execCommand` está
 * obsoleto pero sigue siendo el único camino en ese caso.
 */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      /* cae al respaldo */
    }
  }
  return copiarConSeleccion(texto);
}

/* `readonly` evita que el teclado del teléfono se abra, pero en Safari de iOS
   `select()` no selecciona nada en un campo de solo lectura: hace falta
   `setSelectionRange`. Seleccionar mueve el foco al área auxiliar, así que se
   devuelve a donde estaba (un cajón, el chat) en vez de dejarlo en el body. */
function copiarConSeleccion(texto: string): boolean {
  if (typeof document === 'undefined') return false;
  const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = texto;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, texto.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    previo?.focus();
  }
}
