import { DatePipe } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';

/**
 * Un DÍA DE CALENDARIO, no un instante: lo que llega como «2026-09-20».
 *
 * Son las columnas `@db.Date` del backend (vigencias, ausencias) y los campos
 * que ya viajan como texto, como la fecha de estudio de un informe. No tienen
 * hora, así que no tienen zona: el día que dice la cadena es el día que se
 * muestra, y aquí no se convierte nada.
 *
 * ## Por qué no basta `| date: '…' : 'UTC'`
 *
 * Parece que sí, y en Bolivia funciona. Pero `DatePipe` parsea «2026-09-20»
 * como medianoche **LOCAL**, y solo después aplica la zona que se le pide. Al
 * oeste de UTC eso sobra hacia el día correcto por casualidad; al este, no.
 * Medido con la suite de `fecha-clinica.pipe.spec.ts`:
 *
 *     TZ=America/La_Paz → 20 sep     TZ=Europe/Madrid → 19 sep
 *     TZ=America/Lima   → 20 sep     TZ=Asia/Tokyo    → 19 sep
 *
 * Es decir: la fecha de estudio de Resultados acertaba porque sus usuarios
 * están al oeste, no porque el código lo garantizara.
 *
 * Aquí se parsean los componentes de la cadena y se construye medianoche UTC
 * explícita con `Date.UTC`, que no mira la zona del proceso. El resultado es el
 * mismo en cualquier máquina.
 *
 * Para un instante de verdad —una cita, un pago, una actividad— va
 * `FechaClinicaPipe`, que sí tiene zona y es la de la clínica.
 */
@Pipe({ name: 'fechaCivil' })
export class FechaCivilPipe implements PipeTransform {
  private readonly date = new DatePipe(inject(LOCALE_ID));

  transform(valor: string | null | undefined, formato = 'd MMM y'): string {
    if (!valor) return '';
    /* Se lee el día de la propia cadena. Sirve igual para «2026-09-20» que
       para el «2026-09-20T00:00:00.000Z» con el que la API serializa un
       `@db.Date`: en los dos casos el día es el que está escrito. */
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    if (!partes) return '';
    const dia = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
    return this.date.transform(dia, formato, 'UTC') ?? '';
  }
}
