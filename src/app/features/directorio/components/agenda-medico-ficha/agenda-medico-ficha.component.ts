import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

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
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import {
  BancoAgenda,
  casillasEncendidas,
  datosDeFormulario,
  EspecialidadAgenda,
  FichaMedicoAgenda,
  formularioDe,
  FormularioMedicoAgenda,
  nombreConTitulo,
  resumenDeCasillas,
} from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';
import { AgendaHorarioGrillaComponent } from '../agenda-horario-grilla/agenda-horario-grilla.component';
import { AgendaMedicoDatosComponent } from '../agenda-medico-datos/agenda-medico-datos.component';
import { AgendaPresentacionWebComponent } from '../agenda-presentacion-web/agenda-presentacion-web.component';

type Tarea = 'datos' | 'horario';
export type PestanaFicha = 'datos' | 'horario' | 'web';

const PESTANAS: readonly { readonly id: PestanaFicha; readonly etiqueta: string; readonly icono: IconName }[] = [
  { id: 'datos', etiqueta: 'Datos', icono: 'user' },
  { id: 'horario', etiqueta: 'Horario', icono: 'calendar' },
  { id: 'web', etiqueta: 'Web', icono: 'external-link' },
];

/**
 * La ficha de un médico de la agenda, en tres pestañas: sus datos, la grilla de
 * horario (casillas de 30 minutos) y su ficha web (foto, biografía,
 * publicación). Cada parte se guarda aparte con la versión que se leyó: si otra
 * persona guardó antes —en el CRM o en ScriptCase—, 409 y se ofrece lo último.
 * Las tres quedan montadas: cambiar de pestaña no pierde lo que se escribió, y
 * un punto en la pestaña avisa de lo que falta guardar.
 */
@Component({
  selector: 'app-agenda-medico-ficha',
  imports: [
    AgendaHorarioGrillaComponent,
    AgendaMedicoDatosComponent,
    AgendaPresentacionWebComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    ErrorCargaComponent,
    IconComponent,
    LoadingSkeletonComponent,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-medico-ficha.component.html',
})
export class AgendaMedicoFichaComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly web = viewChild(AgendaPresentacionWebComponent);

  readonly id = input.required<number>();
  readonly especialidades = input<readonly EspecialidadAgenda[]>([]);
  readonly bancos = input<readonly BancoAgenda[]>([]);
  /** La pestaña con que abre: un médico recién creado abre en «Horario». */
  readonly pestanaInicial = input<PestanaFicha>('datos');
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly pestanas = PESTANAS;
  protected readonly pestana = linkedSignal(() => this.pestanaInicial());
  protected readonly puedeEditar = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly iniciales = generarIniciales;
  protected readonly nombreConTitulo = nombreConTitulo;

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

  /** El punto de «sin guardar» de cada pestaña. */
  protected pendiente(p: PestanaFicha): boolean {
    if (p === 'datos') return this.hayCambiosDatos();
    if (p === 'horario') return this.hayCambiosHorario();
    return this.web()?.hayCambios() ?? false;
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
    try {
      this.aplicar(await accion());
      this.conflicto.set(false);
      this.toast.success(exito, 'Listo');
    } catch (err) {
      if (esConflicto(err)) this.conflicto.set(true);
      this.toast.error(mensajeDeError(err, 'No se pudo guardar en la agenda.'), 'Error');
    } finally {
      this.ocupado.set(null);
    }
  }

  /**
   * Una ficha nueva del servidor reinicia los borradores de datos y horario: lo
   * que no se estaba guardando se conserva. La ficha web se cuida sola.
   */
  protected aplicar(ficha: FichaMedicoAgenda): void {
    const formularioPendiente = this.hayCambiosDatos() ? this.formulario() : null;
    const horarioPendiente = this.hayCambiosHorario() ? this.encendidas() : null;
    const antes = this.ficha();
    this.guardada.set(ficha);
    if (formularioPendiente && JSON.stringify(formularioDe(antes?.medico ?? null)) === JSON.stringify(formularioDe(ficha.medico))) {
      this.formulario.set(formularioPendiente);
    }
    if (horarioPendiente && antes && JSON.stringify([...casillasEncendidas(antes)].sort()) === JSON.stringify([...casillasEncendidas(ficha)].sort())) {
      this.encendidas.set(horarioPendiente);
    }
    this.cambio.emit();
  }

  /** Trae lo último de la agenda y descarta lo que no se guardó. */
  protected recargar(): void {
    this.guardada.set(null);
    this.conflicto.set(false);
    this.web()?.descartar();
    this.detalle.reload();
  }

}
