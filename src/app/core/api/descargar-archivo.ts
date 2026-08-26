/**
 * Entrega un `Blob` ya descargado (de `ApiService.getBlob()`) al navegador
 * como archivo — el paso final común a cualquier exportación (Excel, PDF…).
 *
 * Vive junto a `getBlob()` en vez de en cada página: es el mismo truco del
 * `<a>` invisible en las dos vistas que ya descargan un informe, y una
 * tercera no debería tener que reinventarlo.
 */
export function descargarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  // Sin revocar, el blob queda retenido en memoria hasta recargar la página.
  URL.revokeObjectURL(url);
}
