import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { mensajeDeError } from '../../core/api/http-error';
import { ToastService } from '../../core/toast/toast.service';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { DrawerComponent } from '../../shared/components/drawer/drawer.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { KpiCardComponent } from '../../shared/components/kpi-card/kpi-card.component';
import { SwitchComponent } from '../../shared/components/switch/switch.component';
import { LineaWhatsapp } from './linea-whatsapp.model';
import { LineasWhatsappService } from './lineas-whatsapp.service';
import { MenuAtencionEditorComponent } from './menu-atencion-editor.component';
import { CobroLineaEditorComponent } from './cobro-linea-editor.component';

@Component({
  selector: 'app-lineas-whatsapp-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    ButtonComponent,
    InputComponent,
    BadgeComponent,
    TableComponent,
    PaginatorComponent,
    LoadingSkeletonComponent,
    ErrorCargaComponent,
    EmptyStateComponent,
    DrawerComponent,
    IconComponent,
    KpiCardComponent,
    SwitchComponent,
    MenuAtencionEditorComponent,
    CobroLineaEditorComponent,
  ],
  templateUrl: './lineas-whatsapp.page.html',
})
export class LineasWhatsappPage {
  private readonly service = inject(LineasWhatsappService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly toast = inject(ToastService);
  private overlay?: OverlayRef;
  protected readonly pagina = signal(1);
  protected readonly lineas = httpResource<RespuestaPaginada<LineaWhatsapp>>(
    () => this.service.listarRequest(this.pagina()),
    { defaultValue: paginaVacia<LineaWhatsapp>() },
  );
  /** Las dos cifras del resumen salen de la página ya cargada: cero peticiones
   *  nuevas (ver `crm-rendimiento`, «lo que mueve la aguja es no pedir»). */
  protected readonly totalConectadas = computed(
    () => this.lineas.value().datos.filter(l => l.conectada).length,
  );
  protected readonly totalPendientes = computed(
    () => this.lineas.value().datos.length - this.totalConectadas(),
  );

  protected readonly seleccionada = signal<LineaWhatsapp | null>(null);
  /** La línea cuyo menú de atención se edita, en su propio cajón. */
  protected readonly menuDe = signal<LineaWhatsapp | null>(null);
  /** La línea cuyo QR de cobro se edita, en su propio cajón. */
  protected readonly cobroDe = signal<LineaWhatsapp | null>(null);
  /** El editor abierto (menú o cobro) avisa si hay cambios sin guardar; cerrar con ellos pide confirmación. */
  protected readonly editorSinGuardar = signal(false);
  protected readonly nombre = signal('');
  protected readonly telefono = signal('');
  protected readonly phoneNumberId = signal('');
  protected readonly wabaId = signal('');
  protected readonly tokenEnv = signal('');
  protected readonly activa = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected editar(linea: LineaWhatsapp, template: TemplateRef<unknown>): void {
    this.seleccionada.set(linea);
    this.nombre.set(linea.nombre);
    this.telefono.set(linea.telefono ?? '');
    this.phoneNumberId.set(linea.phoneNumberId ?? '');
    this.wabaId.set(linea.wabaId ?? '');
    this.tokenEnv.set(linea.tokenEnv ?? '');
    this.activa.set(linea.activa);
    this.error.set('');
    this.overlay?.dispose();
    this.overlay = this.dialog.abrirCajon(template, this.vcr, { onClose: () => this.seleccionada.set(null) });
  }
  protected editarMenu(linea: LineaWhatsapp, template: TemplateRef<unknown>): void {
    this.menuDe.set(linea);
    this.editorSinGuardar.set(false);
    this.overlay?.dispose();
    this.overlay = this.dialog.abrirCajon(template, this.vcr, {
      onClose: () => {
        this.menuDe.set(null);
        this.editorSinGuardar.set(false);
      },
      puedeCerrar: () => this.descartarEditor(),
    });
  }
  /**
   * Salir de la página (Atrás, otro enlace) con el menú a medio editar pregunta
   * igual que cerrar el cajón: `beforeunload` no cubre la navegación interna.
   */
  puedeSalir(): boolean {
    return this.descartarEditor();
  }
  /** Sin cambios, cierra; con cambios, solo si se confirma descartarlos. */
  private descartarEditor(): boolean {
    return !this.editorSinGuardar() || window.confirm('Hay cambios sin guardar. ¿Cerrar y descartarlos?');
  }
  protected editarCobro(linea: LineaWhatsapp, template: TemplateRef<unknown>): void {
    if (!linea.comercial) return;
    this.cobroDe.set(linea);
    this.editorSinGuardar.set(false);
    this.overlay?.dispose();
    this.overlay = this.dialog.abrirCajon(template, this.vcr, {
      onClose: () => {
        this.cobroDe.set(null);
        this.editorSinGuardar.set(false);
      },
      puedeCerrar: () => this.descartarEditor(),
    });
  }
  protected cerrarCobro(): void {
    if (!this.descartarEditor()) return;
    this.overlay?.dispose();
    this.overlay = undefined;
    this.cobroDe.set(null);
    this.editorSinGuardar.set(false);
  }
  protected cerrarMenu(): void {
    if (!this.descartarEditor()) return;
    this.overlay?.dispose();
    this.overlay = undefined;
    this.menuDe.set(null);
    this.editorSinGuardar.set(false);
  }
  protected cerrar(): void {
    this.overlay?.dispose();
    this.overlay = undefined;
    this.seleccionada.set(null);
  }
  protected async guardar(event: Event): Promise<void> {
    event.preventDefault();
    const linea = this.seleccionada();
    if (!linea || this.guardando()) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      await this.service.actualizar(linea.id, {
        nombre: this.nombre().trim(),
        telefono: this.telefono().trim() || undefined,
        phoneNumberId: this.phoneNumberId().trim() || undefined,
        wabaId: this.wabaId().trim() || undefined,
        tokenEnv: this.tokenEnv().trim() || undefined,
        activa: this.activa(),
      });
      this.cerrar();
      this.lineas.reload();
      this.toast.success('Configuración de la línea guardada.');
    } catch (error) {
      this.error.set(mensajeDeError(error, 'No se pudo guardar la línea.'));
    } finally {
      this.guardando.set(false);
    }
  }
}
