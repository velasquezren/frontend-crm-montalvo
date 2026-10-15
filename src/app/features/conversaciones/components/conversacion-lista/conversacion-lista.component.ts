import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, TemplateRef, untracked, viewChild, ViewContainerRef } from '@angular/core';
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
import { iconoDeAtencion, MOTIVO_ATENCION_CORTO, quienAtiende, tiempoDeEspera, varianteDeAtencion } from '../../atencion-humana';
import { horaDeFila } from '../../presentacion-chat';

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
  /* «Atención» se confundía con el tipo de línea (Recepción) y con el título de los
     avisos de error: el nombre dice lo que hay que hacer. */
  etiqueta: 'Por atender',
  contador: c => c.esperandoHumano + c.enAtencion,
  ayuda: 'Pacientes que necesitan a alguien del equipo: lo pidieron, la IA les pasó el chat o hay algo que revisar. Primero las que esperan.',
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
  host: { '(document:keydown)': 'atajoGlobal($event)' },
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
  /**
   * Las pestañas de trabajo, con el contador que les corresponde. «Sin
   * responder» ya no es una de ellas: es un filtro que se combina con todas
   * (`state.soloSinResponder`), y con él puesto cada número cuenta solo lo que
   * espera respuesta.
   */
  private readonly pestanasDeTrabajo: readonly PestanaInbox[] = [
    { tab: 'TODAS', etiqueta: 'Todas', contador: c => c.total, ayuda: 'Todos los chats abiertos' },
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
  protected readonly quienAtiende = quienAtiende;

  protected readonly viendoCerradas = computed(() => this.state.filtroTab() === 'CERRADAS');

  /**
   * Qué chats ve quien no es admin, en el subtítulo de la cabecera (y entero en
   * su `title`). Recepción y asistencia comparten la atención de sus líneas: ven
   * TODOS sus chats, no solo los suyos (ver `acceso-conversacion.ts`).
   */
  protected readonly alcanceCorto = computed(() => {
    if (this.state.isAdmin()) return 'WhatsApp Business';
    return this.state.puedeGestionComercial() ? 'Tus chats y los sin asignar' : 'Todos los chats de tus líneas';
  });
  protected readonly alcanceExplicado = computed(() => {
    if (this.state.isAdmin()) return 'Ves los chats de todas las líneas y de todo el equipo.';
    return this.state.puedeGestionComercial()
      ? 'Ves tus chats y los que están sin asignar en tus líneas autorizadas.'
      : 'Ves todos los chats de tus líneas: la atención es compartida.';
  });

  protected elegirPestana(tab: FiltroInbox): void {
    this.state.elegirPestana(tab);
  }

  /** Al pasar el mouse, enfocar o tocar una pestaña: que ya esté al elegirla. */
  protected precargar(tab: FiltroInbox): void {
    void this.state.precargar(tab);
  }

  /** Flechas entre pestañas, como un grupo de pestañas de verdad. */
  protected moverConTeclado(evento: KeyboardEvent, indice: number): void {
    const pestanas = this.pestanas();
    const destino = evento.key === 'ArrowRight' ? indice + 1 : evento.key === 'ArrowLeft' ? indice - 1 : null;
    if (destino === null) return;
    evento.preventDefault();
    const p = pestanas[(destino + pestanas.length) % pestanas.length];
    this.elegirPestana(p.tab);
    const grupo = (evento.currentTarget as HTMLElement).parentElement;
    grupo?.querySelector<HTMLButtonElement>(`[data-tab="${p.tab}"]`)?.focus();
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

  /** «miércoles, 14 de octubre, 10:42»: el `title` de la hora, para quien necesite el dato exacto. */
  protected fechaCompleta(fecha: string): string {
    return new Date(fecha).toLocaleString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  /** La hora de la fila, como la lista de WhatsApp (ver `horaDeFila`). */
  protected horaDeFila(fecha: string): string {
    return horaDeFila(new Date(fecha), new Date(this.state.ahora()));
  }

  protected seleccionar(id: string): void {
    this.state.seleccionar(id);
  }

  /* ── Teclado ───────────────────────────────────────────────────── */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * «/» lleva al buscador y Alt+↑/↓ pasa al chat anterior o siguiente, desde
   * cualquier parte de la bandeja que no sea un campo de texto: ahí «/» abre
   * las respuestas rápidas y Alt+flecha mueve el cursor por párrafos (macOS).
   */
  protected atajoGlobal(evento: KeyboardEvent): void {
    if (evento.defaultPrevented || evento.isComposing || this.escribiendoEn(evento.target)) return;
    if (evento.key === '/' && !evento.altKey && !evento.ctrlKey && !evento.metaKey) {
      const buscador = this.host.nativeElement.querySelector<HTMLInputElement>('.sidebar-search input');
      if (!buscador) return;
      evento.preventDefault();
      buscador.focus();
      buscador.select();
      return;
    }
    if (evento.altKey && (evento.key === 'ArrowDown' || evento.key === 'ArrowUp')) {
      evento.preventDefault();
      this.moverSeleccion(evento.key === 'ArrowDown' ? 1 : -1);
    }
  }

  /** Flechas sobre la lista: de fila en fila, como en cualquier lista de correo. */
  protected moverEnLista(evento: KeyboardEvent): void {
    if (evento.key !== 'ArrowDown' && evento.key !== 'ArrowUp') return;
    const filas = Array.from(this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.chat-item'));
    const actual = filas.indexOf(evento.target as HTMLButtonElement);
    if (actual === -1) return;
    evento.preventDefault();
    filas[Math.min(Math.max(actual + (evento.key === 'ArrowDown' ? 1 : -1), 0), filas.length - 1)]?.focus();
  }

  /** Abre el chat de al lado del abierto (o el primero) y lo deja a la vista. */
  private moverSeleccion(paso: 1 | -1): void {
    const lista = this.state.conversacionesFiltradas();
    if (!lista.length) return;
    const actual = lista.findIndex(c => c.id === this.state.seleccionadaId());
    const destino = actual === -1 ? 0 : actual + paso;
    if (destino < 0 || destino >= lista.length) return;
    const id = lista[destino].id;
    this.seleccionar(id);
    queueMicrotask(() =>
      this.host.nativeElement.querySelector(`[data-chat="${id}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
  }

  private escribiendoEn(destino: EventTarget | null): boolean {
    const el = destino as HTMLElement | null;
    if (!el) return false;
    return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
  }

  /* ── Paginación al bajar ───────────────────────────────────────── */
  /**
   * Cerca del final de la lista se pide la página siguiente sola: el botón
   * «Cargar más» queda como respaldo (y para el teclado), pero nadie tiene que
   * buscarlo para seguir bajando.
   */
  protected alDesplazarLista(evento: Event): void {
    const el = evento.target as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 240) return;
    if (this.state.hayMasConversaciones() && !this.state.cargandoMas() && !this.state.cargandoVista()) {
      void this.state.cargarMas();
    }
  }

  /* ── Filtros puestos ───────────────────────────────────────────── */
  /**
   * Lo que acota la lista además de la pestaña, dicho en palabras. Es lo que
   * explica un «Sin resultados»: casi siempre hay un filtro olvidado.
   */
  protected readonly filtrosPuestos = computed<readonly string[]>(() => {
    const puestos: string[] = [];
    const busqueda = this.state.busqueda().trim();
    if (busqueda) puestos.push(`«${busqueda}»`);
    if (this.state.soloSinResponder() && !this.viendoCerradas()) puestos.push('Sin responder');
    if (this.state.soloGold()) puestos.push('Gold');
    const lineaId = this.state.filtroLineaId();
    if (lineaId) puestos.push(this.state.lineas.value().datos.find(l => l.id === lineaId)?.nombre ?? 'una línea');
    if (this.state.isAdmin()) {
      const alcance = this.state.alcance();
      if (alcance === 'MIOS') puestos.push('Míos');
      else if (typeof alcance !== 'string') puestos.push(this.state.agentesActuales().find(a => a.id === alcance.agenteId)?.nombre ?? 'una agente');
    }
    return puestos;
  });

  /** Quita todos los filtros y deja la pestaña en la que se estaba. */
  protected quitarFiltros(): void {
    this.state.restablecerFiltros(this.state.filtroTab());
  }

  protected recargarInbox(): void {
    this.state.inbox.reload();
  }
}
