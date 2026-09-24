import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { generarIniciales } from '../../../../core/auth/user.model';
import { ORIGEN_LABEL } from '../../../leads/lead.model';
import { EstadoLead } from '../../../../core/api/db-enums';
import { BadgeVariant } from '../../../../shared/components/badge/badge.component';
import { ESTADO_LEAD_BADGE, ESTADO_LEAD_LABEL } from '../../../../shared/models/estados.model';
import { esNombreProvisional } from '../../../../shared/models/nombre-cliente';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
import {
  Actividad,
  ESTADO_ACTIVIDAD_LABEL,
  ESTADO_BADGE,
  etiquetaRepeticion,
  formatearDuracion,
  formatoFechaRelativa,
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_LABEL,
} from '../../actividad.model';

/** El paciente, tal como lo necesita quien va a agendarle algo. */
interface ClienteDeLaActividad {
  id: string;
  nombre: string;
  telefono: string;
}

/**
 * El detalle de una actividad: lo que es y qué se puede hacer con ella.
 *
 * **Presenta y propone; no muta.** Todas las acciones salen como intenciones de
 * dominio —completar, cancelar, reprogramar, editar, eliminar— y quien las
 * ejecuta es la página, que además es la única que sabe cuándo refrescar la
 * lista, los contadores y el calendario. Así este componente no se convierte en
 * un segundo store del módulo.
 *
 * **La actividad que recibe es la fuente de verdad.** No guarda copia: cuando la
 * página termina una mutación, actualiza el input y esto se repinta solo. Si
 * guardara la suya, habría dos y una acabaría vieja.
 *
 * **Lo que NO sabe:** que existe A2. `completarYAgendarSiguiente` es una
 * intención de producto —la agente quiere cerrar esta y agendar la próxima—; el
 * orden en que eso se cumple, y la regla de no cerrar nada hasta que el
 * seguimiento exista, viven en la página.
 */
@Component({
  selector: 'app-actividad-detalle-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DatePipe,
    DrawerComponent,
    IconComponent,
    InicialesClientePipe,
    NombreClientePipe,
    RouterLink,
  ],
  templateUrl: './actividad-detalle-drawer.component.html',
})
export class ActividadDetalleDrawerComponent {
  readonly actividad = input.required<Actividad>();

  /** Solo ADMIN+ ve de quién es la actividad. Regla actual, sin tocar. */
  readonly esAdmin = input(false);

  readonly editar = output<Actividad>();
  readonly completar = output<Actividad>();
  readonly cancelar = output<Actividad>();
  /** Horas a sumar sobre la fecha actual. La regla horaria es de la página. */
  readonly reprogramar = output<number>();
  readonly completarYAgendarSiguiente = output<Actividad>();
  readonly agendarSeguimiento = output<ClienteDeLaActividad>();
  readonly eliminar = output<Actividad>();
  readonly cerrado = output<void>();

  protected readonly tiposLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoIcono = TIPO_ACTIVIDAD_ICONO;
  protected readonly estadoLabel = ESTADO_ACTIVIDAD_LABEL;
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly iniciales = generarIniciales;
  protected readonly formatearDuracion = formatearDuracion;
  protected readonly etiquetaRepeticion = etiquetaRepeticion;
  protected readonly formatoFechaRelativa = formatoFechaRelativa;
  protected readonly origenLabel = ORIGEN_LABEL;

  protected sinNombre(cliente: { nombre: string; telefono: string }): boolean {
    return esNombreProvisional(cliente.nombre);
  }

  /* La etapa llegaba en crudo ("CONVERTIDO") dentro de una cápsula teñida de
     secundario. Es un estado, así que va con su etiqueta y su variante de badge,
     las mismas que usa el pipeline de Leads. */
  protected etiquetaEtapaLead(estado: string): string {
    return ESTADO_LEAD_LABEL[estado as EstadoLead] ?? estado;
  }

  protected badgeEtapaLead(estado: string): BadgeVariant {
    return ESTADO_LEAD_BADGE[estado as EstadoLead] ?? 'neutral';
  }

  protected labelOrigen(origen: string): string {
    const mapa: Record<string, string> = this.origenLabel;
    return mapa[origen] ?? origen;
  }
}
