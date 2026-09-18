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
  let esTelefono = false;

  const shell = () => ({
    topbar: fixture.nativeElement.querySelector('.topbar') as HTMLElement | null,
    sidebar: fixture.nativeElement.querySelector('.sidebar') as HTMLElement | null,
    workspace: fixture.nativeElement.querySelector('.workspace') as HTMLElement | null,
  });

  beforeEach(async () => {
    TestBed.resetTestingModule();
    esTelefono = false;
    /* `esMovil` del layout consulta `(max-width: 768px)`. Por defecto escritorio;
       `fingirTelefono()` lo cambia antes de montar. */
    vi.stubGlobal('matchMedia', (consulta: string) => ({
      matches: esTelefono && consulta.includes('max-width: 768px'),
      addEventListener() {},
      removeEventListener() {},
    }));
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

  /**
   * El menú del teléfono: el logo deja de abrirlo, «Más» pasa a hacerlo.
   *
   * Lo que hay que impedir aquí es una regresión concreta y cara: la barra
   * inferior lista 5 rutas y el menú 10, así que Clientes, Actividades,
   * Finanzas, Servicios, Líneas y Usuarios **solo** se alcanzan por el cajón.
   * Quitarle el disparador sin poner otro deja a una agente sin Clientes desde
   * el teléfono, y eso no lo cantaría ningún tipo ni ningún build.
   */
  describe('menú en el teléfono', () => {
    /** Vuelve a montar el shell haciéndole creer que la pantalla es un teléfono. */
    async function montarComoTelefono(): Promise<void> {
      esTelefono = true;
      TestBed.resetTestingModule();
      /* `innerWidth` además de `matchMedia`: el estado inicial del cajón y el
         cierre al tocar fuera lo consultan directamente. Sin esto el shell
         arranca como escritorio —con el cajón ya abierto— y la prueba mediría
         otra cosa. */
      vi.stubGlobal('innerWidth', 390);
      vi.stubGlobal('matchMedia', (consulta: string) => ({
        matches: consulta.includes('max-width: 768px'),
        addEventListener() {},
        removeEventListener() {},
      }));
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          provideRouter([{ path: 'a', component: PaginaA }]),
          { provide: PwaUpdateService, useValue: { actualizacionPendiente: signal(false), aplicarActualizacion: vi.fn() } },
          {
            provide: AuthService,
            useValue: {
              puedeGestionComercial: signal(false),
              isAdmin: signal(false),
              generacionSesion: signal(1),
              user: signal({ id: 'u1', nombre: 'Agente', rol: 'AGENTE', iniciales: 'A', foto: null }),
              logout: vi.fn(),
            },
          },
        ],
      });
      fixture = TestBed.createComponent(LayoutComponent);
      fixture.detectChanges();
      await fixture.whenStable();
    }

    const logo = () => fixture.nativeElement.querySelector('.logo-toggle-btn') as HTMLElement;
    const masBtn = () =>
      fixture.nativeElement.querySelector('button.mobile-nav-item') as HTMLElement | null;
    const cajonAbierto = () =>
      !!fixture.nativeElement.querySelector('.sidebar-expanded');

    it('8 · en el teléfono, el logo TAMBIÉN abre el menú', async () => {
      await montarComoTelefono();
      expect(cajonAbierto(), 'en el teléfono arranca cerrado').toBe(false);

      logo().click();
      fixture.detectChanges();

      /* Hay dos puertas a propósito: el logo, que es donde la gente ya iba, y
         «Más» en la barra inferior, que cae más cerca del pulgar. */
      expect(cajonAbierto()).toBe(true);
    });

    /**
     * Arrastrar el cajón hacia su borde para cerrarlo.
     *
     * Se prueba la lógica del gesto y no eventos táctiles reales: lo que se
     * rompió al escribirlo fue la máquina de estados —un desliz en diagonal
     * acababa arrastrando el cajón a mitad de un scroll de la lista—, y eso vive
     * aquí, no en el navegador.
     */
    describe('arrastrar para cerrar', () => {
      const toque = (x: number, y: number) =>
        ({ touches: [{ clientX: x, clientY: y }] }) as unknown as TouchEvent;

      /** Simula un dedo que parte de (200,300) y acaba en el punto dado. */
      function arrastrar(componente: LayoutComponent, hastaX: number, hastaY: number): void {
        componente['alTocarCajon'](toque(200, 300));
        componente['alArrastrarCajon'](toque(hastaX, hastaY));
        componente['alSoltarCajon']();
      }

      it('12 · un arrastre largo hacia la izquierda lo cierra', async () => {
        await montarComoTelefono();
        const c = fixture.componentInstance;
        logo().click();
        fixture.detectChanges();
        expect(cajonAbierto()).toBe(true);

        arrastrar(c, 60, 300); // 140px a la izquierda, por encima del umbral
        fixture.detectChanges();

        expect(cajonAbierto()).toBe(false);
      });

      it('13 · un arrastre corto NO lo cierra: vuelve a su sitio', async () => {
        await montarComoTelefono();
        const c = fixture.componentInstance;
        logo().click();
        fixture.detectChanges();

        arrastrar(c, 180, 300); // 20px: por debajo del umbral
        fixture.detectChanges();

        expect(cajonAbierto()).toBe(true);
        expect(c['desplazamientoCajon']()).toBeNull();
      });

      it('14 · un desliz VERTICAL no mueve el cajón — la lista scrollea', async () => {
        await montarComoTelefono();
        const c = fixture.componentInstance;
        logo().click();
        fixture.detectChanges();

        c['alTocarCajon'](toque(200, 300));
        c['alArrastrarCajon'](toque(190, 200)); // 10px en x, 100px en y

        /* Lo que hay que impedir: que el cajón siga a un dedo que en realidad
           está scrolleando la navegación. */
        expect(c['desplazamientoCajon']()).toBeNull();
        c['alSoltarCajon']();
        fixture.detectChanges();
        expect(cajonAbierto()).toBe(true);
      });

      it('15 · un diagonal que empieza vertical no se convierte en cierre a mitad', async () => {
        await montarComoTelefono();
        const c = fixture.componentInstance;
        logo().click();
        fixture.detectChanges();

        c['alTocarCajon'](toque(200, 300));
        c['alArrastrarCajon'](toque(190, 200));  // decide: vertical → ignorado
        c['alArrastrarCajon'](toque(20, 190));   // ahora sí va muy a la izquierda

        /* Una vez descartado, el gesto NO se reabre: era el fallo de la primera
           versión, que usaba un booleano en vez de tres estados. */
        expect(c['desplazamientoCajon']()).toBeNull();
        c['alSoltarCajon']();
        fixture.detectChanges();
        expect(cajonAbierto()).toBe(true);
      });
    });

    it('9 · «Más» de la barra inferior SÍ lo abre — es la única puerta que queda', async () => {
      await montarComoTelefono();
      expect(masBtn(), 'debe existir un botón en la barra inferior').not.toBeNull();

      masBtn()!.click();
      fixture.detectChanges();

      expect(cajonAbierto()).toBe(true);
    });

    it('10 · el menú sigue listando las rutas que la barra inferior NO lleva', async () => {
      await montarComoTelefono();
      masBtn()!.click();
      fixture.detectChanges();

      const destinos = Array.from(
        fixture.nativeElement.querySelectorAll('.sidebar a[href]'),
      ).map(a => (a as HTMLAnchorElement).getAttribute('href'));

      /* Con rol AGENTE. Si alguien recorta el menú, que falle aquí y no en el
         teléfono de una agente que no encuentra a su paciente. */
      expect(destinos).toContain('/clientes');
      expect(destinos).toContain('/actividades');
    });

    it('11 · en escritorio el logo SIGUE abriendo y cerrando el menú', () => {
      /* El montaje por defecto de esta suite es escritorio, donde el cajón
         arranca ABIERTO (240px, acoplado). Lo que se fija es que el logo
         alterne, no un valor absoluto. */
      const inicial = cajonAbierto();

      logo().click();
      fixture.detectChanges();
      expect(cajonAbierto()).toBe(!inicial);

      logo().click();
      fixture.detectChanges();
      expect(cajonAbierto()).toBe(inicial);
    });
  });
});
