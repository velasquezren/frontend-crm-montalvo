import { afterEach, describe, expect, it, vi } from 'vitest';

import { copiarAlPortapapeles } from './portapapeles';

describe('copiarAlPortapapeles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function conPortapapeles(writeText: (t: string) => Promise<void>): void {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  }

  function conExecCommand(resultado: boolean) {
    const exec = vi.fn(() => resultado);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    return exec;
  }

  it('usa la API del portapapeles y no toca el respaldo', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    conPortapapeles(writeText);
    const exec = conExecCommand(true);

    await expect(copiarAlPortapapeles('70012345')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('70012345');
    expect(exec).not.toHaveBeenCalled();
  });

  it('si la API rechaza, cae al respaldo y devuelve lo que este logró', async () => {
    conPortapapeles(() => Promise.reject(new Error('NotAllowedError')));
    const exec = conExecCommand(true);

    await expect(copiarAlPortapapeles('hola')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('no afirma éxito cuando el navegador no copió nada', async () => {
    conPortapapeles(() => Promise.reject(new Error('NotAllowedError')));
    conExecCommand(false);

    await expect(copiarAlPortapapeles('hola')).resolves.toBe(false);
  });

  it('selecciona todo el texto (iOS no selecciona con select() en solo lectura)', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const rango = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange');
    conExecCommand(true);

    await copiarAlPortapapeles('70012345');
    expect(rango).toHaveBeenCalledWith(0, 8);
  });

  it('devuelve el foco a donde estaba', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    conExecCommand(true);
    const boton = document.createElement('button');
    document.body.appendChild(boton);
    boton.focus();

    await copiarAlPortapapeles('hola');
    expect(document.activeElement).toBe(boton);
    boton.remove();
  });

  it('no deja el área de texto auxiliar en la página', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    conExecCommand(true);

    await copiarAlPortapapeles('hola');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
