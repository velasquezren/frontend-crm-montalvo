import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { claveCasilla, DiaAgenda, diaCortoAgenda, nombreDiaAgenda } from '../../agenda-medicos.model';

/** Lunes a viernes: el destino de «copiar a la semana». */
const HABILES: readonly DiaAgenda[] = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];

/**
 * La grilla de horario de un médico: una fila por media hora, una columna por
 * día. Se usa tocando casillas, pero con el mouse se PINTA arrastrando (la
 * primera casilla decide si se enciende o se apaga), que es como se carga una
 * mañana entera de un gesto. En pantallas táctiles el arrastre es el scroll,
 * así que ahí cada toque cambia una casilla.
 *
 * Solo edita el conjunto `encendidas`; guardar es de quien la usa.
 */
@Component({
  selector: 'app-agenda-horario-grilla',
  imports: [ButtonComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-horario-grilla.component.html',
  styleUrl: './agenda-horario-grilla.component.css',
  host: { '(document:pointerup)': 'terminarPintura()', '(document:pointercancel)': 'terminarPintura()' },
})
export class AgendaHorarioGrillaComponent {
  readonly dias = input.required<readonly DiaAgenda[]>();
  readonly horas = input.required<readonly string[]>();
  readonly editable = input(false);
  readonly disabled = input(false);
  readonly nombre = input('');
  readonly encendidas = model.required<ReadonlySet<string>>();

  protected readonly clave = claveCasilla;
  protected readonly diaCorto = diaCortoAgenda;
  protected readonly nombreDia = nombreDiaAgenda;
  protected readonly diaOrigen = signal<DiaAgenda>('Lunes');

  /** Mientras se arrastra: si se está encendiendo (true) o apagando (false). */
  private pintando: boolean | null = null;
  /** El `click` que sigue a un `pointerdown` de mouse ya se aplicó al pintar. */
  private ignorarClick = false;

  protected readonly activo = computed(() => this.editable() && !this.disabled());

  /** Horas de atención por semana: cada casilla es media hora. */
  protected readonly horasSemana = computed(() => this.encendidas().size / 2);

  protected cuentaDelDia(dia: DiaAgenda): number {
    return this.horas().filter(h => this.encendidas().has(claveCasilla(dia, h))).length;
  }

  private poner(dia: DiaAgenda, hora: string, encender: boolean): void {
    const c = claveCasilla(dia, hora);
    if (this.encendidas().has(c) === encender) return;
    this.encendidas.update(actual => {
      const nuevo = new Set(actual);
      if (encender) nuevo.add(c);
      else nuevo.delete(c);
      return nuevo;
    });
  }

  protected empezarPintura(evento: PointerEvent, dia: DiaAgenda, hora: string): void {
    if (!this.activo() || evento.pointerType !== 'mouse' || evento.button !== 0) return;
    evento.preventDefault();
    this.pintando = !this.encendidas().has(claveCasilla(dia, hora));
    this.ignorarClick = true;
    this.poner(dia, hora, this.pintando);
  }

  protected seguirPintura(dia: DiaAgenda, hora: string): void {
    if (this.pintando !== null) this.poner(dia, hora, this.pintando);
  }

  terminarPintura(): void {
    this.pintando = null;
  }

  /** Toque, teclado (Enter / Espacio) o el click que cierra un arrastre de mouse. */
  protected alternar(dia: DiaAgenda, hora: string): void {
    if (this.ignorarClick) {
      this.ignorarClick = false;
      return;
    }
    if (this.activo()) this.poner(dia, hora, !this.encendidas().has(claveCasilla(dia, hora)));
  }

  /** Enciende el día entero si tenía alguna apagada; si estaba todo encendido, lo apaga. */
  protected alternarDia(dia: DiaAgenda): void {
    if (!this.activo()) return;
    const encender = this.cuentaDelDia(dia) < this.horas().length;
    for (const h of this.horas()) this.poner(dia, h, encender);
  }

  /** El horario del día elegido, igual en los demás días hábiles. */
  protected copiarALaSemana(): void {
    if (!this.activo()) return;
    const origen = this.diaOrigen();
    const del = new Set(this.horas().filter(h => this.encendidas().has(claveCasilla(origen, h))));
    for (const dia of HABILES) {
      if (dia === origen || !this.dias().includes(dia)) continue;
      for (const h of this.horas()) this.poner(dia, h, del.has(h));
    }
  }

  protected vaciar(): void {
    if (this.activo()) this.encendidas.set(new Set());
  }

  protected elegirOrigen(valor: string): void {
    const dia = this.dias().find(d => d === valor);
    if (dia) this.diaOrigen.set(dia);
  }
}
