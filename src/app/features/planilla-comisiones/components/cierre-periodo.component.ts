import { OverlayRef } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DialogService } from '../../../shared/components/dialog/dialog.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { PlanillaComisionesService } from '../planilla-comisiones.service';
import { FechaClinicaPipe } from '../../../core/fechas/fecha-clinica.pipe';
import {
  ESTADO_PERIODO_AYUDA,
  ESTADO_PERIODO_BADGE,
  ESTADO_PERIODO_LABEL,
  RevisionPeriodo,
} from '../planilla.model';

/**
 * El panel «Cierre del mes» de Reportes: en qué punto está el periodo, qué
 * falta para revisarlo, quién firmó y quién falta, y los botones de cada
 * salto (enviar a revisión, aprobar, rechazar, reabrir, registrar el pago).
 *
 * Vivía dentro de `PlanillaComisionesPage`. La página sigue siendo dueña del
 * recurso `revision` —con sus ramas de carga y de error— y del marco
 * `<section class="panel">`; este componente es su contenido y sus acciones.
 * Se monta con `display: contents` para que sus hijos sigan siendo hijos
 * directos de esa sección, como antes.
 *
 * Las reglas del ciclo de vida siguen en el backend (`estados-periodo.ts`):
 * aquí solo se pinta lo que devuelve `GET /periodos/:id/revision` y se
 * ofrecen botones como conveniencia.
 *
 * Tras cada acción espera a `refrescar(id)`, que le pasa la página: recarga
 * el panel, el periodo (el badge de la barra superior) y las alertas. Es una
 * función y no un evento porque el botón sigue en carga hasta que ese
 * refresco termina, igual que antes.
 */
@Component({
  selector: 'app-cierre-periodo',
  imports: [BadgeComponent, ButtonComponent, IconComponent, InputComponent, FechaClinicaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cierre-periodo.component.html',
  styleUrl: './cierre-periodo.component.css',
  host: { class: 'contents' },
})
export class CierrePeriodoComponent {
  readonly revision = input.required<RevisionPeriodo>();
  readonly periodoId = input.required<string | null>();
  readonly refrescar = input.required<(id: string) => Promise<void>>();

  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  protected readonly esSuperAdmin = this.authService.isSuperAdmin;
  protected readonly estadoPeriodoLabel = ESTADO_PERIODO_LABEL;
  protected readonly estadoPeriodoBadge = ESTADO_PERIODO_BADGE;
  protected readonly estadoPeriodoAyuda = ESTADO_PERIODO_AYUDA;

  protected readonly enviandoARevision = signal(false);
  protected readonly aprobando = signal(false);
  protected readonly comentarioAprobacion = signal('');

  /** Rechazar y reabrir comparten modal: los dos piden lo mismo, un motivo. */
  protected readonly accionConMotivo = signal<'RECHAZAR' | 'REABRIR' | null>(null);
  protected readonly motivoAccion = signal('');
  protected readonly guardandoMotivo = signal(false);
  private readonly plantillaMotivo = viewChild<TemplateRef<unknown>>('modalMotivo');
  private overlayMotivo: OverlayRef | null = null;

  protected async enviarARevision(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    this.enviandoARevision.set(true);
    try {
      await this.service.enviarARevision(id);
      this.toast.success(
        'El mes queda congelado hasta que se apruebe o se rechace.',
        'Enviado a revisión',
      );
      await this.refrescar()(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar a revisión.'), 'Error');
    } finally {
      this.enviandoARevision.set(false);
    }
  }

  protected async aprobar(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    this.aprobando.set(true);
    try {
      const resultado = await this.service.aprobarPeriodo(id, this.comentarioAprobacion());
      /* El mensaje distingue los dos desenlaces porque desde la pantalla son
         indistinguibles: en los dos casos el botón desaparece. */
      if (resultado.cerrado) {
        this.toast.success('El mes queda cerrado con las cifras revisadas.', 'Cerrado');
      } else {
        this.toast.success(
          `Falta ${resultado.faltan.map(f => f.nombre).join(', ')} para cerrar el mes.`,
          'Aprobación registrada',
        );
      }
      this.comentarioAprobacion.set('');
      await this.refrescar()(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo aprobar el periodo.'), 'Error');
    } finally {
      this.aprobando.set(false);
    }
  }

  protected async registrarPago(): Promise<void> {
    const id = this.periodoId();
    if (!id) return;

    try {
      await this.service.registrarPago(id);
      this.toast.success('El mes queda como pagado y ya no se modifica.', 'Pago registrado');
      await this.refrescar()(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo registrar el pago.'), 'Error');
    }
  }

  protected abrirAccionConMotivo(accion: 'RECHAZAR' | 'REABRIR'): void {
    this.motivoAccion.set('');
    this.accionConMotivo.set(accion);
    const tpl = this.plantillaMotivo();
    if (!tpl) return;
    this.overlayMotivo?.dispose();
    this.overlayMotivo = this.dialogService.openTemplate(tpl, this.vcr);
    this.overlayMotivo.backdropClick().subscribe(() => this.cerrarAccionConMotivo());
  }

  protected cerrarAccionConMotivo(): void {
    this.accionConMotivo.set(null);
    this.overlayMotivo?.dispose();
    this.overlayMotivo = null;
  }

  protected async confirmarAccionConMotivo(): Promise<void> {
    const id = this.periodoId();
    const accion = this.accionConMotivo();
    const motivo = this.motivoAccion().trim();
    if (!id || !accion || motivo.length < 3) return;

    this.guardandoMotivo.set(true);
    try {
      if (accion === 'RECHAZAR') {
        await this.service.rechazarPeriodo(id, motivo);
        this.toast.success('El mes vuelve a edición y se borran las aprobaciones.', 'Rechazado');
      } else {
        await this.service.reabrirPeriodo(id, motivo);
        this.toast.success('El mes vuelve a edición. Queda registrado quién y por qué.', 'Reabierto');
      }
      this.cerrarAccionConMotivo();
      await this.refrescar()(id);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo completar la acción.'), 'Error');
    } finally {
      this.guardandoMotivo.set(false);
    }
  }
}
