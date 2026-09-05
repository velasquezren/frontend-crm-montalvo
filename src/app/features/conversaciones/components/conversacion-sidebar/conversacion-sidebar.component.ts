import { ChangeDetectionStrategy, Component, computed, inject, signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';

import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import {
  TIPO_ACTIVIDAD_ICONO,
  TIPO_ACTIVIDAD_DURACION_SUGERIDA,
  TIPO_ACTIVIDAD_LABEL,
  TipoActividad,
} from '../../../actividades/actividad.model';
import { ActividadesService } from '../../../actividades/actividades.service';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
} from '../../../../shared/models/cliente-categoria.model';
import { generarIniciales } from '../../../../core/auth/user.model';
import { ROL_LABEL } from '../../../../core/auth/roles';
import { calcularEdad } from '../../../../core/api/edad';
import { aDatetimeLocal } from '../../../../core/api/fecha';
import { listaExtra, textoExtra } from '../../../../core/api/datos-extra';
import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { ComprobanteSubido, MetodoPagoVenta } from '../../../ventas/venta.model';
import { VentasService } from '../../../ventas/ventas.service';
import { METODOS_PAGO } from '../../../ventas/ventas.page';
import {
  CATALOGO_VACIO,
  filtrarMedicos,
  filtrarServicios,
  moduloDeServicio,
} from '../../../ventas/catalogo.util';
import { CatalogoClinico } from '../../../ventas/venta.model';
import { httpResource } from '@angular/common/http';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionResumen } from '../../conversacion.model';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';

type ClienteChat = ConversacionResumen['cliente'];

function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

/**
 * Ficha lateral del paciente y asignación de agente.
 * Se presenta como tercera columna en escritorio (>=1280px)
 * o como cajón desplegable en móvil y tablet.
 */
@Component({
  selector: 'app-conversacion-sidebar',
  imports: [
    InicialesClientePipe,
    NombreClientePipe,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    FilterChipComponent,
    IconComponent,
    InputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-sidebar.component.html',
  styleUrl: './conversacion-sidebar.component.css',
})
export class ConversacionSidebarComponent {
  protected readonly state = inject(ConversacionesStateService);
  private readonly toast = inject(ToastService);

  /* ── Helpers visuales ──────────────────────────────────────────── */
  /** Nunca comparar `rol === 'ADMIN'` a mano en la plantilla (deja fuera a SUPER_ADMIN). */
  protected readonly rolLabel = ROL_LABEL;
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

  protected enlaceWhatsApp(telefono: string): string {
    return `https://wa.me/${soloDigitos(telefono)}`;
  }

  protected enlaceLlamada(telefono: string): string {
    return `tel:+${soloDigitos(telefono)}`;
  }

  protected empresaDe(cliente: ClienteChat): string {
    return cliente.empresaTrabajo || textoExtra(cliente.datosExtra, 'empresa');
  }

  protected lugarNacimientoDe(cliente: ClienteChat): string {
    return cliente.ciLugar || textoExtra(cliente.datosExtra, 'lugarNacimiento', 'CI.Lug.Pac');
  }

  protected ocupacionDe(cliente: ClienteChat): string {
    return cliente.ocupacion || textoExtra(cliente.datosExtra, 'ocupacion', 'Profesion');
  }

  protected notasDe(cliente: ClienteChat): string {
    return textoExtra(cliente.datosExtra, 'notas');
  }

  protected tagsDe(cliente: ClienteChat): string[] {
    const directIntereses = cliente.intereses?.map(i => i.descripcion) ?? [];
    const tagsExtra = listaExtra(cliente.datosExtra, 'tags', 'intereses');
    return [...new Set([...directIntereses, ...tagsExtra])];
  }

  protected edadDe(cliente: ClienteChat): string | null {
    return calcularEdad(cliente.fechaNacimiento);
  }

  protected campanaDe(cliente: ClienteChat): { titular?: string; anuncioId?: string; cuerpo?: string; origenUrl?: string } | null {
    const raw = cliente.datosExtra?.['campanaOrigen'];
    if (raw && typeof raw === 'object') {
      const c = raw as Record<string, unknown>;
      const titular = typeof c['titular'] === 'string' ? c['titular'] : undefined;
      const anuncioId = typeof c['anuncioId'] === 'string' ? c['anuncioId'] : undefined;
      const cuerpo = typeof c['cuerpo'] === 'string' ? c['cuerpo'] : undefined;
      const origenUrl = typeof c['origenUrl'] === 'string' ? c['origenUrl'] : undefined;
      if (titular || anuncioId || cuerpo) {
        return { titular, anuncioId, cuerpo, origenUrl };
      }
    }
    return null;
  }

  protected copiarTexto(texto: string, label: string): void {
    navigator.clipboard.writeText(texto).then(() => {
      this.toast.success(`${label} copiado al portapapeles.`);
    });
  }

  protected tiempoRelativo(fecha: string): string {
    const ahora = Date.now();
    const diff = ahora - new Date(fecha).getTime();
    const minutos = Math.floor(diff / 60000);

    if (minutos < 1) return 'Ahora';
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
  }

  protected readonly metodosPago = METODOS_PAGO;

  /* ── Modal de Venta Rápida desde el Chat ───────────────────────── */
  private readonly ventasService = inject(VentasService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  private activeOverlayRef?: OverlayRef;

  protected readonly modalVentaAbierto = signal(false);
  protected readonly productoVenta = signal<string>('');
  protected readonly montoVenta = signal<string>('');
  protected readonly metodoPagoVenta = signal<MetodoPagoVenta>('QR');
  protected readonly comprobanteVenta = signal<string>('');
  protected readonly medicoVenta = signal<string>('');
  protected readonly notasVenta = signal<string>('');
  protected readonly guardandoVenta = signal(false);
  protected readonly errorVenta = signal('');

  protected readonly subiendoComprobante = signal(false);
  protected readonly comprobanteSubido = signal<ComprobanteSubido | null>(null);
  protected readonly archivoNombre = signal<string | null>(null);

  /* El mismo catálogo real que usa la página de Ventas: se pide al abrir el
     modal, no al abrir el chat. */
  protected readonly catalogo = httpResource<CatalogoClinico>(
    () => (this.modalVentaAbierto() ? this.ventasService.catalogoRequest() : undefined),
    { defaultValue: CATALOGO_VACIO },
  );

  protected readonly sugerenciasModulo = computed(() =>
    filtrarServicios(this.catalogo.value(), this.productoVenta()),
  );

  protected readonly medicosSugeridos = computed(() =>
    filtrarMedicos(this.catalogo.value(), this.medicoVenta()),
  );

  protected readonly moduloDetectado = computed(() =>
    moduloDeServicio(this.catalogo.value(), this.productoVenta()),
  );

  protected abrirModalVenta(template: TemplateRef<unknown>): void {
    this.productoVenta.set('');
    this.montoVenta.set('');
    this.comprobanteVenta.set('');
    this.medicoVenta.set('');
    this.notasVenta.set('');
    this.errorVenta.set('');
    this.archivoNombre.set(null);
    this.comprobanteSubido.set(null);
    this.modalVentaAbierto.set(true);
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
  }

  protected cerrarModalVenta(): void {
    this.modalVentaAbierto.set(false);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected seleccionarSugerenciaVenta(sug: string): void {
    this.productoVenta.set(sug);
  }

  protected async onArchivoComprobante(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    this.archivoNombre.set(file.name);
    this.subiendoComprobante.set(true);
    this.errorVenta.set('');

    try {
      const res = await this.ventasService.subirComprobante(file);
      this.comprobanteSubido.set(res);
    } catch (err) {
      this.errorVenta.set(mensajeDeError(err, 'No se pudo subir el comprobante'));
      this.archivoNombre.set(null);
      this.comprobanteSubido.set(null);
    } finally {
      this.subiendoComprobante.set(false);
    }
  }

  protected quitarComprobante(): void {
    this.archivoNombre.set(null);
    this.comprobanteSubido.set(null);
  }

  protected async guardarVenta(event: Event, clienteId: string): Promise<void> {
    event.preventDefault();
    this.errorVenta.set('');

    const monto = Number(this.montoVenta());
    if (!this.productoVenta().trim()) {
      this.errorVenta.set('Indica el procedimiento o servicio vendido.');
      return;
    }
    if (!monto || monto <= 0) {
      this.errorVenta.set('Ingresa un monto válido en Bs.');
      return;
    }

    const subido = this.comprobanteSubido();

    this.guardandoVenta.set(true);
    try {
      await this.ventasService.crear({
        clienteId,
        producto: this.productoVenta().trim(),
        monto,
        metodoPago: this.metodoPagoVenta(),
        comprobante: this.comprobanteVenta().trim() || undefined,
        comprobanteKey: subido?.comprobanteKey,
        comprobanteMime: subido?.comprobanteMime,
        comprobanteNombre: subido?.comprobanteNombre,
        medico: this.medicoVenta().trim() || undefined,
        modulo: this.moduloDetectado() || undefined,
        notas: this.notasVenta().trim() || undefined,
      });

      this.toast.success(`Venta de ${this.productoVenta()} (Bs ${monto}) registrada con éxito.`);
      this.cerrarModalVenta();
    } catch (err) {
      this.errorVenta.set(mensajeDeError(err, 'No se pudo registrar la venta.'));
    } finally {
      this.guardandoVenta.set(false);
    }
  }

  protected togglePanel(): void {
    this.state.panelAbierto.update(v => !v);
  }

  protected toggleDropdownAgente(): void {
    this.state.dropdownAgenteAbierto.update(v => !v);
  }

  /**
   * ── Modal de Actividad Rápida desde el Chat ──────────────────────
   *
   * Mismo criterio que "Venta Rápida" arriba: la agente ya está viendo al
   * paciente, no tiene que ir a /actividades y volver a buscarlo. A
   * propósito NO incluye buscador de cliente ni selector de lead — el
   * cliente ya se conoce por la conversación abierta, y complicar un
   * "recordatorio rápido" con más campos es la forma más segura de que
   * nadie lo use.
   */
  private readonly actividadesService = inject(ActividadesService);

  protected readonly tiposActividad: readonly TipoActividad[] = ['LLAMADA', 'REUNION', 'TAREA', 'RECORDATORIO'];
  protected readonly tipoActividadLabel = TIPO_ACTIVIDAD_LABEL;
  protected readonly tipoActividadIcono = TIPO_ACTIVIDAD_ICONO;

  protected readonly modalActividadAbierto = signal(false);
  protected readonly tipoActividad = signal<TipoActividad>('LLAMADA');
  protected readonly tituloActividad = signal('');
  protected readonly fechaActividad = signal('');
  protected readonly notasActividad = signal('');
  protected readonly guardandoActividad = signal(false);
  protected readonly errorActividad = signal('');

  protected abrirModalActividad(template: TemplateRef<unknown>): void {
    this.tipoActividad.set('LLAMADA');
    this.tituloActividad.set('');
    this.fechaActividad.set(aDatetimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
    this.notasActividad.set('');
    this.errorActividad.set('');
    this.modalActividadAbierto.set(true);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
  }

  protected cerrarModalActividad(): void {
    this.modalActividadAbierto.set(false);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  protected async guardarActividadRapida(event: Event, clienteId: string): Promise<void> {
    event.preventDefault();
    this.errorActividad.set('');

    if (this.tituloActividad().trim().length < 3) {
      this.errorActividad.set('El título necesita al menos 3 caracteres.');
      return;
    }

    this.guardandoActividad.set(true);
    try {
      await this.actividadesService.crear({
        tipo: this.tipoActividad(),
        titulo: this.tituloActividad().trim(),
        notas: this.notasActividad().trim() || undefined,
        fechaProgramada: new Date(this.fechaActividad()).toISOString(),
        // Sin control propio en este modal rápido — se sugiere sola por tipo,
        // igual que el modal completo antes de que la persona la toque.
        duracionMinutos: TIPO_ACTIVIDAD_DURACION_SUGERIDA[this.tipoActividad()],
        clienteId,
      });
      this.toast.success('Recordatorio agendado.');
      this.cerrarModalActividad();
    } catch (err) {
      this.errorActividad.set(mensajeDeError(err, 'No se pudo agendar la actividad.'));
    } finally {
      this.guardandoActividad.set(false);
    }
  }
}
