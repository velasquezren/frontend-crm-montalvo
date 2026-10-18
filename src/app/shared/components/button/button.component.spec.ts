import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ButtonComponent } from './button.component';

describe('botón durante una petición', () => {
  it('expone el estado ocupado e impide enviar dos veces', () => {
    const fixture = TestBed.createComponent(ButtonComponent);
    const clicked = vi.fn();
    fixture.componentInstance.clicked.subscribe(clicked);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(clicked).not.toHaveBeenCalled();
    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    expect(button.hasAttribute('aria-busy')).toBe(false);
    button.click();
    expect(clicked).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
