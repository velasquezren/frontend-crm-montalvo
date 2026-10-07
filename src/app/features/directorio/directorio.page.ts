import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { puedeEditarAgendaClinica } from '../../core/auth/roles';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { IconComponent, IconName } from '../../shared/components/icon/icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgendaEspecialidadesComponent } from './components/agenda-especialidades/agenda-especialidades.component';
import { AgendaMedicosListaComponent } from './components/agenda-medicos-lista/agenda-medicos-lista.component';
import { EspecialidadesListaComponent } from './components/especialidades-lista/especialidades-lista.component';

export type TabDirectorio = 'medicos' | 'especialidades';

export const TABS_DIRECTORIO: readonly { readonly id: TabDirectorio; readonly label: string; readonly icon: IconName }[] = [
  { id: 'medicos', label: 'Médicos', icon: 'user' },
  { id: 'especialidades', label: 'Especialidades', icon: 'briefcase' },
];

export function tabDirectorioDe(valor: string | null | undefined): TabDirectorio {
  return TABS_DIRECTORIO.find(t => t.id === valor)?.id ?? 'medicos';
}

/**
 * Directorio médico: los médicos de la AGENDA de la clínica (ScriptCase), la
 * única lista —da los cupos, la lee FileMaker y la publica la reserva web—.
 * Cada médico tiene en su ficha sus datos, la grilla de horario y su ficha web
 * (foto, biografía, publicación). Decisión del propietario (7/10/2026): se edita
 * desde aquí; editan recepción y administración, el resto lo consulta.
 *
 * Mismo patrón que Campañas: pestaña en la URL, pestañas montadas al visitarlas.
 */
@Component({
  selector: 'app-directorio-page',
  imports: [AgendaEspecialidadesComponent, AgendaMedicosListaComponent, ButtonComponent, EspecialidadesListaComponent, IconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './directorio.page.html',
})
export class DirectorioPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly listaAgenda = viewChild(AgendaMedicosListaComponent);

  protected readonly editaAgenda = computed(() => puedeEditarAgendaClinica(this.auth.user()?.rol));
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

  protected nuevoMedico(): void {
    this.listaAgenda()?.abrirNuevo();
  }

  /** Una especialidad renombrada cambia la lista y el filtro de «Médicos». */
  protected especialidadesCambiaron(): void {
    this.listaAgenda()?.recargar();
  }

  private mostrar(tab: TabDirectorio): void {
    this.tabActiva.set(tab);
    this.visitadas.update(vistas => (vistas.has(tab) ? vistas : new Set(vistas).add(tab)));
  }
}
