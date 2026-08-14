import { describe, expect, it } from 'vitest';
import { WhatsAppMarkdownPipe } from './whatsapp-markdown.pipe';

/* El texto que pasa por aquí lo escribe una paciente por WhatsApp, así que las
   dos cosas que se fijan son: que no se cuele HTML, y que el formateo no mienta
   —que fue el fallo real: dos tramos seguidos y solo se pintaba el primero. */
describe('WhatsAppMarkdownPipe', () => {
  const pipe = new WhatsAppMarkdownPipe();
  const formatear = (texto: string) => pipe.transform(texto);

  describe('no deja pasar HTML de la paciente', () => {
    it('escapa las etiquetas en vez de renderizarlas', () => {
      expect(formatear('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
    });

    it('escapa la comilla, así que no se puede salir de un atributo', () => {
      expect(formatear('https://x.com/" onmouseover="alert(1)')).toContain('&quot;');
      expect(formatear('https://x.com/" onmouseover="alert(1)')).not.toContain('onmouseover="a');
    });

    it('un javascript: no se convierte en enlace', () => {
      expect(formatear('javascript:alert(1)')).not.toContain('<a ');
    });
  });

  describe('formatea', () => {
    it('negrita, cursiva y tachado', () => {
      expect(formatear('*a*')).toBe('<strong>a</strong>');
      expect(formatear('_a_')).toBe('<em>a</em>');
      expect(formatear('~a~')).toBe('<del>a</del>');
    });

    /* La regresión que motivó el cambio a lookahead. */
    it('dos tramos seguidos, no solo el primero', () => {
      expect(formatear('*hola* *chau*')).toBe('<strong>hola</strong> <strong>chau</strong>');
      expect(formatear('_uno_ _dos_')).toBe('<em>uno</em> <em>dos</em>');
      expect(formatear('*a* *b* *c*')).toBe(
        '<strong>a</strong> <strong>b</strong> <strong>c</strong>',
      );
    });

    it('deja en paz los asteriscos que no delimitan nada', () => {
      expect(formatear('sin formato 2*3*4')).toBe('sin formato 2*3*4');
    });

    it('enlaza http(s) y abre fuera sin filtrar el referente', () => {
      expect(formatear('mira https://clinica.bo/promo')).toBe(
        'mira <a href="https://clinica.bo/promo" target="_blank" rel="noopener noreferrer" ' +
          'class="chat-link">https://clinica.bo/promo</a>',
      );
    });

    it('el enlace sobrevive a los guiones bajos de la URL', () => {
      expect(formatear('https://clinica.bo/promo_verano_2026.pdf')).toContain(
        'href="https://clinica.bo/promo_verano_2026.pdf"',
      );
    });

    it('vacío y nulo no revientan', () => {
      expect(formatear('')).toBe('');
      expect(pipe.transform(null)).toBe('');
      expect(pipe.transform(undefined)).toBe('');
    });
  });
});
