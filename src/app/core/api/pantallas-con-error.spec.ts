import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, ErrorHandler, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../auth/auth.service';
import { NotificacionNativaService } from '../notification/notificacion-nativa.service';
import { RealtimeService } from '../realtime/realtime.service';
import { ActividadesPage } from '../../features/actividades/actividades.page';
import { ClientesPage } from '../../features/clientes/clientes.page';
import { LeadsPage } from '../../features/leads/leads.page';
import { LineasWhatsappPage } from '../../features/lineas-whatsapp/lineas-whatsapp.page';
import { PerfilPage } from '../../features/perfil/perfil.page';
import { ResultadosPage } from '../../features/resultados/resultados.page';
import { ServiciosPage } from '../../features/servicios/servicios.page';
import { VentasPage } from '../../features/ventas/ventas.page';

/*
 * Con el servidor fallando, cada pantalla tiene que llegar a su «Reintentar».
 * El 2026-10-09 nueve no llegaban: un contador o un KPI ARRIBA de la tabla leía
 * `value()` de la carga en error, que en Angular 21 LANZA, y la plantilla se
 * rompía antes de pintar la rama de error. Aquí TODAS las peticiones fallan.
 */
const usuario = signal({ id: 'admin-1', nombre: 'Admin de prueba', email: 'admin@prueba.test', rol: 'SUPER_ADMIN' as const });
const auth = {
  user: usuario, isAuthenticated: computed(() => true), generacionSesion: signal(1),
  isAdmin: computed(() => true), isSuperAdmin: computed(() => true), puedeGestionComercial: computed(() => true),
  token: 'token-de-prueba',
};

describe('cada pantalla con el servidor caído muestra su error, sin romperse', () => {
  const errores = vi.fn();
  afterEach(() => errores.mockReset());

  /* Lo que dice cada una. Ventas: su tabla va en un `@defer (on viewport)` que la
     prueba no dispara; lo que se ve son las tarjetas, que dicen que no se pudo. */
  it.each<[string, Type<unknown>, string]>([
    ['Clientes', ClientesPage, 'Reintentar'],
    ['Ventas', VentasPage, 'No se pudo calcular'],
    ['Leads', LeadsPage, 'Reintentar'],
    ['Actividades', ActividadesPage, 'Reintentar'],
    ['Líneas WhatsApp', LineasWhatsappPage, 'Reintentar'],
    ['Historial de servicios', ServiciosPage, 'Reintentar'],
    ['Perfil', PerfilPage, 'Reintentar'],
    ['Resultados', ResultadosPage, 'Reintentar'],
  ])('%s', async (_nombre, pagina, aviso) => {
    /* El `@defer (on viewport)` de Ventas lo pide y el entorno de pruebas no lo trae. */
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    /* La página va en `imports`: Ventas tiene un `@defer` y sin esto su
       metadata queda sin resolver (ver correccion-de-origen.spec.ts). */
    TestBed.configureTestingModule({ imports: [pagina], providers: [
      provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: RealtimeService, useValue: { actividad: signal(null), conectado: signal(true), recordatorio: signal(null) } },
      { provide: ErrorHandler, useValue: { handleError: errores } },
      { provide: NotificacionNativaService, useValue: { permiso: signal('default'), suscrito: signal(false), soportado: signal(false) } },
    ] });
    await TestBed.compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(pagina);
    for (let vuelta = 0; vuelta < 6; vuelta++) {
      fixture.detectChanges();
      for (let i = 0; i < 3; i++) { await Promise.resolve(); TestBed.tick(); }
      for (const pedido of http.match(() => true)) {
        if (!pedido.cancelled) pedido.flush({ message: 'Servidor caído' }, { status: 503, statusText: 'Unavailable' });
      }
    }
    fixture.detectChanges();

    expect(errores.mock.calls.map(c => String(c[0]))).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(aviso);
    fixture.destroy();
  });
});
