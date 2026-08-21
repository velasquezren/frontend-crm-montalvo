import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { RespuestaPaginada } from '../../../../core/api/pagination.model';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { PlanillaComisionesService } from '../../../planilla-comisiones/planilla-comisiones.service';
import {
  ConfiguracionPlanilla,
  ESTADO_PERIODO_LABEL,
  EstadoPeriodo,
  FilaConsolidado,
  MESES,
  PeriodoComision,
  ReporteConsolidado,
  Vendedora,
  VentaImportada,
} from '../../../planilla-comisiones/planilla.model';
import { ComposicionPagoComponent } from './partes/composicion-pago.component';
import { FichaCabeceraComponent } from './partes/ficha-cabecera.component';
import { MetaPlanes, MetasAgenteComponent, TramoCirugia } from './partes/metas-agente.component';
import { RepartoCanal, VentasAgenteComponent } from './partes/ventas-agente.component';

/** La página de ventas del mes con el reparto por canal que el servidor agrega. */
interface VentasConCanales extends RespuestaPaginada<VentaImportada> {
  readonly canales: RepartoCanal | null;
}

/**
 * Ficha 360° de una ejecutiva: qué vendió, qué metas tocó y cómo se arma su pago.
 *
 * ## Qué hace esta pantalla que no hagan los otros informes
 *
 * El reporte consolidado ya da la tabla de todas las ejecutivas, y la pestaña de
 * clasificación ya lista las ventas del mes. Lo que ninguno responde es **por
 * qué una persona cobró lo que cobró**: contra qué meta se midió, en qué tramo
 * de cirugías cayó, cuánto le faltó para el siguiente y qué proporción de su
 * pago es sueldo y cuál es comisión. Por eso esta vista no repite la tabla de
 * cifras por concepto —que sería el consolidado otra vez— sino que la sustituye
 * por la composición del pago, que es la lectura que sí es de una sola persona.
 *
 * ## Este componente ya no dibuja: reparte
 *
 * Era una plantilla de 371 líneas con cuatro bloques dentro. Ahora resuelve los
 * datos y los pasa a cuatro piezas con `input()`, cada una con su HTML y su CSS:
 * cabecera, metas, composición del pago y ventas. Teclear en el buscador solo
 * repinta la tabla, no la ficha entera.
 *
 * ## De dónde salen las metas y los tramos
 *
 * De `periodo.configuracionUsada` — la foto de las reglas con las que se liquidó
 * ESE mes— y solo si falta, de la configuración de hoy. Estaban escritos a mano
 * en el componente, así que cambiar una meta en Configuración no se reflejaba
 * aquí, y al abrir un mes antiguo se mostraban las reglas de hoy como si fueran
 * las suyas.
 */
@Component({
  selector: 'app-desempeno-agentes',
  imports: [
    PageHeaderComponent,
    FilterChipComponent,
    IconComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    LoadingSkeletonComponent,
    FichaCabeceraComponent,
    MetasAgenteComponent,
    ComposicionPagoComponent,
    VentasAgenteComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './desempeno-agentes.component.html',
  styleUrl: './desempeno-agentes.component.css',
})
export class DesempenoAgentesComponent {
  /** Oculta su propio `<app-page-header>` cuando vive dentro del hub de Finanzas. */
  readonly embedded = input(false);

  private readonly service = inject(PlanillaComisionesService);

  protected readonly periodoSeleccionado = signal<string | null>(null);
  protected readonly vendedoraSeleccionada = signal<string | null>(null);

  /* ── Datos remotos ──────────────────────────────────────────────────── */

  protected readonly periodos = httpResource<RespuestaPaginada<PeriodoComision>>(() =>
    this.service.periodosRequest(),
  );

  protected readonly consolidado = httpResource<ReporteConsolidado>(() => {
    const id = this.periodoId();
    return id ? this.service.consolidadoRequest(id) : undefined;
  });

  /**
   * La configuración de HOY, solo como respaldo de la foto del periodo.
   *
   * Se pide siempre porque es uno de los cuatro endpoints cacheados 60 s: sale
   * gratis después de la primera vez, y tenerla evita una pantalla a medias
   * cuando el periodo es anterior a que se guardaran las fotos.
   */
  protected readonly configuracion = httpResource<ConfiguracionPlanilla>(() =>
    this.service.configuracionRequest(),
  );

  /**
   * El equipo oficial, solo para poner cara a cada ficha.
   *
   * Es el único endpoint que ya cruza vendedora de planilla con usuario del CRM
   * —`Usuario.codigo` ES el `vendedora_pk` del Excel—, y además está en la lista
   * de los cuatro que el interceptor cachea 60 s: las fotos se descargan una vez
   * por sesión y no en cada cambio de periodo ni de ejecutiva.
   */
  protected readonly equipo = httpResource<readonly Vendedora[]>(() =>
    this.service.vendedorasRequest(),
  );

  protected readonly ventas = httpResource<VentasConCanales>(() => {
    const periodoId = this.periodoId();
    const vendedoraId = this.vendedora()?.vendedoraId;
    if (!periodoId || !vendedoraId) return undefined;
    /* El mes entero, no la primera página: el buscador de la tabla filtra en
       memoria, así que una venta fuera de la página no está "en la siguiente",
       no existe para él. Pesa ~16 KB comprimidos en el peor mes de la base. */
    return this.service.ventasRequest(periodoId, { vendedoraId, mesCompleto: true });
  });

  /* ── Selección ──────────────────────────────────────────────────────── */

  /** El periodo elegido a mano, o el más reciente que ya esté calculado. */
  protected readonly periodoId = computed<string | null>(() => {
    const manual = this.periodoSeleccionado();
    if (manual) return manual;
    const lista = this.periodos.value()?.datos ?? [];
    return (lista.find(p => p.estado === 'CALCULADO') ?? lista[0])?.id ?? null;
  });

  protected readonly periodo = computed<PeriodoComision | null>(() => {
    const id = this.periodoId();
    return (this.periodos.value()?.datos ?? []).find(p => p.id === id) ?? null;
  });

  protected readonly vendedoras = computed<readonly FilaConsolidado[]>(
    () => this.consolidado.value()?.filas ?? [],
  );

  protected readonly vendedora = computed<FilaConsolidado | null>(() => {
    const lista = this.vendedoras();
    const id = this.vendedoraSeleccionada();
    return (id ? lista.find(v => v.vendedoraId === id) : null) ?? lista[0] ?? null;
  });

  /**
   * Foto de la ejecutiva que se está viendo, o `null`.
   *
   * Se resuelve por CÓDIGO y no por nombre: el nombre del Excel y el del CRM no
   * tienen por qué coincidir carácter a carácter, y cruzar por texto es cómo una
   * ficha acaba con la cara de otra persona. El código es único en las dos
   * tablas y es la clave que el propio schema declara como puente.
   */
  protected readonly fotoActual = computed<string | null>(() => {
    const codigo = this.vendedora()?.codigo;
    if (!codigo) return null;
    const ficha = (this.equipo.value() ?? []).find(v => v.codigo === codigo);
    return ficha?.agente?.foto ?? null;
  });

  /** El TC con el que se liquidó este mes, para normalizar la composición. */
  protected readonly tipoCambio = computed(() => Number(this.periodo()?.tipoCambio) || 1);

  /* ── Reglas del periodo ─────────────────────────────────────────────── */

  /**
   * Los dos objetivos de planes de ESTA ejecutiva, con lo que de verdad comisiona.
   *
   * `comisionables` no se recalcula: se lee de lo que guardó el motor. Rehacer
   * aquí la resta `vendidos − objetivo` es cómo una pantalla acaba contradiciendo
   * a la liquidación cuando la regla cambia en un solo sitio.
   */
  protected readonly metas = computed<readonly MetaPlanes[]>(() => {
    const v = this.vendedora();
    if (!v) return [];

    const foto = this.periodo()?.configuracionUsada;
    const objetivoFoto = foto?.objetivos.find(o => o.tipo === v.tipo);
    const objetivoVivo = this.configuracion.value()?.objetivos.find(o => o.tipo === v.tipo);

    const paq = objetivoFoto?.planpaqMinimos ?? objetivoVivo?.planpaqMinimos ?? 0;
    const nin = objetivoFoto?.planninMinimos ?? objetivoVivo?.planninMinimos ?? 0;

    const avance = (vendidos: number, objetivo: number): number =>
      objetivo > 0 ? Math.min(100, Math.round((vendidos / objetivo) * 100)) : 100;

    return [
      {
        etiqueta: 'Paquetes de maternidad',
        vendidos: v.planpaqVendidos,
        objetivo: paq,
        comisionables: v.planpaqComisionables,
        avance: avance(v.planpaqVendidos, paq),
      },
      {
        etiqueta: 'Planes varios',
        vendidos: v.planninVendidos,
        objetivo: nin,
        comisionables: v.planninComisionables,
        avance: avance(v.planninVendidos, nin),
      },
    ];
  });

  /** La escala de cirugías del periodo, de la foto o —si falta— de la de hoy. */
  protected readonly tramos = computed<readonly TramoCirugia[]>(() => {
    const foto = this.periodo()?.configuracionUsada;
    if (foto?.nivelesCirugia.length) {
      return foto.nivelesCirugia
        .map(n => ({
          nivel: n.nivel,
          desde: n.montoDesde,
          hasta: n.montoHasta,
          /* La ficha resume el tramo con un solo porcentaje, y se muestra el de
             EMPRESA: 183 de las 185 ventas de diciembre entraron por ahí. */
          pct: n.pctEmpresa,
        }))
        .sort((a, b) => a.nivel - b.nivel);
    }

    return (this.configuracion.value()?.nivelesCirugia ?? [])
      .map(n => ({
        nivel: n.nivel,
        desde: Number(n.montoDesde),
        hasta: Number(n.montoHasta),
        pct: Number(n.pctEmpresa),
      }))
      .sort((a, b) => a.nivel - b.nivel);
  });

  /* ── Derivados de la tabla ──────────────────────────────────────────── */

  protected readonly ventasDelMes = computed<readonly VentaImportada[]>(
    () => this.ventas.value()?.datos ?? [],
  );

  protected readonly canales = computed(() => this.ventas.value()?.canales ?? null);

  /* ── Acciones ───────────────────────────────────────────────────────── */

  protected elegirPeriodo(id: string): void {
    this.periodoSeleccionado.set(id);
    /* La ejecutiva se re-elige sola: la del mes anterior puede no estar en el
       nuevo, y dejar el id viejo mostraba la primera de la lista sin que el chip
       activo lo dijera. */
    this.vendedoraSeleccionada.set(null);
  }

  protected elegirVendedora(id: string): void {
    this.vendedoraSeleccionada.set(id);
  }

  protected nombreMes(mes: number): string {
    return MESES[mes - 1] ?? `Mes ${mes}`;
  }

  protected etiquetaEstado(estado: string): string {
    return ESTADO_PERIODO_LABEL[estado as EstadoPeriodo] ?? estado;
  }
}
