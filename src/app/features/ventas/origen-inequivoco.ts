/**
 * Qué lead se preselecciona como origen de una venta.
 *
 * La regla vive aparte de la página a propósito: es lo único delicado de
 * CAMP-1 y lo que hay que dejar fijado. El selector de origen existía desde el
 * 2026-08-21 pero arrancaba siempre en «Ninguno», y medido en producción el
 * 2026-09-18 las 14 ventas de la base tenían `leadId` en NULL — sin ese enlace
 * no se puede ir de una venta al anuncio que la originó sin reconstruirlo a ojo.
 *
 * **Solo se elige cuando no hay ambigüedad.** Con dos leads abiertos no se
 * devuelve ninguno: quedarse con el más reciente sería inventar de qué anuncio
 * vino la venta, y una atribución falsa es peor que un `null` honesto porque
 * nadie la audita después. El caso no es hipotético — hay 16 clientes con dos
 * leads.
 */
export function origenInequivoco(leadsAbiertos: readonly { readonly id: string }[]): string | null {
  return leadsAbiertos.length === 1 ? leadsAbiertos[0].id : null;
}
