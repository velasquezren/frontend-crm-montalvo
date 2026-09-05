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
import { ConversacionesService } from '../../conversaciones.service';
import { MemoriaAgenteService } from '../../../memoria-agente/memoria-agente.service';
import { RecursoMemoria } from '../../../memoria-agente/memoria-agente.model';
import { MensajeApi, PlantillaResumen } from '../../conversacion.model';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';

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
    BadgeComponent,
    RouterLink,
    ButtonComponent,
    IconComponent,
    InputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-composer.component.html',
  styleUrl: './conversacion-composer.component.css',
})
export class ConversacionComposerComponent implements OnDestroy {
  protected readonly state = inject(ConversacionesStateService);
  private readonly conversacionesService = inject(ConversacionesService);
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
    try {
      this.toast.info(`Subiendo "${file.name}"...`);
      const recurso = await this.memoriaService.subirBinario(file, { titulo: file.name });
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
      this.toast.error(mensajeDeError(err, 'No se pudo adjuntar el archivo.'));
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
    this.overlayRef = this.dialogService.openTemplate(tmpl, this.vcr);
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
    const texto = this.state.mensajeNuevo().trim();
    const id = this.state.seleccionadaId();
    const adj = this.adjuntoPendiente();

    if ((!texto && !adj) || !id || this.state.enviando()) return;

    this.state.enviando.set(true);
    const chatPrevio = this.state.detalle.value();
    const idOptimista = `temp-${Date.now()}`;

    // Actualización optimista de la UI
    if (chatPrevio) {
      const mensajeOptimista: MensajeApi = {
        id: idOptimista,
        contenido: texto || (adj?.mediaNombre ?? ''),
        direccion: 'SALIENTE',
        tipo: adj ? (adj.mediaMime?.startsWith('image/') ? 'IMAGEN' : 'DOCUMENTO') : 'TEXTO',
        mediaKey: adj?.mediaKey ?? null,
        mediaUrl: adj?.vistaPrevia ?? null,
        mediaMime: adj?.mediaMime ?? null,
        mediaNombre: adj?.mediaNombre ?? null,
        estadoEnvio: 'ENVIADO',
        automatico: false,
        createdAt: new Date().toISOString(),
      };

      this.state.detalle.set({
        ...chatPrevio,
        mensajes: [...chatPrevio.mensajes, mensajeOptimista],
      });
    }

    this.state.mensajeNuevo.set('');
    this.adjuntoPendiente.set(null);

    try {
      const real = await this.conversacionesService.enviarMensaje(id, texto, adj ? {
        mediaKey: adj.mediaKey,
        mediaMime: adj.mediaMime ?? null,
        mediaNombre: adj.mediaNombre ?? null,
      } : undefined);

      // Sin reload: reemplaza el mensaje optimista con el real, en memoria.
      // Ver el porqué en `reconciliarEnvioLocal`.
      this.state.reconciliarEnvioLocal(id, idOptimista, real);
    } catch (err) {
      // Rollback optimista en caso de fallo
      if (chatPrevio) {
        this.state.detalle.set(chatPrevio);
      }
      this.state.mensajeNuevo.set(texto);
      this.adjuntoPendiente.set(adj);
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el mensaje.'));
    } finally {
      this.state.enviando.set(false);
    }
  }

  /* ── Inserción de Respuestas Rápidas ───────────────────────────── */
  protected insertarPlantillaAgente(contenido: string): void {
    const chat = this.state.detalle.value();
    const nombre = chat?.cliente.nombre ? chat.cliente.nombre.split(' ')[0] : 'paciente';
    const procesado = contenido.replace(/\{\{\s*nombre\s*\}\}/gi, nombre);
    this.state.mensajeNuevo.set(procesado);
  }

  /* ── Modales de Plantillas Oficiales de WhatsApp ─────────────────── */
  protected abrirPlantillas(): void {
    const tmpl = this.modalPlantillas();
    if (!tmpl) return;
    this.overlayRef?.dispose();
    this.overlayRef = this.dialogService.openTemplate(tmpl, this.vcr);
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

    this.enviandoPlantilla.set(true);
    try {
      const real = await this.conversacionesService.enviarPlantilla(id, {
        plantilla: p.nombre,
        idioma: p.idioma,
        parametros: this.variablesPlantilla(),
        contenido: p.cuerpo,
      });
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
    this.overlayRef = this.dialogService.openTemplate(tmpl, this.vcr);
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
