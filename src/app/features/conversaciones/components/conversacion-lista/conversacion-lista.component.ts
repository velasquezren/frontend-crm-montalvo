import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, TemplateRef, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';

import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { NuevoChatComponent } from '../nuevo-chat/nuevo-chat.component';

import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import {
  alcanceDeOpcion,
  ContadoresInbox,
  ConversacionResumen,
  duenaDelChatLibre,
  esperandoDesde,
  FiltroInbox,
  opcionDeAlcance,
} from '../../conversacion.model';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
import { ConversacionPreviewComponent } from './conversacion-preview.component';
import { iconoDeAtencion, MOTIVO_ATENCION_CORTO, primerNombre, tiempoDeEspera, varianteDeAtencion } from '../../atencion-humana';

interface PestanaInbox {
  readonly tab: FiltroInbox;
  readonly etiqueta: string;
  readonly contador: (c: ContadoresInbox) => number;
  readonly ayuda: string;
}

/**
 * «Atención»: quien pidió una persona, o mandó algo que hay que revisar. El
 * número son las solicitudes vivas (en espera + en atención), del servidor y con
 * el mismo alcance que la lista; dentro, las que esperan van primero.
 */
const PESTANA_ATENCION: PestanaInbox = {
  tab: 'ATENCION',
  etiqueta: 'Atención',
  contador: c => c.esperandoHumano + c.enAtencion,
  ayuda: 'Pidieron una persona o enviaron algo para revisar. Primero las que nadie tomó.',
};

/**
 * Panel lateral izquierdo con la bandeja de entrada (Inbox).
 *
 * De arriba abajo, de lo más amplio a lo más fino: el ALCANCE (línea y, para
 * el admin, a quién mira), las pestañas de trabajo con sus contadores, y el
 * buscador. El archivo de cerradas es un interruptor en la cabecera, fuera de
 * las pestañas: una cerrada no es trabajo pendiente.
 */
@Component({
  selector: 'app-conversacion-lista',
  imports: [
    InicialesClientePipe,
    NombreClientePipe,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    SelectComponent,
    EmptyStateComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    ConversacionPreviewComponent,
    NuevoChatComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-lista.component.html',
  styleUrl: './conversacion-lista.component.css',
})
export class ConversacionListaComponent {
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly nuevoChatTpl = viewChild.required<TemplateRef<unknown>>('nuevoChatTpl');
  private cajonNuevoChat?: OverlayRef;
  /** Número con el que abre el cajón cuando se llega a una paciente sin chat. */
  protected readonly telefonoNuevoChat = signal<string | null>(null);

  constructor() {
    effect(() => {
      const telefono = this.state.nuevoChatPara();
      if (!telefono) return;
      untracked(() => {
        this.state.nuevoChatPara.set(null);
        this.abrirNuevoChat(telefono);
      });
    });
  }

  protected abrirNuevoChat(telefono: string | null = null): void {
    this.telefonoNuevoChat.set(telefono);
    this.cajonNuevoChat?.dispose();
    this.cajonNuevoChat = this.dialog.abrirCajon(this.nuevoChatTpl(), this.vcr, {
      onClose: () => (this.cajonNuevoChat = undefined),
    });
  }

  protected cerrarNuevoChat(): void {
    this.cajonNuevoChat?.dispose();
    this.cajonNuevoChat = undefined;
  }

  /** Abre el chat recién iniciado; si la bandeja filtraba otra línea, se quita el filtro para que se vea. */
  protected alIniciarChat(conversacionId: string): void {
    this.cerrarNuevoChat();
    this.state.abrirChatIniciado(conversacionId);
  }

  /**
   * ¿Hay algo que decir en la banda del filtro de líneas?
   *
   * Con EXACTAMENTE una línea no: no hay nada que filtrar. Cargando, con
   * fallo, o con ninguna (hay que avisar) o con varias (hay que elegir), sí.
   * Vive acá y no repartido por las ramas de la plantilla para que el
   * contenedor con su borde y su padding se escriba una sola vez.
   */
  protected readonly mostrarFiltroLinea = computed(
    () =>
      this.state.lineas.isLoading() ||
      !!this.state.lineas.error() ||
      this.state.lineas.value().datos.length !== 1,
  );

  protected readonly state = inject(ConversacionesStateService);
  protected readonly duenaDelChatLibre = duenaDelChatLibre;

  /** Las agentes por nombre, para el selector de alcance del admin. */
  protected readonly agentesPorNombre = computed(() =>
    [...this.state.agentesActuales()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  );

  /** El alcance como `value` del selector, y su vuelta. */
  protected readonly opcionAlcance = computed(() => opcionDeAlcance(this.state.alcance()));

  protected cambiarAlcance(valor: string): void {
    this.state.alcance.set(alcanceDeOpcion(valor));
  }

  /* ── Pestañas y archivo ─────────────────────────────────────────── */
  /** Las pestañas de trabajo, con el contador que les corresponde. */
  private readonly pestanasDeTrabajo: readonly PestanaInbox[] = [
    { tab: 'TODAS', etiqueta: 'Todas', contador: c => c.total, ayuda: 'Todos los chats abiertos' },
    { tab: 'SIN_RESPONDER', etiqueta: 'Sin responder', contador: c => c.sinResponder, ayuda: 'La paciente escribió y nadie le contestó todavía' },
    { tab: 'SIN_ASIGNAR', etiqueta: 'Sin asignar', contador: c => c.sinAsignar, ayuda: 'Abiertos sin agente responsable' },
    { tab: 'MIS_CHATS', etiqueta: 'Mis chats', contador: c => c.misChats, ayuda: 'Abiertos y asignados a ti' },
  ];

  /**
   * «Atención» va primera y solo aparece cuando hay solicitudes (o si está
   * elegida): mientras las interacciones de WhatsApp estén apagadas no nace
   * ninguna, y una pestaña siempre en cero solo sería ruido en la barra.
   */
  protected readonly pestanas = computed<readonly PestanaInbox[]>(() =>
    PESTANA_ATENCION.contador(this.state.stats()) > 0 || this.state.filtroTab() === 'ATENCION'
      ? [PESTANA_ATENCION, ...this.pestanasDeTrabajo]
      : this.pestanasDeTrabajo,
  );

  protected readonly motivoCorto = MOTIVO_ATENCION_CORTO;
  protected readonly iconoDeAtencion = iconoDeAtencion;
  protected readonly varianteDeAtencion = varianteDeAtencion;
  protected readonly tiempoDeEspera = tiempoDeEspera;
  protected readonly primerNombre = primerNombre;

  protected readonly viendoCerradas = computed(() => this.state.filtroTab() === 'CERRADAS');

  protected elegirPestana(tab: FiltroInbox): void {
    this.state.filtroTab.set(tab);
  }

  /** El archivo se entra y se sale con el mismo botón; al salir, a «Todas». */
  protected alternarCerradas(): void {
    this.elegirPestana(this.viendoCerradas() ? 'TODAS' : 'CERRADAS');
  }

  /* ── Helpers de tiempo de espera ───────────────────────────────── */
  /* Leen `state.ahora()`, el reloj por minuto: así la plantilla se vuelve a
     pintar sola y «14 min» no se queda congelado hasta el próximo refresco. */
  protected tiempoEsperando(c: ConversacionResumen): string | null {
    const desde = esperandoDesde(c);
    if (!desde) return null;

    const minutos = Math.floor((this.state.ahora() - desde.getTime()) / 60000);
    if (minutos < 60) return `${Math.max(minutos, 1)} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas} h`;
    return `${Math.floor(horas / 24)} d`;
  }

  protected esperaLarga(c: ConversacionResumen): boolean {
    const desde = esperandoDesde(c);
    return !!desde && this.state.ahora() - desde.getTime() > 24 * 60 * 60 * 1000;
  }

  protected tiempoRelativo(fecha: string): string {
    const diff = this.state.ahora() - new Date(fecha).getTime();
    const minutos = Math.floor(diff / 60000);

    if (minutos < 1) return 'Ahora';
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
  }

  protected seleccionar(id: string): void {
    this.state.seleccionar(id);
  }

  protected recargarInbox(): void {
    this.state.inbox.reload();
  }
}
