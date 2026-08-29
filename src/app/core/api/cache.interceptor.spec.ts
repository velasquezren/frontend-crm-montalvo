import '@angular/compiler';
import { describe, expect, it } from 'vitest';

import { esDeReferencia } from './cache.interceptor';

/**
 * Qué entra en la caché de 60 s y qué no.
 *
 * La regla del interceptor es que solo se cachean **datos de referencia** —los
 * que cambian al importar o configurar algo—, nunca la operación del día. Pero
 * la comprobación era `url.includes(ruta)`, e `includes` no distingue una
 * colección de sus hijos: `/planilla-comisiones/periodos` casaba también con
 * todo lo que cuelga de un periodo concreto.
 *
 * No saltaba a la vista porque cualquier escritura vacía la caché entera, así
 * que trabajando solo casi nunca se ve nada viejo. Se nota cuando el cambio lo
 * hace otra persona: dos SUPER_ADMIN revisando el mismo mes, uno aprueba y el
 * otro sigue viendo "falta su firma" hasta un minuto, con el botón de aprobar
 * puesto sobre un mes que en realidad ya está cerrado.
 */
describe('esDeReferencia', () => {
  const api = (ruta: string) => `https://api.clinica.test${ruta}`;

  describe('sí se cachea', () => {
    it('la lista de periodos, que piden tres servicios distintos', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos'))).toBe(true);
    });

    /* La clave de caché incluye los parámetros, así que `?limite=100` y
       `?limite=10` no se pisan. Lo que no puede pasar es que un parámetro
       impida reconocer la ruta. */
    it('la lista de periodos con parámetros', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos?limite=100'))).toBe(true);
    });

    it('la configuración y las vendedoras', () => {
      expect(esDeReferencia(api('/planilla-comisiones/configuracion'))).toBe(true);
      expect(esDeReferencia(api('/planilla-comisiones/vendedoras'))).toBe(true);
    });

    it('los agregados de servicios', () => {
      expect(esDeReferencia(api('/servicios/demografia'))).toBe(true);
    });
  });

  describe('NO se cachea lo que cuelga de un periodo concreto', () => {
    /* El caso que estropeaba el panel de cierre: quién aprobó y quién falta
       cambia cuando otra persona pulsa un botón, no cuando se importa un mes. */
    it('el estado de revisión de un mes', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos/abc-123/revision'))).toBe(false);
    });

    it('las ventas del mes, que cambian con cada ajuste', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos/abc-123/ventas'))).toBe(false);
    });

    it('las alertas y el consolidado', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos/abc-123/alertas'))).toBe(false);
      expect(esDeReferencia(api('/planilla-comisiones/periodos/abc-123/reporte/consolidado'))).toBe(
        false,
      );
    });

    /* Un Excel de varios megas cacheado en memoria durante un minuto, además
       de poder salir desactualizado. */
    it('la descarga del Excel', () => {
      expect(esDeReferencia(api('/planilla-comisiones/periodos/abc-123/exportar'))).toBe(false);
    });
  });

  describe('nunca lo operativo', () => {
    it('clientes, leads y conversaciones quedan fuera', () => {
      expect(esDeReferencia(api('/clientes'))).toBe(false);
      expect(esDeReferencia(api('/leads'))).toBe(false);
      expect(esDeReferencia(api('/conversaciones'))).toBe(false);
    });
  });
});
