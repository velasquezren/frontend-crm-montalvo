import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import { listaExtra, textoExtra } from '../../core/api/datos-extra';
import { calcularEdad } from '../../core/api/edad';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  TemplateRef,
  ViewContainerRef,
  viewChild,
} from '@angular/core';

import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ModoInmersivoService } from '../../core/ui/modo-inmersivo.service';
import { NotificacionNativaService } from '../../core/notification/notificacion-nativa.service';
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
  esperandoDesde,
  estaSinResponder,
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

/** El paciente tal y como lo entrega el detalle de la conversación. */
type ClienteChat = ConversacionResumen['cliente'];

/** Mensajes por lote al subir por el historial. Coincide con el tope del backend. */
const LOTE_HISTORIAL = 50;

/** Distancia al techo (px) a la que se dispara la carga del lote anterior. */
const UMBRAL_CARGA_HISTORIAL = 120;

/**
 * Deja solo los dígitos de un teléfono para `wa.me` y `tel:`.
 *
 * Los números llegan como `+591 7 123 4567` y ninguno de los dos esquemas
 * acepta espacios ni el `+` en la ruta. Es el mismo criterio que usa el backend
 * al hablar con la Cloud API.
 */
function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

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
  /* Con un chat abierto el layout esconde sus dos barras en el móvil, así que
     la altura de esta vista —que las descuenta— deja de valer. Va atada a
     `seleccionadaId` y no a `detalle.value()` para que cambie en el mismo
     instante que el layout: con el detalle, entre el toque y la respuesta del
     servidor quedaría un salto visible. */
  host: { '[class.chat-inmersivo]': 'seleccionadaId()' },
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
  private readonly modoInmersivo = inject(ModoInmersivoService);
  private readonly notificacionNativa = inject(NotificacionNativaService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Chat abierto según la URL. Es la fuente de verdad de la selección. */
  private readonly idEnRuta = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('id'))),
    { initialValue: null },
  );

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
  protected readonly mostrarFiltroAgentes = signal(false);
  protected readonly asignando = signal(false);

  protected toggleMostrarFiltroAgente(): void {
    this.mostrarFiltroAgentes.set(!this.mostrarFiltroAgentes());
  }
  protected readonly dropdownAgenteAbierto = signal(false);
  /**
   * A partir de 1280px la ficha del paciente cabe como tercera columna junto al
   * chat. Por debajo deja de ser una columna y pasa a ser un cajón fijo que
   * cubre la pantalla entera.
   */
  private readonly consultaAncha = window.matchMedia('(min-width: 1280px)');
  protected readonly pantallaAncha = signal(this.consultaAncha.matches);

  /**
   * Arranca abierto SOLO donde es una columna. Estaba en `true` fijo, así que en
   * el móvil bastaba con abrir un chat para que la ficha lo tapara entero antes
   * de leer un mensaje: el agente tenía que cerrarla cada vez.
   */
  protected readonly panelAbierto = signal(this.consultaAncha.matches);

  protected readonly editandoFicha = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editEmpresa = signal('');
  protected readonly editFechaNacimiento = signal('');
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
  /**
   * Se pide al abrir un chat, no al abrir el inbox.
   *
   * La barra "Mis respuestas" vive dentro de `@if (detalle.value())`, así que
   * con la lista de conversaciones en pantalla no se ve ni se usa. Pedirla
   * antes la ponía a competir con la única petición que el agente sí está
   * esperando —y en un servidor de un solo núcleo eso se nota—.
   */
  protected readonly plantillasAgente = httpResource<PlantillaAgente[]>(
    () => (this.seleccionadaId() ? this.conversacionesService.plantillasAgenteRequest() : undefined),
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

  /**
   * Se pide al abrir el popover, no al abrir el inbox.
   *
   * Se renderiza dentro del popover, que arranca cerrado — y `togglePopoverMemoria`
   * ya forzaba un `reload()` al abrirlo, así que la carga inicial se tiraba a la
   * basura y se volvía a pedir igual. Atarla a `mostrarPopoverMemoria` quita esa
   * petición del arranque y deja el `reload()` de más sin razón de existir.
   */
  private readonly recursosMemoriaRecurso = httpResource<RespuestaPaginada<RecursoMemoria>>(
    () =>
      this.mostrarPopoverMemoria()
        ? this.memoriaService.listarRequest({ busqueda: this.busquedaMemoria() })
        : undefined,
    { defaultValue: paginaVacia<RecursoMemoria>() },
  );

  /** Proyección: la vista solo necesita la lista, no la envoltura de paginación. */
  protected readonly recursosMemoria = computed(() => this.recursosMemoriaRecurso.value().datos);

  /* Abrir el popover ya dispara la petición por sí solo: el recurso depende de
     `mostrarPopoverMemoria`. El `reload()` que había aquí provocaba una segunda
     llamada idéntica. */
  protected togglePopoverMemoria(): void {
    this.mostrarPopoverMemoria.set(!this.mostrarPopoverMemoria());
  }

  /**
   * Adjunto pendiente de enviar.
   *
   * Se guarda la CLAVE de R2, no la URL. Antes se pegaba en el texto la URL
   * firmada que devuelve la subida, y esa firma caduca a los 15 minutos: el
   * paciente recibía bien la foto —WhatsApp la descarga al instante— pero en el
   * CRM la burbuja se rompía un cuarto de hora después y el agente solo veía el
   * texto alternativo "Imagen adjunta".
   */
  protected readonly adjuntoPendiente = signal<{
    mediaKey: string;
    mediaMime: string | null;
    mediaNombre: string | null;
    vistaPrevia: string | null;
  } | null>(null);

  protected quitarAdjunto(): void {
    this.adjuntoPendiente.set(null);
  }

  /**
   * Pegar una imagen en el campo de texto la adjunta.
   *
   * Es como llega la mayoría del material que manda la clínica: una captura de
   * una lista de precios, una promo recortada de otra pantalla. Sin esto había
   * que guardarla a disco primero y luego buscarla con el selector de archivos.
   *
   * Solo intercepta cuando el portapapeles trae un archivo de imagen; pegar
   * texto sigue funcionando igual.
   */
  protected async pegarEnComposer(event: ClipboardEvent): Promise<void> {
    const imagen = Array.from(event.clipboardData?.items ?? []).find(i =>
      i.type.startsWith('image/'),
    );
    if (!imagen) return;

    const file = imagen.getAsFile();
    if (!file) return;

    /* Se evita que además pegue la ruta o el marcado de la imagen como texto. */
    event.preventDefault();

    /* Lo pegado no trae nombre: se le pone uno legible para la vista previa y
       para el `filename` que verá la paciente si acaba yendo como documento. */
    const extension = file.type.split('/')[1] ?? 'png';
    await this.subirAdjunto(
      new File([file], `captura-${Date.now()}.${extension}`, { type: file.type }),
    );
  }

  protected async adjuntarMediaChat(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    await this.subirAdjunto(file);
    input.value = '';
  }

  /** Sube el archivo y lo deja pendiente de envío. Lo comparten el selector y el pegado. */
  private async subirAdjunto(file: File): Promise<void> {
    try {
      this.toastService.info(`Subiendo "${file.name}"...`, 'Procesando archivo');
      const recurso = await this.memoriaService.subirBinario(file, { titulo: file.name });
      if (recurso.mediaKey) {
        this.adjuntoPendiente.set({
          mediaKey: recurso.mediaKey,
          mediaMime: recurso.mediaMime,
          mediaNombre: file.name,
          /* Solo para que el agente vea qué va a mandar antes de enviarlo; se
             descarta al enviar y no se guarda en ningún sitio. */
          vistaPrevia: recurso.mediaUrl,
        });
        this.toastService.success('Archivo adjuntado al mensaje', 'Éxito');
      }
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

  /* ── Filtro Super Admin (Mis Chats + Pool) ───────────────────────── */
  protected readonly soloMisChatsAdmin = signal(false);

  protected toggleSoloMisChatsAdmin(): void {
    this.soloMisChatsAdmin.set(!this.soloMisChatsAdmin());
  }

  /* ── Datos del servidor ────────────────────────────────────────── */
  private readonly conversacionesRecurso = httpResource<ConversacionResumen[]>(
    () => this.conversacionesService.listarRequest(),
    { defaultValue: [] },
  );

  /**
   * Copia escribible de la lista del servidor. Permite limpiar el contador de
   * no leídos al instante sin esperar al backend; linkedSignal la resincroniza
   * sola en cuanto llega una respuesta nueva (no hace falta un effect).
   */
  protected readonly conversaciones = linkedSignal(() => this.conversacionesRecurso.value());

  /* ── Estados del inbox ─────────────────────────────────────────────
     Faltaban los dos: sin ellos, un backend caído o una carga en curso
     caían en el `@empty` de la lista, que dice "no hay conversaciones que
     coincidan con tu filtro". Es decirle al agente que su filtro no
     encontró nada cuando lo que pasa es que el servidor no contesta.

     Ambos se condicionan a que NO haya datos ya en pantalla: el inbox se
     recarga solo (socket y polling de respaldo), y no queremos que un
     refresco de fondo haga parpadear esqueletos ni tape una lista que se
     está viendo bien porque una recarga puntual falló. */

  protected readonly cargandoInbox = computed(
    () => this.conversacionesRecurso.isLoading() && this.conversaciones().length === 0,
  );

  protected readonly errorInbox = computed(
    () => !!this.conversacionesRecurso.error() && this.conversaciones().length === 0,
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
    const lista = this.conversaciones();
    return {
      total: lista.length,
      sinResponder: lista.filter(estaSinResponder).length,
      sinAsignar: lista.filter(c => !c.agente).length,
      misChats: lista.filter(c => c.agente?.id === this.currentUserId()).length,
    };
  });

  /**
   * Cuánto lleva esperando el paciente, en formato corto para la fila del
   * inbox. Devuelve null si ya se le respondió.
   */
  protected tiempoEsperando(c: ConversacionResumen): string | null {
    const desde = esperandoDesde(c);
    if (!desde) return null;

    const minutos = Math.floor((Date.now() - desde.getTime()) / 60000);
    if (minutos < 60) return `${Math.max(minutos, 1)} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas} h`;
    return `${Math.floor(horas / 24)} d`;
  }

  /** true cuando lleva esperando más de un día: se marca con más fuerza. */
  protected esperaLarga(c: ConversacionResumen): boolean {
    const desde = esperandoDesde(c);
    return !!desde && Date.now() - desde.getTime() > 24 * 60 * 60 * 1000;
  }

  /** Lista filtrada por tab + búsqueda + agente seleccionado (admin). */
  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const tab = this.filtroTab();
    const agenteFilter = this.filtroAgenteId();
    const userId = this.currentUserId();
    let lista = this.conversaciones();

    // Filtro por tab
    if (tab === 'SIN_RESPONDER') {
      /* Aquí el orden se invierte a propósito: el resto del inbox va por
         actividad reciente, pero en esta pestaña lo urgente es quien lleva
         MÁS tiempo esperando. Con el orden normal, el paciente que lleva
         cinco días sin respuesta queda al fondo, que es justo como se llega
         a tener once conversaciones sin contestar. */
      lista = lista
        .filter(estaSinResponder)
        .sort(
          (a, b) =>
            new Date(a.mensajes[0].createdAt).getTime() -
            new Date(b.mensajes[0].createdAt).getTime(),
        );
    } else if (tab === 'SIN_ASIGNAR') {
      lista = lista.filter(c => !c.agente);
    } else if (tab === 'MIS_CHATS') {
      lista = lista.filter(c => c.agente?.id === userId);
    }

    /* "Míos" del admin: mis chats + los del pool.

       Se filtra en memoria porque la lista entera ya está cargada y el
       interruptor debe responder al instante (ver skill `crm-rendimiento`).
       La MISMA regla existe en el backend como `whereSoloMios()`, que es la que
       se aplica cuando se pide `?soloMios=true`: si cambias una, cambia la otra.

       Ojo: es una preferencia de VISTA, no un permiso. Lo que el usuario tiene
       derecho a ver ya viene acotado por el servidor. Y como el listado llega
       capado a 100, esto filtra dentro de esa ventana. */
    if (this.isAdmin() && this.soloMisChatsAdmin()) {
      lista = lista.filter(c => !c.agente || c.agente.id === userId);
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
    const lista = this.conversaciones();
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

  /* ── Historial: scroll hacia arriba ────────────────────────────────
     El detalle solo trae los 50 mensajes más recientes. Hasta ahora no había
     forma de ver nada anterior: el endpoint, la paginación por cursor y el
     método del servicio existían, pero ningún componente los llamaba, así que
     el historial de un paciente antiguo era inalcanzable desde la interfaz. */

  /** Mensajes anteriores ya traídos, en orden cronológico, delante del detalle. */
  private readonly mensajesAntiguos = signal<readonly MensajeApi[]>([]);
  protected readonly cargandoAntiguos = signal(false);
  /** false cuando el servidor devolvió menos de los pedidos: ya no queda nada más atrás. */
  private readonly quedaHistorial = signal(true);

  /** Hilo completo: lo traído por scroll + lo que vino en el detalle. */
  /**
   * El chat que se está mirando, pintable **desde el toque**.
   *
   * Mientras el detalle viaja por la red se devuelve la fila que ya tiene el
   * listado: nombre, teléfono, categoría y agente son los mismos datos, y con
   * ellos la cabecera se dibuja entera sin esperar a nadie. Solo el hilo de
   * mensajes queda pendiente, y ese muestra su propio esqueleto.
   *
   * Antes todo el panel colgaba de `detalle.value()`. En el móvil eso se notaba
   * como un tirón: la lista no se apartaba hasta que respondía el servidor
   * —unos 222 ms con la conexión caliente y 674 en frío—, así que tocar un chat
   * no producía ningún efecto visible durante ese rato. En escritorio no se veía
   * porque la lista se queda en su sitio y solo se rellena el panel derecho.
   */
  protected readonly chatActivo = computed<ConversacionDetalle | ConversacionResumen | null>(() => {
    const cargado = this.detalle.value();
    if (cargado) return cargado;

    const id = this.seleccionadaId();
    if (!id) return null;
    return this.conversaciones().find(c => c.id === id) ?? null;
  });

  /** Hay chat elegido pero su hilo todavía no llegó. */
  protected readonly cargandoHilo = computed(
    () => !!this.seleccionadaId() && !this.detalle.value(),
  );

  private readonly mensajesDelHilo = computed<readonly MensajeApi[]>(() => {
    const chat = this.detalle.value();
    if (!chat) return [];

    /* Se deduplica por id: si mientras el agente leía historial entraron
       muchos mensajes nuevos, la ventana de 50 del detalle puede solaparse
       con lo que ya se había traído por cursor. */
    const vistos = new Set<string>();
    const hilo: MensajeApi[] = [];
    for (const msg of [...this.mensajesAntiguos(), ...chat.mensajes]) {
      if (vistos.has(msg.id)) continue;
      vistos.add(msg.id);
      hilo.push(msg);
    }
    return hilo;
  });

  /* ── Buscar dentro de la conversación abierta ──────────────────────
     Todo el hilo ya está en memoria, así que la búsqueda es un `computed()`
     sobre lo cargado: no cuesta ni una petición ni toca el servidor. Es la
     contrapartida natural del scroll de historial — de poco sirve poder
     traer meses de conversación si luego hay que leerla entera a mano. */

  protected readonly busquedaChat = signal('');
  protected readonly buscandoEnChat = signal(false);

  /** Ids de los mensajes que contienen el término, en orden cronológico. */
  protected readonly coincidenciasChat = computed<readonly string[]>(() => {
    const termino = this.busquedaChat().trim().toLowerCase();
    if (termino.length < 2) return [];
    return this.mensajesDelHilo()
      .filter(m => m.contenido?.toLowerCase().includes(termino))
      .map(m => m.id);
  });

  /** Posición actual dentro de las coincidencias (0 = la más antigua). */
  private readonly indiceCoincidencia = signal(0);

  /** Id resaltado ahora mismo, para marcar la burbuja activa. */
  protected readonly coincidenciaActiva = computed<string | null>(() => {
    const ids = this.coincidenciasChat();
    return ids[this.indiceCoincidencia()] ?? ids[0] ?? null;
  });

  protected abrirBusquedaChat(): void {
    this.buscandoEnChat.set(true);
  }

  protected cerrarBusquedaChat(): void {
    this.buscandoEnChat.set(false);
    this.busquedaChat.set('');
    this.indiceCoincidencia.set(0);
  }

  /** Salta a la coincidencia siguiente o anterior, dando la vuelta al llegar al final. */
  protected irACoincidencia(paso: 1 | -1): void {
    const total = this.coincidenciasChat().length;
    if (total === 0) return;
    const siguiente = (this.indiceCoincidencia() + paso + total) % total;
    this.indiceCoincidencia.set(siguiente);
    this.desplazarACoincidencia();
  }

  /** Centra en pantalla el mensaje resaltado. */
  private desplazarACoincidencia(): void {
    setTimeout(() => {
      const id = this.coincidenciaActiva();
      const contenedor = this.messagesContainer()?.nativeElement;
      if (!id || !contenedor) return;
      /* Se busca DENTRO del contenedor del hilo, no en todo el documento:
         los ids de mensaje solo tienen sentido dentro de este chat. */
      contenedor
        .querySelector(`[data-mensaje-id="${id}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  /** Mensajes del detalle agrupados con separadores de fecha. */
  protected readonly mensajesAgrupados = computed<
    Array<{ tipo: 'fecha'; label: string } | { tipo: 'mensaje'; mensaje: MensajeApi }>
  >(() => {
    const mensajes = this.mensajesDelHilo();
    if (mensajes.length === 0) return [];

    const result: Array<
      { tipo: 'fecha'; label: string } | { tipo: 'mensaje'; mensaje: MensajeApi }
    > = [];
    let lastDate = '';

    for (const msg of mensajes) {
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
    const destroyRef = inject(DestroyRef);
    this.realtimeService.conectar(destroyRef);

    /* Al estrechar la ventana (o girar el teléfono) la ficha deja de ser una
       columna y pasa a ser un cajón a pantalla completa. Si se quedara abierta,
       taparía el chat sin que nadie lo hubiera pedido. */
    const alCambiarAncho = (evento: MediaQueryListEvent): void => {
      this.pantallaAncha.set(evento.matches);
      if (!evento.matches) this.panelAbierto.set(false);
    };
    this.consultaAncha.addEventListener('change', alCambiarAncho);
    destroyRef.onDestroy(() => this.consultaAncha.removeEventListener('change', alCambiarAncho));

    /**
     * Al volver a primer plano se recarga.
     *
     * Con la pestaña oculta —teléfono bloqueado, o el agente en otra app— el
     * navegador congela el `setInterval` del polling. Mientras tanto caducan las
     * URLs firmadas de las fotos ya pintadas, así que al volver aparecía el
     * icono de imagen rota aunque el archivo siguiera intacto en R2.
     *
     * Recargar aquí las devuelve al instante en vez de esperar hasta 60 s al
     * siguiente poll, y de paso trae lo que haya entrado mientras tanto.
     */
    const alVolver = (): void => {
      if (document.hidden) return;
      this.conversacionesRecurso.reload();
      if (this.seleccionadaId()) this.detalle.reload();
    };
    document.addEventListener('visibilitychange', alVolver);
    destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', alVolver));

    // Solicita permiso explícito de notificaciones nativas y VAPID Web Push
    void this.notificacionNativa.solicitarPermiso();

    /* Actualiza el globo/icono rojo de la PWA según las conversaciones sin responder */
    effect(() => {
      const sinResponder = this.stats().sinResponder;
      this.notificacionNativa.actualizarBadge(sinResponder);
    });

    /* Reload dirigido debounced: evita múltiples reloads seguidos si llegan varios eventos de socket */
    let timerReload: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const aviso = this.realtimeService.actividad();
      if (!aviso) return;

      if (timerReload) clearTimeout(timerReload);
      timerReload = setTimeout(() => {
        this.conversacionesRecurso.reload();
        /* Requisito 2: Actualizar mapa de caché para CUALQUIER conversación (abierta o no) */
        void this.conversacionesService.actualizarCachePorRealtime(aviso.conversacionId);

        const chatSeleccionado = this.seleccionadaId() === aviso.conversacionId;

        if (chatSeleccionado) {
          this.detalle.reload();
          /* El chat está abierto y llegó algo nuevo: marcarlo leído al instante. */
          void this.conversacionesService.marcarLeido(aviso.conversacionId, false).catch(() => {});
        }

        // Si la pestaña no está activa o el mensaje es de otra conversación, avisar con notificación nativa + chime
        if (document.hidden || !chatSeleccionado) {
          this.notificacionNativa.mostrar({
            titulo: 'Nuevo mensaje en WhatsApp',
            mensaje: 'Tienes un nuevo mensaje entrante en Montalvo CRM.',
            tag: `conv-${aviso.conversacionId}`,
            alHacerClic: () => this.seleccionar(aviso.conversacionId),
          });
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

      this.conversacionesRecurso.reload();
      if (this.seleccionadaId()) {
        this.detalle.reload();
      }
    });

    /**
     * La URL manda. Un único sitio donde se abre y se cierra un chat, venga de
     * donde venga: tocar la lista, el botón atrás de Android, el gesto de
     * deslizar, o una notificación push con `?id=<id>`.
     *
     * Sin este efecto el parámetro de las notificaciones se ignoraba: el aviso
     * llevaba al inbox y el agente tenía que buscar a mano el chat que acababa
     * de sonar.
     */
    effect(() => {
      const id = this.idEnRuta();
      if (id === this.seleccionadaId()) return;

      if (id) {
        this.aplicarSeleccion(id);
      } else {
        this.seleccionadaId.set(null);
        this.editandoFicha.set(false);
        /* La entrada que habíamos empujado ya no está: la deshizo el atrás del
           sistema o nuestra propia llamada. */
        this.entradaPropia = false;
      }
    });

    /* Con un chat abierto, el layout se aparta: en el teléfono se apilaban la
       topbar de la app, la cabecera del chat, el compositor y la navegación
       inferior. Al volver a la lista reaparece todo — el efecto sigue a
       `seleccionadaId`, así que la flecha de volver lo deshace sola. */
    effect(() => {
      if (this.seleccionadaId()) {
        this.modoInmersivo.activar();
      } else {
        this.modoInmersivo.desactivar();
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

  /** Reintento manual desde el estado de error del inbox. */
  protected recargarInbox(): void {
    this.conversacionesRecurso.reload();
  }

  /**
   * Abrir un chat es **navegar**: el id viaja en la URL (`?id=…`).
   *
   * Con eso el botón atrás de Android —y el gesto de deslizar, y el atrás del
   * navegador— cierran el chat y devuelven al inbox en vez de sacar de la app,
   * que es lo que espera cualquiera que use un teléfono. No hace falta escuchar
   * `popstate`: el historial ya lo hace, y la vista solo reacciona a la ruta.
   *
   * Y de paso arregla los enlaces de las notificaciones: el push ya mandaba
   * `/conversaciones?id=<id>` desde el primer día, pero esta vista nunca leyó
   * ese parámetro, así que tocar el aviso abría el inbox y había que buscar a
   * mano el chat que acababa de avisar.
   *
   * `replaceUrl` cuando ya hay uno abierto: saltar entre diez conversaciones no
   * debe dejar diez entradas que haya que deshacer una por una. Desde cualquier
   * chat, un solo atrás vuelve al inbox.
   */
  protected seleccionar(id: string): void {
    const veniaDeOtroChat = !!this.seleccionadaId();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { id },
      replaceUrl: veniaDeOtroChat,
    });
    if (!veniaDeOtroChat) this.entradaPropia = true;
  }

  /**
   * ¿La entrada del historial del chat abierto la creamos nosotros?
   *
   * Distingue "abrí este chat desde el inbox" de "aterricé aquí desde una
   * notificación con la app cerrada". En el primer caso hay a dónde volver; en
   * el segundo, `history.back()` sacaría de la aplicación.
   */
  private entradaPropia = false;

  /** Vuelve al inbox. Mismo camino que el botón atrás del teléfono. */
  protected deseleccionar(): void {
    if (!this.seleccionadaId()) return;

    if (this.entradaPropia) {
      /* `history.back()` y no una navegación nueva: quitar el parámetro
         navegando añadiría otra entrada, y entonces el atrás del sistema
         volvería a ABRIR el chat que se acaba de cerrar. */
      history.back();
      return;
    }

    /* Se llegó directo a `?id=…`: se reemplaza esa entrada para no dejar el
       chat detrás del botón atrás. */
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  /**
   * Aplica lo que dice la ruta. Lo dispara el efecto de la URL, así que corre
   * igual si el chat se abrió tocando la lista, llegando por una notificación o
   * pulsando atrás.
   */
  private aplicarSeleccion(id: string): void {
    this.seleccionadaId.set(id);
    this.editandoFicha.set(false);
    /* El historial traído por scroll es de la conversación anterior: si no se
       limpia, los mensajes de un paciente aparecerían en el hilo de otro. */
    this.mensajesAntiguos.set([]);
    this.quedaHistorial.set(true);
    this.cerrarBusquedaChat();
    /* En móvil la ficha cubre la pantalla entera: abrir un chat no puede
       significar taparlo. En escritorio es una columna y se respeta lo que el
       agente haya elegido. */
    if (!this.pantallaAncha()) this.panelAbierto.set(false);
    /* Al abrir un chat siempre queremos ver lo último: forzar que el próximo
       render baje al fondo, sin importar dónde estaba el scroll del chat previo. */
    this.estaCercaDelFondo = true;
    this.mostrarBotonBajar.set(false);
    /* Tildes azules: al abrir el chat, el paciente ve que leímos su mensaje. */
    void this.conversacionesService.marcarLeido(id, false).catch(() => {});

    /* Limpia el contador de no leídos al instante (actualización optimista) */
    this.conversaciones.update(lista =>
      lista.map(c => (c.id === id && (c.noLeidosCount ?? 0) > 0 ? { ...c, noLeidosCount: 0 } : c)),
    );
  }

  /** Detecta si el agente está cerca del fondo del hilo (para el auto-scroll inteligente). */
  protected onMessagesScroll(): void {
    const c = this.messagesContainer()?.nativeElement;
    if (!c) return;
    this.estaCercaDelFondo = c.scrollHeight - c.scrollTop - c.clientHeight < 150;
    if (this.estaCercaDelFondo) {
      this.mostrarBotonBajar.set(false);
    }

    /* Cerca del techo: traer el lote anterior antes de que el agente choque
       con el borde, para que el historial se sienta continuo. */
    if (c.scrollTop < UMBRAL_CARGA_HISTORIAL) {
      void this.cargarAnteriores();
    }
  }

  /**
   * Trae el lote de mensajes anterior al más viejo que hay en pantalla.
   * Se apoya en la paginación por cursor del backend (`antesDe`), no en offset:
   * con mensajes entrando en vivo, un offset se desplaza y repite o salta filas.
   */
  private async cargarAnteriores(): Promise<void> {
    if (this.cargandoAntiguos() || !this.quedaHistorial()) return;

    const id = this.seleccionadaId();
    const masViejo = this.mensajesDelHilo()[0];
    if (!id || !masViejo) return;

    const contenedor = this.messagesContainer()?.nativeElement;
    const alturaPrevia = contenedor?.scrollHeight ?? 0;

    this.cargandoAntiguos.set(true);
    try {
      const previos = await this.conversacionesService.obtenerMensajesAnteriores(
        id,
        masViejo.createdAt,
        LOTE_HISTORIAL,
      );

      /* Menos de los pedidos significa que se acabó el hilo: se deja de pedir
         para no golpear el servidor en cada scroll al llegar al principio. */
      if (previos.length < LOTE_HISTORIAL) {
        this.quedaHistorial.set(false);
      }

      if (previos.length > 0) {
        this.mensajesAntiguos.update(actuales => [...previos, ...actuales]);

        /* Mantener el punto de lectura: al insertar contenido arriba, lo que el
           agente estaba leyendo se desplaza hacia abajo. Sin compensar, la vista
           salta y hay que volver a buscar por dónde iba. Se corrige sumando lo
           que creció el contenedor. */
        setTimeout(() => {
          const c = this.messagesContainer()?.nativeElement;
          if (c) {
            c.scrollTop += c.scrollHeight - alturaPrevia;
          }
        });
      }
    } catch (err) {
      this.toastService.error(
        mensajeDeError(err, 'No se pudo cargar el historial anterior.'),
        'Conversaciones',
      );
    } finally {
      this.cargandoAntiguos.set(false);
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
    this.editEmpresa.set(this.empresaDe(chat.cliente));
    this.editFechaNacimiento.set(chat.cliente.fechaNacimiento?.slice(0, 10) ?? '');
    this.editLugarNacimiento.set(this.lugarNacimientoDe(chat.cliente));
    this.editCategoria.set(chat.cliente.categoria || 'PROSPECTO');
    this.editNotas.set(textoExtra(chat.cliente.datosExtra, 'notas'));
    this.editTags.set(listaExtra(chat.cliente.datosExtra, 'tags').join(', '));
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
        /* Mismo contrato que la ficha de Clientes: lo que tiene columna va al
           primer nivel; el JSON guarda solo notas y etiquetas. */
        empresa: this.editEmpresa().trim(),
        fechaNacimiento: this.editFechaNacimiento() || undefined,
        lugarNacimiento: this.editLugarNacimiento().trim(),
        datosExtra: {
          notas: this.editNotas().trim() || null,
          tags: tagsArray,
        },
      };

      await this.clientesService.actualizar(chat.cliente.id, payload);
      this.toastService.success('Ficha de cliente actualizada', 'Ficha Cliente');
      this.editandoFicha.set(false);
      this.detalle.reload();
      this.conversacionesRecurso.reload();
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
    audioElem.playbackRate = speed;
  }

  /** El propio <audio> es la fuente de verdad: no hace falta estado paralelo. */
  protected obtenerVelocidadAudio(audioElem: HTMLAudioElement): number {
    return audioElem.playbackRate;
  }

  /* ── Perfil del paciente (columna real primero, JSON heredado después) ── */
  /**
   * Abre el chat con esta paciente en el WhatsApp personal de la agente.
   *
   * `wa.me` resuelve solo el destino: en el escritorio abre WhatsApp Web y en
   * el móvil la app instalada, sin que haya que detectar el dispositivo.
   *
   * Ojo con lo que implica: lo que se hable por ahí **no queda en el CRM** —ni
   * en el hilo, ni en la auditoría, ni disponible para quien tome el relevo si
   * esa agente no está—. Es para el trato personal puntual, no para atender.
   */
  protected enlaceWhatsApp(telefono: string): string {
    return `https://wa.me/${soloDigitos(telefono)}`;
  }

  /** `tel:` — en el móvil llama y en el escritorio abre el marcador del sistema. */
  protected enlaceLlamada(telefono: string): string {
    return `tel:+${soloDigitos(telefono)}`;
  }

  protected empresaDe(cliente: ClienteChat): string {
    return cliente.empresaTrabajo || textoExtra(cliente.datosExtra, 'empresa');
  }

  protected lugarNacimientoDe(cliente: ClienteChat): string {
    return cliente.ciLugar || textoExtra(cliente.datosExtra, 'lugarNacimiento', 'CI.Lug.Pac');
  }

  protected ocupacionDe(cliente: ClienteChat): string {
    return cliente.ocupacion || textoExtra(cliente.datosExtra, 'ocupacion', 'Profesion');
  }

  protected notasDe(cliente: ClienteChat): string {
    return textoExtra(cliente.datosExtra, 'notas');
  }

  protected tagsDe(cliente: ClienteChat): string[] {
    return listaExtra(cliente.datosExtra, 'tags');
  }

  protected edadDe(cliente: ClienteChat): string | null {
    return calcularEdad(cliente.fechaNacimiento);
  }

  /* ── Notas Médicas Fijadas en Cabecera ──────────────────────── */
  /**
   * La nota fijada vive dentro del JSON libre `datosExtra` (el backend no la
   * conoce como columna). Este accesor la estrecha a string en un solo sitio,
   * en vez de castear en cada punto de la plantilla.
   */
  protected notaFijadaDe(cliente: { readonly datosExtra?: Record<string, unknown> | null }): string {
    const nota = cliente.datosExtra?.['notaFijada'];
    return typeof nota === 'string' ? nota : '';
  }

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
      const datosExtraActuales = chat.cliente.datosExtra ?? {};
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
    /* Con adjunto se puede enviar sin texto: la foto es el mensaje y el texto,
       si lo hay, hace de pie de foto. */
    if ((!texto && !this.adjuntoPendiente()) || !id || this.enviando()) {
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
      this.conversacionesRecurso.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo enviar la plantilla'), 'Error');
    } finally {
      this.enviandoPlantilla.set(false);
    }
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
      const adjunto = this.adjuntoPendiente();
      await this.conversacionesService.enviarMensaje(
        id,
        texto,
        adjunto
          ? {
              mediaKey: adjunto.mediaKey,
              mediaMime: adjunto.mediaMime,
              mediaNombre: adjunto.mediaNombre,
            }
          : undefined,
      );
      this.adjuntoPendiente.set(null);
      this.toastService.success('Mensaje enviado al paciente', 'WhatsApp');
      this.detalle.reload();
      this.conversacionesRecurso.reload();
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
      this.conversacionesRecurso.reload();
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
      this.conversacionesRecurso.reload();
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
    /* Salir de la vista con un chat abierto no puede dejar al resto de la app
       sin barras: el servicio es global y nadie más lo apagaría. */
    this.modoInmersivo.desactivar();
  }
}
