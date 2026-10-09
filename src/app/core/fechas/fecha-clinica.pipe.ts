import { DatePipe } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

import { offsetClinica } from './zona-clinica';

/**
 * Una fecha de OPERACIÓN de la clínica: cita, reserva, actividad, pago,
 * campaña programada, vigencia de promoción.
 *
 * Mismos formatos que `DatePipe` —`'d MMM y'`, `'dd/MM/yy HH:mm'`, `'HH:mm'`—
 * pero fijados a la zona de la clínica en vez de a la del dispositivo.
 *
 * ## Por qué hace falta
 *
 * `{{ x | date: 'dd/MM/yyyy' }}` usa la zona del navegador. Las fechas de venta
 * del Excel están guardadas a medianoche de La Paz (04:00 UTC): desde Bolivia
 * se leen bien, pero desde cualquier zona al oeste —Lima o Bogotá, UTC-5— esos
 * mismos instantes caen a las 23:00 del día ANTERIOR, y la venta aparece un día
 * antes. La fecha de una operación no puede depender de dónde esté sentada
 * quien mira.
 *
 * Y `DatePipe` no acepta nombres IANA, solo desfases, que es cómo seis
 * plantillas acabaron con `'-0400'` escrito a mano. Aquí el desfase lo deriva
 * `offsetClinica()` de `ZONA_CLINICA`, que sigue siendo la única fuente.
 *
 * ## Cuándo NO usarlo
 *
 * - **Valores date-only.** «2026-01-02» o un `@db.Date` que llega como
 *   «2026-01-02T00:00:00.000Z» es medianoche UTC; traerlo a La Paz lo retrasa
 *   un día. Esos van con `| date: '…' : 'UTC'`, como la fecha de estudio de
 *   Resultados.
 * - **Marcas técnicas**: `createdAt`, `updatedAt`, `calculadoEn`. No describen
 *   una operación de la clínica, y el usuario las lee como «cuándo pasó esto en
 *   el sistema». Se dejan en la zona del dispositivo a propósito.
 */
@Pipe({ name: 'fechaClinica' })
export class FechaClinicaPipe implements PipeTransform {
  /* Se delega en el `DatePipe` real para no reimplementar su lenguaje de
     formatos: lo único que cambia es de dónde sale la zona. Toma el locale de
     la app, así que el texto es idéntico al de antes. */
  private readonly date = new DatePipe(inject(LOCALE_ID));

  transform(valor: Date | string | number | null | undefined, formato = 'd MMM y'): string {
    if (valor === null || valor === undefined || valor === '') return '';
    return this.date.transform(valor, formato, offsetClinica(valor)) ?? '';
  }
}
