import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast/toast.service';
import { BadgeComponent } from '../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { InfoHintComponent } from '../../../shared/components/info-hint/info-hint.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { TableComponent } from '../../../shared/components/table/table.component';
import { MonedaPipe } from '../../../shared/pipes/moneda.pipe';
import { PlanillaComisionesService } from '../planilla-comisiones.service';
import {
  CambiosVendedora,
  ClasifComision,
  CLASIF_LABEL,
  ConfiguracionPlanilla,
  MESES,
  Objetivo,
  PeriodoComision,
  TipoVendedora,
  Vendedora,
} from '../planilla.model';

/**
 * Pestaña de Configuración de Comisiones.
 *
 * Consolida todas las reglas maestras del módulo de liquidación:
 * 1. Reglas globales del cálculo (parámetros y factores).
 * 2. Directorio de vendedoras (sueldo base, tipo y área).
 * 3. Tarifas Tipo A (Planes y paquetes).
 * 4. Tarifas Tipo C (Consultas, labs, ecografías y servicios sueltos).
 * 5. Escala Tipo B (Cirugías por volumen mensual).
 * 6. Histórico RA (Procedimientos de Reproducción Asistida).
 * 7. Canales de Captación (Mapeo empresa vs. propia).
 * 8. Metas comerciales (Base y específicas del periodo).
 * 9. Diccionario de clasificación por patrón de servicio.
 */
@Component({
  selector: 'app-configuracion-comisiones',
  imports: [
    MonedaPipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    FilterChipComponent,
    InfoHintComponent,
    InputComponent,
    LoadingSkeletonComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Reglas globales del cálculo -->
    <section class="panel mb-4">
      <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
        Reglas del cálculo
        <app-info-hint titulo="Las cuatro palancas globales">
          <p>
            Valen para todas las vendedoras y todos los periodos. Cambiarlas
            <strong>no recalcula nada por sí solo</strong>: el nuevo valor se aplica
            la próxima vez que se calcule un periodo.
          </p>
          <p>
            Un periodo ya CERRADO no se toca. Si necesitas rehacer un mes ya
            liquidado, tienes que reabrirlo a propósito.
          </p>
        </app-info-hint>
      </h3>
      <p class="text-xs text-text-muted mb-3">
        Solo el super administrador puede cambiarlas.
      </p>

      <div class="space-y-3">
        @for (p of parametrosConocidos; track p.clave) {
          <div class="regla-global">
            <div class="min-w-0">
              <p class="text-xs font-bold text-text-dark">{{ p.titulo }}</p>
              <p class="text-[11px] text-text-muted leading-snug mt-0.5">{{ p.ayuda }}</p>
              <code class="text-[10px] text-text-muted">{{ p.clave }}</code>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <input
                class="input-base w-28 text-right tabular-nums"
                type="text"
                inputmode="decimal"
                [value]="valorParametro(p.clave)"
                [disabled]="!esSuperAdmin()"
                (change)="guardarParametro(p.clave, $any($event.target).value)" />
              <span class="text-[10px] text-text-muted w-28">{{ p.sufijo }}</span>
            </div>
          </div>
        }
      </div>
    </section>

    <!-- Vendedoras -->
    <section class="panel mb-4">
      <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
        Vendedoras
        <app-info-hint titulo="Cómo se reconoce a cada vendedora">
          <p>
            El sistema NO cruza por nombre —se escribe distinto cada vez— sino por el
            <strong>código</strong> de la columna <code>vendedora_pk</code> del Excel (Pe2455).
          </p>
          <p>
            Ese mismo código va en la ficha del agente del CRM. Mientras coincidan, cada venta cae
            sola en su dueña; si no, la vendedora se crea aparte y queda <strong>sin configurar</strong>.
          </p>
          <p>Una vendedora sin sueldo base ni tipo asignado no puede liquidarse bien.</p>
        </app-info-hint>
      </h3>
      <p class="text-xs text-text-muted mb-3">
        Se dan de alta solas al importar. El agente del CRM se reconoce por el <strong>código de
        empresa</strong> (el mismo <code>vendedora_pk</code> del Excel), así que no hay que vincular
        nada a mano. Fíjales tipo, área y sueldo base para que la liquidación sea correcta.
      </p>

      @if (cargandoVendedoras()) {
        <app-loading-skeleton height="120px" />
      } @else if (vendedoras().length === 0) {
        <app-empty-state
          icon="users"
          title="Sin vendedoras"
          description="Aparecerán aquí en cuanto importes el primer Excel." />
      } @else {
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Nombre</th>
              <th class="text-left">Código</th>
              <th class="text-left">Agente CRM</th>
              <th class="text-center">Tipo</th>
              <th class="text-center">Área</th>
              <th class="text-right">Sueldo Base (Bs)</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (v of vendedoras(); track v.id) {
              <tr [class.fila-pendiente]="!v.configurada">
                <td class="text-left font-semibold text-sm text-text-dark">{{ v.nombre }}</td>
                <td class="text-left text-xs font-mono text-text-muted">{{ v.codigo }}</td>
                <td class="text-left">
                  @if (v.agente; as ag) {
                    <span class="text-sm font-medium text-text-dark">{{ ag.nombre }}</span>
                    <span class="block text-[10px] text-text-muted">{{ ag.email }}</span>
                  } @else {
                    <app-badge variant="neutral" icon="alert-circle">Sin agente</app-badge>
                  }
                </td>
                <td class="text-center">
                  <select
                    class="select-base select-mini font-medium"
                    [value]="v.tipo"
                    (change)="cambiarTipoVendedora(v, $any($event.target).value)">
                    <option value="VENDEDORA" [selected]="v.tipo === 'VENDEDORA'">Vendedora</option>
                    <option value="JEFA" [selected]="v.tipo === 'JEFA'">Jefa</option>
                  </select>
                </td>
                <td class="text-center">
                  <select
                    class="select-base select-mini font-medium"
                    [value]="v.area"
                    (change)="cambiarAreaVendedora(v, $any($event.target).value)">
                    <option value="EJECUTIVA" [selected]="v.area === 'EJECUTIVA'">Ejecutiva</option>
                    <option value="RA" [selected]="v.area === 'RA'">Coordinadora RA</option>
                    <option value="PUBLICIDAD" [selected]="v.area === 'PUBLICIDAD'">Publicidad</option>
                  </select>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      class="input-mini text-right"
                      [value]="v.sueldoBase"
                      (change)="guardarSueldo(v, $any($event.target).value)" />
                  </div>
                </td>
                <td class="text-center">
                  @if (v.configurada) {
                    <app-badge variant="success">Configurada</app-badge>
                  } @else {
                    <app-badge variant="critical">Pendiente</app-badge>
                  }
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      }
    </section>

    @if (configuracion(); as cfg) {
      <!-- Tipo A -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Tipo A — Planes (%)
          <app-info-hint titulo="Tarifas de planes y paquetes">
            <p>
              Los paquetes de maternidad cobran según su <strong>nivel</strong>; los planes varios
              (niño sano, bariátrica) usan la fila PLANNIN.
            </p>
            <p>
              Dos columnas porque el <strong>canal</strong> cambia la tarifa: la venta propia paga más
              que la que llegó por la clínica.
            </p>
            <p>Recuerda que solo comisionan los planes que superan el objetivo del mes.</p>
          </app-info-hint>
        </h3>
        <p class="text-xs text-text-muted mb-3">
          Por nivel del plan de maternidad, y PLANNIN para los paquetes varios.
        </p>
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Nivel</th>
              <th class="text-right">Empresa %</th>
              <th class="text-right">Propio %</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (t of cfg.tarifasPlan; track t.id) {
              <tr>
                <td class="text-left font-semibold text-text-dark">{{ t.clave }}</td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #te
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      class="input-mini text-right"
                      [value]="t.pctEmpresa" />
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #tp
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      class="input-mini text-right"
                      [value]="t.pctPropio" />
                  </div>
                </td>
                <td class="text-right">
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="check"
                    (clicked)="guardarTarifaPlan(t.clave, te.value, tp.value)">
                    Guardar
                  </app-button>
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>

      <!-- Tipo C -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Tipo C — Consultas, laboratorios y otros (%)
          <app-info-hint titulo="Tarifas de servicios sueltos">
            <p>
              Consultas, laboratorios, ecografías y otros servicios <strong>facturados aparte</strong>.
            </p>
            <p>
              Lo que va incluido dentro de un plan no llega como fila propia al Excel: se cobra con el
              plan y comisiona como Tipo A, no aquí.
            </p>
            <p>
              <strong>Campaña y promoción van en 0%</strong> a propósito: entran al reporte para que se
              vean, pero no se pagan.
            </p>
            <p>No dependen del objetivo de planes: se pagan aunque no se llegue a la meta.</p>
          </app-info-hint>
        </h3>
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Clasificación</th>
              <th class="text-right">Empresa %</th>
              <th class="text-right">Propio %</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (t of cfg.tarifasServicio; track t.id) {
              <tr>
                <td class="text-left font-semibold text-text-dark">{{ clasifLabel[t.clasif] }}</td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #se
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      class="input-mini text-right"
                      [value]="t.pctEmpresa" />
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #sp
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      class="input-mini text-right"
                      [value]="t.pctPropio" />
                  </div>
                </td>
                <td class="text-right">
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="check"
                    (clicked)="guardarTarifaServicio(t.clasif, se.value, sp.value)">
                    Guardar
                  </app-button>
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>

      <!-- Tipo B -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Tipo B — Escala de cirugías
          <app-info-hint titulo="Cómo funciona la escala">
            <p>
              Se suman TODAS las cirugías del mes de la vendedora, y ese acumulado decide el nivel.
            </p>
            <p>
              Luego ese porcentaje se aplica <strong>a todas</strong>, no por tramos: no es que las
              primeras paguen menos y las últimas más.
            </p>
            <p>
              En una frontera exacta manda el tramo de arriba. Por debajo del primer nivel no hay
              comisión, y por encima del último se aplica ese último.
            </p>
          </app-info-hint>
        </h3>
        <p class="text-xs text-text-muted mb-3">
          El nivel se decide con el monto acumulado de cirugías del mes de cada vendedora.
        </p>
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Nivel</th>
              <th class="text-right">Monto Desde</th>
              <th class="text-right">Monto Hasta</th>
              <th class="text-right">Empresa %</th>
              <th class="text-right">Propio %</th>
            </tr>
          </thead>
          <tbody>
            @for (n of cfg.nivelesCirugia; track n.id) {
              <tr>
                <td class="text-left font-semibold text-text-dark">Nivel {{ n.nivel }}</td>
                <td class="text-right text-text-dark font-medium">{{ n.montoDesde | moneda }}</td>
                <td class="text-right text-text-dark font-medium">{{ n.montoHasta | moneda }}</td>
                <td class="text-right font-semibold text-primary">{{ n.pctEmpresa }}%</td>
                <td class="text-right font-semibold text-secondary">{{ n.pctPropio }}%</td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>

      <!-- Tarifas RA (Histórico) -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Tipo B — Coordinadoras RA (USD por procedimiento)
          <app-badge variant="neutral">Histórico</app-badge>
          <app-info-hint titulo="Por qué RA no usa escala">
            <p>
              Reproducción Asistida cobraba <strong>monto fijo en dólares por procedimiento</strong>, no un
              porcentaje sobre el precio.
            </p>
            <p>
              <em>Nota operativa:</em> Rol retirado del cálculo activo desde diciembre 2025 (las tarifas se
              mantienen para auditoría y recálculo de periodos anteriores).
            </p>
          </app-info-hint>
        </h3>
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Procedimiento</th>
              <th class="text-right">Clínica</th>
              <th class="text-right">Propia</th>
            </tr>
          </thead>
          <tbody>
            @for (t of cfg.tarifasRA; track t.id) {
              <tr>
                <td class="text-left font-medium text-text-dark">{{ t.procedimiento }}</td>
                <td class="text-right font-medium text-text-dark">
                  {{ t.esPorcentaje ? t.montoEmpresa + '%' : '$' + t.montoEmpresa }}
                </td>
                <td class="text-right font-medium text-text-dark">
                  {{ t.esPorcentaje ? t.montoPropio + '%' : '$' + t.montoPropio }}
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>

      <!-- Captación: qué cuenta como venta propia -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Canales de Captación
          <app-info-hint titulo="Cómo se decide si una venta es propia">
            <p>
              Cada venta del Excel trae una <strong>captación</strong> (Clínica, Propio, Facebook…).
              Aquí se define cuáles cuentan como venta <strong>propia</strong> de la vendedora.
            </p>
            <p>
              No es un detalle: una venta propia paga bastante más que una de la empresa, tanto en
              servicios como en planes. Las tarifas exactas están en las tablas de arriba.
            </p>
            <p>
              <strong>Lo que no esté en esta lista cuenta como EMPRESA</strong>, que es la tarifa más
              baja. Si aparece un canal nuevo el sistema paga de menos y ustedes lo corrigen, en vez de
              pagar de más y tener que recuperarlo.
            </p>
          </app-info-hint>
        </h3>
        <p class="text-xs text-text-muted mb-3">
          Escribe el valor tal como aparece en la columna de captación del Excel.
        </p>

        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Valor en el Excel</th>
              <th class="text-left">Cuenta como</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (c of cfg.captacion; track c.valor) {
              <tr>
                <td class="text-left font-semibold text-text-dark font-mono">{{ c.valor }}</td>
                <td class="text-left">
                  <select
                    class="select-base"
                    [value]="c.canal"
                    (change)="guardarCaptacion(c.valor, $any($event.target).value)">
                    <option value="EMPRESA" [selected]="c.canal === 'EMPRESA'">Empresa (tarifa base)</option>
                    <option value="PROPIO" [selected]="c.canal === 'PROPIO'">Propia (tarifa alta)</option>
                  </select>
                </td>
                <td class="text-right">
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    (clicked)="eliminarCaptacion(c.valor)">
                    Quitar
                  </app-button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="3" class="text-center text-text-muted text-xs py-3">
                  Sin canales configurados — todas las ventas cuentan como empresa.
                </td>
              </tr>
            }
          </tbody>
        </app-table>

        <div class="flex items-end gap-2 mt-3 flex-wrap">
          <app-input
            label="Agregar canal"
            placeholder="Ej. TIKTOK"
            [(value)]="captacionNueva" />
          <app-button
            variant="secondary"
            icon="plus"
            (clicked)="guardarCaptacion(captacionNueva(), 'EMPRESA')">
            Agregar como empresa
          </app-button>
          <app-button
            variant="primary"
            icon="plus"
            (clicked)="guardarCaptacion(captacionNueva(), 'PROPIO')">
            Agregar como propia
          </app-button>
        </div>
      </section>

      <!-- Metas del Equipo Comercial -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Metas del Equipo Comercial
          <app-info-hint titulo="Cómo funcionan las metas">
            <p>
              El objetivo es una <strong>franquicia, no un interruptor</strong>: solo comisionan los
              planes que lo superan. Con 5 paquetes y objetivo 4, comisiona 1. Igualar paga cero.
            </p>
            <p>
              <strong>Mensual:</strong> quien lo supera aporta a la bolsa que cobra publicidad.
              <strong>Trimestral:</strong> se compara contra el promedio del trimestre.
            </p>
            <p>
              Hay dos capas: las metas <strong>por defecto</strong> rigen siempre, y cada mes puede
              tener las suyas propias. Cambiar la meta de un mes no toca lo ya liquidado en otro.
            </p>
          </app-info-hint>
        </h3>

        <div class="flex items-center gap-2 flex-wrap mb-3">
          <app-filter-chip [active]="metasDelPeriodo() === false" (clicked)="verMetas(false)">
            Por defecto
          </app-filter-chip>
          @if (periodo(); as p) {
            <app-filter-chip [active]="metasDelPeriodo() === true" (clicked)="verMetas(true)">
              {{ nombreMes(p.mes) }} {{ p.anio }}
            </app-filter-chip>
          }
        </div>

        @if (metasDelPeriodo() && periodo(); as p) {
          <p class="text-xs text-text-muted mb-3">
            @if (hayMetasPropias()) {
              Este mes tiene metas propias. Guardar las cambia solo para
              <strong>{{ nombreMes(p.mes) }} {{ p.anio }}</strong>.
            } @else {
              Este mes usa las metas por defecto. Al guardar aquí se crean metas propias para
              <strong>{{ nombreMes(p.mes) }} {{ p.anio }}</strong>, sin tocar las demás.
            }
          </p>
        } @else {
          <p class="text-xs text-text-muted mb-3">
            Metas base: rigen en todos los meses que no tengan las suyas propias.
          </p>
        }

        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-left">Tipo Vendedora</th>
              <th class="text-right">Mín. Paquetes</th>
              <th class="text-right">Mín. Planes Varios</th>
              <th class="text-right">Meta Mensual (USD)</th>
              <th class="text-right">Meta Trimestral (USD)</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (o of metasVisibles(); track o.tipo) {
              <tr>
                <td class="text-left font-semibold text-text-dark">
                  {{ o.tipo }}
                  @if (metasDelPeriodo() && o.periodoId) {
                    <app-badge variant="info">propia</app-badge>
                  }
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #mpq
                      type="number"
                      min="0"
                      step="1"
                      class="input-mini text-right"
                      [value]="o.planpaqMinimos" />
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #mpn
                      type="number"
                      min="0"
                      step="1"
                      class="input-mini text-right"
                      [value]="o.planninMinimos" />
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #mme
                      type="number"
                      min="0"
                      step="100"
                      class="input-mini text-right"
                      [value]="o.montoMensualUsd" />
                  </div>
                </td>
                <td class="text-right">
                  <div class="flex justify-end">
                    <input
                      #mtr
                      type="number"
                      min="0"
                      step="100"
                      class="input-mini text-right"
                      [value]="o.montoTrimestralUsd" />
                  </div>
                </td>
                <td class="text-right whitespace-nowrap">
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="check"
                    (clicked)="guardarMeta(o, mpq.value, mpn.value, mme.value, mtr.value)">
                    Guardar
                  </app-button>
                  @if (metasDelPeriodo() && o.periodoId) {
                    <app-button
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      (clicked)="quitarMetaDelMes(o.tipo)">
                      Usar la base
                    </app-button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>

      <!-- Diccionario de clasificación -->
      <section class="panel mb-4">
        <h3 class="text-sm font-bold text-text-dark mb-1 flex items-center gap-1.5">
          Diccionario de clasificación ({{ cfg.reglas.length }} reglas)
          <app-info-hint titulo="Para qué sirve el diccionario">
            <p>
              Cada venta del Excel hay que clasificarla. El sistema lo deduce del nombre del servicio,
              pero cuando se equivoca —o cuando el catálogo dice otra cosa— manda una regla de aquí.
            </p>
            <p>
              <strong>Prioridad baja gana.</strong> Se usan números bajos para las excepciones que deben
              vencer a la deducción automática, y altos para las que solo confirman.
            </p>
            <p>
              Es también la <strong>única</strong> forma de marcar una venta como del área RA.
            </p>
            <p>
              Si dos reglas tienen el mismo patrón y la misma prioridad, cuál gana queda al azar:
              conviene que no se repitan.
            </p>
          </app-info-hint>
        </h3>
        <p class="text-xs text-text-muted mb-3">
          Manda sobre la clasificación automática. Se evalúa de menor a mayor prioridad.
        </p>
        <app-table [dense]="true">
          <thead>
            <tr>
              <th class="text-center w-[70px]">Prioridad</th>
              <th class="text-left">Patrón (Servicio contiene…)</th>
              <th class="text-center min-w-[150px]">Clasificación</th>
              <th class="text-left min-w-[120px]">Unidad de Negocio</th>
              <th class="text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (r of cfg.reglas; track r.id) {
              <tr>
                <td class="text-center font-mono text-xs text-text-muted">{{ r.prioridad }}</td>
                <td class="text-left">
                  <span class="font-semibold text-sm text-text-dark block">{{ r.patron }}</span>
                  @if (r.notas) {
                    <span class="block text-[11px] text-text-muted">{{ r.notas }}</span>
                  }
                </td>
                <td class="text-center">
                  <app-badge variant="neutral">{{ clasifLabel[r.clasif] }}</app-badge>
                </td>
                <td class="text-left text-xs font-medium text-text-muted">{{ r.unidadNegocio ?? '—' }}</td>
                <td class="text-right">
                  <app-button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    (clicked)="eliminarRegla(r.id, r.patron)">
                    Quitar
                  </app-button>
                </td>
              </tr>
            }
          </tbody>
        </app-table>
      </section>
    } @else {
      <section class="panel">
        <app-loading-skeleton height="200px" />
      </section>
    }
  `,
  styles: [
    `
      .panel {
        background: white;
        border: 1px solid var(--color-border);
        border-radius: 16px;
        padding: 20px;
        box-shadow: var(--shadow-subtle);
        margin-bottom: 20px;
      }

      .regla-global {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        background: var(--color-bg-light);
      }

      .fila-pendiente {
        background: color-mix(in srgb, var(--color-critical-bg) 40%, transparent);
      }

      .select-base {
        padding: 6px 12px;
        font-size: 13px;
        color: var(--color-text-dark);
        background: white;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        cursor: pointer;
        max-width: 100%;
        transition: border-color 0.15s ease;
      }

      .select-base:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
      }

      .select-mini {
        padding: 4px 8px;
        font-size: 12px;
        border-radius: 12px;
      }

      .input-base {
        padding: 6px 12px;
        font-size: 13px;
        color: var(--color-text-dark);
        background: white;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        font-variant-numeric: tabular-nums;
        transition: border-color 0.15s ease;
      }

      .input-base:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
      }

      .input-mini {
        width: 96px;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-dark);
        background: white;
        border: 1px solid var(--color-border);
        border-radius: 12px;
        font-variant-numeric: tabular-nums;
      }

      .input-mini:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent);
      }
    `,
  ],
})
export class ConfiguracionComisionesComponent {
  readonly periodo = input<PeriodoComision | null>(null);
  readonly configuracion = input<ConfiguracionPlanilla | null>(null);
  readonly vendedoras = input<readonly Vendedora[]>([]);
  readonly cargandoVendedoras = input(false);

  readonly configuracionModificada = output<void>();
  readonly vendedoraModificada = output<void>();

  private readonly service = inject(PlanillaComisionesService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);

  protected readonly esSuperAdmin = this.authService.isSuperAdmin;
  protected readonly clasifLabel = CLASIF_LABEL;

  /** Campo para dar de alta un valor de captación nuevo desde configuración. */
  protected readonly captacionNueva = signal('');

  protected readonly parametrosConocidos: ReadonlyArray<{
    clave: string;
    titulo: string;
    ayuda: string;
    sufijo: string;
  }> = [
    {
      clave: 'PCT_TIPO_C_RA',
      titulo: 'Comisión del área RA',
      ayuda:
        'Porcentaje que aplica a las ventas cuya columna «area» del export dice RA. ' +
        'En 0 no pagan comisión directa, aunque siguen sumando al monto vendido del ' +
        'mes y por tanto a los bonos.',
      sufijo: '%  (0,045 = 4,5%)',
    },
    {
      clave: 'FACTOR_BONO_JEFATURA',
      titulo: 'Factor del bono de jefatura',
      ayuda:
        'Se aplica al excedente sobre el objetivo mensual de cada vendedora para armar ' +
        'el pote. El pote se paga DOS veces: íntegro a la jefatura y otro tanto ' +
        'repartido entre publicidad.',
      sufijo: '(0,002 = 0,2%)',
    },
    {
      clave: 'FACTOR_BONO_TRIMESTRAL',
      titulo: 'Factor del bono trimestral',
      ayuda:
        'Se aplica al PROMEDIO del trimestre, no al mes suelto, y solo si ese promedio ' +
        'supera el objetivo trimestral. Se paga únicamente en los meses de cierre: ' +
        'marzo, junio, septiembre y diciembre.',
      sufijo: '(0,005 = 0,5%)',
    },
    {
      clave: 'MESES_BONO_TRIMESTRAL',
      titulo: 'Meses que promedia el bono trimestral',
      ayuda:
        'Cuántos meses entran en el promedio, contando hacia atrás desde el mes que se ' +
        'liquida. Con 3, liquidar marzo promedia enero, febrero y marzo.',
      sufijo: 'meses',
    },
  ];

  /* ── Metas: base o propias del mes ───────────────────────────────────── */
  private readonly metasResueltas = signal<Objetivo[]>([]);
  protected readonly metasDelPeriodo = signal(false);

  protected readonly metasVisibles = computed(() =>
    this.metasDelPeriodo()
      ? this.metasResueltas()
      : (this.configuracion()?.objetivos ?? []),
  );

  protected readonly hayMetasPropias = computed(() =>
    this.metasResueltas().some(o => o.periodoId !== null),
  );

  protected nombreMes(mes: number): string {
    return MESES[mes - 1] ?? '';
  }

  protected valorParametro(clave: string): string {
    const p = this.configuracion()?.parametros.find(x => x.clave === clave);
    return p ? String(p.valor) : '';
  }

  protected async guardarParametro(clave: string, valor: string): Promise<void> {
    const numero = Number(valor.replace(',', '.').trim());
    if (!Number.isFinite(numero)) {
      this.toast.error(`"${valor}" no es un número.`, 'Parámetros');
      this.configuracionModificada.emit();
      return;
    }
    try {
      await this.service.actualizarParametro(clave, numero);
      this.toast.success(
        'Se aplica en el próximo cálculo: recalcula el periodo para verlo.',
        'Parámetro guardado',
      );
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar el parámetro.'), 'Parámetros');
    }
  }

  protected async guardarVendedora(
    vendedora: Vendedora,
    cambios: CambiosVendedora,
  ): Promise<void> {
    try {
      await this.service.actualizarVendedora(vendedora.id, cambios);
      this.toast.success(`${vendedora.nombre} actualizada.`, 'Guardado');
      this.vendedoraModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    }
  }

  protected cambiarTipoVendedora(vendedora: Vendedora, tipo: string): void {
    void this.guardarVendedora(vendedora, { tipo: tipo as Vendedora['tipo'] });
  }

  protected cambiarAreaVendedora(vendedora: Vendedora, area: string): void {
    void this.guardarVendedora(vendedora, { area: area as Vendedora['area'] });
  }

  protected guardarSueldo(vendedora: Vendedora, valor: string): void {
    const sueldoBase = Number(valor);
    if (!Number.isFinite(sueldoBase) || sueldoBase < 0) {
      this.toast.error('El sueldo base debe ser un número positivo.', 'Dato inválido');
      return;
    }
    void this.guardarVendedora(vendedora, { sueldoBase });
  }

  protected async guardarTarifaPlan(clave: string, empresa: string, propio: string): Promise<void> {
    const pctEmpresa = Number(empresa);
    const pctPropio = Number(propio);
    if (!this.porcentajesValidos(pctEmpresa, pctPropio)) return;

    try {
      await this.service.actualizarTarifaPlan(clave, pctEmpresa, pctPropio);
      this.toast.success(`Tarifa ${clave} actualizada.`, 'Guardado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la tarifa.'), 'Error');
    }
  }

  protected async guardarTarifaServicio(
    clasif: ClasifComision,
    empresa: string,
    propio: string,
  ): Promise<void> {
    const pctEmpresa = Number(empresa);
    const pctPropio = Number(propio);
    if (!this.porcentajesValidos(pctEmpresa, pctPropio)) return;

    try {
      await this.service.actualizarTarifaServicio(clasif, pctEmpresa, pctPropio);
      this.toast.success(`Tarifa ${this.clasifLabel[clasif]} actualizada.`, 'Guardado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la tarifa.'), 'Error');
    }
  }

  protected async guardarCaptacion(valor: string, canal: string): Promise<void> {
    const limpio = valor.trim();
    if (!limpio) {
      this.toast.error('Escribe el valor tal como aparece en el Excel.', 'Falta el valor');
      return;
    }

    try {
      const guardado = await this.service.guardarCaptacion(
        limpio,
        canal === 'PROPIO' ? 'PROPIO' : 'EMPRESA',
      );
      this.toast.success(`"${guardado.valor}" cuenta como ${guardado.canal}.`, 'Guardado');
      this.captacionNueva.set('');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la captación.'), 'Error');
    }
  }

  protected async eliminarCaptacion(valor: string): Promise<void> {
    try {
      await this.service.eliminarCaptacion(valor);
      this.toast.success(`"${valor}" vuelve a contar como EMPRESA.`, 'Eliminado');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la captación.'), 'Error');
    }
  }

  protected async verMetas(delPeriodo: boolean): Promise<void> {
    this.metasDelPeriodo.set(delPeriodo);
    const periodo = this.periodo();
    if (delPeriodo && periodo) {
      try {
        this.metasResueltas.set(await this.service.objetivosDelPeriodo(periodo.id));
      } catch (err) {
        this.toast.error(mensajeDeError(err, 'No se pudieron cargar las metas del mes.'), 'Error');
      }
    }
  }

  protected async guardarMeta(
    objetivo: Objetivo,
    planpaq: string,
    plannin: string,
    mensual: string,
    trimestral: string,
  ): Promise<void> {
    const datos = {
      planpaqMinimos: Number(planpaq),
      planninMinimos: Number(plannin),
      montoMensualUsd: Number(mensual),
      montoTrimestralUsd: Number(trimestral),
    };

    if (Object.values(datos).some(v => !Number.isFinite(v) || v < 0)) {
      this.toast.error('Las metas deben ser números positivos.', 'Valor inválido');
      return;
    }

    const periodo = this.periodo();
    try {
      if (this.metasDelPeriodo() && periodo) {
        await this.service.guardarObjetivoDePeriodo(periodo.id, objetivo.tipo, datos);
        this.toast.success(`Meta de ${objetivo.tipo} guardada para este mes.`, 'Guardado');
        await this.verMetas(true);
      } else {
        await this.service.actualizarObjetivo(objetivo.id, datos);
        this.toast.success(`Meta base de ${objetivo.tipo} actualizada.`, 'Guardado');
        this.configuracionModificada.emit();
      }
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la meta.'), 'Error');
    }
  }

  protected async quitarMetaDelMes(tipo: TipoVendedora): Promise<void> {
    const periodo = this.periodo();
    if (!periodo) return;

    try {
      await this.service.eliminarObjetivoDePeriodo(periodo.id, tipo);
      this.toast.success(`${tipo} vuelve a la meta base.`, 'Eliminada');
      await this.verMetas(true);
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo quitar la meta del mes.'), 'Error');
    }
  }

  protected async eliminarRegla(id: string, patron: string): Promise<void> {
    try {
      await this.service.eliminarRegla(id);
      this.toast.success(`Regla "${patron}" eliminada.`, 'Eliminada');
      this.configuracionModificada.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo eliminar la regla.'), 'Error');
    }
  }

  private porcentajesValidos(empresa: number, propio: number): boolean {
    const valido = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100;
    if (!valido(empresa) || !valido(propio)) {
      this.toast.error('Los porcentajes deben estar entre 0 y 100.', 'Dato inválido');
      return false;
    }
    return true;
  }
}
