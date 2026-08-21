import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formateador de texto estilo WhatsApp, para pintar los mensajes del chat.
 *
 * Soporta `*negrita*`, `_cursiva_`, `~tachado~`, `` `código` ``, bloques con
 * triple acento grave y enlaces automáticos http(s).
 *
 * ## Por qué NO usa `bypassSecurityTrustHtml`
 *
 * El texto que entra aquí lo escribe una paciente por WhatsApp: es la entrada
 * menos confiable de todo el CRM. El pipe escapa `& < > " '` antes de tocar
 * nada, así que ninguna etiqueta del original sobrevive y los enlaces exigen
 * `http(s)://` (no hay hueco para `javascript:`).
 *
 * Aun así devuelve `string`, no `SafeHtml`, a propósito: `[innerHTML]` pasa las
 * cadenas por el saneador de Angular, y todo lo que este pipe emite —strong,
 * em, del, code, pre, a, y los atributos class/href/target/rel— está en su
 * lista blanca. Es decir, sanear no cambia ni un píxel de lo que se ve, y a
 * cambio deja una segunda barrera puesta: si mañana alguien añade una regla que
 * meta texto de la paciente dentro de un atributo, Angular lo ataja. Con
 * `bypassSecurityTrustHtml` ese mismo descuido sería XSS con el historial
 * clínico de la clínica delante.
 */
@Pipe({
  name: 'whatsappMarkdown',
})
export class WhatsAppMarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';

    /* Primero y sin excepción: si algo de esto se mueve más abajo, el escape
       dejaría de cubrir el texto original. */
    let seguro = value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    seguro = seguro.replace(
      /```([\s\S]*?)```/g,
      '<pre class="chat-code-block"><code>$1</code></pre>',
    );
    seguro = seguro.replace(/`([^`\n]+)`/g, '<code class="chat-inline-code">$1</code>');

    /* El cierre va como lookahead —mira pero no consume— y no como grupo.
       Consumiéndolo, el espacio que separa dos tramos se lo comía el primero y
       el segundo se quedaba sin el carácter previo que su propio patrón exige:
       "*hola* *chau*" pintaba en negrita solo "hola". El delimitador de apertura
       sí se consume, y por eso sigue haciendo falta reponerlo con `$1`. */
    seguro = seguro.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    seguro = seguro.replace(/(^|[^\w*])\*([^*\n]+)\*(?=[^\w*]|$)/g, '$1<strong>$2</strong>');
    seguro = seguro.replace(/(^|[^\w_])_([^_\n]+)_(?=[^\w_]|$)/g, '$1<em>$2</em>');
    seguro = seguro.replace(/(^|[^\w~])~([^~\n]+)~(?=[^\w~]|$)/g, '$1<del>$2</del>');

    /* Al final: si fuera antes, el marcado que insertan las reglas de arriba
       entraría dentro del href. */
    return seguro.replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>',
    );
  }
}
