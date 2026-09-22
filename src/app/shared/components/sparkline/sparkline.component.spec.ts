import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SparklineComponent } from './sparkline.component';

function trazo(valores: Array<number | null>): string | null {
  const fixture = TestBed.createComponent(SparklineComponent);
  fixture.componentRef.setInput('valores', valores);
  fixture.detectChanges();
  return fixture.nativeElement.querySelector('path')?.getAttribute('d') ?? null;
}

describe('SparklineComponent', () => {
  it('con menos de dos datos no dibuja nada: una línea necesita dos puntos', () => {
    expect(trazo([])).toBeNull();
    expect(trazo([null, 5, null])).toBeNull();
  });

  it('salta los tramos sin dato en vez de hundirlos a cero', () => {
    /* Cuatro tramos (x = 0, 40, 80, 120) y solo dos con dato: la línea une
       el primero con el último y no pasa por los huecos. */
    const d = trazo([10, null, null, 20])!;
    expect(d).toBe('M0.0,27.0 Q0.0,27.0 60.0,15.0 L120.0,3.0');
    expect(d).not.toMatch(/\b(40|80)\.0,/);
  });

  it('una serie plana va por el centro, no pegada al borde', () => {
    expect(trazo([4, 4, 4])).toBe('M0.0,15.0 Q0.0,15.0 30.0,15.0 Q60.0,15.0 90.0,15.0 L120.0,15.0');
  });
});
