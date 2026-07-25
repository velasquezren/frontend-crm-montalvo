import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastService } from '../../core/toast/toast.service';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../shared/models/cliente-categoria.model';
import { ClientesService } from '../clientes/clientes.service';
import { MemoriaAgenteService } from '../memoria-agente/memoria-agente.service';
import { CuotaMemoria, RecursoMemoria } from '../memoria-agente/memoria-agente.model';
import {
  AgenteResumen,
  ConversacionDetalle,
  ConversacionResumen,
  FiltroInbox,
  MensajeApi,
  PlantillaAgente,
  PlantillaResumen,
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
 *  • Tiempo real por WebSocket (RealtimeService), con polling de 60s de respaldo
 *
 * Visibilidad por rol resuelta en el servidor.
 */
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-conversaciones',
  imports: [
    RouterLink,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    InputComponent,
    EmptyStateComponent,
    LoadingSkeletonComponent,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversaciones.page.html',
  styleUrl: './conversaciones.page.css',
})
export class ConversacionesPage implements AfterViewInit {
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly clientesService = inject(ClientesService);
  private readonly memoriaService = inject(MemoriaAgenteService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly realtimeService = inject(RealtimeService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  /* ── Refs de template ──────────────────────────────────────────── */
  private readonly messagesContainer = viewChild<ElementRef<HTMLElement>>('messagesScroll');
  private readonly modalPlantillas = viewChild<TemplateRef<unknown>>('modalPlantillas');
  private readonly modalGestionPlantillas = viewChild<TemplateRef<unknown>>('modalGestionPlantillas');
  private readonly modalMemoria = viewChild<TemplateRef<unknown>>('modalMemoria');

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
  protected readonly panelAbierto = signal(true);

  protected readonly editandoFicha = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editEmpresa = signal('');
  protected readonly editEdad = signal('');
  protected readonly editLugarNacimiento = signal('');
  protected readonly editCategoria = signal<CategoriaCliente>('PROSPECTO');
  protected readonly editNotas = signal('');
  protected readonly editTags = signal('');
  protected readonly guardandoFicha = signal(false);

  /* ── Lightbox & Audio Speed & Pinned Notes ──────────────────────── */
  protected readonly lightboxImagenUrl = signal<string | null>(null);

  protected readonly editandoNotaFijada = signal(false);
  protected readonly editNotaFijada = signal('');
  protected readonly guardandoNotaFijada = signal(false);

  /* ── Respuestas Rápidas Personalizadas del Agente ────────────────── */
  protected readonly plantillasAgente = httpResource<PlantillaAgente[]>(
    () => this.conversacionesService.plantillasAgenteRequest(),
    { defaultValue: [] },
  );

  protected readonly sugerenciasAtajo = computed(() => {
    const texto = this.mensajeNuevo().trim();
    if (!texto.startsWith('/')) return [];
    const busquedaAtajo = texto.toLowerCase();
    const lista = this.plantillasAgente.value();
    return lista.filter(
      p =>
        (p.atajo && p.atajo.toLowerCase().includes(busquedaAtajo)) ||
        p.titulo.toLowerCase().includes(busquedaAtajo.substring(1)),
    );
  });

  private gestionOverlay?: OverlayRef;
  protected readonly tituloNuevaPlantilla = signal('');
  protected readonly atajoNuevaPlantilla = signal('');
  protected readonly contenidoNuevaPlantilla = signal('');
  protected readonly editandoPlantillaId = signal<string | null>(null);
  protected readonly guardandoPlantillaAgente = signal(false);

  protected insertarPlantillaAgente(texto: string): void {
    this.mensajeNuevo.set(texto);
  }

  protected abrirGestionPlantillas(): void {
    const tpl = this.modalGestionPlantillas();
    if (!tpl) return;
    this.resetFormPlantillaAgente();
    this.gestionOverlay?.dispose();
    this.gestionOverlay = this.dialogService.openTemplate(tpl, this.vcr);
  }

  protected cerrarGestionPlantillas(): void {
    this.gestionOverlay?.dispose();
    this.gestionOverlay = undefined;
    this.resetFormPlantillaAgente();
  }

  protected resetFormPlantillaAgente(): void {
    this.tituloNuevaPlantilla.set('');
    this.atajoNuevaPlantilla.set('');
    this.contenidoNuevaPlantilla.set('');
    this.editandoPlantillaId.set(null);
  }

  protected editarPlantillaAgente(p: PlantillaAgente): void {
    this.editandoPlantillaId.set(p.id);
    this.tituloNuevaPlantilla.set(p.titulo);
    this.atajoNuevaPlantilla.set(p.atajo ?? '');
    this.contenidoNuevaPlantilla.set(p.contenido);
  }

  protected async guardarPlantillaAgente(): Promise<void> {
    const titulo = this.tituloNuevaPlantilla().trim();
    const contenido = this.contenidoNuevaPlantilla().trim();
    const atajo = this.atajoNuevaPlantilla().trim();
    const id = this.editandoPlantillaId();

    if (!titulo || !contenido) {
      this.toastService.error('Ingresa título y contenido para la plantilla', 'Campos incompletos');
      return;
    }

    this.guardandoPlantillaAgente.set(true);
    try {
      if (id) {
        await this.conversacionesService.actualizarPlantillaAgente(id, { titulo, atajo, contenido });
        this.toastService.success('Respuesta rápida actualizada', 'Éxito');
      } else {
        await this.conversacionesService.crearPlantillaAgente({ titulo, atajo, contenido });
        this.toastService.success('Respuesta rápida creada', 'Éxito');
      }
      this.resetFormPlantillaAgente();
      this.plantillasAgente.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo guardar la respuesta rápida'), 'Error');
    } finally {
      this.guardandoPlantillaAgente.set(false);
    }
  }

  protected async eliminarPlantillaAgente(id: string): Promise<void> {
    try {
      await this.conversacionesService.eliminarPlantillaAgente(id);
      this.toastService.success('Respuesta rápida eliminada', 'Éxito');
      this.plantillasAgente.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo eliminar'), 'Error');
    }
  }

  /* ── Memoria Personal del Agente (Popover Flotante en Chat) ────── */
  protected readonly mostrarPopoverMemoria = signal(false);
  protected readonly busquedaMemoria = signal('');

  protected readonly recursosMemoriaRaw = httpResource<any>(
    () =>
      this.memoriaService.listarRequest({
        busqueda: this.busquedaMemoria(),
      }),
  );

  protected readonly recursosMemoria = computed<RecursoMemoria[]>(() => {
    const raw = this.recursosMemoriaRaw.value();
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.datos)) return raw.datos;
    if (Array.isArray(raw.data)) return raw.data;
    return [];
  });

  protected togglePopoverMemoria(): void {
    const estadoActual = this.mostrarPopoverMemoria();
    if (!estadoActual) {
      this.recursosMemoriaRaw.reload();
    }
    this.mostrarPopoverMemoria.set(!estadoActual);
  }

  protected async adjuntarMediaChat(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.toastService.info(`Subiendo "${file.name}"...`, 'Procesando archivo');
      const recurso = await this.memoriaService.subirBinario(file, { titulo: file.name });
      if (recurso.mediaUrl) {
        const previo = this.mensajeNuevo();
        this.mensajeNuevo.set(previo ? `${previo}\n${recurso.mediaUrl}` : recurso.mediaUrl);
        this.toastService.success('Archivo adjuntado al mensaje', 'Éxito');
      }
      input.value = '';
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo adjuntar el archivo'), 'Error');
    }
  }

  protected esUrlImagen(texto?: string | null): boolean {
    if (!texto) return false;
    const t = texto.trim();
    return (t.startsWith('http://') || t.startsWith('https://')) && /\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(t);
  }

  protected esUrlPdf(texto?: string | null): boolean {
    if (!texto) return false;
    const t = texto.trim();
    return (t.startsWith('http://') || t.startsWith('https://')) && /\.pdf(\?.*)?$/i.test(t);
  }

  protected insertarRecursoEnChat(recurso: RecursoMemoria): void {
    const texto = recurso.mediaUrl || recurso.contenido || recurso.titulo;
    const previo = this.mensajeNuevo();
    this.mensajeNuevo.set(previo ? `${previo}\n${texto}` : texto);
    this.mostrarPopoverMemoria.set(false);
    this.toastService.success('Recurso insertado en el chat', 'Memoria Personal');
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

  /* ── Plantillas de WhatsApp (fuera de la ventana de 24h) ───────── */
  /** Plantillas aprobadas de la WABA; se cargan al abrir el selector. */
  protected readonly plantillas = httpResource<PlantillaResumen[]>(
    () => (this.mostrarPlantillas() ? this.conversacionesService.plantillasRequest() : undefined),
    { defaultValue: [] },
  );
  private readonly mostrarPlantillas = signal(false);
  protected readonly plantillaSeleccionada = signal<PlantillaResumen | null>(null);
  protected readonly variablesPlantilla = signal<string[]>([]);
  protected readonly enviandoPlantilla = signal(false);
  private plantillasOverlay?: OverlayRef;

  /** Vista previa: reemplaza `{{n}}` por lo que el agente escribió (o deja el marcador). */
  protected readonly previewPlantilla = computed(() => {
    const p = this.plantillaSeleccionada();
    if (!p) return '';
    const vars = this.variablesPlantilla();
    return p.cuerpo.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1]?.trim() || `{{${n}}}`);
  });

  /** Faltan variables por completar → no deja enviar. */
  protected readonly plantillaIncompleta = computed(() => {
    const p = this.plantillaSeleccionada();
    if (!p) return true;
    const vars = this.variablesPlantilla();
    return Array.from({ length: p.variables }, (_, i) => vars[i]?.trim()).some(v => !v);
  });

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

  /* ── Respaldo por polling (solo si el WebSocket no está disponible) ──
     El push en tiempo real (`RealtimeService`) es el camino normal; este
     intervalo es una red de seguridad mucho más espaciada, no el mecanismo
     principal de refresco. */
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  /** true cuando el usuario tiene la vista cerca del fondo del hilo. */
  private estaCercaDelFondo = true;
  /** Muestra el botón flotante "↓ nuevos" cuando llegó algo y el agente está leyendo arriba. */
  protected readonly mostrarBotonBajar = signal(false);

  constructor() {
    /* Auto-scroll INTELIGENTE: solo baja si el agente ya estaba cerca del
       fondo, o si el último mensaje es suyo (lo acaba de enviar). Si está
       leyendo historial más arriba, no lo interrumpe: muestra el botón "↓". */
    effect(() => {
      const chat = this.detalle.value();
      if (!chat) return;
      const ultimo = chat.mensajes[chat.mensajes.length - 1];
      const esMio = ultimo?.direccion === 'SALIENTE';
      setTimeout(() => {
        if (this.estaCercaDelFondo || esMio) {
          this.scrollToBottom();
          this.mostrarBotonBajar.set(false);
        } else {
          this.mostrarBotonBajar.set(true);
        }
      }, 50);
    });

    // Conecta el socket del inbox; se desconecta solo al destruir la página.
    this.realtimeService.conectar(inject(DestroyRef));

    /* Reload dirigido debounced: evita múltiples reloads seguidos si llegan varios eventos de socket */
    let timerReload: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const aviso = this.realtimeService.actividad();
      if (!aviso) return;

      if (timerReload) clearTimeout(timerReload);
      timerReload = setTimeout(() => {
        this.conversaciones.reload();
        if (this.seleccionadaId() === aviso.conversacionId) {
          this.detalle.reload();
          /* El chat está abierto y llegó algo nuevo: marcarlo leído al instante. */
          void this.conversacionesService.marcarLeido(aviso.conversacionId, false).catch(() => {});
        }
      }, 100);
    });

    /* Si el socket se cayó y volvió (wifi, laptop suspendida), cualquier
       aviso emitido mientras estuvo desconectado se perdió para siempre —
       un reload completo al reconectar es la única forma de recuperarlo,
       en vez de confiar en que el polling de respaldo (60s) lo alcance. */
    effect(() => {
      const n = this.realtimeService.reconectado();
      if (n === 0) return;

      this.conversaciones.reload();
      if (this.seleccionadaId()) {
        this.detalle.reload();
      }
    });

    /* Indicador "escribiendo…" para el paciente mientras el agente redacta.
       Debounce ~1s tras la última tecla; WhatsApp lo mantiene 25s o hasta que
       se envía, así que refrescarlo al pausar alcanza. Se autolimpia el timer. */
    effect(onCleanup => {
      const texto = this.mensajeNuevo().trim();
      const id = this.seleccionadaId();
      if (!texto || !id) return;
      const t = setTimeout(() => {
        void this.conversacionesService.marcarLeido(id, true).catch(() => {});
      }, 1000);
      onCleanup(() => clearTimeout(t));
    });
  }

  ngAfterViewInit(): void {
    this.startPolling();
  }

  /* ── Acciones ──────────────────────────────────────────────────── */

  protected seleccionar(id: string): void {
    this.seleccionadaId.set(id);
    this.editandoFicha.set(false);
    /* Al abrir un chat siempre queremos ver lo último: forzar que el próximo
       render baje al fondo, sin importar dónde estaba el scroll del chat previo. */
    this.estaCercaDelFondo = true;
    this.mostrarBotonBajar.set(false);
    /* Tildes azules: al abrir el chat, el paciente ve que leímos su mensaje. */
    void this.conversacionesService.marcarLeido(id, false).catch(() => {});

    /* Inmediatamente limpia el contador de no leídos en la lista local */
    const lista = this.conversaciones.value();
    if (lista) {
      const conv = lista.find(c => c.id === id);
      if (conv && (conv as any).noLeidosCount > 0) {
        (conv as any).noLeidosCount = 0;
      }
    }
  }

  /** Detecta si el agente está cerca del fondo del hilo (para el auto-scroll inteligente). */
  protected onMessagesScroll(): void {
    const c = this.messagesContainer()?.nativeElement;
    if (!c) return;
    this.estaCercaDelFondo = c.scrollHeight - c.scrollTop - c.clientHeight < 150;
    if (this.estaCercaDelFondo) {
      this.mostrarBotonBajar.set(false);
    }
  }

  /** Botón flotante "↓ nuevos": baja al fondo y limpia el aviso. */
  protected bajarAlFondo(): void {
    this.scrollToBottom();
    this.estaCercaDelFondo = true;
    this.mostrarBotonBajar.set(false);
  }

  /** Enter envía; Shift+Enter inserta salto de línea (como WhatsApp/Slack). */
  protected onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.enviar(event);
    }
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
    this.editEdad.set(chat.cliente.datosExtra?.edad != null ? String(chat.cliente.datosExtra.edad) : '');
    this.editLugarNacimiento.set(chat.cliente.datosExtra?.lugarNacimiento || '');
    this.editCategoria.set(chat.cliente.categoria || 'PROSPECTO');
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
        categoria: this.editCategoria(),
        datosExtra: {
          empresa: this.editEmpresa().trim() || null,
          edad: this.editEdad().trim() || null,
          lugarNacimiento: this.editLugarNacimiento().trim() || null,
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

  /* ── Lightbox de Imágenes ─────────────────────────────────────── */
  protected abrirLightbox(url: string): void {
    if (url) {
      this.lightboxImagenUrl.set(url);
    }
  }

  protected cerrarLightbox(): void {
    this.lightboxImagenUrl.set(null);
  }

  /* ── Control de Velocidad de Audio ───────────────────────────── */
  protected cambiarVelocidadAudio(audioElem: HTMLAudioElement, speed: number): void {
    if (audioElem) {
      audioElem.playbackRate = speed;
      const currentSpeed = (audioElem as any)['_speed'] ?? 1;
      (audioElem as any)['_speed'] = speed;
    }
  }

  protected obtenerVelocidadAudio(audioElem: HTMLAudioElement): number {
    return (audioElem as any)?._speed ?? 1;
  }

  /* ── Notas Médicas Fijadas en Cabecera ──────────────────────── */
  protected iniciarEdicionNotaFijada(notaActual?: string): void {
    this.editNotaFijada.set(notaActual || '');
    this.editandoNotaFijada.set(true);
  }

  protected cancelarEdicionNotaFijada(): void {
    this.editandoNotaFijada.set(false);
    this.editNotaFijada.set('');
  }

  protected async guardarNotaFijada(): Promise<void> {
    const chat = this.detalle.value();
    if (!chat || this.guardandoNotaFijada()) return;

    const texto = this.editNotaFijada().trim();
    this.guardandoNotaFijada.set(true);
    try {
      const datosExtraActuales = (chat.cliente.datosExtra as Record<string, any>) || {};
      const nuevosDatosExtra = {
        ...datosExtraActuales,
        notaFijada: texto || null,
      };

      await this.clientesService.actualizar(chat.cliente.id, { datosExtra: nuevosDatosExtra });
      this.toastService.success(texto ? 'Nota clínica fijada en la cabecera' : 'Nota fijada eliminada', 'Nota Fijada');
      this.editandoNotaFijada.set(false);
      this.detalle.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo guardar la nota fijada.'), 'Error');
    } finally {
      this.guardandoNotaFijada.set(false);
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

  /**
   * Verifica si la ventana de 24h de atención de WhatsApp (Meta Cloud API) está activa.
   * Meta prohíbe el envío de mensajes libres cuando han transcurrido más de 24 horas
   * desde el último mensaje ENTRANTE del cliente.
   */
  protected readonly ventana24hActiva = computed(() => {
    const d = this.detalle.value();
    if (!d || !d.mensajes || d.mensajes.length === 0) return true;

    const mensajesEntrantes = d.mensajes.filter(m => m.direccion === 'ENTRANTE');
    if (mensajesEntrantes.length === 0) {
      return false;
    }

    const ultimoEntrante = mensajesEntrantes[mensajesEntrantes.length - 1];
    const fechaMs = new Date(ultimoEntrante.createdAt).getTime();
    const transcurridoMs = Date.now() - fechaMs;
    const horas = transcurridoMs / (1000 * 60 * 60);

    return horas <= 24;
  });

  protected async enviar(event: Event): Promise<void> {
    event.preventDefault();
    const texto = this.mensajeNuevo().trim();
    const id = this.seleccionadaId();
    if (!texto || !id || this.enviando()) {
      return;
    }

    /* Bloqueo proactivo: Meta rechaza textos planos fuera de la ventana de 24h */
    if (!this.ventana24hActiva()) {
      this.toastService.error(
        'La ventana de 24h de WhatsApp expiró. Debes enviar una Plantilla Aprobada de WhatsApp.',
        'Ventana Expirada',
      );
      this.abrirPlantillas();
      return;
    }

    this.mensajeNuevo.set('');
    await this.enviarTexto(id, texto);
  }

  /* ── Plantillas ────────────────────────────────────────────────── */

  /** Abre el selector de plantillas (CDK Overlay, se autolimpia al navegar). */
  protected abrirPlantillas(): void {
    const tpl = this.modalPlantillas();
    if (!tpl) return;
    this.plantillaSeleccionada.set(null);
    this.variablesPlantilla.set([]);
    this.mostrarPlantillas.set(true); // dispara la carga del httpResource
    this.plantillasOverlay?.dispose();
    this.plantillasOverlay = this.dialogService.openTemplate(tpl, this.vcr);
  }

  protected seleccionarPlantilla(p: PlantillaResumen): void {
    this.plantillaSeleccionada.set(p);
    this.variablesPlantilla.set(Array.from({ length: p.variables }, () => ''));
  }

  protected volverAListaPlantillas(): void {
    this.plantillaSeleccionada.set(null);
  }

  protected setVariablePlantilla(indice: number, valor: string): void {
    this.variablesPlantilla.update(vars => {
      const copia = [...vars];
      copia[indice] = valor;
      return copia;
    });
  }

  protected cerrarPlantillas(): void {
    this.plantillasOverlay?.dispose();
    this.plantillasOverlay = undefined;
    this.mostrarPlantillas.set(false);
    this.plantillaSeleccionada.set(null);
  }

  protected async enviarPlantillaSeleccionada(): Promise<void> {
    const id = this.seleccionadaId();
    const p = this.plantillaSeleccionada();
    if (!id || !p || this.enviandoPlantilla() || this.plantillaIncompleta()) return;

    const contenido = this.previewPlantilla();
    const parametros = this.variablesPlantilla().slice(0, p.variables).map(v => v.trim());

    this.enviandoPlantilla.set(true);
    try {
      await this.conversacionesService.enviarPlantilla(id, {
        plantilla: p.nombre,
        idioma: p.idioma,
        parametros,
        contenido,
      });
      this.toastService.success('Plantilla enviada al paciente', 'WhatsApp');
      this.cerrarPlantillas();
      this.detalle.reload();
      this.conversaciones.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo enviar la plantilla'), 'Error');
    } finally {
      this.enviandoPlantilla.set(false);
    }
  }

  /** Reenvía el mismo texto de un mensaje que quedó FALLIDO (ticks del chat).
   *  El mensaje fallido original se queda tal cual en el historial —no se
   *  borra, es la constancia de que ese intento no llegó— y este crea uno
   *  nuevo, igual que el botón "reintentar" de WhatsApp Web. */
  protected async reintentarEnvio(mensaje: MensajeApi): Promise<void> {
    const id = this.seleccionadaId();
    if (!id || this.enviando()) return;
    this.toastService.info('Reintentando envío... Si pasaron más de 24h del último mensaje del cliente, usa una Plantilla de WhatsApp.', 'WhatsApp API');
    await this.enviarTexto(id, mensaje.contenido);
  }

  private async enviarTexto(id: string, texto: string): Promise<void> {
    /* Envío optimista: la burbuja aparece de inmediato en vez de esperar el
       round-trip al backend (que a su vez ya no espera a Meta, pero sigue
       habiendo latencia de red). Si falla, se revierte y el texto vuelve
       al campo para que el agente no pierda lo que escribió. */
    const chatPrevio = this.detalle.value();
    const idOptimista = `optimista-${Date.now()}`;
    if (chatPrevio && chatPrevio.id === id) {
      const mensajeOptimista: MensajeApi = {
        id: idOptimista,
        direccion: 'SALIENTE',
        contenido: texto,
        createdAt: new Date().toISOString(),
        estadoEnvio: 'ENVIADO',
      };
      this.detalle.set({ ...chatPrevio, mensajes: [...chatPrevio.mensajes, mensajeOptimista] });
    }

    this.enviando.set(true);
    try {
      await this.conversacionesService.enviarMensaje(id, texto);
      this.toastService.success('Mensaje enviado al paciente', 'WhatsApp');
      this.detalle.reload();
      this.conversaciones.reload();
    } catch (err) {
      // Revierte la burbuja optimista y devuelve el texto al campo.
      if (chatPrevio && chatPrevio.id === id) {
        this.detalle.set(chatPrevio);
      }
      this.mensajeNuevo.set(texto);
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

  protected togglePanel(): void {
    this.panelAbierto.update(v => !v);
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
    }, 60000);
  }

  /** @internal */
  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }
}
