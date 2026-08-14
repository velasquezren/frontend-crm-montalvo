import { inject, Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Formateador de texto estilo WhatsApp / Markdown ligero.
 * Soporta:
 * - Negrita: `*texto*` o `**texto**`
 * - Cursiva: `_texto_`
 * - Tachado: `~texto~`
 * - Monoespaciado: `` `código` `` o ```` ```bloque``` ````
 * - Enlaces automáticos: URLs que empiezan por http:// o https://
 *
 * Sanitiza cualquier HTML entrante antes de aplicar el formato para evitar XSS.
 */
@Pipe({
  name: 'whatsappMarkdown',
  standalone: true,
})
export class WhatsAppMarkdownPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';

    // 1. Escapar caracteres HTML para prevenir inyecciones
    let seguro = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // 2. Bloques de código (triple backtick)
    seguro = seguro.replace(/```([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$1</code></pre>');

    // 3. Código en línea (single backtick)
    seguro = seguro.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

    // 4. Negrita (**texto** o *texto*)
    seguro = seguro.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    seguro = seguro.replace(/(^|[^\w*])\*([^*\n]+)\*([^\w*]|$)/g, '$1<strong>$2</strong>$3');

    // 5. Cursiva (_texto_)
    seguro = seguro.replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1<em>$2</em>$3');

    // 6. Tachado (~texto~)
    seguro = seguro.replace(/(^|[^\w~])~([^~\n]+)~([^\w~]|$)/g, '$1<del>$2</del>$3');

    // 7. Enlaces automáticos (http/https)
    seguro = seguro.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener" class="chat-link">$1</a>',
    );

    return this.sanitizer.bypassSecurityTrustHtml(seguro);
  }
}
