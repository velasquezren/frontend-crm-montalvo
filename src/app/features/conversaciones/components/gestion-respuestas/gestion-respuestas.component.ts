import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { ConversacionesService } from '../../conversaciones.service';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';

/**
 * «Mis respuestas rápidas»: crear, editar y borrar los textos personales que
 * la agente inserta con «/atajo» desde el compositor.
 *
 * Vivía dentro de `ConversacionComposerComponent`, que ya reúne escribir,
 * adjuntar, atajos, plantillas de WhatsApp y ubicación; esto es otro dominio
 * (`plantillas-agente` en el backend) con su propio formulario. El compositor
 * sigue abriendo el cajón y poniendo su marco (`<app-drawer>`); este
 * componente es su contenido.
 *
 * El formulario nace vacío cada vez que se abre el cajón, porque el cajón
 * crea el componente de nuevo: es lo que antes hacía `resetFormPlantilla()` al
 * abrir.
 */
@Component({
  selector: 'app-gestion-respuestas',
  imports: [ButtonComponent, InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './gestion-respuestas.component.html',
  /* Las mismas clases del contenedor al que sustituye, más `block`: un
     elemento propio nace `inline`. */
  host: { class: 'block flex-1 overflow-y-auto p-5 space-y-4' },
})
export class GestionRespuestasComponent {
  private readonly state = inject(ConversacionesStateService);
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly toast = inject(ToastService);

  protected readonly misRespuestas = computed(() =>
    this.state.plantillasAgente.hasValue() ? this.state.plantillasAgente.value() : [],
  );

  protected readonly editandoPlantillaId = signal<string | null>(null);
  protected readonly formPlantillaTitulo = signal('');
  protected readonly formPlantillaAtajo = signal('');
  protected readonly formPlantillaContenido = signal('');
  protected readonly guardandoPlantilla = signal(false);

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
