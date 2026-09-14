/**
 * Cómo se construyen los enlaces a un teléfono de paciente.
 *
 * **Estaba escrito CUATRO veces con dos nombres** —`getWhatsappLink` en
 * Actividades y Ventas, `enlaceWhatsApp` en el hilo y el panel del chat—, más
 * dos copias de `soloDigitos`. Y las versiones no hacían lo mismo:
 *
 * ```
 * Actividades · Ventas   digitos.startsWith('591') ? digitos : '591' + digitos
 * Chat                   digitos
 * ```
 *
 * **La primera está mal, y no es teórico.** `Cliente.telefono` siempre llega en
 * formato internacional —el DTO del backend lo exige con `@IsPhoneNumber()` sin
 * región, que rechaza cualquier número sin `+`—, así que anteponer `591` no
 * arregla nada y en cambio **corrompe a cualquier paciente extranjera**: un
 * `+52 1 55 1234 5678` de México salía como `wa.me/5915215512345678`, con el
 * prefijo de Bolivia pegado delante. Enlace muerto, y sin ningún aviso.
 *
 * Gana la versión del chat: el número ya viene completo, solo hay que quitarle
 * los símbolos.
 */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

/**
 * Enlace para abrir WhatsApp con esa paciente, opcionalmente con un mensaje ya
 * escrito. Devuelve cadena vacía si no hay número, para que una plantilla pueda
 * pintarlo sin comprobar antes.
 */
export function enlaceWhatsApp(telefono: string | null | undefined, mensaje?: string): string {
  const numero = soloDigitos(telefono ?? '');
  if (!numero) return '';
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}

/** Enlace para llamar. El `+` va explícito: sin él el marcador pierde el país. */
export function enlaceLlamada(telefono: string | null | undefined): string {
  const numero = soloDigitos(telefono ?? '');
  return numero ? `tel:+${numero}` : '';
}
