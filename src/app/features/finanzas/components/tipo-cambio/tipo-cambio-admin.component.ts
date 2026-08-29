import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/toast/toast.service';
import { BadgeComponent, BadgeVariant } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MESES } from '../../../planilla-comisiones/planilla.model';
import {
  ConfiguracionTipoCambio,
  DiaTipoCambio,
  ModoTipoCambio,
  MotivoSincronizacion,
  TipoCambioAdminService,
} from './tipo-cambio.service';

const FUENTE_BADGE: Record<DiaTipoCambio['fuente'], BadgeVariant> = {
  AUTOMATICO: 'info',
  MANUAL: 'success',
};

const FUENTE_LABEL: Record<DiaTipoCambio['fuente'], string> = {
  AUTOMATICO: 'Automático',
  MANUAL: 'Manual',
};

const MOTIVO_LABEL: Record<MotivoSincronizacion, string> = {
  ok: 'Actualizado',
  sin_cambios: 'El espejo ya tenía este valor guardado.',
  ya_hay_valor_manual: 'Hoy ya tiene una corrección manual: no se pisa automáticamente.',
  fetch_fallido: 'No se pudo contactar al espejo del BCB. Intenta de nuevo en un momento.',
  respuesta_invalida: 'El espejo respondió con un formato inesperado.',
};

/**
 * Pestaña "Tipo de Cambio" del hub de Finanzas — historial diario del TC oficial
 * USD→BOB (RF nuevo, 2026-08-25).
 *
 * Por qué existe: antes el único TC que veía todo el CRM fuera de una
 * liquidación cerrada era una constante escrita a mano (`TIPO_CAMBIO_DE_RESPALDO`
 * en `MonedaService`), y quedó en 6,97 mientras el oficial subía a 11,54 sin que
 * nada lo notara. Esta pantalla es la ventana a `TipoCambioDiario`: un valor por
 * día, alimentado por un sincronizador automático cada 6 h (espejo público del
 * BCB, que no tiene API propia) y corregible a mano en cualquier momento — la
 * corrección manual siempre le gana a la automática de ese mismo día.
 */
@Component({
  selector: 'app-tipo-cambio-admin',
  imports: [
    IconComponent,
    ButtonComponent,
    FilterChipComponent,
    InputComponent,
    BadgeComponent,
    LoadingSkeletonComponent,
    ErrorCargaComponent,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tipo-cambio-admin.component.html',
})
export class TipoCambioAdminComponent {
  /* ── Criterio de conversión (fijo o automático) ─────────────────────────
   *
   * La clínica opera a un tipo de cambio PACTADO: así se liquidan las
   * comisiones y así viene el `tc` del Excel. Con el modo AUTOMATICO el
   * selector Bs/$us de toda la app convertía con el oficial del día, que en
   * agosto de 2026 estaba un 71 % por encima de cualquier cifra pagada.
   *
   * Cambiar el modo NO reescribe nada: cada liquidación guarda el TC con el que
   * se calculó y se sigue leyendo con ese.
   */
  protected readonly configuracion = httpResource<ConfiguracionTipoCambio | undefined>(
    () => this.service.configuracionRequest(),
    { defaultValue: undefined },
  );

  protected readonly guardandoModo = signal(false);
  protected readonly valorFijoEditado = signal('');

  protected readonly esFijo = computed(() => this.configuracion.value()?.modo === 'FIJO');

  /** Cuánto se aparta el oficial del valor pactado, en %. `null` si no aplica. */
  protected readonly desvioOficial = computed(() => {
    const config = this.configuracion.value();
    if (!config || config.modo !== 'FIJO' || !config.oficialDelDia) return null;
    return Math.round(((config.oficialDelDia - config.valorFijo) / config.valorFijo) * 100);
  });

  protected async cambiarModo(modo: ModoTipoCambio): Promise<void> {
    if (this.configuracion.value()?.modo === modo) return;
    await this.guardarConfiguracion({ modo });
  }

  protected async guardarValorFijo(): Promise<void> {
    const valorFijo = Number(this.valorFijoEditado());
    if (!Number.isFinite(valorFijo) || valorFijo <= 0) {
      this.toast.error('El tipo de cambio debe ser un número mayor que cero.', 'Dato inválido');
      return;
    }
    await this.guardarConfiguracion({ valorFijo });
  }

  private async guardarConfiguracion(datos: {
    modo?: ModoTipoCambio;
    valorFijo?: number;
  }): Promise<void> {
    this.guardandoModo.set(true);
    try {
      await this.service.guardarConfiguracion(datos);
      this.configuracion.reload();
      /* El aviso dice qué se movió de verdad: esto cambia a la vez todas las
         cifras en bolivianos del CRM, y quien lo toca tiene que saberlo. */
      this.toast.success(
        'Todas las conversiones Bs/$us del CRM usan el nuevo criterio. Las liquidaciones ya ' +
          'calculadas conservan el suyo.',
        'Tipo de cambio actualizado',
      );
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo cambiar el tipo de cambio.'), 'Error');
    } finally {
      this.guardandoModo.set(false);
    }
  }

  private readonly service = inject(TipoCambioAdminService);
  private readonly toast = inject(ToastService);
  /* Cambiar el criterio es SUPER_ADMIN en el backend; acá solo se esconde el
     control para no ofrecer un botón que devolvería 403. */
  protected readonly esSuperAdmin = inject(AuthService).isSuperAdmin;

  protected readonly meses = MESES;
  protected readonly fuenteBadge = FUENTE_BADGE;
  protected readonly fuenteLabel = FUENTE_LABEL;

  private readonly hoy = new Date();
  protected readonly anio = signal(this.hoy.getFullYear());
  /** 1-12, a diferencia de `Date.getMonth()`. */
  protected readonly mes = signal(this.hoy.getMonth() + 1);

  protected readonly etiquetaMes = computed(() => `${this.meses[this.mes() - 1]} ${this.anio()}`);
  /** No se puede navegar a meses futuros: no hay TC oficial que mostrar todavía. */
  protected readonly esMesActual = computed(
    () => this.anio() === this.hoy.getFullYear() && this.mes() === this.hoy.getMonth() + 1,
  );

  protected readonly dias = httpResource<readonly DiaTipoCambio[]>(
    () => this.service.historialRequest(this.anio(), this.mes()),
    { defaultValue: [] },
  );

  protected readonly sincronizando = signal(false);

  protected readonly fechaEnEdicion = signal<string | null>(null);
  protected readonly valorEdicion = signal('');
  protected readonly guardando = signal(false);

  /** Solo es verdad para "cargar hoy a mano" antes de que exista su fila: el resto de ediciones parten de una fila ya listada. */
  protected readonly fechaEnEdicionEsNueva = computed(() => {
    const fecha = this.fechaEnEdicion();
    return fecha !== null && !this.dias.value().some(d => d.fecha === fecha);
  });

  protected mesAnterior(): void {
    if (this.mes() === 1) {
      this.mes.set(12);
      this.anio.update(a => a - 1);
    } else {
      this.mes.update(m => m - 1);
    }
  }

  protected mesSiguiente(): void {
    if (this.esMesActual()) return;
    if (this.mes() === 12) {
      this.mes.set(1);
      this.anio.update(a => a + 1);
    } else {
      this.mes.update(m => m + 1);
    }
  }

  /** dd/mm/aaaa para la columna — `fecha` llega "AAAA-MM-DD" (sin hora, evita líos de zona horaria). */
  protected formatearFecha(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  protected abrirEdicion(dia: DiaTipoCambio): void {
    this.fechaEnEdicion.set(dia.fecha);
    this.valorEdicion.set(dia.valor);
  }

  protected cancelarEdicion(): void {
    this.fechaEnEdicion.set(null);
    this.valorEdicion.set('');
  }

  protected async guardarEdicion(fecha: string): Promise<void> {
    const valor = Number(this.valorEdicion());
    if (!valor || valor <= 0) {
      this.toast.error('Ingresa un tipo de cambio válido.', 'Valor inválido');
      return;
    }

    this.guardando.set(true);
    try {
      await this.service.corregir(fecha, valor);
      this.cancelarEdicion();
      this.dias.reload();
      this.toast.success(`Tipo de cambio del ${this.formatearFecha(fecha)} corregido a ${valor}.`, 'Guardado');
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar la corrección.'), 'Error');
    } finally {
      this.guardando.set(false);
    }
  }

  /** Añade el día de hoy a la tabla aunque no tenga fila todavía, para poder cargarlo a mano. */
  protected abrirEdicionHoy(): void {
    const iso = this.hoy.toISOString().slice(0, 10);
    this.fechaEnEdicion.set(iso);
    this.valorEdicion.set('');
  }

  protected async sincronizarAhora(): Promise<void> {
    this.sincronizando.set(true);
    try {
      const resultado = await this.service.sincronizar();
      this.dias.reload();
      const mensaje = MOTIVO_LABEL[resultado.motivo];
      if (resultado.actualizado) {
        this.toast.success(mensaje, 'Sincronizado');
      } else {
        this.toast.info(mensaje, 'Sin cambios');
      }
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo sincronizar con el espejo del BCB.'), 'Error');
    } finally {
      this.sincronizando.set(false);
    }
  }
}
