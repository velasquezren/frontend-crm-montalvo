import '@angular/compiler';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreloadPorRol } from './preload-por-rol.strategy';
import { cubreRol, rolExigidoPor } from './roles';
import { RolUsuario } from './user.model';
import { routes } from '../../app.routes';

/**
 * Se prueba contra `app.routes.ts` REAL, no contra una lista copiada: una ruta
 * nueva con `exigeRol('ADMIN')` queda cubierta por estas pruebas el día que
 * alguien la escriba, sin tocar este archivo. Ese es el punto — la versión con
 * lista propia se desincroniza en el primer PR y deja de proteger nada.
 */
function rutasCargables(rs: readonly Route[]): Route[] {
  return rs.flatMap(r => [
    ...(r.loadComponent ? [r] : []),
    ...rutasCargables(r.children ?? []),
  ]);
}

const TODAS = rutasCargables(routes);
const CON_ROL = TODAS.filter(r => rolExigidoPor(r) !== undefined);
const SIN_ROL = TODAS.filter(r => rolExigidoPor(r) === undefined);

function sesion(rol: RolUsuario | null): PreloadPorRol {
  localStorage.clear();
  if (rol) {
    localStorage.setItem('crm_token', 'token-preload');
    localStorage.setItem(
      'crm_usuario',
      JSON.stringify({ id: 'U', nombre: 'U', email: 'u@preload.test', rol, iniciales: 'U', foto: null }),
    );
  }
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return TestBed.inject(PreloadPorRol);
}

/** Rutas cuyo chunk se descargaría de verdad con este rol. */
function precargadas(rol: RolUsuario | null): string[] {
  const estrategia = sesion(rol);
  return TODAS.filter(r => {
    const cargar = vi.fn(() => of(null));
    estrategia.preload(r, cargar).subscribe();
    return cargar.mock.calls.length > 0;
  }).map(r => r.path ?? '');
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('PreloadPorRol · solo se precarga lo que el rol puede abrir', () => {
  it('el fixture ve rutas con rol y rutas abiertas (si no, lo demás no prueba nada)', () => {
    expect(CON_ROL.length).toBeGreaterThan(0);
    expect(SIN_ROL.length).toBeGreaterThan(0);
  });

  it.each(['RECEPCION', 'AGENTE', 'ADMIN', 'SUPER_ADMIN'] as const)(
    'con rol %s se precarga exactamente lo que ese rol alcanza',
    rol => {
      const esperado = TODAS.filter(r => {
        const minimo = rolExigidoPor(r);
        return minimo === undefined || cubreRol(rol, minimo);
      }).map(r => r.path ?? '');

      expect(precargadas(rol)).toEqual(esperado);
    },
  );

  it('recepción dispone de WhatsApp y Actividades, sin módulos comerciales', () => {
    const permitidas = precargadas('RECEPCION');
    expect(permitidas).toContain('conversaciones');
    expect(permitidas).toContain('actividades');
    for (const ruta of ['clientes', 'leads', 'ventas', 'finanzas', 'usuarios']) expect(permitidas).not.toContain(ruta);
  });

  it('una AGENTE no descarga NINGUNA pantalla de ADMIN', () => {
    const deAdmin = CON_ROL.filter(r => !cubreRol('AGENTE', rolExigidoPor(r)!)).map(r => r.path ?? '');
    expect(deAdmin.length).toBeGreaterThan(0);
    expect(precargadas('AGENTE')).not.toEqual(expect.arrayContaining(deAdmin));
  });

  it('un SUPER_ADMIN sigue precargándolo todo, como antes', () => {
    expect(precargadas('SUPER_ADMIN')).toEqual(TODAS.map(r => r.path ?? ''));
  });

  it('sin sesión no se precarga nada con rol, pero lo abierto sí (login incluido)', () => {
    const sinSesion = precargadas(null);
    expect(sinSesion).toEqual(SIN_ROL.map(r => r.path ?? ''));
    expect(sinSesion.length).toBeGreaterThan(0);
  });

  it('bloquear NO consume la descarga: `cargar` no se llega a llamar', () => {
    const estrategia = sesion('AGENTE');
    const rutaAdmin = CON_ROL.find(r => !cubreRol('AGENTE', rolExigidoPor(r)!))!;
    const cargar = vi.fn(() => of('chunk'));

    estrategia.preload(rutaAdmin, cargar).subscribe();

    expect(cargar).not.toHaveBeenCalled();
  });
});

describe('rolExigidoPor · lee el rol del propio guard, sin `data` paralelo', () => {
  it('cada ruta con guard de rol declara su rol mínimo', () => {
    for (const r of CON_ROL) expect(rolExigidoPor(r)).toBeTruthy();
  });

  it('un canActivate ajeno a `exigeRol` no se adivina: la ruta queda abierta', () => {
    expect(rolExigidoPor({ path: 'x', canActivate: [() => true] })).toBeUndefined();
  });
});
