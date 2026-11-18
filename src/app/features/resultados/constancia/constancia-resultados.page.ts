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
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../shared/components/select/select.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { NombreClientePipe } from '../../../shared/pipes/nombre-cliente.pipe';
import { ResultadosService } from '../resultados.service';
import {
  coincideBusqueda,
  ConstanciaMensual,
  cumpleEstado,
  estadoWhatsapp,
  FilaConstancia,
  FILTROS_ESTADO,
  FiltroEstado,
  filtroEstadoDeUrl,
  grupoDe,
  grupoDeUrl,
  GrupoConstancia,
  llegoAlTelefono,
  mesAnterior,
  mesDeUrl,
  mesesParaElegir,
  detalleWhatsapp,
  etiquetaWhatsapp,
  nombreDelMes,
  NOMBRES_GRUPO,
  porcentaje,
  resumenConstancia,
  seccionesPorTipo,
  varianteWhatsapp,
} from './constancia.model';

/**
 * Constancia mensual de entregas de resultados, para imprimir y notariar
 * (18/11/2026, pedido de René): cada aviso de resultado enviado en el mes con
 * el número, el paciente, el informe, la fecha y hora, lo que confirmó
 * WhatsApp y lo que hizo el paciente con el enlace del portal.
 *
 * Los avisos van separados por tipo de informe (ecografía, Papanicolau,
 * laboratorio…), cada tipo con su resumen y la línea de WhatsApp por la que
 * salió, y en papel cada tipo empieza en hoja nueva. Se puede imprimir uno
 * solo: el laboratorio lo entrega Laboratorio Climon, otra empresa.
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
    RouterLink, ButtonComponent, EmptyStateComponent, ErrorCargaComponent, IconComponent, InputComponent, LoadingSkeletonComponent,
    SelectComponent, TableComponent, NombreClientePipe, FechaClinicaPipe, FechaCivilPipe,
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
  private readonly url = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly mes = signal(mesDeUrl(this.url.get('mes'), this.porDefecto));
  /** `null` = todos los tipos de informe. */
  protected readonly tipo = signal<GrupoConstancia | null>(grupoDeUrl(this.url.get('tipo')));
  protected readonly estado = signal<FiltroEstado>(filtroEstadoDeUrl(this.url.get('estado')));
  /** Lo que se escribe en «Buscar»: filtra al instante (los avisos ya están en memoria). */
  protected readonly busqueda = signal((this.url.get('q') ?? '').slice(0, 80));
  /** La búsqueda que va a la URL, con su pausa: nunca una navegación por tecla. */
  private readonly busquedaEnUrl = signal(this.busqueda());
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

  /** Todos los avisos del mes, de cualquier tipo. */
  private readonly todas = computed<readonly FilaConstancia[]>(() => (this.constancia.hasValue() ? this.constancia.value().datos : []));
  /** Los del tipo elegido, antes de buscar: el «de cuántos» cuando hay filtro. */
  private readonly delTipo = computed(() => {
    const tipo = this.tipo();
    return tipo ? this.todas().filter(f => grupoDe(f) === tipo) : this.todas();
  });
  /** Lo que se ve y lo que se imprime. */
  protected readonly filas = computed(() => {
    const estado = this.estado();
    const busqueda = this.busqueda();
    return this.delTipo().filter(f => cumpleEstado(f, estado) && coincideBusqueda(f, busqueda));
  });
  /**
   * El filtro puesto, dicho en palabras, para la cabecera del documento: una
   * constancia filtrada impresa no puede leerse como la del mes entero.
   */
  protected readonly filtroAplicado = computed(() => {
    const partes = [
      this.estado() !== 'TODOS' ? FILTROS_ESTADO[this.estado()] : null,
      this.busqueda().trim() ? `búsqueda «${this.busqueda().trim()}»` : null,
    ].filter((p): p is string => !!p);
    return partes.length ? partes.join(' · ') : null;
  });
  protected readonly totalDelTipo = computed(() => this.delTipo().length);
  protected readonly secciones = computed(() => seccionesPorTipo(this.filas()));
  protected readonly resumen = computed(() => resumenConstancia(this.filas()));
  /** El selector de tipo con cuántos avisos tiene cada uno en el mes; solo los que tienen. */
  protected readonly opcionesTipo = computed(() =>
    seccionesPorTipo(this.todas()).map(s => ({ valor: s.grupo, etiqueta: `${s.nombre} (${s.filas.length})` })));
  protected readonly nombreTipo = computed(() => {
    const tipo = this.tipo();
    return tipo ? NOMBRES_GRUPO[tipo] : null;
  });
  protected readonly listo = computed(() => this.constancia.hasValue() && !this.constancia.isLoading());
  /** El último día del periodo: `hasta` es el primer instante del mes siguiente. */
  protected readonly ultimoDia = computed(() => (this.constancia.hasValue() ? new Date(Date.parse(this.constancia.value().hasta) - 1) : null));
  /** Hay avisos anteriores al 18/11/2026 cuyo número es el actual de la ficha: la nota lo explica. */
  protected readonly hayNumerosActuales = computed(() => this.filas().some(f => f.destinatario && !f.destinatario.telefonoAlEnviar));

  protected readonly filtrosEstado = Object.entries(FILTROS_ESTADO) as Array<[FiltroEstado, string]>;
  protected readonly estadoWhatsapp = estadoWhatsapp;
  protected readonly varianteWhatsapp = varianteWhatsapp;
  protected readonly etiquetaWhatsapp = etiquetaWhatsapp;
  protected readonly detalleWhatsapp = detalleWhatsapp;
  protected readonly llegoAlTelefono = llegoAlTelefono;
  protected readonly porcentaje = porcentaje;

  constructor() {
    reflejarEnUrl(() => ({
      mes: this.mes() === this.porDefecto ? null : this.mes(),
      tipo: this.tipo(),
      estado: this.estado() === 'TODOS' ? null : this.estado(),
      q: this.busquedaEnUrl().trim() || null,
    }));
    effect(onCleanup => {
      const texto = this.busqueda();
      const pausa = setTimeout(() => this.busquedaEnUrl.set(texto), 400);
      onCleanup(() => clearTimeout(pausa));
    });
    /* El título es el nombre del archivo al «Guardar como PDF». Ninguna otra
       ruta pone título, así que al salir se devuelve el de siempre. */
    const tituloAnterior = this.titulo.getTitle();
    effect(() => {
      const tipo = this.nombreTipo();
      this.titulo.setTitle(`Constancia de entrega de resultados — ${tipo ? `${tipo} — ` : ''}${this.nombreMes()}`);
    });
    inject(DestroyRef).onDestroy(() => this.titulo.setTitle(tituloAnterior));
  }

  protected cambiarMes(valor: string): void {
    this.mes.set(mesDeUrl(valor, this.porDefecto));
  }

  protected cambiarTipo(valor: string): void {
    this.tipo.set(grupoDeUrl(valor));
  }

  protected cambiarEstado(valor: string): void {
    this.estado.set(filtroEstadoDeUrl(valor));
  }

  protected limpiarFiltros(): void {
    this.estado.set('TODOS');
    this.busqueda.set('');
  }

  protected imprimir(): void {
    this.documento.defaultView?.print();
  }
}
