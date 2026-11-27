import { DOCUMENT } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, Injector, resource, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { cubreRol } from '../../../core/auth/roles';
import { FechaCivilPipe } from '../../../core/fechas/fecha-civil.pipe';
import { FechaClinicaPipe } from '../../../core/fechas/fecha-clinica.pipe';
import { fechaCivilClinica } from '../../../core/fechas/zona-clinica';
import { ToastService } from '../../../core/toast/toast.service';
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
  VersionConstancia,
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
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);
  protected readonly auth = inject(AuthService);
  /** Validar y anular la validación: solo SUPER_ADMIN (lo exige también el backend). */
  protected readonly esSuperAdmin = computed(() => cubreRol(this.auth.user()?.rol, 'SUPER_ADMIN'));

  /** Por defecto el mes anterior: el que ya cerró y se lleva a notariar. */
  private readonly mesEnCurso = fechaCivilClinica(new Date()).slice(0, 7);
  private readonly porDefecto = mesAnterior(this.mesEnCurso);
  protected readonly meses = mesesParaElegir(this.mesEnCurso);
  private readonly url = inject(ActivatedRoute).snapshot.queryParamMap;
  protected readonly mes = signal(mesDeUrl(this.url.get('mes'), this.porDefecto));
  /** `null` = todos los tipos de informe. */
  protected readonly tipo = signal<GrupoConstancia | null>(grupoDeUrl(this.url.get('tipo')));
  protected readonly estado = signal<FiltroEstado>(filtroEstadoDeUrl(this.url.get('estado')));
  /**
   * `null` = lo que corresponde: la copia validada si el mes está validado.
   * `EN_VIVO` = recalcular ahora, para comparar con lo validado.
   */
  protected readonly version = signal<VersionConstancia | null>(this.url.get('version') === 'EN_VIVO' ? 'EN_VIVO' : null);
  /** Lo que se escribe en «Buscar»: filtra al instante (los avisos ya están en memoria). */
  protected readonly busqueda = signal((this.url.get('q') ?? '').slice(0, 80));
  /** La búsqueda que va a la URL, con su pausa: nunca una navegación por tecla. */
  private readonly busquedaEnUrl = signal(this.busqueda());
  protected readonly nombreMes = computed(() => nombreDelMes(this.mes()));
  protected readonly enCurso = computed(() => this.mes() === this.mesEnCurso);

  /** Cuántos avisos van cargados de cuántos, mientras llegan las páginas. */
  protected readonly progreso = signal<{ cargados: number; total: number } | null>(null);

  protected readonly constancia = resource({
    params: () => ({ mes: this.mes(), version: this.version() ?? undefined }),
    loader: async ({ params, abortSignal }): Promise<ConstanciaMensual> => {
      this.progreso.set(null);
      this.impresion.set(null);
      const primera = await this.resultados.constanciaPagina(params.mes, 1, params.version);
      const filas = new Map(primera.datos.map(f => [f.avisoId, f]));
      this.progreso.set({ cargados: filas.size, total: primera.total });
      for (let pagina = 2; pagina <= primera.totalPaginas; pagina++) {
        /* Cambiaron de mes a mitad de camino: no seguir pidiendo el anterior. */
        if (abortSignal.aborted) throw new DOMException('Cambio de mes', 'AbortError');
        const siguiente = await this.resultados.constanciaPagina(params.mes, pagina, params.version);
        /* Por id: en el mes en curso puede entrar un aviso nuevo entre dos páginas. */
        for (const f of siguiente.datos) filas.set(f.avisoId, f);
        this.progreso.set({ cargados: filas.size, total: siguiente.total });
      }
      return { ...primera, datos: [...filas.values()], total: filas.size };
    },
  });

  /** Los últimos 12 meses: avisos, validación e impresiones. Solo se lee al abrir y tras validar o imprimir. */
  protected readonly historial = resource({ loader: () => this.resultados.mesesConstancia() });
  /** La última impresión de ESTA pantalla: sale en la cabecera del papel. */
  protected readonly impresion = signal<{ impresaEn: string; porNombre: string | null } | null>(null);
  /** Validar pide confirmación en la misma barra; anular, además, el motivo. */
  protected readonly confirmandoValidar = signal(false);
  protected readonly anulando = signal(false);
  protected readonly motivo = signal('');
  protected readonly trabajando = signal(false);

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
  protected readonly validacion = computed(() => (this.constancia.hasValue() ? this.constancia.value().validacion : null));
  /** Avisos del mes entero (sin filtros): lo que se congela al validar. */
  protected readonly totalDelMes = computed(() => (this.constancia.hasValue() ? this.constancia.value().total : 0));
  /** Lo que se ve es la copia congelada al validar. */
  protected readonly esCopiaValidada = computed(() => this.constancia.hasValue() && this.constancia.value().version === 'VALIDADA');
  /** Validar: SUPER_ADMIN, mes ya cerrado y sin validar, con la constancia ya cargada. */
  protected readonly puedeValidar = computed(() => this.esSuperAdmin() && this.listo() && !this.enCurso() && !this.validacion());
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
  protected readonly nombreDelMes = nombreDelMes;

  constructor() {
    reflejarEnUrl(() => ({
      mes: this.mes() === this.porDefecto ? null : this.mes(),
      tipo: this.tipo(),
      estado: this.estado() === 'TODOS' ? null : this.estado(),
      q: this.busquedaEnUrl().trim() || null,
      version: this.version(),
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
    this.version.set(null);
    this.cancelar();
  }

  /** Desde el historial: abre ese mes arriba. */
  protected verMes(mes: string): void {
    this.cambiarMes(mes);
    this.documento.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected verVersion(version: VersionConstancia): void {
    this.version.set(version === 'EN_VIVO' ? 'EN_VIVO' : null);
  }

  protected cancelar(): void {
    this.confirmandoValidar.set(false);
    this.anulando.set(false);
    this.motivo.set('');
  }

  protected async validar(): Promise<void> {
    if (!this.puedeValidar() || this.trabajando()) return;
    this.trabajando.set(true);
    try {
      const v = await this.resultados.validarConstancia(this.mes());
      this.toast.success(`${this.nombreMes()} quedó validado con ${v.totalAvisos} ${v.totalAvisos === 1 ? 'aviso' : 'avisos'}.`);
      this.cancelar();
      this.version.set(null);
      this.constancia.reload();
      this.historial.reload();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo validar el mes.'));
    } finally {
      this.trabajando.set(false);
    }
  }

  protected async anular(): Promise<void> {
    const motivo = this.motivo().trim();
    if (!this.esSuperAdmin() || motivo.length < 5 || this.trabajando()) return;
    this.trabajando.set(true);
    try {
      await this.resultados.anularValidacionConstancia(this.mes(), motivo);
      this.toast.success(`Se anuló la validación de ${this.nombreMes()}. La copia anterior queda en la auditoría.`);
      this.cancelar();
      this.version.set(null);
      this.constancia.reload();
      this.historial.reload();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo anular la validación.'));
    } finally {
      this.trabajando.set(false);
    }
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

  /**
   * Primero consta quién imprime (pedido de René, 27/11/2026) y después se
   * imprime: si el registro falla, no se imprime. El nombre y la hora salen en
   * la cabecera del papel, así que se espera a que se pinten antes de abrir
   * el cuadro de impresión.
   */
  protected async imprimir(): Promise<void> {
    if (!this.listo() || !this.filas().length || this.trabajando() || !this.constancia.hasValue()) return;
    this.trabajando.set(true);
    try {
      const registro = await this.resultados.registrarImpresionConstancia(this.mes(), {
        tipo: this.tipo() ?? undefined,
        filtro: this.filtroAplicado() ?? undefined,
        filas: this.filas().length,
        version: this.constancia.value().version,
      });
      this.impresion.set(registro);
      this.historial.reload();
      /* El nombre de quien imprime tiene que estar pintado antes de abrir el cuadro. */
      await new Promise<void>(listo => afterNextRender(() => listo(), { injector: this.injector }));
      this.documento.defaultView?.print();
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo registrar la impresión, así que no se imprimió. Inténtalo de nuevo.'));
    } finally {
      this.trabajando.set(false);
    }
  }
}
