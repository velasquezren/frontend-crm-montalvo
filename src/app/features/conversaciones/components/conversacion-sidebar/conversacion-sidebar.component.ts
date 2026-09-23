import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef, ViewContainerRef } from '@angular/core';
import { OverlayRef } from '@angular/cdk/overlay';

import { CampanaOrigen, campanaOrigenDe } from '../../../../shared/models/campana-origen';
import { enlaceWhatsApp, enlaceLlamada } from '../../../../shared/models/telefono';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
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
import { edadDePaciente } from '../../../../core/api/edad';
import { aDatetimeLocal } from '../../../../core/api/fecha';
import { etiquetasDe, textoExtra } from '../../../../core/api/datos-extra';
import { mensajeDeError } from '../../../../core/api/http-error';
import { ToastService } from '../../../../core/toast/toast.service';
import { FormularioVentaComponent } from '../../../ventas/formulario-venta/formulario-venta.component';
import { Venta } from '../../../ventas/venta.model';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionResumen } from '../../conversacion.model';
import { InicialesClientePipe, NombreClientePipe } from '../../../../shared/pipes/nombre-cliente.pipe';
import { SelectComponent } from '../../../../shared/components/select/select.component';
import { CategoriaCliente } from '../../../../shared/models/cliente-categoria.model';

type ClienteChat = ConversacionResumen['cliente'];


/**
 * Ficha lateral del paciente y asignación de agente.
 * Se presenta como tercera columna en escritorio (>=1280px)
 * o como cajón desplegable en móvil y tablet.
 */
@Component({
  selector: 'app-conversacion-sidebar',
  imports: [
    FormularioVentaComponent,
    SelectComponent,
    InicialesClientePipe,
    NombreClientePipe,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
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

  /** El átomo emite `string`; la señal quiere el enum. Un solo sitio donde cae el cast. */
  protected cambiarCategoria(valor: string): void {
    if (valor) this.state.editCategoria.set(valor as CategoriaCliente);
  }

  protected enlaceWhatsApp(telefono: string): string {
    return enlaceWhatsApp(telefono);
  }

  protected enlaceLlamada(telefono: string): string {
    return enlaceLlamada(telefono);
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

  /** Era una copia de `obtenerEtiquetas` de Clientes, con otro nombre. */
  protected readonly tagsDe = etiquetasDe;

  protected readonly edadDe = edadDePaciente;

  /** Ver `campanaOrigenDe`. Era una copia de la del hilo y ya había divergido:
   *  leía cuatro campos donde la otra leía siete, así que el mismo chat
   *  mostraba distinto contexto según dónde lo miraras. */
  protected campanaDe(cliente: ClienteChat): CampanaOrigen | null {
    return campanaOrigenDe(cliente.datosExtra);
  }

  protected copiarTexto(texto: string, label: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(texto).then(
        () => this.toast.success(`${label} copiado al portapapeles.`),
        () => this.copiarFallback(texto, label),
      );
    } else {
      this.copiarFallback(texto, label);
    }
  }

  private copiarFallback(texto: string, label: string): void {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = texto;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.toast.success(`${label} copiado al portapapeles.`);
    } catch {
      this.toast.error(`No se pudo copiar ${label.toLowerCase()}.`);
    }
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

  /* ── Venta desde el chat: el MISMO formulario que la página de Ventas ──
     Era una copia y había divergido: no mandaba el lead de origen (0 de 18
     ventas atribuidas en producción), no frenaba el doble envío y leía «4.500»
     como Bs 4,50. Ver `FormularioVentaComponent`. */
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private activeOverlayRef?: OverlayRef;

  protected abrirModalVenta(template: TemplateRef<unknown>): void {
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => (this.activeOverlayRef = undefined),
    });
  }

  protected cerrarModalVenta(): void {
    const abierto = this.activeOverlayRef;
    this.activeOverlayRef = undefined;
    abierto?.dispose();
  }

  protected alRegistrarVenta(venta: Venta): void {
    this.cerrarModalVenta();
    this.toast.success(`Venta de ${venta.producto} registrada.`);
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
    this.activeOverlayRef = this.dialogService.abrirCajon(template, this.vcr, {
      onClose: () => {
        this.modalActividadAbierto.set(false);
        this.activeOverlayRef = undefined;
      },
    });
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
