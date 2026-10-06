import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { esConflicto, mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { generarIniciales } from '../../../../core/auth/user.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { fechaCivilClinica } from '../../../actividades/zona-clinica';
import { fechaCorta, precioDeTexto, problemaDeImagen, TIPOS_IMAGEN_PUBLICA } from '../../../../shared/models/catalogo';
import { BloqueEditable, bloquesEditables, DIAS, Especialidad, FichaMedico, nombreDia, problemasDelHorario } from '../../directorio.model';
import { CambiosFicha, DirectorioService } from '../../directorio.service';

type Tarea = 'datos' | 'horario' | 'ausencia' | 'foto' | 'publicar';

interface DatosEditables {
  nombrePublico: string;
  resumen: string;
  biografia: string;
  matricula: string;
  precioConsulta: string;
}

function datosDe(f: FichaMedico): DatosEditables {
  return {
    nombrePublico: f.nombrePublico,
    resumen: f.resumen,
    biografia: f.biografia,
    matricula: f.matricula ?? '',
    precioConsulta: f.precioConsulta === null ? '' : String(f.precioConsulta),
  };
}

/**
 * La ficha de un médico: datos, foto, especialidades, horario semanal y
 * ausencias. Cada parte se guarda por separado (el horario es un documento que
 * se guarda entero) con la versión que se leyó: si otra persona guardó, 409.
 * Sin rango de administración se ve sin controles de edición.
 */
@Component({
  selector: 'app-medico-ficha',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './medico-ficha.component.html',
  styleUrl: './medico-ficha.component.css',
})
export class MedicoFichaComponent {
  private readonly servicio = inject(DirectorioService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly puedeEditar = inject(AuthService).isAdmin;
  protected readonly dias = DIAS;
  protected readonly nombreDia = nombreDia;
  protected readonly fechaCorta = fechaCorta;
  protected readonly iniciales = generarIniciales;
  protected readonly tiposFoto = TIPOS_IMAGEN_PUBLICA;

  protected readonly detalle = httpResource<FichaMedico>(() => this.servicio.fichaRequest(this.id()));
  private readonly ficha = computed(() => (this.detalle.hasValue() ? this.detalle.value() : null));
  protected readonly especialidades = httpResource<RespuestaPaginada<Especialidad>>(() => this.servicio.especialidadesActivasRequest(), {
    defaultValue: paginaVacia<Especialidad>(),
  });
  protected readonly opcionesEspecialidad = computed(() => (this.especialidades.hasValue() ? this.especialidades.value().datos : []));

  /* ── Datos y especialidades ── */
  protected readonly datos = linkedSignal<FichaMedico | null, DatosEditables | null>({ source: this.ficha, computation: f => (f ? datosDe(f) : null) });
  protected readonly especialidadIds = linkedSignal<FichaMedico | null, string[]>({
    source: this.ficha,
    computation: f => f?.especialidades.map(e => e.id) ?? [],
  });
  private readonly cambiosDatos = computed((): { cambios: CambiosFicha } | { error: string } | null => {
    const f = this.ficha();
    const d = this.datos();
    if (!f || !d) return null;
    const precio = precioDeTexto(d.precioConsulta);
    if (precio === undefined) return { error: 'Escribe el precio solo con números, por ejemplo 250.' };
    if (d.nombrePublico.trim().length < 3) return { error: 'El nombre no puede quedar vacío.' };
    const cambios: CambiosFicha = {};
    if (d.nombrePublico.trim() !== f.nombrePublico) cambios.nombrePublico = d.nombrePublico.trim();
    if (d.resumen.trim() !== f.resumen) cambios.resumen = d.resumen.trim();
    if (d.biografia.trim() !== f.biografia) cambios.biografia = d.biografia.trim();
    if ((d.matricula.trim() || null) !== f.matricula) cambios.matricula = d.matricula.trim() || null;
    if (precio !== f.precioConsulta) cambios.precioConsulta = precio;
    const antes = f.especialidades.map(e => e.id).sort().join(',');
    if ([...this.especialidadIds()].sort().join(',') !== antes) cambios.especialidadIds = [...this.especialidadIds()];
    return { cambios };
  });
  protected readonly errorDatos = computed(() => {
    const c = this.cambiosDatos();
    return c && 'error' in c ? c.error : null;
  });
  protected readonly hayCambiosDatos = computed(() => {
    const c = this.cambiosDatos();
    return !!c && ('error' in c || Object.keys(c.cambios).length > 0);
  });

  /* ── Horario ── */
  protected readonly bloques = linkedSignal<FichaMedico | null, BloqueEditable[]>({ source: this.ficha, computation: f => (f ? bloquesEditables(f.horario) : []) });
  protected readonly problemasHorario = computed(() => problemasDelHorario(this.bloques()));
  protected readonly hayCambiosHorario = computed(() => {
    const f = this.ficha();
    return !!f && JSON.stringify(bloquesEditables(f.horario)) !== JSON.stringify(this.bloques());
  });

  /* ── Ausencias ── */
  protected readonly hoy = fechaCivilClinica(new Date());
  protected readonly ausenciaDesde = signal('');
  protected readonly ausenciaHasta = signal('');
  protected readonly ausenciaMotivo = signal('');
  protected readonly faltaAusencia = computed(() => {
    if (!this.ausenciaDesde() || !this.ausenciaHasta()) return 'Elige desde y hasta cuándo.';
    if (this.ausenciaHasta() < this.ausenciaDesde()) return 'Termina antes de empezar.';
    if (this.ausenciaHasta() < this.hoy) return 'Esa ausencia ya pasó.';
    return null;
  });

  protected readonly ocupado = signal<Tarea | null>(null);
  protected readonly conflicto = signal(false);

  protected editar<K extends keyof DatosEditables>(campo: K, valor: string): void {
    this.datos.update(d => (d ? { ...d, [campo]: valor } : d));
  }

  protected alternarEspecialidad(id: string): void {
    this.especialidadIds.update(ids => (ids.includes(id) ? ids.filter(e => e !== id) : [...ids, id]));
  }

  protected descartarDatos(): void {
    const f = this.ficha();
    if (!f) return;
    this.datos.set(datosDe(f));
    this.especialidadIds.set(f.especialidades.map(e => e.id));
  }

  protected async guardarDatos(): Promise<void> {
    const f = this.ficha();
    const c = this.cambiosDatos();
    if (!f || !c || 'error' in c || this.ocupado()) return;
    await this.trabajar('datos', () => this.servicio.actualizarFicha(f.id, f.version, c.cambios), 'Ficha guardada.');
  }

  /* El horario: agregar copia el último bloque al día siguiente, que es como se carga una semana. */
  protected agregarBloque(): void {
    const ultimo = this.bloques().at(-1);
    this.bloques.update(bs => [
      ...bs,
      ultimo ? { ...ultimo, diaSemana: Math.min(7, ultimo.diaSemana + 1) } : { diaSemana: 1, desde: '08:00', hasta: '12:00', lugar: '' },
    ]);
  }

  protected editarBloque(indice: number, campo: keyof BloqueEditable, valor: string): void {
    this.bloques.update(bs => bs.map((b, i) => (i === indice ? { ...b, [campo]: campo === 'diaSemana' ? Number(valor) : valor } : b)));
  }

  protected quitarBloque(indice: number): void {
    this.bloques.update(bs => bs.filter((_, i) => i !== indice));
  }

  protected descartarHorario(): void {
    const f = this.ficha();
    if (f) this.bloques.set(bloquesEditables(f.horario));
  }

  protected async guardarHorario(): Promise<void> {
    const f = this.ficha();
    if (!f || this.problemasHorario().length > 0 || this.ocupado()) return;
    await this.trabajar('horario', () => this.servicio.guardarHorario(f.id, f.version, this.bloques()), 'Horario guardado.');
  }

  protected async agregarAusencia(): Promise<void> {
    const f = this.ficha();
    if (!f || this.faltaAusencia() || this.ocupado()) return;
    this.ocupado.set('ausencia');
    try {
      await this.servicio.agregarAusencia(f.id, {
        desde: this.ausenciaDesde(),
        hasta: this.ausenciaHasta(),
        ...(this.ausenciaMotivo().trim() ? { motivoPublico: this.ausenciaMotivo().trim() } : {}),
      });
      this.ausenciaDesde.set('');
      this.ausenciaHasta.set('');
      this.ausenciaMotivo.set('');
      this.detalle.reload();
      this.cambio.emit();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo agregar la ausencia.'));
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async quitarAusencia(ausenciaId: string): Promise<void> {
    const f = this.ficha();
    if (!f || this.ocupado()) return;
    this.ocupado.set('ausencia');
    try {
      await this.servicio.quitarAusencia(f.id, ausenciaId);
      this.detalle.reload();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo quitar la ausencia.'));
    } finally {
      this.ocupado.set(null);
    }
  }

  protected async publicar(publicado: boolean): Promise<void> {
    const f = this.ficha();
    if (!f || this.ocupado()) return;
    await this.trabajar('publicar', () => this.servicio.publicar(f.id, publicado), publicado ? 'Publicada: la landing ya la muestra.' : 'Oculta: la landing deja de mostrarla.');
  }

  protected async elegirFoto(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    const f = this.ficha();
    if (!archivo || !f) return;
    const problema = problemaDeImagen(archivo);
    if (problema) {
      this.toast.error(problema);
      return;
    }
    await this.trabajar('foto', () => this.servicio.subirFoto(f.id, archivo), 'Foto actualizada.');
  }

  protected async quitarFoto(): Promise<void> {
    const f = this.ficha();
    if (!f || this.ocupado()) return;
    await this.trabajar('foto', () => this.servicio.quitarFoto(f.id), 'Foto quitada.');
  }

  protected recargar(): void {
    this.conflicto.set(false);
    this.detalle.reload();
  }

  /** Cada respuesta trae la ficha entera: se pinta sin pedirla otra vez. */
  private async trabajar(que: Tarea, pedido: () => Promise<FichaMedico>, exito: string): Promise<void> {
    this.ocupado.set(que);
    try {
      const ficha = await pedido();
      this.conflicto.set(false);
      this.detalle.set(ficha);
      this.cambio.emit();
      this.toast.success(exito);
    } catch (error) {
      if (esConflicto(error)) this.conflicto.set(true);
      this.toast.error(mensajeDeError(error, 'No se pudo guardar.'));
    } finally {
      this.ocupado.set(null);
    }
  }
}
