import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, inject, output, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';

import { mensajeDeError } from '../../../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../../../core/api/pagination.model';
import { AuthService } from '../../../../core/auth/auth.service';
import { puedeEditarAgendaClinica } from '../../../../core/auth/roles';
import { ToastService } from '../../../../core/toast/toast.service';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DialogService } from '../../../../shared/components/dialog/dialog.service';
import { DrawerComponent } from '../../../../shared/components/drawer/drawer.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../../../shared/components/error-carga/error-carga.component';
import { FilterChipComponent } from '../../../../shared/components/filter-chip/filter-chip.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { SwitchComponent } from '../../../../shared/components/switch/switch.component';
import { TableComponent } from '../../../../shared/components/table/table.component';
import { EspecialidadAgenda } from '../../agenda-medicos.model';
import { AgendaMedicosService } from '../../agenda-medicos.service';

/** Para comparar nombres como lo hace la agenda: sin mayúsculas, tildes ni espacios de más. */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

type Filtro = 'todas' | 'conMedicos' | 'sinPagina';

/**
 * La pestaña «Especialidades»: las escritas en los médicos de la agenda (texto
 * libre, por eso hay casi-duplicados como «Pediatra» y «Pediatria»), cada una
 * con su entrada en la landing (sección «Especialidades» y grupo de «Staff
 * médico»). Renombrar con el nombre de otra las unifica, y la entrada acompaña. Una sola lista: la web no tiene especialidades
 * que la agenda no conozca.
 */
@Component({
  selector: 'app-agenda-especialidades',
  imports: [
    BadgeComponent,
    ButtonComponent,
    DrawerComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    FilterChipComponent,
    InputComponent,
    LoadingSkeletonComponent,
    SwitchComponent,
    TableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agenda-especialidades.component.html',
})
export class AgendaEspecialidadesComponent {
  private readonly servicio = inject(AgendaMedicosService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly paginaTpl = viewChild.required<TemplateRef<unknown>>('paginaTpl');
  private cajon?: OverlayRef;

  /** Avisa a la pestaña de médicos: sus especialidades cambiaron. */
  readonly cambio = output<void>();

  protected readonly puedeEditar = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly especialidades = httpResource<RespuestaPaginada<EspecialidadAgenda>>(() => this.servicio.especialidadesRequest(), {
    defaultValue: paginaVacia<EspecialidadAgenda>(),
  });
  private readonly todas = computed(() => (this.especialidades.hasValue() ? this.especialidades.value().datos : []));

  protected readonly filtro = signal<Filtro>('conMedicos');
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    return this.todas().filter(e => (f === 'todas' ? true : f === 'conMedicos' ? e.activos > 0 : e.activos > 0 && !e.pagina));
  });
  protected readonly cuenta = computed(() => ({
    todas: this.todas().length,
    conMedicos: this.todas().filter(e => e.activos > 0).length,
    sinPagina: this.todas().filter(e => e.activos > 0 && !e.pagina).length,
  }));

  /* ── Renombrar / unificar (en la fila) ── */
  protected readonly editando = signal<string | null>(null);
  protected readonly nuevoNombre = signal('');
  protected readonly ocupado = signal(false);

  /** Si el nombre nuevo ya existe, se unifican: se avisa antes de guardar. */
  protected readonly unificaCon = computed(() => {
    const actual = this.editando();
    const nuevo = normalizar(this.nuevoNombre());
    if (!actual || !nuevo) return null;
    return this.todas().find(e => e.nombre !== actual && normalizar(e.nombre) === nuevo) ?? null;
  });

  protected editar(e: EspecialidadAgenda): void {
    this.editando.set(e.nombre);
    this.nuevoNombre.set(e.nombre);
  }

  protected cancelar(): void {
    this.editando.set(null);
  }

  protected async renombrar(): Promise<void> {
    const actual = this.editando();
    const nueva = this.nuevoNombre().trim();
    if (!actual || !nueva || nueva === actual || this.ocupado()) return;
    await this.trabajar(async () => {
      const r = await this.servicio.renombrarEspecialidad(actual, this.unificaCon()?.nombre ?? nueva);
      this.editando.set(null);
      return `${r.medicos} ${r.medicos === 1 ? 'médico actualizado' : 'médicos actualizados'}.`;
    });
  }

  /* ── Páginas web ── */

  protected crearPagina(e: EspecialidadAgenda): Promise<void> {
    return this.trabajar(async () => {
      await this.servicio.crearPaginas([e.nombre]);
      return `«${e.nombre}» ya se muestra en la web. Escríbele una descripción.`;
    });
  }

  /** Las que tienen médicos activos y todavía no tienen página. */
  protected crearFaltantes(): Promise<void> {
    const nombres = this.todas().filter(e => e.activos > 0 && !e.pagina).map(e => e.nombre);
    if (nombres.length === 0) return Promise.resolve();
    return this.trabajar(async () => {
      const r = await this.servicio.crearPaginas(nombres);
      return `${r.creadas} ${r.creadas === 1 ? 'especialidad se muestra' : 'especialidades se muestran'} ahora en la web.`;
    });
  }

  /* El editor de la página: descripción, orden y si se muestra. */
  protected readonly editandoPagina = signal<EspecialidadAgenda | null>(null);
  protected readonly descripcion = signal('');
  protected readonly orden = signal('0');
  protected readonly activa = signal(true);
  protected readonly faltaPagina = computed(() => (/^\d{1,4}$/.test(this.orden().trim()) ? null : 'El orden es un número (0 va primero).'));

  protected abrirPagina(e: EspecialidadAgenda): void {
    if (!e.pagina) return;
    this.editandoPagina.set(e);
    this.descripcion.set(e.pagina.descripcion);
    this.orden.set(String(e.pagina.orden));
    this.activa.set(e.pagina.activa);
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.paginaTpl(), this.vcr, {
      onClose: () => {
        this.cajon = undefined;
        this.editandoPagina.set(null);
      },
    });
  }

  protected cerrarPagina(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
    this.editandoPagina.set(null);
  }

  protected async guardarPagina(): Promise<void> {
    const pagina = this.editandoPagina()?.pagina;
    if (!pagina || this.faltaPagina()) return;
    await this.trabajar(async () => {
      await this.servicio.actualizarPagina(pagina.id, { descripcion: this.descripcion().trim(), orden: Number(this.orden().trim()), activa: this.activa() });
      this.cerrarPagina();
      return 'Guardado.';
    });
  }

  private async trabajar(accion: () => Promise<string>): Promise<void> {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      this.toast.success(await accion(), 'Listo');
      this.especialidades.reload();
      this.cambio.emit();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    } finally {
      this.ocupado.set(false);
    }
  }
}
