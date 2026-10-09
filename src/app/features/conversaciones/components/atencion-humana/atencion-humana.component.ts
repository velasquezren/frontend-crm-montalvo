import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ZONA_CLINICA } from '../../../../core/fechas/zona-clinica';
import {
  ACCION_ATENCION,
  ContextoAtencion,
  iconoDeAtencion,
  MOTIVO_ATENCION,
  primerNombre,
  tiempoDeEspera,
} from '../../atencion-humana';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';

/**
 * El bloque de atención humana del chat: quién pidió una persona, desde
 * cuándo, por qué y qué hacer. Va bajo la cabecera, como la banda de la
 * campaña de origen, y ocupa una línea: el contexto (lo que se le ofreció, lo
 * que eligió, los datos del formulario, su último mensaje) se despliega a
 * pedido, sin pantalla aparte.
 *
 * No decide nada. El estado, el motivo y la prioridad vienen del servidor, y
 * las acciones las valida el servidor: si alguien tomó antes, el 409 vuelve a
 * leer la verdad y el bloque pasa a decir «En atención por …».
 *
 * Sin solicitud viva, pero con la automatización en pausa, queda una franja
 * mínima con «Reanudar»: es la única puerta para que vuelva a escribir.
 */
@Component({
  selector: 'app-atencion-humana',
  imports: [BadgeComponent, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atencion-humana.component.html',
  styleUrl: './atencion-humana.component.css',
})
export class AtencionHumanaComponent {
  protected readonly state = inject(ConversacionesStateService);

  /** El chat al que pertenece: al cambiar de chat, el contexto vuelve a empezar plegado. */
  readonly conversacionId = input<string | null>(null);
  readonly atencion = input<ContextoAtencion | null>(null);
  readonly automatizacionPausadaEn = input<string | null>(null);

  /* El hilo reutiliza este componente entre chats: sin atarlo a la conversación,
     el desplegado de una paciente seguía abierto al pasar a la siguiente. */
  protected readonly abierto = linkedSignal({ source: this.conversacionId, computation: () => false });
  protected readonly motivos = MOTIVO_ATENCION;
  protected readonly acciones = ACCION_ATENCION;
  protected readonly primerNombre = primerNombre;
  protected readonly tiempoDeEspera = tiempoDeEspera;
  protected readonly iconoDeAtencion = iconoDeAtencion;

  /** Liberar es de quien la tomó, o de quien reparte el trabajo (el servidor lo vuelve a exigir). */
  protected readonly puedeLiberar = computed(() => {
    const a = this.atencion();
    return a?.estado === 'EN_ATENCION' && (a.tomadaPor?.id === this.state.currentUserId() || this.state.isAdmin());
  });

  /** ¿Hay algo que desplegar? Sin contexto (vista provisional) el botón no aparece. */
  protected readonly hayContexto = computed(() => {
    const a = this.atencion();
    return !!a && (!!a.origen || !!a.ultimoMensaje);
  });

  /** Una fecha de calendario del Flow («2026-10-13») se lee como fecha; lo demás, tal cual. */
  protected valorLegible(valor: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
    return new Date(`${valor}T12:00:00Z`).toLocaleDateString('es-BO', {
      timeZone: ZONA_CLINICA, weekday: 'long', day: 'numeric', month: 'long',
    });
  }

  protected hora(fecha: string): string {
    return new Date(fecha).toLocaleString('es-BO', {
      timeZone: ZONA_CLINICA, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }
}
