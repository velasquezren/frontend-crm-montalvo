import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { debeRefrescar } from './conversaciones.page';

/* Esta regla decide cuánta red gasta la vista más usada del CRM. Antes se
   preguntaba cada 60 s pasara lo que pasara: de 437 peticiones a
   /conversaciones en producción, 219 devolvieron 304 — la mitad eran viajes
   que no traían nada. */
describe('debeRefrescar', () => {
  describe('con la pestaña oculta', () => {
    it('no pregunta nunca, ni con el socket caído', () => {
      expect(debeRefrescar(1, false, true)).toBe(false);
      expect(debeRefrescar(99, false, true)).toBe(false);
      expect(debeRefrescar(99, true, true)).toBe(false);
    });
  });

  describe('con el socket conectado', () => {
    it('deja pasar cuatro latidos y pregunta al quinto', () => {
      expect([1, 2, 3, 4].map(t => debeRefrescar(t, true, false))).toEqual([
        false,
        false,
        false,
        false,
      ]);
      expect(debeRefrescar(5, true, false)).toBe(true);
    });
  });

  describe('con el socket caído', () => {
    /* Es cuando el respaldo es lo único que queda: no puede espaciarse. */
    it('pregunta en cada latido', () => {
      expect(debeRefrescar(1, false, false)).toBe(true);
      expect(debeRefrescar(2, false, false)).toBe(true);
    });
  });

  it('caerse el socket acelera el ritmo sin esperar al quinto latido', () => {
    expect(debeRefrescar(1, true, false)).toBe(false);
    expect(debeRefrescar(1, false, false)).toBe(true);
  });
});
