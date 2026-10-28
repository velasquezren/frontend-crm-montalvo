import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, output, signal, untracked } from '@angular/core';

import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { horaClinica } from '../../../../core/fechas/zona-clinica';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { DiasLibresAgenda, HorasLibresAgenda, MedicoAgendaConWeb } from '../../../directorio/agenda-medicos.model';
import { AgendaMedicosService } from '../../../directorio/agenda-medicos.service';
import { fechaDeReserva } from '../../../reservas/reserva.model';
import { alternarCupo, cantidadDeCupos, SeleccionCupos, soloHorasLibres, textoDeCupos } from '../../cupos-medico';

/**
 * El contenido del cajón «Cupos» del compositor: buscar un médico, ver sus
 * días y horas libres y dejar el texto en la caja. Antes, para contestar
 * «¿hay cupo con el cardiólogo?», recepción salía del CRM a la agenda.
 *
 * Solo lee. Las horas son las de la web (`AgendaService` del backend) y nada
 * se reserva desde aquí: el texto va a la caja y la agente lo envía.
 */
@Component({
  selector: 'app-cupos-medico',
  imports: [
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 min-h-0 flex flex-col' },
  templateUrl: './cupos-medico.component.html',
  styleUrl: './cupos-medico.component.css',
})
export class CuposMedicoComponent {
  private readonly agenda = inject(AgendaMedicosService);

  /** El texto listo para la caja. El compositor decide dónde va. */
  readonly insertar = output<string>();

  protected readonly fechaCorta = fechaDeReserva;

  protected readonly busqueda = signal('');
  private readonly busquedaAplicada = signal('');
  /** Con una letra el listado devolvería media agenda: se pide desde dos. */
  protected readonly buscando = computed(() => this.busquedaAplicada().length >= 2);

  /** Solo activos: un médico inactivo no tiene cupos que ofrecer. */
  protected readonly medicos = httpResource<RespuestaPaginada<MedicoAgendaConWeb>>(
    () => this.buscando()
      ? this.agenda.listarRequest({ buscar: this.busquedaAplicada(), especialidad: '', estado: 'ACTIVO', pagina: 1 })
      : undefined,
    { defaultValue: paginaVacia<MedicoAgendaConWeb>() },
  );
  protected readonly listaMedicos = computed(() => (this.medicos.hasValue() ? this.medicos.value().datos : []));

  protected readonly elegido = signal<MedicoAgendaConWeb | null>(null);

  /** Sin horario cargado, la web lo ofrece «a solicitud»: no hay días que pedir. */
  protected readonly dias = httpResource<DiasLibresAgenda>(() => {
    const m = this.elegido();
    return m?.reservaEnLinea ? this.agenda.diasLibresRequest(m.id) : undefined;
  });
  protected readonly fechas = computed(() => (this.dias.hasValue() ? this.dias.value().fechas : []));
  /** Sus vacaciones en estos 30 días: esos días ya no vienen en `fechas`, y la paciente preguntará por qué. */
  protected readonly ausencias = computed(() => (this.dias.hasValue() ? this.dias.value().ausencias ?? [] : []));

  /** El primer día libre ya elegido: lo más común es ofrecer lo más cercano. */
  protected readonly fecha = linkedSignal<readonly string[], string | null>({
    source: this.fechas,
    computation: (fechas, previa) => (previa?.value && fechas.includes(previa.value) ? previa.value : fechas[0] ?? null),
  });

  protected readonly horas = httpResource<HorasLibresAgenda>(() => {
    const m = this.elegido();
    const f = this.fecha();
    return m?.reservaEnLinea && f ? this.agenda.horasLibresRequest(m.id, f) : undefined;
  });
  protected readonly horasDelDia = computed(() => (this.horas.hasValue() ? this.horas.value() : null));
  /** Cuándo leyó la agenda: las horas pueden ocuparse mientras se escribe. */
  protected readonly consultadoA = computed(() => {
    const h = this.horasDelDia();
    return h ? horaClinica(new Date(h.consultadoEn)) : null;
  });

  protected readonly seleccion = signal<SeleccionCupos>({});
  protected readonly cantidad = computed(() => cantidadDeCupos(this.seleccion()));
  protected readonly texto = computed(() => {
    const m = this.elegido();
    return m ? textoDeCupos(m, this.seleccion()) : '';
  });

  constructor() {
    /* Debounce de 300 ms; onCleanup cancela el timer al teclear de nuevo o al destruir. */
    effect(onCleanup => {
      const termino = this.busqueda().trim();
      const temporizador = setTimeout(() => this.busquedaAplicada.set(termino), 300);
      onCleanup(() => clearTimeout(temporizador));
    });
    /* Lo elegido nunca ofrece una hora que la última lectura ya no da por libre. */
    effect(() => {
      const h = this.horasDelDia();
      if (!h) return;
      const libres = h.horarios.map(x => x.hora);
      untracked(() => this.seleccion.update(s => soloHorasLibres(s, h.fecha, libres)));
    });
  }

  protected precio(m: MedicoAgendaConWeb): number | null {
    const valor = m.precio === null ? NaN : Number(m.precio);
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  }

  protected elegir(m: MedicoAgendaConWeb): void {
    this.seleccion.set({});
    this.elegido.set(m);
  }

  /** Volver a la búsqueda, con lo escrito intacto. Lo elegido era de ese médico. */
  protected cambiarMedico(): void {
    this.seleccion.set({});
    this.elegido.set(null);
  }

  protected estaElegida(hora: string): boolean {
    const f = this.fecha();
    return !!f && (this.seleccion()[f]?.includes(hora) ?? false);
  }

  protected alternar(hora: string): void {
    const f = this.fecha();
    if (f) this.seleccion.update(s => alternarCupo(s, f, hora));
  }

  protected confirmar(): void {
    const texto = this.texto();
    if (texto) this.insertar.emit(texto);
  }
}
