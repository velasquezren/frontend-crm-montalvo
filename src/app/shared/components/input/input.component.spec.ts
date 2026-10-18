import '@angular/compiler';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { InputComponent } from './input.component';

@Component({
  imports: [InputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<app-input label="Contenido" [multiline]="true" [(value)]="contenido" />',
})
class FormularioTexto {
  readonly contenido = signal('Primera línea\nSegunda línea');
}

describe('errores accesibles del input', () => {
  it('mantiene el enlace bidireccional y los saltos de línea al reemplazar un textarea nativo', async () => {
    const fixture = TestBed.createComponent(FormularioTexto);
    await fixture.whenStable();
    const campo: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(campo.value).toBe('Primera línea\nSegunda línea');
    campo.value = 'Texto editado\n/enlace';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(fixture.componentInstance.contenido()).toBe('Texto editado\n/enlace');
    fixture.componentInstance.contenido.set('');
    await fixture.whenStable();
    expect(campo.value).toBe('');
    fixture.destroy();
  });

  it('dibuja el icono solicitado sin sustituir el nombre accesible del buscador', () => {
    const fixture = TestBed.createComponent(InputComponent);
    fixture.componentRef.setInput('type', 'search');
    fixture.componentRef.setInput('icon', 'search');
    fixture.componentRef.setInput('ariaLabel', 'Buscar pacientes');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-icon')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input').getAttribute('aria-label')).toBe('Buscar pacientes');
    fixture.componentRef.setInput('multiline', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-icon')).toBeNull();
    expect(fixture.nativeElement.querySelector('textarea').getAttribute('aria-label')).toBe('Buscar pacientes');
    fixture.destroy();
  });
  it('permite revelar la contraseña sin cambiar su valor y desactiva ambos controles al bloquear el campo', () => {
    const fixture = TestBed.createComponent(InputComponent);
    fixture.componentRef.setInput('type', 'password');
    fixture.componentRef.setInput('value', 'clave de prueba');
    fixture.detectChanges();
    const campo: HTMLInputElement = fixture.nativeElement.querySelector('input');
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(boton.getAttribute('aria-controls')).toBe(campo.id);
    boton.click();
    fixture.detectChanges();
    expect(campo.type).toBe('text');
    expect(campo.value).toBe('clave de prueba');
    expect(boton.getAttribute('aria-label')).toBe('Ocultar contraseña');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(campo.disabled).toBe(true);
    expect(boton.disabled).toBe(true);
    boton.click();
    fixture.detectChanges();
    expect(campo.type).toBe('text');
    fixture.destroy();
  });

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
