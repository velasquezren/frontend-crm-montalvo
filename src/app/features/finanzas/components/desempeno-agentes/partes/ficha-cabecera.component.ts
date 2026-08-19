import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AvatarComponent } from '../../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../../shared/components/badge/badge.component';
import { MonedaPipe } from '../../../../../shared/pipes/moneda.pipe';
import { FilaConsolidado } from '../../../../planilla-comisiones/planilla.model';

/**
 * Quién es la ejecutiva y cuánto se le transfiere este mes.
 *
 * Es la única cifra de la pantalla que administración copia a un comprobante,
 * así que se muestra sola y en grande, y nada más compite con ella.
 *
 * ## La moneda de cada campo NO es opcional aquí
 *
 * `totalGanado` y `sueldoBase` vienen en BOLIVIANOS (el backend calcula
 * `totalGanado = totalBob + sueldoBase`), mientras que `montoVendido`,
 * `totalUsd` y las tres comisiones vienen en DÓLARES. El pipe `moneda` asume
 * dólares cuando no se le dice el origen, así que omitir el `'BOB'` no da un
 * error: multiplica por el tipo de cambio y enseña una cifra siete veces mayor.
 *
 * Es lo que pasaba: esta cabecera decía "Total a Transferir Bs 67.618,48" cuando
 * el desglose de abajo —que sí pasaba `'BOB'`— decía Bs 9.701,36, y el sueldo
 * base Bs 29.530,57 en vez de Bs 4.236,81. El mismo campo, dos cifras, en la
 * misma pantalla.
 */
@Component({
  selector: 'app-ficha-cabecera',
  imports: [AvatarComponent, BadgeComponent, MonedaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ficha-cabecera.component.html',
  styleUrl: './ficha-cabecera.component.css',
})
export class FichaCabeceraComponent {
  readonly fila = input.required<FilaConsolidado>();
  /**
   * Foto de perfil de la ejecutiva, si el CRM tiene una para su código.
   *
   * `null` no es un caso de error: no todo el equipo oficial de la planilla
   * tiene usuario en el CRM, y quien lo tiene puede no haber subido foto. En
   * cualquiera de los dos casos el átomo Avatar cae solo a las iniciales.
   */
  readonly foto = input<string | null>(null);

  /** Iniciales del avatar. Dos palabras dan dos letras; una, la suya. */
  protected readonly iniciales = computed(() => {
    const partes = this.fila().nombre.trim().split(/\s+/);
    if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
    return (partes[0]?.[0] ?? '?').toUpperCase();
  });
}
