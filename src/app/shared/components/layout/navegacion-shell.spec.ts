import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../core/auth/auth.service';
import { PwaUpdateService } from '../../../core/pwa/pwa-update.service';
import { LayoutComponent } from './layout.component';

/**
 * El shell no se va cuando cambia la ruta.
 *
 * El síntoma que motivó esto era una navegación que "se sentía como un
 * refresh". No lo era: `LayoutComponent` es la ruta padre y sus hijos cambian
 * dentro del `router-outlet`, así que nada se remonta. Lo que pasaba es que
 * `withViewTransitions()` estaba activo sin CSS que lo acotara y el navegador
 * cross-fadeaba el documento ENTERO, barra lateral incluida.
 *
 * El fundido es CSS y no se prueba acá —una prueba de animación es frágil y no
 * dice nada—. Lo que sí se fija es la estructura de la que depende el arreglo:
 * si algún día el layout deja de ser la ruta padre, o alguien mete una
 * navegación con `window.location`, el fundido acotado deja de tener sentido y
 * estas pruebas caen primero.
 */

@Component({ template: '<h1>Página A</h1>', changeDetection: ChangeDetectionStrategy.OnPush })
class PaginaA {}

@Component({ template: '<h1>Página B</h1>', changeDetection: ChangeDetectionStrategy.OnPush })
class PaginaB {}

@Component({
  template: '<h1>Página que revienta</h1>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PaginaRota {
  constructor() {
    throw new Error('fallo al construir la página');
  }
}

describe('navegación: el shell sobrevive al cambio de ruta', () => {
  let fixture: ComponentFixture<LayoutComponent>;
  let router: Router;

  const shell = () => ({
    topbar: fixture.nativeElement.querySelector('.topbar') as HTMLElement | null,
    sidebar: fixture.nativeElement.querySelector('.sidebar') as HTMLElement | null,
    workspace: fixture.nativeElement.querySelector('.workspace') as HTMLElement | null,
  });

  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'a', component: PaginaA },
          { path: 'b', component: PaginaB },
          { path: 'rota', component: PaginaRota },
        ]),
        {
          /* El indicador de versión del shell inyecta esto, que a su vez pide
             `SwUpdate`: no hay service worker en una prueba. */
          provide: PwaUpdateService,
          useValue: { actualizacionPendiente: signal(false), aplicarActualizacion: vi.fn() },
        },
        {
          provide: AuthService,
          useValue: {
            /* `false` mantiene fuera la campana de notificaciones, que abriría
               un socket real: acá se prueba el shell, no el tiempo real. */
            puedeGestionComercial: signal(false),
            isAdmin: signal(false),
            generacionSesion: signal(1),
            user: signal({ id: 'u1', nombre: 'Agente', rol: 'AGENTE', iniciales: 'A', foto: null }),
            logout: vi.fn(),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(LayoutComponent);
    await router.navigate(['/a']);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('1 · la ruta cambia de verdad y el contenido se reemplaza', async () => {
    expect(fixture.nativeElement.textContent).toContain('Página A');

    await router.navigate(['/b']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.url).toBe('/b');
    expect(fixture.nativeElement.textContent).toContain('Página B');
    expect(fixture.nativeElement.textContent).not.toContain('Página A');
  });

  it('2 · el shell es el MISMO nodo del DOM antes y después de navegar', async () => {
    const antes = shell();
    expect(antes.topbar).not.toBeNull();
    expect(antes.sidebar).not.toBeNull();
    expect(antes.workspace).not.toBeNull();

    await router.navigate(['/b']);
    fixture.detectChanges();
    await fixture.whenStable();

    const despues = shell();
    /* Identidad de nodo, no solo "existe": si el layout se remontara, serían
       elementos distintos y el fundido acotado no serviría de nada. */
    expect(despues.topbar).toBe(antes.topbar);
    expect(despues.sidebar).toBe(antes.sidebar);
    expect(despues.workspace).toBe(antes.workspace);
  });

  it('3 · el shell lleva los nombres de View Transition que lo dejan quieto', () => {
    const { topbar, sidebar } = shell();
    /* Sin estos nombres, el navegador mete la cabecera y la barra en el snapshot
       `root` y las cross-fadea en cada navegación: ese era el "mini-refresh". */
    expect(getComputedStyle(topbar!).viewTransitionName).toBe('crm-topbar');
    expect(getComputedStyle(sidebar!).viewTransitionName).toBe('crm-sidebar');
  });

  it('4 · si una ruta falla al construirse, el shell sigue en pie', async () => {
    const antes = shell();

    await router.navigate(['/rota']).catch(() => undefined);
    fixture.detectChanges();
    await fixture.whenStable().catch(() => undefined);

    const despues = shell();
    expect(despues.topbar).toBe(antes.topbar);
    expect(despues.sidebar).toBe(antes.sidebar);
    expect(despues.workspace).toBe(antes.workspace);
  });

  it('6 · cambiar de página devuelve el contenido al principio', async () => {
    const { workspace } = shell();
    /* Quien scrollea es el workspace, no el documento: la restauración del
       navegador no lo toca y el scroll sobrevivía a la navegación. */
    workspace!.scrollTop = 400;

    await router.navigate(['/b']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(workspace!.scrollTop).toBe(0);
  });

  it('7 · un cambio de query param NO se trata como cambio de página', async () => {
    const { workspace } = shell();
    workspace!.scrollTop = 250;

    /* Conversaciones navega a `?id=…` cada vez que se abre un chat; eso no es
       cambiar de página y no debe saltar el scroll. */
    await router.navigate(['/a'], { queryParams: { id: 'abc' } });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(workspace!.scrollTop).toBe(250);
  });

  it('5 · navegar NO provoca una recarga del navegador', async () => {
    const recargar = vi.fn();
    const asignar = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: recargar, assign: asignar },
    });

    await router.navigate(['/b']);
    fixture.detectChanges();
    await fixture.whenStable();
    await router.navigate(['/a']);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(recargar).not.toHaveBeenCalled();
    expect(asignar).not.toHaveBeenCalled();
  });
});
