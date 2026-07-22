import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/toast/toast.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
} from '../../shared/models/cliente-categoria.model';
import { ClientesService } from '../clientes/clientes.service';
import {
  AgenteResumen,
  ConversacionDetalle,
  ConversacionResumen,
  FiltroInbox,
  MensajeApi,
} from './conversacion.model';
import { ConversacionesService } from './conversaciones.service';

/**
 * Conversaciones — WhatsApp Inbox Premium (RF-09/RF-10).
 *
 * Vista rediseñada con:
 *  • Filtros por tab (Todas / Sin asignar / Mis chats) + filtro por agente (admin)
 *  • Indicadores de actividad y conteo de mensajes
 *  • Auto-scroll al último mensaje
 *  • Separadores de fecha en el hilo
 *  • Panel de ficha del cliente con asignación de agente (admin)
 *  • Polling cada 15s para simular tiempo real
 *
 * Visibilidad por rol resuelta en el servidor.
 */
@Component({
  selector: 'app-conversaciones',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    InputComponent,
    EmptyStateComponent,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversaciones.page.html',
  styleUrl: './conversaciones.page.css',
})
export class ConversacionesPage implements AfterViewInit {
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly clientesService = inject(ClientesService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  /* ── Refs de template ──────────────────────────────────────────── */
  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesScroll');

  /* ── Helpers reutilizados ──────────────────────────────────────── */
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

  /* ── Estado del usuario ────────────────────────────────────────── */
  protected readonly isAdmin = this.authService.isAdmin;
  protected readonly currentUserId = computed(() => this.authService.user()?.id ?? '');

  /* ── Estado de UI ──────────────────────────────────────────────── */
  protected readonly busqueda = signal('');
  protected readonly mensajeNuevo = signal('');
  protected readonly enviando = signal(false);
  protected readonly seleccionadaId = signal<string | null>(null);
  protected readonly filtroTab = signal<FiltroInbox>('TODAS');
  protected readonly filtroAgenteId = signal<string | null>(null);
  protected readonly asignando = signal(false);
  protected readonly dropdownAgenteAbierto = signal(false);

  protected readonly editandoFicha = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editEmpresa = signal('');
  protected readonly editNotas = signal('');
  protected readonly editTags = signal('');
  protected readonly guardandoFicha = signal(false);

  /* ── Plantillas de Respuesta Rápida para Agentes ───────────────── */
  protected readonly plantillasRapidas = [
    {
      titulo: '📋 Citas y Horarios',
      texto: '¡Hola! Atendemos de lunes a sábado de 8:00 a 19:00 hrs. ¿Para qué fecha y especialidad deseas agendar tu cita?',
    },
    {
      titulo: '💰 Tratamientos y Precios',
      texto: 'Con gusto te informamos sobre nuestros servicios médicos y estéticos. ¿Qué tratamiento deseas consultar?',
    },
    {
      titulo: '📍 Ubicación de Clínica',
      texto: 'Nos encontramos en la sede central de Clínica Montalvo. Contamos con parqueo privado exclusivo para pacientes.',
    },
    {
      titulo: '🔬 Indicaciones Previas',
      texto: 'Por favor preséntate 10 minutos antes de tu cita agendada portando tu documento de identidad.',
    },
  ];

  protected insertarPlantilla(texto: string): void {
    this.mensajeNuevo.set(texto);
  }

  /* ── Datos del servidor ────────────────────────────────────────── */
  protected readonly conversaciones = httpResource<ConversacionResumen[]>(
    () => this.conversacionesService.listarRequest(),
    { defaultValue: [] },
  );

  protected readonly detalle = httpResource<ConversacionDetalle | undefined>(() => {
    const id = this.seleccionadaId();
    return id ? this.conversacionesService.detalleRequest(id) : undefined;
  });

  /** Agentes activos — solo se carga si el usuario es ADMIN. */
  protected readonly agentes = httpResource<AgenteResumen[]>(
    () => (this.isAdmin() ? this.conversacionesService.agentesRequest() : undefined),
    { defaultValue: [] },
  );

  /* ── Datos derivados ───────────────────────────────────────────── */

  /** Estadísticas del inbox para la barra superior. */
  protected readonly stats = computed(() => {
    const lista = this.conversaciones.value();
    return {
      total: lista.length,
      sinAsignar: lista.filter(c => !c.agente).length,
      misChats: lista.filter(c => c.agente?.id === this.currentUserId()).length,
    };
  });

  /** Lista filtrada por tab + búsqueda + agente seleccionado (admin). */
  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const tab = this.filtroTab();
    const agenteFilter = this.filtroAgenteId();
    const userId = this.currentUserId();
    let lista = this.conversaciones.value();

    // Filtro por tab
    if (tab === 'SIN_ASIGNAR') {
      lista = lista.filter(c => !c.agente);
    } else if (tab === 'MIS_CHATS') {
      lista = lista.filter(c => c.agente?.id === userId);
    }

    // Filtro por agente (admin)
    if (agenteFilter) {
      lista = lista.filter(c => c.agente?.id === agenteFilter);
    }

    // Filtro de búsqueda por nombre o teléfono
    if (termino) {
      lista = lista.filter(
        c =>
          c.cliente.nombre.toLowerCase().includes(termino) ||
          c.cliente.telefono.includes(termino),
      );
    }

    return lista;
  });

  /** Agentes únicos que tienen al menos 1 conversación asignada — para el dropdown rápido. */
  protected readonly agentesConChats = computed(() => {
    const lista = this.conversaciones.value();
    const map = new Map<string, { id: string; nombre: string; count: number }>();
    for (const c of lista) {
      if (c.agente) {
        const prev = map.get(c.agente.id);
        map.set(c.agente.id, {
          id: c.agente.id,
          nombre: c.agente.nombre,
          count: (prev?.count ?? 0) + 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  /** Mensajes del detalle agrupados con separadores de fecha. */
  protected readonly mensajesAgrupados = computed<
    Array<{ tipo: 'fecha'; label: string } | { tipo: 'mensaje'; mensaje: MensajeApi }>
  >(() => {
    const chat = this.detalle.value();
    if (!chat) return [];

    const result: Array<
      { tipo: 'fecha'; label: string } | { tipo: 'mensaje'; mensaje: MensajeApi }
    > = [];
    let lastDate = '';

    for (const msg of chat.mensajes) {
      const date = new Date(msg.createdAt);
      const dateKey = date.toLocaleDateString('es-BO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });

      if (dateKey !== lastDate) {
        lastDate = dateKey;
        result.push({ tipo: 'fecha', label: this.formatDateSeparator(date) });
      }
      result.push({ tipo: 'mensaje', mensaje: msg });
    }

    return result;
  });

  /* ── Polling para simular tiempo real (cada 15s) ───────────────── */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Auto-scroll al cambiar de conversación o al recibir mensajes nuevos
    effect(() => {
      // Leer el signal para suscribirse a cambios
      this.detalle.value();
      // Programar el scroll al siguiente tick de renderizado
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  ngAfterViewInit(): void {
    this.startPolling();
  }

  /* ── Acciones ──────────────────────────────────────────────────── */

  protected seleccionar(id: string): void {
    this.seleccionadaId.set(id);
    this.editandoFicha.set(false);
  }

  protected deseleccionar(): void {
    this.seleccionadaId.set(null);
    this.editandoFicha.set(false);
  }

  protected copiarTexto(texto: string, etiqueta: string): void {
    if (!texto) return;
    void navigator.clipboard.writeText(texto).then(() => {
      this.toastService.success(`${etiqueta} copiado al portapapeles.`, 'Copiado');
    });
  }

  protected iniciarEdicion(): void {
    const chat = this.detalle.value();
    if (!chat) return;

    this.editNombre.set(chat.cliente.nombre);
    this.editEmail.set(chat.cliente.email || '');
    this.editEmpresa.set(chat.cliente.datosExtra?.empresa || '');
    this.editNotas.set(chat.cliente.datosExtra?.notas || '');
    this.editTags.set((chat.cliente.datosExtra?.tags || []).join(', '));
    this.editandoFicha.set(true);
  }

  protected cancelarEdicion(): void {
    this.editandoFicha.set(false);
  }

  protected async guardarFicha(): Promise<void> {
    const chat = this.detalle.value();
    if (!chat || this.guardandoFicha()) return;

    const nombre = this.editNombre().trim();
    if (!nombre) {
      this.toastService.error('El nombre del cliente es obligatorio', 'Ficha Cliente');
      return;
    }

    this.guardandoFicha.set(true);
    try {
      const tagsArray = this.editTags()
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const payload = {
        nombre,
        email: this.editEmail().trim() || null,
        datosExtra: {
          empresa: this.editEmpresa().trim() || null,
          notas: this.editNotas().trim() || null,
          tags: tagsArray,
        },
      };

      await this.clientesService.actualizar(chat.cliente.id, payload);
      this.toastService.success('Ficha de cliente actualizada', 'Ficha Cliente');
      this.editandoFicha.set(false);
      this.detalle.reload();
      this.conversaciones.reload();
    } catch (err) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo guardar los cambios.'),
        'Error al Guardar',
      );
    } finally {
      this.guardandoFicha.set(false);
    }
  }

  protected setFiltroTab(tab: FiltroInbox): void {
    this.filtroTab.set(tab);
    // Limpiar filtro de agente al cambiar de tab
    if (tab !== 'TODAS') {
      this.filtroAgenteId.set(null);
    }
  }

  protected filtrarPorAgente(agenteId: string | null): void {
    this.filtroAgenteId.set(agenteId);
    // Si selecciona un agente, tab = TODAS para no conflictuar
    if (agenteId) {
      this.filtroTab.set('TODAS');
    }
  }

  protected async enviar(event: Event): Promise<void> {
    event.preventDefault();
    const texto = this.mensajeNuevo().trim();
    const id = this.seleccionadaId();
    if (!texto || !id || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    try {
      await this.conversacionesService.enviarMensaje(id, texto);
      this.mensajeNuevo.set('');
      this.toastService.success('Mensaje enviado al paciente', 'WhatsApp');
      this.detalle.reload();
      this.conversaciones.reload();
    } catch (err) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo enviar el mensaje'),
        'Error de Conexión',
      );
    } finally {
      this.enviando.set(false);
    }
  }

  /** Asignar un agente a la conversación activa (admin). */
  protected async asignarAgente(agenteId: string | null): Promise<void> {
    const id = this.seleccionadaId();
    if (!id || this.asignando()) return;

    this.asignando.set(true);
    this.dropdownAgenteAbierto.set(false);
    try {
      await this.conversacionesService.asignarAgente(id, agenteId);
      this.toastService.success('Conversación reasignada', 'Inbox Admin');
      this.detalle.reload();
      this.conversaciones.reload();
    } catch (err) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo reasignar el agente'),
        'Error de Permisos',
      );
    } finally {
      this.asignando.set(false);
    }
  }

  protected toggleDropdownAgente(): void {
    this.dropdownAgenteAbierto.update(v => !v);
  }

  protected tiempoRelativo(fecha: string): string {
    const ahora = Date.now();
    const diff = ahora - new Date(fecha).getTime();
    const minutos = Math.floor(diff / 60000);

    if (minutos < 1) return 'Ahora';
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
  }

  /* ── Helpers internos ──────────────────────────────────────────── */

  private scrollToBottom(): void {
    const container = this.messagesContainer()?.nativeElement;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  private formatDateSeparator(date: Date): string {
    const hoy = new Date();
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);

    if (this.isSameDay(date, hoy)) return 'Hoy';
    if (this.isSameDay(date, ayer)) return 'Ayer';

    return date.toLocaleDateString('es-BO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear()
    );
  }

  private startPolling(): void {
    this.pollingInterval = setInterval(() => {
      this.conversaciones.reload();
      if (this.seleccionadaId()) {
        this.detalle.reload();
      }
    }, 15000);
  }

  /** @internal */
  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }
}
