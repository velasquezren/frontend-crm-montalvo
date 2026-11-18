import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, resource, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { FechaCivilPipe } from '../../../core/fechas/fecha-civil.pipe';
import { FechaClinicaPipe } from '../../../core/fechas/fecha-clinica.pipe';
import { fechaCivilClinica } from '../../../core/fechas/zona-clinica';
import { reflejarEnUrl } from '../../../core/ui/reflejar-en-url';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../shared/components/select/select.component';
import { NombreClientePipe } from '../../../shared/pipes/nombre-cliente.pipe';
import { NOMBRES_TIPO } from '../resultado.model';
import { ResultadosService } from '../resultados.service';
import {
  ConstanciaMensual,
  estadoWhatsapp,
  FilaConstancia,
  mesAnterior,
  mesDeUrl,
  mesesParaElegir,
  nombreDelMes,
  resumenConstancia,
} from './constancia.model';

/**
 * Constancia mensual de entregas de resultados, para imprimir y notariar
 * (18/11/2026, pedido de René): cada aviso de resultado enviado en el mes con
 * el número, el paciente, el informe, la fecha y hora, lo que confirmó
 * WhatsApp y lo que hizo el paciente con el enlace del portal.
 *
 * Va fuera del layout del CRM (sin menú ni barras): lo que se ve es lo que se
 * imprime. La barra de arriba no sale en papel (`.no-imprimir`).
 *
 * El backend pagina como todo listado; aquí se piden TODAS las páginas antes
 * de mostrar nada, y «Imprimir» solo se habilita con el mes completo: una
 * constancia a medias se leería como si fuera todo.
 */
@Component({
  selector: 'app-constancia-resultados-page',
  imports: [
    RouterLink, ButtonComponent, EmptyStateComponent, ErrorCargaComponent, IconComponent, LoadingSkeletonComponent,
    SelectComponent, NombreClientePipe, FechaClinicaPipe, FechaCivilPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './constancia-resultados.page.html',
  styleUrl: './constancia-resultados.page.css',
})
export class ConstanciaResultadosPage {
  private readonly resultados = inject(ResultadosService);
  private readonly documento = inject(DOCUMENT);
  private readonly titulo = inject(Title);
  protected readonly auth = inject(AuthService);

  /** Por defecto el mes anterior: el que ya cerró y se lleva a notariar. */
  private readonly mesEnCurso = fechaCivilClinica(new Date()).slice(0, 7);
  private readonly porDefecto = mesAnterior(this.mesEnCurso);
  protected readonly meses = mesesParaElegir(this.mesEnCurso);
  protected readonly mes = signal(mesDeUrl(inject(ActivatedRoute).snapshot.queryParamMap.get('mes'), this.porDefecto));
  protected readonly nombreMes = computed(() => nombreDelMes(this.mes()));
  protected readonly enCurso = computed(() => this.mes() === this.mesEnCurso);

  /** Cuántos avisos van cargados de cuántos, mientras llegan las páginas. */
  protected readonly progreso = signal<{ cargados: number; total: number } | null>(null);

  protected readonly constancia = resource({
    params: () => ({ mes: this.mes() }),
    loader: async ({ params, abortSignal }): Promise<ConstanciaMensual> => {
      this.progreso.set(null);
      const primera = await this.resultados.constanciaPagina(params.mes, 1);
      const filas = new Map(primera.datos.map(f => [f.avisoId, f]));
      this.progreso.set({ cargados: filas.size, total: primera.total });
      for (let pagina = 2; pagina <= primera.totalPaginas; pagina++) {
        /* Cambiaron de mes a mitad de camino: no seguir pidiendo el anterior. */
        if (abortSignal.aborted) throw new DOMException('Cambio de mes', 'AbortError');
        const siguiente = await this.resultados.constanciaPagina(params.mes, pagina);
        /* Por id: en el mes en curso puede entrar un aviso nuevo entre dos páginas. */
        for (const f of siguiente.datos) filas.set(f.avisoId, f);
        this.progreso.set({ cargados: filas.size, total: siguiente.total });
      }
      return { ...primera, datos: [...filas.values()], total: filas.size };
    },
  });

  protected readonly filas = computed<readonly FilaConstancia[]>(() => (this.constancia.hasValue() ? this.constancia.value().datos : []));
  protected readonly resumen = computed(() => resumenConstancia(this.filas()));
  protected readonly listo = computed(() => this.constancia.hasValue() && !this.constancia.isLoading());
  /** El último día del periodo: `hasta` es el primer instante del mes siguiente. */
  protected readonly ultimoDia = computed(() => (this.constancia.hasValue() ? new Date(Date.parse(this.constancia.value().hasta) - 1) : null));
  /** Hay avisos anteriores al 18/11/2026 cuyo número es el actual de la ficha: la nota lo explica. */
  protected readonly hayNumerosActuales = computed(() => this.filas().some(f => f.destinatario && !f.destinatario.telefonoAlEnviar));

  protected readonly nombresTipo = NOMBRES_TIPO;
  protected readonly estadoWhatsapp = estadoWhatsapp;

  constructor() {
    reflejarEnUrl(() => ({ mes: this.mes() === this.porDefecto ? null : this.mes() }));
    /* El título es el nombre del archivo al «Guardar como PDF». Ninguna otra
       ruta pone título, así que al salir se devuelve el de siempre. */
    const tituloAnterior = this.titulo.getTitle();
    effect(() => this.titulo.setTitle(`Constancia de entrega de resultados — ${this.nombreMes()}`));
    inject(DestroyRef).onDestroy(() => this.titulo.setTitle(tituloAnterior));
  }

  protected cambiarMes(valor: string): void {
    this.mes.set(mesDeUrl(valor, this.porDefecto));
  }

  protected imprimir(): void {
    this.documento.defaultView?.print();
  }
}
