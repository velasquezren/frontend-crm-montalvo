import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
import { Lead, ORIGEN_LABEL } from '../../lead.model';

/**
 * Etiqueta corta del canal, solo para la tarjeta del kanban.
 *
 * `ORIGEN_LABEL` es la etiqueta completa ("Facebook · Lead Ad") y es la correcta
 * en la ficha, donde hay sitio. En una tarjeta de 220px de ancho, junto a la
 * fecha, esa cadena parte la línea; acá interesa solo por dónde entró.
 */
const CANAL_CORTO: Record<string, string> = {
  FACEBOOK_LEAD_AD: 'Facebook',
  FACEBOOK_COMENTARIO: 'Facebook',
  FACEBOOK_MENSAJE: 'Facebook',
  INSTAGRAM_LEAD_AD: 'Instagram',
  INSTAGRAM_COMENTARIO: 'Instagram',
  INSTAGRAM_MENSAJE: 'Instagram',
  WHATSAPP_DIRECTO: 'WhatsApp',
  PRESENCIAL: 'Presencial',
  IMPORTACION: 'Histórico',
};

/**
 * Tarjeta de un lead en el pipeline (kanban).
 *
 * **Existía cuatro veces, byte a byte**, una por columna: 42 líneas repetidas en
 * `leads.page.html` que había que tocar cuatro veces y acordarse de las cuatro.
 * Con eso, cualquier arreglo entraba en tres columnas y se olvidaba en la
 * cuarta, sin que nada avisara.
 *
 * De paso se le quitaron tres píldoras —PAC, canal y agente asignada—: son
 * datos de apoyo y van en `.crm-meta`, texto tranquilo separado por puntos. La
 * única que queda es **"Sin asignar"**, y esa sí es un estado: un lead sin
 * dueña es trabajo que nadie está haciendo, y tiene que saltar a la vista.
 *
 * El `cdkDrag` y el `(click)` viven en el host, puestos por la columna: el
 * `cdkDropList` es suyo y la lista tiene que ver a sus hijos arrastrables.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-lead-card',
  imports: [BadgeComponent, DatePipe, IconComponent, NombreClientePipe, RouterLink],
  templateUrl: './lead-card.component.html',
})
export class LeadCardComponent {
  readonly lead = input.required<Lead>();

  protected readonly origenLabel = ORIGEN_LABEL;

  /** El canal en corto, con la etiqueta larga en el `title` por si hace falta. */
  protected readonly canal = computed(() => CANAL_CORTO[this.lead().origen] ?? this.origenLabel[this.lead().origen]);
}
