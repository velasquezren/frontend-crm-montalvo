import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { esConflicto, mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { generarIniciales } from '../../../../core/auth/user.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { problemaDeImagen, TIPOS_IMAGEN_PUBLICA } from '../../../../shared/models/catalogo';
import { FichaMedicoAgenda, requisitosWeb } from '../../agenda-medicos.model';
import { AgendaMedicosService, CambiosPresentacion } from '../../agenda-medicos.service';
import { Especialidad, FichaMedico } from '../../directorio.model';
import { DirectorioService } from '../../directorio.service';

type Tarea = 'crear' | 'texto' | 'foto' | 'publicar';

interface TextoWeb {
  nombrePublico: string;
  resumen: string;
  biografia: string;
  matricula: string;
}

const textoDe = (p: FichaMedico | null): TextoWeb => ({
  nombrePublico: p?.nombrePublico ?? '',
  resumen: p?.resumen ?? '',
  biografia: p?.biografia ?? '',
  matricula: p?.matricula ?? '',
});

/** Límites del backend (`ActualizarPresentacionAgendaDto`). */
export const LARGO_RESUMEN = 300;
export const LARGO_BIOGRAFIA = 3000;

/**
 * La presentación web de un médico de la agenda: su foto, cómo se presenta y
 * si la landing lo muestra. Nombre de la agenda, precio y horario NO se editan
 * aquí: salen de la agenda, que es la que da los cupos.
 *
 * Cada acción devuelve la ficha completa y se la pasa a quien la monta
 * (`actualizada`): así la cabecera del cajón y el listado se enteran sin pedirla.
 */
@Component({
  selector: 'app-agenda-presentacion-web',
  imports: [BadgeComponent, ButtonComponent, FilterChipComponent, IconComponent, InputComponent, MonedaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-presentacion-web.component.html',
  host: { class: 'flex-1 min-h-0 flex flex-col' },
})
export class AgendaPresentacionWebComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly directorio = inject(DirectorioService);
  private readonly toast = inject(ToastService);

  /*
   * Opcional a propósito: el cajón pregunta `hayCambios()` al pintar sus
   * pestañas, ANTES de que este componente reciba la ficha. Con `required`
   * esa pregunta lanzaba NG0950 y el cajón no abría.
   */
  readonly ficha = input<FichaMedicoAgenda | null>(null);
  readonly editable = input(false);
  readonly actualizada = output<FichaMedicoAgenda>();
  /** 409: otra persona guardó la ficha web. Quien monta ofrece recargar. */
  readonly conflicto = output<void>();

  protected readonly tiposFoto = TIPOS_IMAGEN_PUBLICA;
  protected readonly largoResumen = LARGO_RESUMEN;
  protected readonly largoBiografia = LARGO_BIOGRAFIA;
  protected readonly iniciales = generarIniciales;
  protected readonly ocupado = signal<Tarea | null>(null);

  protected readonly presentacion = computed(() => this.ficha()?.presentacion ?? null);
  protected readonly requisitos = computed(() => {
    const f = this.ficha();
    return f ? requisitosWeb(f) : [];
  });
  /** El id del médico de la agenda; las acciones solo existen con la ficha pintada. */
  private medicoId(): number {
    const f = this.ficha();
    if (!f) throw new Error('Ficha sin cargar');
    return f.medico.id;
  }
  protected readonly faltaObligatorio = computed(() => this.requisitos().some(r => r.obligatorio && !r.cumple));
  protected readonly cumplidos = computed(() => this.requisitos().filter(r => r.cumple).length);

  protected readonly especialidadesWeb = httpResource<RespuestaPaginada<Especialidad>>(
    () => (this.presentacion() ? this.directorio.especialidadesActivasRequest() : undefined),
    { defaultValue: paginaVacia<Especialidad>() },
  );
  protected readonly opcionesEspecialidad = computed(() => (this.especialidadesWeb.hasValue() ? this.especialidadesWeb.value().datos : []));

  /* ── Borrador del texto y de las especialidades ── */
  /*
   * La ficha llega por `input` desde quien la monta, así que cambia DESPUÉS de
   * cada respuesta (al subir una foto, al publicar). Un borrador con cambios
   * sin guardar del mismo médico sobrevive a eso; uno limpio se rehace con lo
   * nuevo. Descartarlo a propósito es `descartar()`.
   */
  protected readonly texto = linkedSignal<FichaMedico | null, TextoWeb>({
    source: this.presentacion,
    computation: (p, previo) =>
      previo && previo.source?.id === p?.id && JSON.stringify(previo.value) !== JSON.stringify(textoDe(previo.source)) ? previo.value : textoDe(p),
  });
  protected readonly especialidadIds = linkedSignal<FichaMedico | null, string[]>({
    source: this.presentacion,
    computation: (p, previo) => {
      const de = (f: FichaMedico | null) => f?.especialidades.map(e => e.id) ?? [];
      const sucio = previo && previo.source?.id === p?.id && [...previo.value].sort().join() !== de(previo.source).sort().join();
      return sucio ? previo.value : de(p);
    },
  });
  private readonly cambios = computed((): CambiosPresentacion => {
    const p = this.presentacion();
    const t = this.texto();
    if (!p) return {};
    const c: CambiosPresentacion = {};
    if (t.nombrePublico.trim() !== p.nombrePublico) c.nombrePublico = t.nombrePublico.trim();
    if (t.resumen.trim() !== p.resumen) c.resumen = t.resumen.trim();
    if (t.biografia.trim() !== p.biografia) c.biografia = t.biografia.trim();
    if ((t.matricula.trim() || null) !== p.matricula) c.matricula = t.matricula.trim() || null;
    const antes = p.especialidades.map(e => e.id).sort().join(',');
    if ([...this.especialidadIds()].sort().join(',') !== antes) c.especialidadIds = [...this.especialidadIds()];
    return c;
  });
  readonly hayCambios = computed(() => Object.keys(this.cambios()).length > 0);
  protected readonly errorTexto = computed(() => {
    const t = this.texto();
    if (t.nombrePublico.trim().length < 3) return 'El nombre en la web necesita al menos 3 letras.';
    if (t.resumen.length > LARGO_RESUMEN) return `El resumen admite hasta ${LARGO_RESUMEN} caracteres.`;
    if (t.biografia.length > LARGO_BIOGRAFIA) return `La biografía admite hasta ${LARGO_BIOGRAFIA} caracteres.`;
    if (this.presentacion()?.publicado && this.especialidadIds().length === 0) return 'Una ficha publicada necesita al menos una especialidad.';
    return null;
  });

  /** Las especialidades elegidas, con nombre, para la vista previa (también las recién marcadas). */
  protected readonly especialidadesElegidas = computed(() => {
    const ids = this.especialidadIds();
    const conocidas = [...this.opcionesEspecialidad(), ...(this.presentacion()?.especialidades ?? [])];
    return ids.map(id => conocidas.find(e => e.id === id)?.nombre).filter((n): n is string => !!n);
  });

  protected editar<K extends keyof TextoWeb>(campo: K, valor: string): void {
    this.texto.update(t => ({ ...t, [campo]: valor }));
  }

  protected alternarEspecialidad(id: string): void {
    this.especialidadIds.update(ids => (ids.includes(id) ? ids.filter(e => e !== id) : [...ids, id]));
  }

  /** Lo llama el cajón al recargar tras un 409: lo no guardado se pierde a sabiendas. */
  descartar(): void {
    this.deshacer();
  }

  protected deshacer(): void {
    const p = this.presentacion();
    this.texto.set(textoDe(p));
    this.especialidadIds.set(p?.especialidades.map(e => e.id) ?? []);
  }

  protected crear(): Promise<void> {
    return this.trabajar('crear', () => this.servicio.crearPresentacion(this.medicoId()), 'Ficha web creada. Súbele una foto y elige su especialidad.');
  }

  protected guardarTexto(): Promise<void> {
    const p = this.presentacion();
    if (!p || this.errorTexto() || !this.hayCambios()) return Promise.resolve();
    return this.trabajar('texto', () => this.servicio.actualizarPresentacion(this.medicoId(), p.version, this.cambios()), 'Ficha web guardada.');
  }

  protected publicar(publicado: boolean): Promise<void> {
    return this.trabajar(
      'publicar',
      () => this.servicio.publicarPresentacion(this.medicoId(), publicado),
      publicado ? 'Publicado: la web ya lo muestra.' : 'Oculto: la web deja de mostrarlo.',
    );
  }

  protected async elegirFoto(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    const problema = problemaDeImagen(archivo);
    if (problema) {
      this.toast.error(problema, 'Foto');
      return;
    }
    await this.trabajar('foto', () => this.servicio.subirFoto(this.medicoId(), archivo), 'Foto actualizada.');
  }

  protected quitarFoto(): Promise<void> {
    return this.trabajar('foto', () => this.servicio.quitarFoto(this.medicoId()), 'Foto quitada.');
  }

  private async trabajar(tarea: Tarea, pedido: () => Promise<FichaMedicoAgenda>, exito: string): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(tarea);
    try {
      const ficha = await pedido();
      this.actualizada.emit(ficha);
      this.toast.success(exito, 'Listo');
    } catch (err) {
      if (esConflicto(err)) this.conflicto.emit();
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la ficha web.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }
}
