import { OverlayRef } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, effect, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EspecialidadesListaComponent } from './components/especialidades-lista/especialidades-lista.component';
import { MedicosListaComponent } from './components/medicos-lista/medicos-lista.component';
import { NuevaFichaComponent } from './components/nueva-ficha/nueva-ficha.component';
import { FichaMedico } from './directorio.model';

export type TabDirectorio = 'medicos' | 'especialidades';

export const TABS_DIRECTORIO: readonly { readonly id: TabDirectorio; readonly label: string; readonly icon: IconName }[] = [
  { id: 'medicos', label: 'Médicos', icon: 'user' },
  { id: 'especialidades', label: 'Especialidades', icon: 'briefcase' },
];

export function tabDirectorioDe(valor: string | null | undefined): TabDirectorio {
  return TABS_DIRECTORIO.find(t => t.id === valor)?.id ?? 'medicos';
}

/**
 * Directorio médico: quién atiende, de qué y cuándo. Lo publicado lo muestra
 * la landing; recepción lo consulta para contestar («¿qué días atiende la
 * doctora?»). El horario es informativo: las citas siguen en la agenda de la
 * clínica. Editarlo es de administración (el backend lo exige).
 *
 * Mismo patrón que Campañas: pestaña en la URL, pestañas montadas al
 * visitarlas, `?id=` abre una ficha.
 */
@Component({
  selector: 'app-directorio-page',
  imports: [ButtonComponent, EspecialidadesListaComponent, IconComponent, MedicosListaComponent, NuevaFichaComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './directorio.page.html',
})
export class DirectorioPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly nuevaTpl = viewChild.required<TemplateRef<unknown>>('nuevaTpl');
  private cajon?: OverlayRef;

  protected readonly puedeEditar = inject(AuthService).isAdmin;
  protected readonly tabs = TABS_DIRECTORIO;

  private readonly tabEnRuta = toSignal(this.route.queryParamMap.pipe(map(p => p.get('tab'))), {
    initialValue: this.route.snapshot.queryParamMap.get('tab'),
  });
  private readonly tabInicial = tabDirectorioDe(this.tabEnRuta());
  protected readonly tabActiva = signal<TabDirectorio>(this.tabInicial);
  private readonly visitadas = signal<ReadonlySet<TabDirectorio>>(new Set([this.tabInicial]));

  constructor() {
    effect(() => this.mostrar(tabDirectorioDe(this.tabEnRuta())));
  }

  protected estaMontada(tab: TabDirectorio): boolean {
    return this.visitadas().has(tab);
  }

  protected cambiarTab(tab: TabDirectorio): void {
    if (this.tabActiva() === tab) return;
    this.mostrar(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'medicos' ? null : tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected abrirNueva(): void {
    this.cajon?.dispose();
    this.cajon = this.dialog.abrirCajon(this.nuevaTpl(), this.vcr, { onClose: () => (this.cajon = undefined) });
  }

  protected cerrarNueva(): void {
    this.cajon?.dispose();
    this.cajon = undefined;
  }

  /** Recién creada: a «Médicos», con su ficha abierta para el horario y la foto. */
  protected alCrear(f: FichaMedico): void {
    this.cerrarNueva();
    this.mostrar('medicos');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab: null, id: f.id }, queryParamsHandling: 'merge' });
  }

  private mostrar(tab: TabDirectorio): void {
    this.tabActiva.set(tab);
    this.visitadas.update(vistas => (vistas.has(tab) ? vistas : new Set(vistas).add(tab)));
  }
}
