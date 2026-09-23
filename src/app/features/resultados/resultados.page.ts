import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';

import { mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { nombreParaMostrar } from '../../shared/models/nombre-cliente';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { ToastService } from '../../core/toast/toast.service';
import { EntregaResultado, estadoEntrega, motivoBloqueo, nombresDistintos, sePuedeEntregar, sePuedeRenovar } from './resultado.model';
import { ResultadosService } from './resultados.service';

/**
 * Entrega de resultados: la cola de informes publicados en el portal, con el
 * botón para mandarle al paciente el enlace por WhatsApp.
 *
 * El permiso NO se deduce del rol: lo decide el backend por la membresía en la
 * línea de resultados. Por eso un 404 aquí no es "no hay nada", es "esta cuenta
 * no entrega resultados", y la vista lo dice con esas palabras.
 */
@Component({
  selector: 'app-resultados-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    LoadingSkeletonComponent,
    NombreClientePipe,
    PageHeaderComponent,
    PaginatorComponent,
    TableComponent,
  ],
  templateUrl: './resultados.page.html',
})
export class ResultadosPage {
  private readonly resultadosService = inject(ResultadosService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly toast = inject(ToastService);

  private readonly plantillaConfirmar = viewChild.required<TemplateRef<unknown>>('confirmar');
  private overlay: OverlayRef | null = null;

  protected readonly pagina = signal(1);
  /** Informe que se está enviando: bloquea solo su fila, no la tabla entera. */
  protected readonly enviando = signal<string | null>(null);
  /** A quién se va a enviar y si antes hay que renovar su enlace vencido. */
  protected readonly candidato = signal<{ fila: EntregaResultado; renovar: boolean } | null>(null);

  protected readonly entregas = httpResource<RespuestaPaginada<EntregaResultado>>(
    () => this.resultadosService.pendientesRequest(this.pagina()),
    { defaultValue: paginaVacia<EntregaResultado>() },
  );

  /* Las dos reglas viven en el modelo: la plantilla las consulta y la prueba
     las fija, y escritas dos veces divergen. */
  protected readonly sePuedeEnviar = sePuedeEntregar;
  protected readonly sePuedeRenovar = sePuedeRenovar;
  protected readonly motivoBloqueo = motivoBloqueo;
  protected readonly estadoEntrega = estadoEntrega;
  protected readonly distintos = nombresDistintos;

  protected pedirConfirmacion(fila: EntregaResultado, renovar = false): void {
    this.candidato.set({ fila, renovar });
    this.overlay = this.dialog.openTemplate(this.plantillaConfirmar(), this.vcr);
  }

  protected cerrarConfirmacion(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.candidato.set(null);
  }

  protected async confirmarEnvio(): Promise<void> {
    const candidato = this.candidato();
    if (!candidato) return;
    const { fila, renovar } = candidato;
    this.cerrarConfirmacion();
    this.enviando.set(fila.informeId);
    try {
      await (renovar ? this.resultadosService.renovarYEnviar(fila.informeId) : this.resultadosService.enviar(fila.informeId));
      this.toast.success(
        /* Meta confirma después: el estado real aparece en la fila. */
        `El enlace del informe va en camino a ${fila.paciente ? nombreParaMostrar(fila.paciente) : 'el paciente'}.`,
        'Aviso enviado',
      );
      this.entregas.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el aviso.'), 'Error');
    } finally {
      this.enviando.set(null);
    }
  }
}
