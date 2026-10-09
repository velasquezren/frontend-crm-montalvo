import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { esConflicto, mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { ToastService } from '../../../../core/toast/toast.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { KpiCardComponent } from '../../../../shared/components/kpi-card/kpi-card.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { SwitchComponent } from '../../../../shared/components/switch/switch.component';
import { problemaDeImagen, TIPOS_IMAGEN_PUBLICA } from '../../../../shared/models/catalogo';
import { MonedaPipe } from '../../../../shared/pipes/moneda.pipe';
import { EspecialidadCorta, FichaResumen } from '../../../directorio/directorio.model';
import { DirectorioService } from '../../../directorio/directorio.service';
import {
  ACCION,
  AccionPromocion,
  BorradorPromocion,
  borradorDe,
  cambiosDe,
  ESTADO_PROMOCION,
  FORMATOS,
  FormatoBanner,
  PromocionDetalle,
  rangoVigencia,
  VIGENCIA,
} from '../../promocion.model';
import { PromocionesService } from '../../promociones.service';
import { FechaClinicaPipe } from '../../../../core/fechas/fecha-clinica.pipe';

/** El id de un anuncio de Meta: dígitos (a veces con `_`). Espejo de `ANUNCIO_ID` del backend. */
const ANUNCIO_ID = /^[0-9_]{3,64}$/;

/**
 * La ficha de una promoción. El servidor dice qué puede hacer ESTA persona
 * (`puedeEditar`, `acciones`) y qué falta para publicarla (`faltantes`); aquí
 * solo se pinta y se pide. Cada respuesta trae la promoción entera, así que
 * tras guardar o cambiar de estado no hace falta otra petición.
 */
@Component({
  selector: 'app-promocion-ficha',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    ErrorCargaComponent,
    IconComponent,
    InputComponent,
    KpiCardComponent,
    LoadingSkeletonComponent,
    MonedaPipe,
    RouterLink,
    SelectComponent,
    SwitchComponent, FechaClinicaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './promocion-ficha.component.html',
  styleUrl: './promocion-ficha.component.css',
})
export class PromocionFichaComponent {
  private readonly servicio = inject(PromocionesService);
  private readonly directorio = inject(DirectorioService);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();
  /** Algo cambió: el listado se vuelve a pedir. */
  readonly cambio = output<void>();
  readonly cerrar = output<void>();

  protected readonly estados = ESTADO_PROMOCION;
  protected readonly vigencias = VIGENCIA;
  protected readonly formatos = FORMATOS;
  protected readonly acciones = ACCION;
  protected readonly tiposBanner = TIPOS_IMAGEN_PUBLICA;
  protected readonly rangoVigencia = rangoVigencia;

  protected readonly detalle = httpResource<PromocionDetalle>(() => this.servicio.detalleRequest(this.id()));
  private readonly promocion = computed(() => (this.detalle.hasValue() ? this.detalle.value() : null));

  /* Los selectores: especialidades activas y fichas del directorio. */
  protected readonly especialidades = httpResource<RespuestaPaginada<EspecialidadCorta>>(() => this.directorio.especialidadesActivasRequest(), {
    defaultValue: paginaVacia<EspecialidadCorta>(),
  });
  protected readonly fichas = httpResource<RespuestaPaginada<FichaResumen>>(() => this.directorio.fichasParaElegirRequest(), {
    defaultValue: paginaVacia<FichaResumen>(),
  });
  protected readonly opcionesEspecialidad = computed(() => (this.especialidades.hasValue() ? this.especialidades.value().datos : []));

  /* ── Formulario: lo que se edita, reiniciado con cada versión guardada ── */
  protected readonly borrador = linkedSignal<PromocionDetalle | null, BorradorPromocion | null>({
    source: this.promocion,
    computation: p => (p ? borradorDe(p) : null),
  });
  protected readonly medicoIds = linkedSignal<PromocionDetalle | null, string[]>({
    source: this.promocion,
    computation: p => p?.medicos.map(m => m.id) ?? [],
  });
  protected readonly medicosElegibles = computed(() => {
    const elegidos = new Set(this.medicoIds());
    return this.fichas.hasValue() ? this.fichas.value().datos.filter(f => !elegidos.has(f.id)) : [];
  });
  protected readonly medicosElegidos = computed(() => {
    const p = this.promocion();
    const porId = new Map<string, string>();
    for (const m of p?.medicos ?? []) porId.set(m.id, m.nombrePublico);
    if (this.fichas.hasValue()) for (const f of this.fichas.value().datos) porId.set(f.id, f.nombrePublico);
    return this.medicoIds().map(id => ({ id, nombre: porId.get(id) ?? 'Médico' }));
  });

  /** Lo que cambió respecto de lo guardado, o por qué no se puede guardar. */
  private readonly revision = computed(() => {
    const p = this.promocion();
    const b = this.borrador();
    if (!p || !b) return null;
    const resultado = cambiosDe(p, b);
    const medicosAntes = p.medicos.map(m => m.id).sort().join(',');
    const medicosAhora = [...this.medicoIds()].sort().join(',');
    if ('error' in resultado) return { error: resultado.error, cambios: null };
    const cambios = medicosAntes === medicosAhora ? resultado.cambios : { ...resultado.cambios, medicoIds: this.medicoIds() };
    return { error: null, cambios };
  });
  protected readonly hayCambios = computed(() => {
    const r = this.revision();
    return !!r && (r.error !== null || Object.keys(r.cambios ?? {}).length > 0);
  });
  protected readonly errorFormulario = computed(() => this.revision()?.error ?? null);

  protected readonly guardando = signal(false);
  /** Otra persona guardó mientras se editaba: se ofrece recargar (y perder lo propio). */
  protected readonly conflicto = signal(false);
  protected readonly ocupada = signal<AccionPromocion | null>(null);
  protected readonly confirmando = linkedSignal<PromocionDetalle | null, AccionPromocion | null>({ source: this.promocion, computation: () => null });
  protected readonly motivo = signal('');

  /* ── Banners y anuncios ── */
  protected readonly textoAlternativo = linkedSignal<PromocionDetalle | null, string>({
    source: this.promocion,
    computation: p => (p ? `Promoción «${p.titulo}» de Clínica Montalvo` : ''),
  });
  protected readonly subiendo = signal<FormatoBanner | null>(null);
  protected readonly nuevoAnuncio = signal('');
  protected readonly anuncioValido = computed(() => ANUNCIO_ID.test(this.nuevoAnuncio().trim()));
  protected readonly trabajandoAnuncio = signal(false);

  protected banner(p: PromocionDetalle, formato: FormatoBanner) {
    return p.imagenes.find(i => i.formato === formato) ?? null;
  }

  protected editar<K extends keyof BorradorPromocion>(campo: K, valor: BorradorPromocion[K]): void {
    this.borrador.update(b => (b ? { ...b, [campo]: valor } : b));
  }

  protected agregarMedico(id: string): void {
    if (id && !this.medicoIds().includes(id)) this.medicoIds.update(ids => [...ids, id]);
  }

  protected quitarMedico(id: string): void {
    this.medicoIds.update(ids => ids.filter(m => m !== id));
  }

  protected descartar(): void {
    const p = this.promocion();
    if (!p) return;
    this.borrador.set(borradorDe(p));
    this.medicoIds.set(p.medicos.map(m => m.id));
  }

  protected async guardar(): Promise<void> {
    const p = this.promocion();
    const r = this.revision();
    if (!p || !r || r.error || !r.cambios || this.guardando()) return;
    this.guardando.set(true);
    try {
      this.actualizar(await this.servicio.actualizar(p.id, p.version, r.cambios));
      this.toast.success('Cambios guardados.');
    } catch (error) {
      if (esConflicto(error)) this.conflicto.set(true);
      this.toast.error(mensajeDeError(error, 'No se pudieron guardar los cambios.'));
    } finally {
      this.guardando.set(false);
    }
  }

  protected recargar(): void {
    this.conflicto.set(false);
    this.detalle.reload();
  }

  /** Las transiciones que no se deshacen piden un segundo clic, en línea. */
  protected pedir(accion: AccionPromocion): void {
    if (accion === 'devolver' || accion === 'archivar') {
      this.motivo.set('');
      this.confirmando.set(accion);
      return;
    }
    void this.ejecutar(accion);
  }

  protected async ejecutar(accion: AccionPromocion): Promise<void> {
    const p = this.promocion();
    if (!p || this.ocupada()) return;
    this.ocupada.set(accion);
    try {
      this.actualizar(await this.servicio.transicion(p.id, accion, accion === 'devolver' ? this.motivo().trim() : undefined));
      this.toast.success(this.acciones[accion].exito);
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo cambiar el estado.'));
      this.detalle.reload();
    } finally {
      this.ocupada.set(null);
      this.confirmando.set(null);
    }
  }

  protected async elegirBanner(formato: FormatoBanner, evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const archivo = campo.files?.[0];
    campo.value = '';
    const p = this.promocion();
    if (!archivo || !p) return;
    const problema = problemaDeImagen(archivo);
    if (problema) {
      this.toast.error(problema);
      return;
    }
    const alt = this.textoAlternativo().trim();
    if (alt.length < 3) {
      this.toast.error('Escribe qué muestra el banner (texto alternativo) antes de subirlo.');
      return;
    }
    this.subiendo.set(formato);
    try {
      this.actualizar(await this.servicio.subirBanner(p.id, formato, archivo, alt));
      this.toast.success('Banner subido.');
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo subir el banner.'));
    } finally {
      this.subiendo.set(null);
    }
  }

  protected async quitarBanner(formato: FormatoBanner): Promise<void> {
    const p = this.promocion();
    if (!p || this.subiendo()) return;
    this.subiendo.set(formato);
    try {
      this.actualizar(await this.servicio.quitarBanner(p.id, formato));
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo quitar el banner.'));
    } finally {
      this.subiendo.set(null);
    }
  }

  protected async enlazarAnuncio(): Promise<void> {
    const p = this.promocion();
    const anuncioId = this.nuevoAnuncio().trim();
    if (!p || !ANUNCIO_ID.test(anuncioId) || this.trabajandoAnuncio()) return;
    this.trabajandoAnuncio.set(true);
    try {
      this.actualizar(await this.servicio.asignarAnuncio(p.id, anuncioId));
      this.nuevoAnuncio.set('');
      this.toast.success('Anuncio enlazado: quien llegue por él se atribuye a esta promoción.');
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo enlazar el anuncio.'));
    } finally {
      this.trabajandoAnuncio.set(false);
    }
  }

  protected async quitarAnuncio(anuncioId: string): Promise<void> {
    const p = this.promocion();
    if (!p || this.trabajandoAnuncio()) return;
    this.trabajandoAnuncio.set(true);
    try {
      this.actualizar(await this.servicio.quitarAnuncio(p.id, anuncioId));
    } catch (error) {
      this.toast.error(mensajeDeError(error, 'No se pudo quitar el anuncio.'));
    } finally {
      this.trabajandoAnuncio.set(false);
    }
  }

  protected async copiarMensaje(texto: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      this.toast.success('Mensaje copiado.');
    } catch {
      this.toast.error('No se pudo copiar; selecciónalo y cópialo a mano.');
    }
  }

  /** La respuesta del servidor ya es la promoción entera: se pinta sin pedirla otra vez. */
  private actualizar(p: PromocionDetalle): void {
    this.conflicto.set(false);
    this.detalle.set(p);
    this.cambio.emit();
  }
}
