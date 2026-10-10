import { ChangeDetectionStrategy, Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';

import { ModoAsistente, ResultadoTurnoAsistente } from '../../core/api/db-enums';
import { mensajeDeError } from '../../core/api/http-error';
import { ToastService } from '../../core/toast/toast.service';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import {
  AsistenteEditable, faltaEnElServidor, GuardarAsistente, LIMITES_ASISTENTE, MODOS_ASISTENTE, motivoParaNoGuardar, PASO_PRUEBA, RESULTADO_TURNO, ResultadoPrueba,
} from './asistente-linea.model';
import { LineasWhatsappService } from './lineas-whatsapp.service';

function formulario(d: AsistenteEditable | undefined): GuardarAsistente {
  const c = d?.configuracion;
  return {
    modo: c?.modo ?? 'APAGADO',
    conocimiento: c?.conocimiento ?? '',
    criterioDerivacion: c?.criterioDerivacion ?? '',
    leerComprobantes: c?.leerComprobantes ?? false,
  };
}

const ORDEN_RESULTADOS: readonly ResultadoTurnoAsistente[] = ['RESPONDIO', 'SUGIRIO', 'DERIVO', 'FALLO', 'OMITIDO'];

/**
 * El asistente de IA de esta línea (docs/asistente-ia.md del backend): cómo
 * participa, lo que sabe de la clínica y qué pasa SIEMPRE a una persona. Se
 * guarda aunque el servidor no esté conectado a Google todavía: empieza a
 * funcionar cuando lo esté.
 */
@Component({
  selector: 'app-asistente-linea-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BadgeComponent, ButtonComponent, DrawerComponent, ErrorCargaComponent, IconComponent, InputComponent, LoadingSkeletonComponent, SwitchComponent],
  templateUrl: './asistente-linea-editor.component.html',
})
export class AsistenteLineaEditorComponent {
  private readonly service = inject(LineasWhatsappService);
  private readonly toast = inject(ToastService);

  readonly lineaId = input.required<string>();
  readonly nombre = input('');
  readonly cerrar = output<void>();
  readonly cambiosSinGuardar = output<boolean>();

  protected readonly datos = httpResource<AsistenteEditable>(() => this.service.asistenteRequest(this.lineaId()));
  protected readonly borrador = linkedSignal<GuardarAsistente>(() => formulario(this.datos.hasValue() ? this.datos.value() : undefined));
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected readonly modos = MODOS_ASISTENTE;
  protected readonly limites = LIMITES_ASISTENTE;
  protected readonly resultados = RESULTADO_TURNO;
  protected readonly nombresPaso = PASO_PRUEBA;
  /* Una prueba es de la línea que se mira: al cambiar de línea, vuelve a empezar vacía. */
  protected readonly prueba = linkedSignal<string, ResultadoPrueba | null>({ source: this.lineaId, computation: () => null });
  protected readonly probando = signal(false);

  readonly sinGuardar = computed(() => this.datos.hasValue() && JSON.stringify(this.borrador()) !== JSON.stringify(formulario(this.datos.value())));
  /** Lo que el servidor rechazaría, dicho antes de pulsar. */
  protected readonly motivo = computed(() => motivoParaNoGuardar(this.borrador()));
  protected readonly falta = computed(() => (this.datos.hasValue() ? faltaEnElServidor(this.datos.value().proveedor) : null));
  protected readonly actividad = computed(() => {
    if (!this.datos.hasValue()) return [];
    const por = this.datos.value().actividad.porResultado;
    return ORDEN_RESULTADOS.filter(r => (por[r] ?? 0) > 0).map(r => ({ resultado: r, cantidad: por[r] ?? 0 }));
  });

  constructor() {
    effect(() => this.cambiosSinGuardar.emit(this.sinGuardar()));
  }

  protected cambiar(cambios: Partial<GuardarAsistente>): void {
    this.borrador.update(b => ({ ...b, ...cambios }));
  }

  protected elegirModo(modo: ModoAsistente): void {
    this.cambiar({ modo });
  }

  /** Prueba la conexión con Google de punta a punta (unos segundos, datos sintéticos). */
  protected async probar(): Promise<void> {
    if (this.probando()) return;
    this.probando.set(true);
    this.prueba.set(null);
    try {
      const r = await this.service.probarAsistente();
      this.prueba.set(r);
      if (r.ok) this.toast.success('Conexión con Google comprobada.');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo probar la conexión.'));
    } finally {
      this.probando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    if (this.guardando()) return;
    const motivo = this.motivo();
    if (motivo) {
      this.error.set(motivo);
      return;
    }
    const b = this.borrador();
    this.guardando.set(true);
    this.error.set('');
    try {
      this.datos.set(await this.service.guardarAsistente(this.lineaId(), {
        ...b, conocimiento: b.conocimiento.trim(), criterioDerivacion: b.criterioDerivacion.trim(),
      }));
      this.toast.success(b.modo === 'APAGADO' ? 'Asistente guardado. Está apagado.' : 'Asistente guardado.');
    } catch (err) {
      this.error.set(mensajeDeError(err, 'No se pudo guardar el asistente.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
