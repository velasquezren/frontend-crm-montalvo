import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InputComponent } from './input.component';

describe('errores accesibles del input', () => {
  it.each([false, true])('asocia el error al campo y retira el estado al corregirlo (multiline=%s)', multiline => {
    const fixture = TestBed.createComponent(InputComponent);
    fixture.componentRef.setInput('multiline', multiline);
    fixture.componentRef.setInput('label', 'Nombre');
    fixture.componentRef.setInput('error', 'Este campo es obligatorio');
    fixture.detectChanges();
    const campo: HTMLElement = fixture.nativeElement.querySelector(multiline ? 'textarea' : 'input');
    const error: HTMLElement = fixture.nativeElement.querySelector('[role="alert"]');
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(campo.getAttribute('aria-describedby')).toBe(error.id);
    expect(fixture.nativeElement.querySelector('label').htmlFor).toBe(campo.id);
    fixture.componentRef.setInput('error', undefined);
    fixture.detectChanges();
    expect(campo.hasAttribute('aria-describedby')).toBe(false);
    expect(campo.hasAttribute('aria-invalid')).toBe(false);
    fixture.destroy();
  });
});
