import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { OverlayRef } from '@angular/cdk/overlay';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { ToastService } from '../../../../core/toast/toast.service';
import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { envioSeReintentaSinRiesgo } from '../../clasificar-error-envio';
import { ConversacionesService } from '../../conversaciones.service';
import { MemoriaAgenteService } from '../../../memoria-agente/memoria-agente.service';
import { RecursoMemoria } from '../../../memoria-agente/memoria-agente.model';
import { MensajeApi, PlantillaResumen } from '../../conversacion.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';

interface AdjuntoLocal {
  readonly mediaKey: string;
  readonly mediaMime?: string | null;
  readonly mediaNombre?: string | null;
  readonly vistaPrevia?: string | null;
}

const TAMANO_MAXIMO_ADJUNTO = 5 * 1024 * 1024;
const TIPOS_ADJUNTO_ACEPTADOS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

function tipoBase(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase();
}

/**
 * Compositor de WhatsApp — Caja de texto con:
 * - Autoresize multilínea
 * - Barra de chips de respuestas rápidas (`Mis respuestas:`)
 * - Popover inteligente de Memoria Personal del Agente
 * - Envío de plantillas oficiales aprobadas por Meta fuera de la ventana de 24h
 * - Drag & Drop de imágenes y documentos
 */
@Component({
  selector: 'app-conversacion-composer',
  imports: [
    DrawerComponent,
    BadgeComponent,
    RouterLink,
    ButtonComponent,
    IconComponent,
    InputComponent,
    NombreClientePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-composer.component.html',
  styleUrl: './conversacion-composer.component.css',
})
export class ConversacionComposerComponent implements OnDestroy {
  protected readonly state = inject(ConversacionesStateService);
  private readonly conversacionesService = inject(ConversacionesService);
  /** Textos con un POST en vuelo: frena el doble submit sin frenar el uso rápido. */
  private readonly enviosEnVuelo = new Set<string>();
  private readonly memoriaService = inject(MemoriaAgenteService);
  private readonly toast = inject(ToastService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  /* ── Template Refs ─────────────────────────────────────────────── */
  private readonly modalPlantillas = viewChild<TemplateRef<unknown>>('modalPlantillas');
  private readonly modalGestionPlantillas = viewChild<TemplateRef<unknown>>('modalGestionPlantillas');
  private readonly modalConfirmarMedia = viewChild<TemplateRef<unknown>>('modalConfirmarMedia');
  private overlayRef?: OverlayRef;

  /* ── Adjuntos & Drag and Drop ──────────────────────────────────── */
  protected readonly adjuntoPendiente = signal<AdjuntoLocal | null>(null);
  /**
   * Nombre del archivo que está viajando a R2 ahora mismo, o `null`.
   *
   * El estado de subida vive AQUÍ y no en `envioLocal` del mensaje, aunque
   * `envioLocal` sea donde están ENVIANDO/ERROR/AMBIGUO. La razón es que el
   * upload ocurre antes de que exista mensaje: la agente adjunta, revisa el
   * archivo en el modal de confirmación y solo entonces decide enviar. Pintar
   * una burbuja en el hilo durante la subida diría "esto ya salió" de algo que
   * todavía puede descartar — y habría que borrarla si quita el adjunto.
   *
   * Sin porcentaje a propósito: `HttpClient` aquí no reporta progreso, y una
   * barra inventada miente sobre cuánto falta.
   */
  protected readonly subiendoArchivo = signal<string | null>(null);
  protected readonly arrastrandoSobre = signal(false);

  /* ── Mi Memoria Personal (Biblioteca Privada del Agente) ───────── */
  protected readonly mostrarPopoverMemoria = signal(false);
  protected readonly busquedaMemoria = signal('');

  private readonly recursosMemoriaRecurso = httpResource<RespuestaPaginada<RecursoMemoria>>(
    () =>
      this.mostrarPopoverMemoria()
        ? this.memoriaService.listarRequest({ busqueda: this.busquedaMemoria() })
        : undefined,
    { defaultValue: paginaVacia<RecursoMemoria>() },
  );

  protected readonly recursosMemoria = computed(() => this.recursosMemoriaRecurso.value().datos);

  /* ── Plantillas de WhatsApp (Ventana 24h) ───────────────────────── */
  protected readonly plantillaSeleccionada = signal<PlantillaResumen | null>(null);
  protected readonly variablesPlantilla = signal<string[]>([]);
  protected readonly enviandoPlantilla = signal(false);

  /* ── Gestión de Respuestas Rápidas ──────────────────────────────── */
  protected readonly editandoPlantillaId = signal<string | null>(null);
  protected readonly formPlantillaTitulo = signal('');
  protected readonly formPlantillaAtajo = signal('');
  protected readonly formPlantillaContenido = signal('');
  protected readonly guardandoPlantilla = signal(false);

  /**
   * "Escribiendo…" del lado del paciente mientras la agente redacta.
   *
   * El backend ya lo tenía completo (`marcarLeido(id, typing)` → Meta apaga
   * el indicador solo a los 25s o al llegar el mensaje) pero nada en el
   * frontend lo llamaba con `typing: true` — el paciente nunca veía nada
   * hasta que el mensaje aparecía de golpe, aunque la agente llevara un
   * minuto escribiendo una respuesta larga. Es justo la señal que WhatsApp
   * nativo da gratis y que hace que escribir desde el CRM se sienta más
   * "en vivo" que el silencio de antes.
   *
   * Un `throttle` de 20s (Meta lo mantiene 25s) evita mandar la señal en
   * cada tecla — solo se reenvía si pasó el umbral desde la última vez, **por
   * conversación**: cambiar de chat no debe heredar el enfriamiento del
   * anterior.
   */
  private readonly ultimoTypingPorChat = new Map<string, number>();
  private static readonly TYPING_THROTTLE_MS = 20_000;

  constructor() {
    effect(() => {
      this.state.contextoChat();
      this.adjuntoPendiente.set(null);
      this.subiendoArchivo.set(null);
      this.state.mensajeNuevo.set('');
      this.mostrarPopoverMemoria.set(false);
      this.plantillaSeleccionada.set(null);
      this.variablesPlantilla.set([]);
      this.overlayRef?.dispose();
      this.overlayRef = undefined;
    });
    effect(() => {
      const texto = this.state.mensajeNuevo();
      const id = this.state.seleccionadaId();
      if (!texto.trim() || !id || this.state.fueraDeVentana24h()) return;

      const ahora = Date.now();
      const ultimo = this.ultimoTypingPorChat.get(id) ?? 0;
      if (ahora - ultimo < ConversacionComposerComponent.TYPING_THROTTLE_MS) return;
      this.ultimoTypingPorChat.set(id, ahora);
      void this.conversacionesService.marcarLeido(id, true).catch(() => {});
    });
  }

  ngOnDestroy(): void {
    this.overlayRef?.dispose();
  }

  /* ── Drag & Drop de Archivos ───────────────────────────────────── */
  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoSobre.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoSobre.set(false);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoSobre.set(false);

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.size > TAMANO_MAXIMO_ADJUNTO) {
      this.toast.warning('El archivo supera el límite de 5 MB.');
      return;
    }

    const mime = tipoBase(file.type);
    if (file.type && !TIPOS_ADJUNTO_ACEPTADOS.includes(mime)) {
      this.toast.warning('Tipo de archivo no permitido en el chat.');
      return;
    }

    await this.subirAdjunto(file);
  }

  /* ── Mi Memoria Personal Popover ───────────────────────────────── */
  protected togglePopoverMemoria(): void {
    this.mostrarPopoverMemoria.update(v => !v);
  }

  protected insertarRecursoEnChat(recurso: RecursoMemoria): void {
    this.mostrarPopoverMemoria.set(false);

    if (recurso.mediaKey) {
      this.adjuntoPendiente.set({
        mediaKey: recurso.mediaKey,
        mediaMime: recurso.mediaMime,
        mediaNombre: recurso.mediaNombre ?? recurso.titulo,
        vistaPrevia: recurso.mediaUrl,
      });
      this.toast.success('Archivo adjuntado al mensaje.');
      return;
    }

    const texto = recurso.contenido || recurso.titulo;
    const previo = this.state.mensajeNuevo();
    this.state.mensajeNuevo.set(previo ? `${previo}\n${texto}` : texto);
    this.toast.success('Recurso insertado en el chat.');
  }

  /* ── Adjuntos desde Input / Clipboard ──────────────────────────── */
  protected async adjuntarMediaChat(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    await this.subirAdjunto(file);
    input.value = '';
  }

  protected async pegarEnComposer(event: ClipboardEvent): Promise<void> {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          const extension = file.type.split('/')[1] || 'png';
          await this.subirAdjunto(
            new File([file], `captura-${Date.now()}.${extension}`, { type: file.type }),
          );
          return;
        }
      }
    }
  }

  protected async subirAdjunto(file: File): Promise<void> {
    const contexto = this.state.contextoChat();
    this.subiendoArchivo.set(file.name);
    try {
      const recurso = await this.memoriaService.subirBinario(file, { titulo: file.name });
      /* La agente ya está en otra conversación: el archivo queda en Mi Memoria
         —visible y borrable— pero NO se adjunta aquí. Mandarle a la paciente
         equivocada la foto de otra es mucho peor que perder el adjunto. */
      if (contexto !== this.state.contextoChat()) return;
      if (recurso.mediaKey) {
        this.adjuntoPendiente.set({
          mediaKey: recurso.mediaKey,
          mediaMime: recurso.mediaMime,
          mediaNombre: file.name,
          vistaPrevia: recurso.mediaUrl,
        });
        this.toast.success('Archivo adjuntado.');
      }
    } catch (err) {
      if (contexto === this.state.contextoChat()) {
        this.toast.error(mensajeDeError(err, 'No se pudo adjuntar el archivo.'));
      }
    } finally {
      /* Solo si seguimos donde empezamos: si cambió el chat, el effect del
         constructor ya lo limpió y podríamos estar borrando el indicador de
         una subida que arrancó en la conversación nueva. */
      if (contexto === this.state.contextoChat()) this.subiendoArchivo.set(null);
    }
  }

  protected quitarAdjunto(): void {
    this.adjuntoPendiente.set(null);
  }

  /* ── Envío de Mensajes con Rollback Optimista & Confirmación de Media ── */
  protected async enviar(event?: Event): Promise<void> {
    event?.preventDefault();
    const texto = this.state.mensajeNuevo().trim();
    const id = this.state.seleccionadaId();
    const adj = this.adjuntoPendiente();

    if ((!texto && !adj) || !id || this.state.enviando()) return;
    /* Con una subida en vuelo el adjunto todavía no tiene clave: enviar ahora
       mandaría el texto solo y el archivo llegaría a ninguna parte. */
    if (this.subiendoArchivo()) return;

    if (this.state.fueraDeVentana24h()) {
      const horas = this.state.horasVentanaMeta();
      this.toast.warning(`Han pasado >${horas}h desde el último mensaje del paciente. Usa una Plantilla de WhatsApp.`);
      return;
    }

    // Si hay un adjunto (imagen o documento), solicitar confirmación explícita para evitar envíos accidentales
    if (adj) {
      this.abrirConfirmarMedia();
      return;
    }

    await this.ejecutarEnvio();
  }

  protected abrirConfirmarMedia(): void {
    const tmpl = this.modalConfirmarMedia();
    if (!tmpl) return;
    this.overlayRef?.dispose();
    this.overlayRef = this.dialogService.openTemplate(tmpl, this.vcr, {
      onClose: () => {
        this.overlayRef = undefined;
      },
    });
  }

  protected cerrarConfirmarMedia(): void {
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  protected quitarAdjuntoDesdeModal(): void {
    this.quitarAdjunto();
    this.cerrarConfirmarMedia();
  }

  protected async confirmarYEnviarMedia(): Promise<void> {
    this.cerrarConfirmarMedia();
    await this.ejecutarEnvio();
  }

  private async ejecutarEnvio(): Promise<void> {
    marcarEnvio('message-send-click');
    const texto = this.state.mensajeNuevo().trim();
    const id = this.state.seleccionadaId();
    const adj = this.adjuntoPendiente();

    if ((!texto && !adj) || !id) return;

    /* Antes aquí había `|| this.state.enviando()`, y con el input limpiándose
       al instante eso descartaba EN SILENCIO un segundo mensaje legítimo
       escrito dentro de los ~226 ms del primero. Dos textos distintos son dos
       envíos distintos, cada uno con su globo y su id temporal: no hay razón
       para serializarlos.
       Lo que sí hay que impedir es que el MISMO submit se procese dos veces
       —doble Enter, doble clic sobre el botón—, y para eso basta con el texto
       en vuelo: el input ya se vació, así que un segundo evento del mismo
       envío trae exactamente el mismo contenido. Un adjunto no se compara:
       exige confirmación explícita en su modal. */
    if (!adj && this.enviosEnVuelo.has(texto)) return;

    const contexto = this.state.contextoChat();
    if (!adj) this.enviosEnVuelo.add(texto);
    this.state.enviando.set(true);
    const chatPrevio = this.state.detalleActual();
    const idOptimista = idTemporal();
    /* Una intención de envío, un `clientMessageId`. Se genera aquí —no al
       reintentar— porque identifica lo que la agente quiso mandar, no el
       intento técnico. El reintento reutiliza el del globo. */
    const clientMessageId = idDeEnvio();

    // Actualización optimista de la UI
    if (chatPrevio) {
      const mensajeOptimista: MensajeApi = {
        id: idOptimista,
        /* EXACTAMENTE lo que va en el POST, ni más ni menos.
           Antes caía a `adj.mediaNombre` cuando no había texto, y eso tenía dos
           problemas: la burbuja mostraba como pie de foto un nombre de archivo
           que la paciente nunca recibió, y —desde que el reintento reenvía el
           adjunto— ese nombre se habría convertido en el pie real al reintentar.
           Un reintento tiene que repetir la intención, no inventarle un texto.
           La plantilla ya enseña el nombre del documento por su cuenta. */
        contenido: texto,
        direccion: 'SALIENTE',
        tipo: adj ? (adj.mediaMime?.startsWith('image/') ? 'IMAGEN' : 'DOCUMENTO') : 'TEXTO',
        mediaKey: adj?.mediaKey ?? null,
        mediaUrl: adj?.vistaPrevia ?? null,
        mediaMime: adj?.mediaMime ?? null,
        mediaNombre: adj?.mediaNombre ?? null,
        /* Sin `estadoEnvio`: ese campo es el del servidor y todavía no hay
           servidor que lo haya puesto. El estado de espera va aparte. */
        estadoEnvio: null,
        envioLocal: 'ENVIANDO',
        clientMessageId,
        automatico: false,
        createdAt: new Date().toISOString(),
      };

      this.state.detalle.set({
        ...chatPrevio,
        mensajes: [...chatPrevio.mensajes, mensajeOptimista],
      });
      marcarEnvio('message-optimistic-painted');
    }

    this.state.mensajeNuevo.set('');
    this.adjuntoPendiente.set(null);

    try {
      const real = await this.conversacionesService.enviarMensaje(id, texto, adj ? {
        mediaKey: adj.mediaKey,
        mediaMime: adj.mediaMime ?? null,
        mediaNombre: adj.mediaNombre ?? null,
      } : undefined, clientMessageId);

      // Sin reload: reemplaza el mensaje optimista con el real, en memoria.
      // Ver el porqué en `reconciliarEnvioLocal`.
      if (contexto === this.state.contextoChat()) {
        this.state.reconciliarEnvioLocal(id, idOptimista, real);
        medirEnvio('message-server-confirmed', 'message-send-click');
      }
    } catch (err) {
      // Una respuesta tardía no toca la conversación que ya no se está mirando.
      if (contexto !== this.state.contextoChat()) return;

      /* Antes esto restauraba `chatPrevio`: el globo desaparecía y el texto
         volvía al input con un toast. Un mensaje que se ve salir y luego se
         esfuma se lee como enviado-y-perdido, que es peor que un error
         visible. Ahora el globo se queda donde está, marcado, y ofrece
         reintentar sin volver a escribirlo. */
      if (chatPrevio) {
        /* Un error NO es permiso para reintentar. El backend persiste y
           dispara el envío a Meta antes de responder, así que solo los
           códigos que corta antes de la transacción son seguros. */
        this.state.marcarEnvioFallido(
          id, idOptimista, envioSeReintentaSinRiesgo(err) ? 'ERROR' : 'AMBIGUO',
        );
      } else {
        /* Sin detalle cargado no hay globo donde poner el error: ahí sí toca
           devolver el texto al input. */
        this.state.mensajeNuevo.set(texto);
        this.adjuntoPendiente.set(adj);
      }
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el mensaje.'));
    } finally {
      if (!adj) this.enviosEnVuelo.delete(texto);
      this.state.enviando.set(false);
    }
  }

  /* ── Inserción de Respuestas Rápidas ───────────────────────────── */
  protected insertarPlantillaAgente(contenido: string): void {
    const chat = this.state.detalleActual();
    const nombre = chat?.cliente.nombre ? chat.cliente.nombre.split(' ')[0] : 'paciente';
    const procesado = contenido.replace(/\{\{\s*nombre\s*\}\}/gi, nombre);
    this.state.mensajeNuevo.set(procesado);
  }

  /* ── Modales de Plantillas Oficiales de WhatsApp ─────────────────── */
  protected abrirPlantillas(): void {
    const tmpl = this.modalPlantillas();
    if (!tmpl) return;
    this.overlayRef?.dispose();
    this.overlayRef = this.dialogService.abrirCajon(tmpl, this.vcr, {
      onClose: () => {
        this.plantillaSeleccionada.set(null);
        this.variablesPlantilla.set([]);
        this.overlayRef = undefined;
      },
    });
  }

  protected seleccionarPlantilla(p: PlantillaResumen): void {
    this.plantillaSeleccionada.set(p);
    this.variablesPlantilla.set(Array.from({ length: p.variables }, () => ''));
  }

  protected setVariablePlantilla(index: number, val: string): void {
    this.variablesPlantilla.update(vars => {
      const next = [...vars];
      next[index] = val;
      return next;
    });
  }

  protected async enviarPlantillaWhatsApp(): Promise<void> {
    const p = this.plantillaSeleccionada();
    const id = this.state.seleccionadaId();
    if (!p || !id || this.enviandoPlantilla()) return;

    const contexto = this.state.contextoChat();
    this.enviandoPlantilla.set(true);
    try {
      const real = await this.conversacionesService.enviarPlantilla(id, {
        plantilla: p.nombre,
        idioma: p.idioma,
        parametros: this.variablesPlantilla(),
        contenido: p.cuerpo,
      });
      if (contexto !== this.state.contextoChat()) return;
      this.state.reconciliarEnvioLocal(id, null, real);
      this.toast.success('Plantilla de WhatsApp enviada.');
      this.cerrarModalPlantillas();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar la plantilla.'));
    } finally {
      this.enviandoPlantilla.set(false);
    }
  }

  protected cerrarModalPlantillas(): void {
    this.plantillaSeleccionada.set(null);
    this.variablesPlantilla.set([]);
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  /* ── Gestión de Respuestas Rápidas ──────────────────────────────── */
  protected abrirGestionPlantillas(): void {
    const tmpl = this.modalGestionPlantillas();
    if (!tmpl) return;
    this.resetFormPlantilla();
    this.overlayRef?.dispose();
    this.overlayRef = this.dialogService.abrirCajon(tmpl, this.vcr, {
      onClose: () => {
        this.resetFormPlantilla();
        this.overlayRef = undefined;
      },
    });
  }

  protected cerrarGestionPlantillas(): void {
    this.resetFormPlantilla();
    this.overlayRef?.dispose();
    this.overlayRef = undefined;
  }

  protected editarPlantilla(p: { id: string; titulo: string; atajo: string | null; contenido: string }): void {
    this.editandoPlantillaId.set(p.id);
    this.formPlantillaTitulo.set(p.titulo);
    this.formPlantillaAtajo.set(p.atajo || '');
    this.formPlantillaContenido.set(p.contenido);
  }

  protected resetFormPlantilla(): void {
    this.editandoPlantillaId.set(null);
    this.formPlantillaTitulo.set('');
    this.formPlantillaAtajo.set('');
    this.formPlantillaContenido.set('');
  }

  protected async guardarPlantillaAgente(): Promise<void> {
    const titulo = this.formPlantillaTitulo().trim();
    const contenido = this.formPlantillaContenido().trim();
    const atajo = this.formPlantillaAtajo().trim() || undefined;

    if (!titulo || !contenido) {
      this.toast.warning('Título y contenido son requeridos.');
      return;
    }

    this.guardandoPlantilla.set(true);
    try {
      const editId = this.editandoPlantillaId();
      if (editId) {
        await this.conversacionesService.actualizarPlantillaAgente(editId, { titulo, atajo, contenido });
        this.toast.success('Respuesta rápida actualizada.');
      } else {
        await this.conversacionesService.crearPlantillaAgente({ titulo, atajo, contenido });
        this.toast.success('Respuesta rápida creada.');
      }
      this.resetFormPlantilla();
      this.state.plantillasAgente.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la respuesta rápida.'));
    } finally {
      this.guardandoPlantilla.set(false);
    }
  }

  protected async eliminarPlantillaAgente(id: string): Promise<void> {
    try {
      await this.conversacionesService.eliminarPlantillaAgente(id);
      this.toast.success('Respuesta rápida eliminada.');
      this.state.plantillasAgente.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la respuesta rápida.'));
    }
  }
}

/**
 * Id del globo optimista mientras no existe el real.
 *
 * `Date.now()` a secas colisiona: dos mensajes enviados en el mismo
 * milisegundo compartían id y la reconciliación del primero se llevaba por
 * delante al segundo. El contador lo hace único dentro de la pestaña, que es
 * todo el alcance que necesita — nunca sale de aquí.
 */
let secuenciaTemporal = 0;
function idTemporal(): string {
  secuenciaTemporal += 1;
  return `temp-${Date.now()}-${secuenciaTemporal}`;
}

/** Marcas estándar del navegador; sin telemetría ni envío. */
function marcarEnvio(nombre: string): void {
  try {
    performance.mark(nombre);
  } catch {
    /* Medir nunca puede romper un envío. */
  }
}

function medirEnvio(nombre: string, desde: string): void {
  try {
    if (!performance.getEntriesByName(desde, 'mark').length) return;
    performance.measure(nombre, desde);
  } catch {
    /* Ídem. */
  }
}

/**
 * Identidad de la intención de envío que viaja al backend.
 *
 * `crypto.randomUUID()` porque el backend la valida como UUID y porque un
 * `Date.now()` no sirve para esto: dos pestañas de la misma agente pueden
 * coincidir en el milisegundo, y aquí una colisión significaría que un mensaje
 * se traga a otro. El respaldo cubre navegadores sin `randomUUID` en contextos
 * no seguros; no entra en producción, que es HTTPS.
 */
function idDeEnvio(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}
