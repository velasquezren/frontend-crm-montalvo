import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, linkedSignal, output, signal } from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../core/api/pagination.model';
import { ToastService } from '../../../core/toast/toast.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../shared/components/drawer/drawer.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../shared/components/select/select.component';
import { SwitchComponent } from '../../../shared/components/switch/switch.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { PlantillaResumen } from '../../conversaciones/conversacion.model';
import { ConversacionesService } from '../../conversaciones/conversaciones.service';
import { VistaPreviaPlantillaComponent } from '../../conversaciones/components/vista-previa-plantilla/vista-previa-plantilla.component';
import { etiquetaVariable, faltaParaEnviar } from '../../conversaciones/plantillas';
import { LineaWhatsapp } from '../../lineas-whatsapp/linea-whatsapp.model';
import { LineasWhatsappService } from '../../lineas-whatsapp/lineas-whatsapp.service';
import { costoMaximoUsd } from '../../audiencias/audiencia.model';
import { Campana, faltaProgramacion, FiltroCampana, instanteProgramado, MAX_DESTINATARIOS_CAMPANA, valoresPara, VariableCampana } from '../campana.model';
import { CampanasService } from '../campanas.service';

/** Cómo se rellena una variable, mientras se edita. */
interface VariableEnEdicion {
  readonly tipo: 'NOMBRE' | 'TEXTO';
  /** El respaldo (si es NOMBRE) o el texto fijo (si es TEXTO). */
  readonly valor: string;
}

/** La paciente de ejemplo de la vista previa, y una sin nombre para ver el respaldo. */
const EJEMPLO = 'María Gutiérrez';
const EJEMPLO_SIN_NOMBRE = 'WhatsApp +59170000000';

/**
 * Lanzar una campaña con la audiencia que se está mirando.
 *
 * Plantilla de Marketing de la línea, cómo se rellena cada variable (el
 * nombre de la paciente o un texto fijo), la vista previa tal como llegará y,
 * antes del botón, a cuántas y cuánto. El número que se ve viaja con la
 * campaña: si la audiencia cambió entretanto, el backend responde 409 con el
 * número nuevo en vez de mandar a otras.
 */
@Component({
  selector: 'app-nueva-campana',
  imports: [
    ButtonComponent,
    DrawerComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    SelectComponent,
    SwitchComponent,
    VistaPreviaPlantillaComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nueva-campana.component.html',
})
export class NuevaCampanaComponent {
  private readonly campanas = inject(CampanasService);
  private readonly conversaciones = inject(ConversacionesService);
  private readonly lineasService = inject(LineasWhatsappService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly filtro = input.required<FiltroCampana>();
  readonly elegibles = input.required<number>();
  readonly tarifaUsd = input.required<number>();
  readonly cerrar = output<void>();
  readonly creada = output<Campana>();

  protected readonly nombre = signal('');
  protected readonly lineaId = signal('');
  protected readonly plantillaClave = linkedSignal({ source: this.lineaId, computation: () => '' });
  protected readonly programar = signal(false);
  protected readonly programadaPara = signal('');
  protected readonly enviando = signal(false);

  protected readonly todasLasLineas = httpResource<RespuestaPaginada<LineaWhatsapp>>(
    () => this.lineasService.listarRequest(),
    { defaultValue: paginaVacia<LineaWhatsapp>() },
  );
  /** Las que pueden escribir hoy; las comerciales primero, que es donde se vende. */
  protected readonly lineas = computed(() =>
    (this.todasLasLineas.hasValue() ? this.todasLasLineas.value().datos : [])
      .filter(l => l.activa && l.conectada)
      .sort((a, b) => Number(b.comercial) - Number(a.comercial) || a.nombre.localeCompare(b.nombre, 'es')),
  );

  protected readonly todasLasPlantillas = httpResource<PlantillaResumen[]>(
    () => (this.lineaId() ? this.conversaciones.plantillasRequest(this.lineaId()) : undefined),
    { defaultValue: [] },
  );
  /** Solo Marketing y que el CRM sepa rellenar: el backend rechaza el resto. */
  protected readonly plantillas = computed(() =>
    (this.todasLasPlantillas.hasValue() ? this.todasLasPlantillas.value() : []).filter(p => p.categoria === 'MARKETING' && p.enviable),
  );
  protected readonly plantilla = computed(
    () => this.plantillas().find(p => claveDe(p) === this.plantillaClave()) ?? null,
  );

  /** Una por variable de la plantilla; la primera, por defecto, el nombre de la paciente. */
  protected readonly variables = linkedSignal<PlantillaResumen | null, VariableEnEdicion[]>({
    source: this.plantilla,
    computation: p => (p?.nombresVariables ?? []).map((_, i) => (i === 0 ? { tipo: 'NOMBRE', valor: 'hola' } : { tipo: 'TEXTO', valor: '' })),
  });

  private readonly paraEnviar = computed<VariableCampana[]>(() =>
    this.variables().map(v => (v.tipo === 'NOMBRE' ? { tipo: 'NOMBRE', respaldo: v.valor } : { tipo: 'TEXTO', texto: v.valor })),
  );
  protected readonly ejemplo = computed(() => valoresPara(this.paraEnviar(), EJEMPLO));
  protected readonly ejemploSinNombre = computed(() => valoresPara(this.paraEnviar(), EJEMPLO_SIN_NOMBRE));
  protected readonly usaNombre = computed(() => this.variables().some(v => v.tipo === 'NOMBRE'));
  protected readonly costo = computed(() => costoMaximoUsd(this.elegibles(), this.tarifaUsd()));
  private readonly instante = computed(() => instanteProgramado(this.programadaPara()));

  /** Qué falta para lanzarla, en palabras; null si está lista. */
  protected readonly falta = computed(() => {
    if (this.nombre().trim().length < 3) return 'Ponle un nombre a la campaña.';
    if (this.nombre().trim().length > 120) return 'El nombre admite hasta 120 caracteres.';
    if (this.elegibles() < 1 || this.elegibles() > MAX_DESTINATARIOS_CAMPANA) return 'Elige una audiencia de 1 a 2000 pacientes.';
    if (!this.lineaId()) return 'Elige la línea desde la que sale.';
    const p = this.plantilla();
    if (!p) return 'Elige una plantilla de Marketing.';
    const sinValor = this.variables().findIndex(v => !v.valor.trim());
    if (sinValor >= 0) return `Completa «${etiquetaVariable(p, sinValor)}».`;
    const demasiadoLargo = this.variables().findIndex(v => v.valor.trim().length > (v.tipo === 'NOMBRE' ? 60 : 200));
    if (demasiadoLargo >= 0) return `Acorta «${etiquetaVariable(p, demasiadoLargo)}»: admite ${this.variables()[demasiadoLargo].tipo === 'NOMBRE' ? 60 : 200} caracteres.`;
    const formato = faltaParaEnviar(p, this.ejemplo()) ?? faltaParaEnviar(p, this.ejemploSinNombre());
    if (formato) return formato;
    return this.programar() ? faltaProgramacion(this.instante()) : null;
  });

  protected readonly etiqueta = etiquetaVariable;
  protected readonly claveDe = claveDe;

  protected cambiarTipo(indice: number, tipo: string): void {
    this.variables.update(lista =>
      lista.map((v, i) => (i === indice ? { tipo: tipo === 'NOMBRE' ? 'NOMBRE' : 'TEXTO', valor: tipo === 'NOMBRE' ? 'hola' : '' } : v)),
    );
  }

  protected cambiarValor(indice: number, valor: string): void {
    this.variables.update(lista => lista.map((v, i) => (i === indice ? { ...v, valor } : v)));
  }

  protected async lanzar(): Promise<void> {
    const p = this.plantilla();
    if (!p || this.falta() || this.enviando()) return;
    // Comprobar otra vez el reloj: un formulario abierto puede haber esperado
    // hasta después de su hora, sin que cambie ninguna señal de edición.
    const fechaInvalida = this.programar() ? faltaProgramacion(this.instante()) : null;
    if (fechaInvalida) { this.toast.error(fechaInvalida); return; }
    this.enviando.set(true);
    try {
      const campana = await this.campanas.crear({
        nombre: this.nombre().trim(),
        lineaId: this.lineaId(),
        plantilla: p.nombre,
        idioma: p.idioma,
        variables: this.paraEnviar(),
        filtro: this.filtro(),
        tarifaUsd: this.tarifaUsd(),
        ...(this.programar() ? { programadaPara: this.instante()! } : {}),
        elegiblesVistas: this.elegibles(),
      });
      if (this.destroyRef.destroyed) return;
      this.toast.success(
        campana.estado === 'PROGRAMADA'
          ? `«${campana.nombre}» quedó programada.`
          : `«${campana.nombre}» empezó a salir. Va de a poco y solo de 9:00 a 20:00.`,
      );
      this.creada.emit(campana);
    } catch (error) {
      if (!this.destroyRef.destroyed) this.toast.error(mensajeDeError(error, 'No se pudo crear la campaña.'));
    } finally {
      this.enviando.set(false);
    }
  }
}

function claveDe(p: PlantillaResumen): string {
  return `${p.nombre}|${p.idioma}`;
}
