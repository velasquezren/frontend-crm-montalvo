import { Directive, ElementRef, inject } from '@angular/core';

/** Teclado compartido de las pestañas. La página conserva selección, URL y montaje. */
@Directive({
  selector: '[appTablist]',
  host: { '(keydown)': 'mover($event)' },
})
export class TablistDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected mover(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const root = this.host.nativeElement;
    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('button[role="tab"]'))
      .filter(tab => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true'
        && tab.closest('[role="tablist"]') === root);
    const actual = tabs.indexOf(event.target as HTMLButtonElement);
    if (actual < 0) return;
    event.preventDefault();
    const indice = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (actual + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[indice].focus();
    tabs[indice].click();
  }
}
