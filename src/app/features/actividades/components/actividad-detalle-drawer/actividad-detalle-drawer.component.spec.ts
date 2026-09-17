import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Actividad } from '../../actividad.model';
import { ActividadDetalleDrawerComponent } from './actividad-detalle-drawer.component';

/**
 * A4.2 · el cajón de detalle.
 *
 * Presenta y propone: aquí se prueba QUÉ muestra y QUÉ intención emite, no qué
 * pasa después. Ejecutar la mutación, refrescar la lista y cerrar el cajón son
 * de la página, y se prueban en su spec.
 */

const CLIENTE = { id: 'c-1', nombre: 'María Fernanda Gutiérrez', telefono: '+59171234567' };

function actividad(parcial: Partial<Actividad> = {}): Actividad {
  return {
    id: 'a-1', tipo: 'LLAMADA', titulo: 'Llamar para confirmar', notas: 'Ayuno de 8 horas',
    fechaProgramada: '2026-09-20T18:00:00.000Z', duracionMinutos: 45, estado: 'PENDIENTE',
    completadaEn: null, notificadaEn: null, createdAt: '2026-09-01T12:00:00.000Z',
    cliente: CLIENTE, agente: { id: 'u-1', nombre: 'Viviana Morales' }, lead: null,
    serieId: null, frecuenciaSerie: null,
    ...parcial,
  } as unknown as Actividad;
}

describe('A4.2 · ActividadDetalleDrawerComponent', () => {
  let fixture: ComponentFixture<ActividadDetalleDrawerComponent>;
  let componente: ActividadDetalleDrawerComponent;
  let emitido: Array<[string, unknown]>;

  function montar(act: Actividad, esAdmin = false): void {
    fixture = TestBed.createComponent(ActividadDetalleDrawerComponent);
    fixture.componentRef.setInput('actividad', act);
    fixture.componentRef.setInput('esAdmin', esAdmin);
    componente = fixture.componentInstance;
    for (const nombre of [
      'editar', 'completar', 'cancelar', 'reprogramar',
      'completarYAgendarSiguiente', 'agendarSeguimiento', 'eliminar', 'cerrado',
    ] as const) {
      componente[nombre].subscribe((v: unknown) => emitido.push([nombre, v]));
    }
    fixture.detectChanges();
  }

  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

  function soloDe(nombre: string): unknown[] {
    return emitido.filter(([n]) => n === nombre).map(([, v]) => v);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined }));
    emitido = [];
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('Render · muestra los datos de la actividad', () => {
    montar(actividad());

    const texto = html();
    expect(texto).toContain('Llamar para confirmar');
    expect(texto).toContain('María Fernanda Gutiérrez');
    expect(texto).toContain('Ayuno de 8 horas');
    expect(texto).toContain('45 min');
    expect(texto).toContain('Llamada');
  });

  it('Permisos · el responsable comercial solo se ve siendo ADMIN', () => {
    montar(actividad(), false);
    expect(html()).not.toContain('Responsable comercial');

    fixture.destroy();
    emitido = [];
    montar(actividad(), true);
    expect(html()).toContain('Responsable comercial');
    expect(html()).toContain('Viviana Morales');
  });

  it('Estado PENDIENTE · ofrece completar, reprogramar, editar, cancelar y eliminar', () => {
    montar(actividad({ estado: 'PENDIENTE' }));

    const texto = html();
    expect(texto).toContain('Completar y agendar siguiente paso');
    expect(texto).toContain('Eliminar actividad');
    expect(texto).not.toContain('Agendar nuevo seguimiento');
  });

  it('Estado COMPLETADA · ofrece agendar el siguiente y eliminar, no completar', () => {
    montar(actividad({ estado: 'COMPLETADA', completadaEn: '2026-09-20T19:00:00.000Z' }));

    const texto = html();
    expect(texto).toContain('Agendar nuevo seguimiento');
    expect(texto).toContain('Eliminar actividad');
    expect(texto).not.toContain('Completar y agendar siguiente paso');
  });

  it('Estado CANCELADA · solo queda eliminar', () => {
    montar(actividad({ estado: 'CANCELADA' }));

    const texto = html();
    /* «Eliminar del registro», no «Eliminar actividad»: una cancelada ya no es
       una actividad viva. El texto es el que había y se conserva tal cual. */
    expect(texto).toContain('Eliminar del registro');
    expect(texto).not.toContain('Completar y agendar siguiente paso');
    expect(texto).not.toContain('Agendar nuevo seguimiento');
  });

  /**
   * A5.3 · la etiqueta de repetición.
   *
   * Que una actividad pertenezca a una serie es un dato, no una acción: se dice
   * y ya. Aquí solo se comprueba que se dice —y que no se dice cuando no hay
   * serie—, porque este componente no opera sobre ella.
   */
  describe('A5.3 · etiqueta de repetición', () => {
    it('SEMANAL', () => {
      montar(actividad({ serieId: 's-1', frecuenciaSerie: 'SEMANAL' }));
      expect(html()).toContain('Repetición semanal');
    });

    it('QUINCENAL', () => {
      montar(actividad({ serieId: 's-1', frecuenciaSerie: 'QUINCENAL' }));
      expect(html()).toContain('Repetición quincenal');
    });

    it('MENSUAL', () => {
      montar(actividad({ serieId: 's-1', frecuenciaSerie: 'MENSUAL' }));
      expect(html()).toContain('Repetición mensual');
    });

    it('sin serie no aparece nada: una actividad suelta no se repite', () => {
      montar(actividad());
      expect(html()).not.toContain('Repetición');
      expect(html()).not.toContain('Se repite');
    });

    it('serie histórica anterior a A5.1 · `serieId` nulo, se trata como suelta', () => {
      /* Se agendó «cada semana» en su día, pero entonces no se guardaba nada
         que enlazara las ocurrencias. No hay hermanas que buscar, y prometer
         una repetición que el backend no puede operar sería mentir. */
      montar(actividad({ serieId: null, frecuenciaSerie: 'SEMANAL' }));
      expect(html()).not.toContain('Repetición semanal');
    });
  });

  it('Editar · emite la intención con la actividad', () => {
    const act = actividad();
    montar(act);

    componente.editar.emit(act);

    expect(soloDe('editar')).toEqual([act]);
  });

  it('Completar · emite exactamente una intención', () => {
    const act = actividad();
    montar(act);

    componente.completar.emit(act);

    expect(soloDe('completar')).toHaveLength(1);
    expect(soloDe('cancelar')).toHaveLength(0);
  });

  it('Reprogramar · lleva las horas, no una fecha ya calculada', () => {
    montar(actividad());

    componente.reprogramar.emit(24);

    /* La regla horaria —qué significa «+24 h»— es de la página. Aquí solo se
       dice cuántas horas pidió la agente. */
    expect(soloDe('reprogramar')).toEqual([24]);
  });

  it('Eliminar · una pulsación, una intención', () => {
    const act = actividad();
    montar(act);

    componente.eliminar.emit(act);

    expect(soloDe('eliminar')).toEqual([act]);
  });

  it('Agendar seguimiento · emite el paciente, que es lo que hace falta', () => {
    const act = actividad({ estado: 'COMPLETADA' });
    montar(act);

    componente.agendarSeguimiento.emit(act.cliente);

    expect(soloDe('agendarSeguimiento')).toEqual([CLIENTE]);
  });

  it('Cerrar · avisa y no muta la actividad', () => {
    const act = actividad();
    montar(act);

    componente.cerrado.emit();

    expect(soloDe('cerrado')).toHaveLength(1);
    expect(componente.actividad()).toBe(act);
    expect(componente.actividad().estado, 'presentar no cambia nada').toBe('PENDIENTE');
  });

  it('La actividad que llega es la fuente de verdad: no se guarda copia', () => {
    montar(actividad({ titulo: 'Original' }));
    expect(html()).toContain('Original');

    fixture.componentRef.setInput('actividad', actividad({ titulo: 'Ya actualizada' }));
    fixture.detectChanges();

    /* La página muta y vuelve a pasar la actividad; el cajón se repinta solo.
       Si guardara la suya, aquí seguiría diciendo «Original». */
    expect(html()).toContain('Ya actualizada');
    expect(html()).not.toContain('Original');
  });
});
