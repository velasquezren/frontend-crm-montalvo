import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse, httpResource } from '@angular/common/http';

import { mensajeDeError } from '../../core/api/http-error';
import { ToastService } from '../../core/toast/toast.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../shared/components/select/select.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { ZONA_CLINICA } from '../../core/fechas/zona-clinica';
import { InteraccionPreviewComponent } from '../conversaciones/components/interaccion-preview/interaccion-preview.component';
import { LineasWhatsappService } from './lineas-whatsapp.service';
import {
  editable,
  efectoDeCita,
  LIMITES,
  MenuAtencion,
  MenuEditable,
  menuInicial,
  OpcionMenu,
  paraGuardar,
  TIPOS,
  tiposDisponibles,
  vistaPrevia,
} from './menu-atencion.model';

/**
 * El menú con el que una línea recibe a la paciente: qué opciones ve y qué se
 * le responde. Se edita entero y se guarda de una vez; el servidor valida y, si
 * algo falta, devuelve la lista de motivos, que se muestra tal cual.
 *
 * La vista previa es cómo lo verá ella en WhatsApp (botones o lista).
 */
@Component({
  selector: 'app-menu-atencion-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonComponent,
    DrawerComponent,
    ErrorCargaComponent,
    IconComponent,
    InputComponent,
    InteraccionPreviewComponent,
    LoadingSkeletonComponent,
    SelectComponent,
    SwitchComponent,
  ],
  templateUrl: './menu-atencion-editor.component.html',
  styleUrl: './menu-atencion-editor.component.css',
})
export class MenuAtencionEditorComponent {
  private readonly service = inject(LineasWhatsappService);
  private readonly toast = inject(ToastService);

  readonly lineaId = input.required<string>();
  readonly nombre = input('');
  readonly cerrar = output<void>();
  /** Si hay cambios sin guardar: la página lo usa para pedir confirmación antes de cerrar el cajón. */
  readonly cambiosSinGuardar = output<boolean>();

  protected readonly datos = httpResource<MenuEditable>(() => this.service.menuRequest(this.lineaId()));
  /** Lo que se está editando. Se reinicia con cada carga del servidor (también tras guardar). */
  protected readonly borrador = linkedSignal<MenuAtencion>(() => editable(this.datos.value()?.menu ?? menuInicial()));
  protected readonly guardando = signal(false);
  protected readonly errores = signal<readonly string[]>([]);
  /** Lo que eligió el desplegable; se comprueba contra los tipos disponibles al agregar. */
  protected readonly tipoNuevo = signal('');
  /** La última opción quitada, para deshacer: quitar borra lo que se había escrito en ella. */
  protected readonly quitada = signal<{ opcion: OpcionMenu; indice: number } | null>(null);

  protected readonly tipos = TIPOS;
  /** Qué hace «Cita» en esta línea (reserva, solicitud o solo «Atención»). */
  protected readonly formularioCita = computed(() => this.datos.value()?.formularioCita ?? null);
  protected readonly efectoCita = computed(() => efectoDeCita(this.formularioCita()));
  protected readonly limites = LIMITES;
  protected readonly disponibles = computed(() => tiposDisponibles(this.borrador(), this.datos.value()?.linea.comercial === true));
  protected readonly vista = computed(() => vistaPrevia(this.borrador()));
  /** Errores que el servidor dejó en un menú guardado que ya no vale (p. ej. tras una regla nueva). */
  protected readonly erroresGuardados = computed(() => this.datos.value()?.errores ?? []);
  /** Lo editado difiere de lo guardado. Se compara lo que viajaría, no espacios sueltos. */
  readonly sinGuardar = computed(() => {
    if (!this.datos.hasValue()) return false;
    const guardado = this.datos.value()?.menu ?? menuInicial();
    return JSON.stringify(paraGuardar(this.borrador())) !== JSON.stringify(paraGuardar(guardado));
  });
  protected readonly ultimaEdicion = computed(() => {
    const d = this.datos.value();
    if (!d?.actualizadoPor || !d.actualizadoEn) return null;
    const cuando = new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA_CLINICA }).format(new Date(d.actualizadoEn));
    return `${d.actualizadoPor.nombre} · ${cuando}`;
  });

  constructor() {
    effect(() => this.cambiosSinGuardar.emit(this.sinGuardar()));
  }

  /** Cerrar la pestaña con cambios sin guardar: el navegador pregunta. */
  @HostListener('window:beforeunload', ['$event'])
  protected antesDeSalir(evento: BeforeUnloadEvent): void {
    if (this.sinGuardar()) evento.preventDefault();
  }

  protected cambiar(cambios: Partial<MenuAtencion>): void {
    this.borrador.update(m => ({ ...m, ...cambios }));
  }

  protected cambiarOpcion(i: number, cambios: Partial<OpcionMenu>): void {
    this.borrador.update(m => ({ ...m, opciones: m.opciones.map((o, j) => (j === i ? { ...o, ...cambios } : o)) }));
  }

  protected mover(i: number, delta: -1 | 1): void {
    this.borrador.update(m => {
      const opciones = [...m.opciones];
      const destino = i + delta;
      if (destino < 0 || destino >= opciones.length) return m;
      [opciones[i], opciones[destino]] = [opciones[destino], opciones[i]];
      return { ...m, opciones };
    });
  }

  /** La de hablar con una persona no se quita: el menú siempre ofrece esa salida. */
  protected quitar(i: number): void {
    const opcion = this.borrador().opciones[i];
    if (!opcion || opcion.tipo === 'PERSONA') return;
    this.borrador.update(m => ({ ...m, opciones: m.opciones.filter((_, j) => j !== i) }));
    this.quitada.set({ opcion, indice: i });
  }

  protected deshacerQuitar(): void {
    const q = this.quitada();
    if (!q) return;
    /* Las mismas reglas que agregar: un tipo único no vuelve si ya hay otro, ni pasa de diez. */
    if (!this.disponibles().includes(q.opcion.tipo)) {
      this.quitada.set(null);
      return;
    }
    this.borrador.update(m => {
      const opciones = [...m.opciones];
      opciones.splice(Math.min(q.indice, opciones.length), 0, q.opcion);
      return { ...m, opciones };
    });
    this.quitada.set(null);
  }

  protected agregar(): void {
    const tipo = this.disponibles().find(t => t === this.tipoNuevo());
    if (!tipo) return;
    this.borrador.update(m => ({ ...m, opciones: [...m.opciones, { tipo, titulo: TIPOS[tipo].tituloSugerido, uid: crypto.randomUUID() }] }));
    this.tipoNuevo.set('');
    /* Después de agregar, deshacer el quitar podría duplicar un tipo único o pasar de diez. */
    this.quitada.set(null);
  }

  /** El aviso de un texto que ya no cabe, mientras se escribe. El servidor tiene la última palabra. */
  protected excede(valor: string | undefined, max: number): string | undefined {
    return (valor?.length ?? 0) > max ? `Máximo ${max} caracteres (van ${valor!.length}).` : undefined;
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.errores.set([]);
    try {
      /* La respuesta del PUT ya es el menú guardado (con las claves nuevas): se usa
         tal cual. Recargar dejaba «Cambios sin guardar» un viaje de ida y vuelta más. */
      this.datos.set(await this.service.guardarMenu(this.lineaId(), paraGuardar(this.borrador())));
      this.quitada.set(null);
      this.toast.success(!this.borrador().activo ? 'Menú guardado. Está apagado.'
        : this.datos.value()?.enviosHabilitados ? 'Menú guardado y encendido.'
        : 'Menú guardado. Los envíos siguen desactivados en esta línea.');
    } catch (error) {
      this.errores.set(erroresDe(error));
    } finally {
      this.guardando.set(false);
    }
  }
}

/** Un 400 de validación trae la lista de motivos; se muestran uno por línea. */
function erroresDe(error: unknown): readonly string[] {
  const detalle: unknown = error instanceof HttpErrorResponse ? error.error?.message : undefined;
  if (Array.isArray(detalle) && detalle.every(d => typeof d === 'string') && detalle.length) return detalle as string[];
  return [mensajeDeError(error, 'No se pudo guardar el menú.')];
}
