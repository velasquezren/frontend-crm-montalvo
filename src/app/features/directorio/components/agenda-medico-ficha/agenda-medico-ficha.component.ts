import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';

import { esConflicto, mensajeDeError } from '../../../../core/api/http-error';
import { AuthService } from '../../../../core/auth/auth.service';
import { puedeEditarAgendaClinica } from '../../../../core/auth/roles';
import { generarIniciales } from '../../../../core/auth/user.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import {
  BancoAgenda,
  casillasEncendidas,
  claveCasilla,
  datosDeFormulario,
  DiaAgenda,
  diaCortoAgenda,
  EspecialidadAgenda,
  FichaMedicoAgenda,
  formularioDe,
  FormularioMedicoAgenda,
  nombreConTitulo,
  nombreDiaAgenda,
  resumenDeCasillas,
} from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';
import { AgendaMedicoDatosComponent } from '../agenda-medico-datos/agenda-medico-datos.component';

type Tarea = 'datos' | 'horario';

/**
 * La ficha de un médico de la agenda: sus datos y la grilla de horario (casillas
 * de 30 minutos, de lunes a sábado). Cada parte se guarda aparte con la versión
 * que se leyó: si otra persona guardó antes —en el CRM o en ScriptCase—, 409.
 * Sin permiso de edición se ve igual, sin controles.
 */
@Component({
  selector: 'app-agenda-medico-ficha',
  imports: [AgendaMedicoDatosComponent, AvatarComponent, BadgeComponent, ButtonComponent, DrawerComponent, ErrorCargaComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medico-ficha.component.html',
  styleUrl: './agenda-medico-ficha.component.css',
})
export class AgendaMedicoFichaComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly id = input.required<number>();
  readonly especialidades = input<readonly EspecialidadAgenda[]>([]);
  readonly bancos = input<readonly BancoAgenda[]>([]);
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly puedeEditar = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly iniciales = generarIniciales;
  protected readonly nombreConTitulo = nombreConTitulo;
  protected readonly diaCorto = diaCortoAgenda;
  protected readonly nombreDia = nombreDiaAgenda;
  protected readonly clave = claveCasilla;

  protected readonly detalle = httpResource<FichaMedicoAgenda>(() => this.servicio.fichaRequest(this.id()));
  /** La última ficha conocida: la del servidor, o la que devolvió el último guardado. */
  private readonly guardada = signal<FichaMedicoAgenda | null>(null);
  protected readonly ficha = computed(() => this.guardada() ?? (this.detalle.hasValue() ? this.detalle.value() : null));

  protected readonly ocupado = signal<Tarea | null>(null);
  protected readonly conflicto = signal(false);

  /* ── Datos ── */
  protected readonly formulario = linkedSignal<FichaMedicoAgenda | null, FormularioMedicoAgenda>({
    source: this.ficha,
    computation: f => formularioDe(f?.medico ?? null),
  });
  private readonly validacion = computed(() => datosDeFormulario(this.formulario()));
  protected readonly errorDatos = computed(() => {
    const v = this.validacion();
    return 'error' in v ? v.error : null;
  });
  protected readonly hayCambiosDatos = computed(() => {
    const f = this.ficha();
    return !!f && JSON.stringify(formularioDe(f.medico)) !== JSON.stringify(this.formulario());
  });

  /* ── Horario ── */
  protected readonly encendidas = linkedSignal<FichaMedicoAgenda | null, ReadonlySet<string>>({
    source: this.ficha,
    computation: f => (f ? casillasEncendidas(f) : new Set<string>()),
  });
  protected readonly hayCambiosHorario = computed(() => {
    const f = this.ficha();
    if (!f) return false;
    const antes = casillasEncendidas(f);
    const ahora = this.encendidas();
    return antes.size !== ahora.size || [...ahora].some(c => !antes.has(c));
  });
  protected readonly resumen = computed(() => {
    const f = this.ficha();
    return f ? resumenDeCasillas(f.grilla.dias, f.grilla.horas, this.encendidas()) : '';
  });
  protected readonly sinCodigo = computed(() => !this.ficha()?.medico.codigo);

  protected alternar(dia: DiaAgenda, hora: string): void {
    if (!this.puedeEditar() || this.ocupado()) return;
    const c = claveCasilla(dia, hora);
    this.encendidas.update(actual => {
      const nuevo = new Set(actual);
      if (nuevo.has(c)) nuevo.delete(c);
      else nuevo.add(c);
      return nuevo;
    });
  }

  /** Enciende el día entero si tenía alguna apagada; si estaba todo encendido, lo apaga. */
  protected alternarDia(dia: DiaAgenda): void {
    const f = this.ficha();
    if (!f || !this.puedeEditar() || this.ocupado()) return;
    const claves = f.grilla.horas.map(h => claveCasilla(dia, h));
    this.encendidas.update(actual => {
      const nuevo = new Set(actual);
      const todas = claves.every(c => nuevo.has(c));
      for (const c of claves) {
        if (todas) nuevo.delete(c);
        else nuevo.add(c);
      }
      return nuevo;
    });
  }

  protected casillasDelDia(dia: DiaAgenda): number {
    const f = this.ficha();
    return f ? f.grilla.horas.filter(h => this.encendidas().has(claveCasilla(dia, h))).length : 0;
  }

  protected deshacerHorario(): void {
    const f = this.ficha();
    if (f) this.encendidas.set(casillasEncendidas(f));
  }

  protected deshacerDatos(): void {
    const f = this.ficha();
    if (f) this.formulario.set(formularioDe(f.medico));
  }

  protected async guardarDatos(): Promise<void> {
    const f = this.ficha();
    const v = this.validacion();
    if (!f || 'error' in v) return;
    await this.guardar('datos', () => this.servicio.actualizar(f.medico.id, f.version, v.datos), 'Datos guardados en la agenda.');
  }

  protected async guardarHorario(): Promise<void> {
    const f = this.ficha();
    if (!f) return;
    const activas = [...this.encendidas()].map(c => {
      const [dia, hora] = c.split(' ');
      return { dia, hora };
    });
    await this.guardar('horario', () => this.servicio.guardarHorario(f.medico.id, f.version, activas), 'Horario guardado: la web ya ofrece estas horas.');
  }

  private async guardar(tarea: Tarea, accion: () => Promise<FichaMedicoAgenda>, exito: string): Promise<void> {
    this.ocupado.set(tarea);
    /* La ficha nueva reinicia los dos borradores: lo que no se estaba guardando se conserva. */
    const formularioPendiente = this.hayCambiosDatos() ? this.formulario() : null;
    const horarioPendiente = this.hayCambiosHorario() ? this.encendidas() : null;
    try {
      this.guardada.set(await accion());
      if (tarea === 'horario' && formularioPendiente) this.formulario.set(formularioPendiente);
      if (tarea === 'datos' && horarioPendiente) this.encendidas.set(horarioPendiente);
      this.conflicto.set(false);
      this.toast.success(exito, 'Listo');
      this.cambio.emit();
    } catch (err) {
      if (esConflicto(err)) this.conflicto.set(true);
      this.toast.error(mensajeDeError(err, 'No se pudo guardar en la agenda.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  /** Trae lo último de la agenda y descarta lo que no se guardó. */
  protected recargar(): void {
    this.guardada.set(null);
    this.conflicto.set(false);
    this.detalle.reload();
  }
}
