import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { OverlayRef } from '@angular/cdk/overlay';

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { ToastService } from '../../../../core/toast/toast.service';
import { mensajeDeError } from '../../../../core/api/http-error';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionesService } from '../../conversaciones.service';
import { MemoriaAgenteService } from '../../../memoria-agente/memoria-agente.service';
import { RecursoMemoria } from '../../../memoria-agente/memoria-agente.model';
import { PlantillaResumen } from '../../conversacion.model';

interface AdjuntoLocal {
  readonly mediaKey: string;
  readonly mediaMime?: string | null;
  readonly mediaNombre?: string | null;
  readonly vistaPrevia?: string | null;
}

const TICK_GRABACION_MS = 1000;

/**
 * Componente de entrada y composición de mensajes para el Inbox de WhatsApp.
 * Soporta:
 * - Respuestas rápidas / plantillas del agente (atajos con '/')
 * - Inserción de notas y medios desde la Memoria Personal
 * - Envío de plantillas oficiales aprobadas por Meta fuera de la ventana de 24h
 * - Drag & Drop de imágenes y documentos
 * - Grabación de notas de voz en tiempo real (MediaRecorder API)
 */
@Component({
  selector: 'app-conversacion-composer',
  standalone: true,
  imports: [
    RouterLink,
    BadgeComponent,
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
  private overlayRef: OverlayRef | null = null;

  /* ── Adjuntos & Popovers ────────────────────────────────────────── */
  protected readonly adjuntoPendiente = signal<AdjuntoLocal | null>(null);
  protected readonly mostrarPopoverMemoria = signal(false);
  protected readonly busquedaMemoria = signal('');
  protected readonly arrastrandoSobre = signal(false);

  /* ── Grabadora de Audio en Tiempo Real (MediaRecorder) ──────────── */
  protected readonly grabandoAudio = signal(false);
  protected readonly segundosGrabacion = signal(0);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private audioStream: MediaStream | null = null;
  private timerGrabacion: ReturnType<typeof setInterval> | null = null;

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

  ngOnDestroy(): void {
    this.cancelarGrabacionAudio();
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
    if (files && files.length > 0) {
      await this.subirAdjunto(files[0]);
    }
  }

  /* ── Grabadora de Voz (MediaRecorder API) ───────────────────────── */
  protected async iniciarGrabacionAudio(): Promise<void> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.toast.error('Tu navegador no permite la grabación de audio.');
        return;
      }

      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      const options = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? { mimeType: 'audio/ogg;codecs=opus' }
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : undefined;

      this.mediaRecorder = new MediaRecorder(this.audioStream, options);

      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      this.mediaRecorder.start(100);
      this.grabandoAudio.set(true);
      this.segundosGrabacion.set(0);

      this.timerGrabacion = setInterval(() => {
        this.segundosGrabacion.update(s => s + 1);
      }, TICK_GRABACION_MS);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo acceder al micrófono.'));
      this.cancelarGrabacionAudio();
    }
  }

  protected cancelarGrabacionAudio(): void {
    if (this.timerGrabacion) {
      clearInterval(this.timerGrabacion);
      this.timerGrabacion = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.grabandoAudio.set(false);
    this.segundosGrabacion.set(0);
  }

  protected async enviarAudioGrabado(): Promise<void> {
    if (!this.mediaRecorder) return;
    const duracion = this.segundosGrabacion();

    if (duracion < 1) {
      this.toast.warning('El audio es muy corto.');
      this.cancelarGrabacionAudio();
      return;
    }

    if (this.timerGrabacion) {
      clearInterval(this.timerGrabacion);
      this.timerGrabacion = null;
    }

    this.mediaRecorder.onstop = async () => {
      try {
        const mime = this.mediaRecorder?.mimeType || 'audio/ogg';
        const blob = new Blob(this.audioChunks, { type: mime });
        const extension = mime.includes('webm') ? 'webm' : 'ogg';
        const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: mime });

        if (this.audioStream) {
          this.audioStream.getTracks().forEach(track => track.stop());
          this.audioStream = null;
        }

        this.toast.info('Subiendo mensaje de voz…');
        const recurso = await this.memoriaService.subirBinario(file, { titulo: file.name });
        const convId = this.state.seleccionadaId();

        if (recurso.mediaKey && convId) {
          await this.conversacionesService.enviarMensaje(convId, '', {
            mediaKey: recurso.mediaKey,
            mediaMime: recurso.mediaMime ?? null,
            mediaNombre: file.name,
          });
          this.toast.success('Mensaje de voz enviado.');
          this.state.detalle.reload();
          this.state.conversacionesRecurso.reload();
        }
      } catch (err) {
        this.toast.error(mensajeDeError(err, 'No se pudo enviar el mensaje de voz.'));
      } finally {
        this.cancelarGrabacionAudio();
      }
    };

    this.mediaRecorder.stop();
  }

  protected formatearTiempoAudio(segundos: number): string {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0');
    const sec = (segundos % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
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

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          event.preventDefault();
          const extension = file.type.split('/')[1] ?? 'png';
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

  /* ── Envío de Mensajes con Rollback Optimista ──────────────────── */
  protected async enviar(event: Event): Promise<void> {
    event.preventDefault();
    const texto = this.state.mensajeNuevo().trim();
    const id = this.state.seleccionadaId();
    const adj = this.adjuntoPendiente();

    if ((!texto && !adj) || !id || this.state.enviando()) return;

    if (this.state.fueraDeVentana24h()) {
      this.toast.warning('Han pasado >24h desde el último mensaje del paciente. Usa una Plantilla de WhatsApp.');
      this.abrirPlantillas();
      return;
    }

    this.state.enviando.set(true);
    const chatPrevio = this.state.detalle.value();

    // Actualización optimista
    if (chatPrevio) {
      const idOptimista = `temp-${Date.now()}`;
      const mensajeOptimista = {
        id: idOptimista,
        contenido: texto,
        direccion: 'SALIENTE' as const,
        estadoEnvio: 'ENVIADO' as const,
        createdAt: new Date().toISOString(),
        tipo: adj ? (adj.mediaMime?.startsWith('image/') ? 'IMAGEN' as const : 'DOCUMENTO' as const) : undefined,
        mediaUrl: adj?.vistaPrevia ?? null,
        mediaNombre: adj?.mediaNombre ?? null,
      };

      this.state.detalle.set({
        ...chatPrevio,
        mensajes: [...chatPrevio.mensajes, mensajeOptimista],
      });
    }

    this.state.mensajeNuevo.set('');
    this.adjuntoPendiente.set(null);

    try {
      await this.conversacionesService.enviarMensaje(
        id,
        texto,
        adj ? { mediaKey: adj.mediaKey, mediaMime: adj.mediaMime ?? null, mediaNombre: adj.mediaNombre ?? null } : undefined,
      );

      this.state.detalle.reload();
      this.state.conversacionesRecurso.reload();
    } catch (err) {
      if (chatPrevio) {
        this.state.detalle.set(chatPrevio);
      }
      this.state.mensajeNuevo.set(texto);
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el mensaje.'));
    } finally {
      this.state.enviando.set(false);
    }
  }

  /* ── Popover Memoria Personal ─────────────────────────────────── */
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
      this.toast.success('Archivo adjuntado.');
      return;
    }

    const texto = recurso.contenido || recurso.titulo;
    const previo = this.state.mensajeNuevo();
    this.state.mensajeNuevo.set(previo ? `${previo}\n${texto}` : texto);
    this.toast.success('Recurso insertado.');
  }

  /* ── Respuestas Rápidas / Atajos ──────────────────────────────── */
  protected insertarPlantillaAgente(contenido: string): void {
    this.state.mensajeNuevo.set(contenido);
  }

  protected abrirGestionPlantillas(): void {
    const tpl = this.modalGestionPlantillas();
    if (tpl) {
      this.overlayRef = this.dialogService.openTemplate(tpl, this.vcr);
    }
  }

  protected cerrarGestionPlantillas(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.limpiarFormPlantilla();
  }

  protected editarPlantilla(id: string, titulo: string, atajo: string | null, contenido: string): void {
    this.editandoPlantillaId.set(id);
    this.formPlantillaTitulo.set(titulo);
    this.formPlantillaAtajo.set(atajo || '');
    this.formPlantillaContenido.set(contenido);
  }

  protected limpiarFormPlantilla(): void {
    this.editandoPlantillaId.set(null);
    this.formPlantillaTitulo.set('');
    this.formPlantillaAtajo.set('');
    this.formPlantillaContenido.set('');
  }

  protected async guardarPlantillaAgente(): Promise<void> {
    const titulo = this.formPlantillaTitulo().trim();
    const contenido = this.formPlantillaContenido().trim();
    const atajo = this.formPlantillaAtajo().trim() || null;

    if (!titulo || !contenido) {
      this.toast.warning('Título y contenido son obligatorios.');
      return;
    }

    this.guardandoPlantilla.set(true);
    try {
      const editId = this.editandoPlantillaId();
      if (editId) {
        await this.conversacionesService.actualizarPlantillaAgente(editId, {
          titulo,
          atajo: atajo || undefined,
          contenido,
        });
        this.toast.success('Respuesta rápida actualizada.');
      } else {
        await this.conversacionesService.crearPlantillaAgente({
          titulo,
          atajo: atajo || undefined,
          contenido,
        });
        this.toast.success('Respuesta rápida creada.');
      }
      this.state.plantillasAgente.reload();
      this.limpiarFormPlantilla();
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
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar.'));
    }
  }

  /* ── Modal Plantillas WhatsApp ────────────────────────────────── */
  protected abrirPlantillas(): void {
    const tpl = this.modalPlantillas();
    if (tpl) {
      this.plantillaSeleccionada.set(null);
      this.variablesPlantilla.set([]);
      this.overlayRef = this.dialogService.openTemplate(tpl, this.vcr);
    }
  }

  protected cerrarPlantillas(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
    this.plantillaSeleccionada.set(null);
    this.variablesPlantilla.set([]);
  }

  protected seleccionarPlantilla(p: PlantillaResumen): void {
    this.plantillaSeleccionada.set(p);
    this.variablesPlantilla.set(new Array(p.variables).fill(''));
  }

  protected volverAListaPlantillas(): void {
    this.plantillaSeleccionada.set(null);
    this.variablesPlantilla.set([]);
  }

  protected setVariablePlantilla(index: number, valor: string): void {
    const vars = [...this.variablesPlantilla()];
    vars[index] = valor;
    this.variablesPlantilla.set(vars);
  }

  protected previsualizarCuerpo(cuerpo: string, vars: string[]): string {
    let res = cuerpo;
    vars.forEach((v, i) => {
      res = res.replaceAll(`{{${i + 1}}}`, v || `[Variable ${i + 1}]`);
    });
    return res;
  }

  protected async enviarPlantilla(): Promise<void> {
    const p = this.plantillaSeleccionada();
    const id = this.state.seleccionadaId();
    if (!p || !id || this.enviandoPlantilla()) return;

    this.enviandoPlantilla.set(true);
    try {
      await this.conversacionesService.enviarPlantilla(id, {
        plantilla: p.nombre,
        idioma: p.idioma,
        parametros: this.variablesPlantilla().filter(Boolean),
        contenido: this.previsualizarCuerpo(p.cuerpo, this.variablesPlantilla()),
      });
      this.toast.success(`Plantilla "${p.nombre}" enviada.`);
      this.cerrarPlantillas();
      this.state.detalle.reload();
      this.state.conversacionesRecurso.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar la plantilla.'));
    } finally {
      this.enviandoPlantilla.set(false);
    }
  }
}
