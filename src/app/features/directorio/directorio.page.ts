import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { puedeEditarAgendaClinica, puedeVerAgendaClinica } from '../../core/auth/roles';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgendaEspecialidadesComponent } from './components/agenda-especialidades/agenda-especialidades.component';
import { AgendaMedicosListaComponent } from './components/agenda-medicos-lista/agenda-medicos-lista.component';
import { EspecialidadesListaComponent } from './components/especialidades-lista/especialidades-lista.component';
import { MedicosListaComponent } from './components/medicos-lista/medicos-lista.component';
import { NuevaFichaComponent } from './components/nueva-ficha/nueva-ficha.component';
import { FichaMedico } from './directorio.model';

export type TabDirectorio = 'medicos' | 'especialidades' | 'web';

interface TabInfo {
  readonly id: TabDirectorio;
  readonly label: string;
  readonly icon: IconName;
  /** Las dos primeras leen la agenda de la clínica: solo quien gestiona citas. */
  readonly deAgenda: boolean;
}

export const TABS_DIRECTORIO: readonly TabInfo[] = [
  { id: 'medicos', label: 'Médicos', icon: 'user', deAgenda: true },
  { id: 'especialidades', label: 'Especialidades', icon: 'briefcase', deAgenda: true },
  { id: 'web', label: 'Fichas web', icon: 'external-link', deAgenda: false },
];

/** La pestaña pedida si este usuario la puede ver; si no, la primera que puede. */
export function tabDirectorioDe(valor: string | null | undefined, veAgenda: boolean): TabDirectorio {
  const visibles = TABS_DIRECTORIO.filter(t => veAgenda || !t.deAgenda);
  return visibles.find(t => t.id === valor)?.id ?? visibles[0].id;
}

/**
 * Directorio médico. «Médicos» y «Especialidades» son la AGENDA de la clínica
 * (ScriptCase): la única lista de médicos, la que da los cupos, la que lee
 * FileMaker y la que publica la reserva web. Se edita desde aquí (decisión del
 * propietario, 7/10/2026); ven quienes gestionan citas, editan recepción y
 * administración. «Fichas web» son las fichas de presentación de la landing
 * (foto, biografía), que se enlazarán a la agenda en la fase siguiente.
 *
 * Mismo patrón que Campañas: pestaña en la URL, pestañas montadas al
 * visitarlas, `?id=` abre una ficha web.
 */
@Component({
  selector: 'app-directorio-page',
  imports: [
    AgendaEspecialidadesComponent,
    AgendaMedicosListaComponent,
    ButtonComponent,
    EspecialidadesListaComponent,
    IconComponent,
    MedicosListaComponent,
    NuevaFichaComponent,
    PageHeaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './directorio.page.html',
})
export class DirectorioPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthService);
  private readonly nuevaTpl = viewChild.required<TemplateRef<unknown>>('nuevaTpl');
  private readonly listaAgenda = viewChild(AgendaMedicosListaComponent);
  private cajon?: OverlayRef;

  private readonly veAgenda = puedeVerAgendaClinica(this.auth.user()?.rol);
  protected readonly editaAgenda = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
  protected readonly editaWeb = this.auth.isAdmin;
  protected readonly tabs = TABS_DIRECTORIO.filter(t => this.veAgenda || !t.deAgenda);

  private readonly tabEnRuta = toSignal(this.route.queryParamMap.pipe(map(p => p.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  private readonly tabInicial = tabDirectorioDe(this.tabEnRuta(), this.veAgenda);
  protected readonly tabActiva = signal<TabDirectorio>(this.tabInicial);
  private readonly visitadas = signal<ReadonlySet<TabDirectorio>>(new Set([this.tabInicial]));

  constructor() {
    effect(() => this.mostrar(tabDirectorioDe(this.tabEnRuta(), this.veAgenda)));
  }

  protected estaMontada(tab: TabDirectorio): boolean {
    return this.visitadas().has(tab);
  }

  protected cambiarTab(tab: TabDirectorio): void {
    if (this.tabActiva() === tab) return;
    this.mostrar(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === this.tabs[0].id ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected nuevoMedico(): void {
    this.listaAgenda()?.abrirNuevo();
  }

  /** Una especialidad renombrada cambia la lista y el filtro de «Médicos». */
  protected especialidadesCambiaron(): void {
    this.listaAgenda()?.recargar();
  }

  protected abrirNuevaFicha(): void {
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.nuevaTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  protected cerrarNuevaFicha(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
  }

  /** Ficha web recién creada: se abre, para la foto y el horario. */
  protected alCrearFicha(f: FichaMedico): void {
    this.cerrarNuevaFicha();
    this.mostrar('web');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: 'web', id: f.id }, queryParamsHandling: 'merge' });
  }

  private mostrar(tab: TabDirectorio): void {
    this.tabActiva.set(tab);
    this.visitadas.update(vistas => (vistas.has(tab) ? vistas : new Set(vistas).add(tab)));
  }
}
