import { ConversacionDetalle, ConversacionResumen, PaginaInbox, ResumenInbox } from './conversacion.model';

/** No inferir un número si el servidor no lo identifica. */
export class ErrorCanalWhatsapp extends Error {
  constructor() {
    super('No se puede identificar la línea de atención. Reintenta; si continúa, contacta al administrador.');
    this.name = 'ErrorCanalWhatsapp';
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function comprobarCanal(valor: unknown): asserts valor is ConversacionResumen {
  if (!esObjeto(valor) || !esObjeto(valor['linea'])) throw new ErrorCanalWhatsapp();
  const linea = valor['linea'];
  if (typeof linea['id'] !== 'string' || !linea['id'] ||
      typeof linea['nombre'] !== 'string' || !linea['nombre'] ||
      (linea['telefono'] !== null && typeof linea['telefono'] !== 'string') ||
      typeof linea['activa'] !== 'boolean' || typeof linea['comercial'] !== 'boolean') {
    throw new ErrorCanalWhatsapp();
  }
}

/** Valida el nuevo contrato en la entrada, antes de renderizar o paginar. */
export function validarPaginaInbox(valor: unknown): PaginaInbox {
  if (!esObjeto(valor) || !Array.isArray(valor['datos'])) throw new ErrorCanalWhatsapp();
  valor['datos'].forEach(comprobarCanal);
  return valor as unknown as PaginaInbox;
}

export function validarDetalle(valor: unknown): ConversacionDetalle {
  comprobarCanal(valor);
  return valor as ConversacionDetalle;
}

export function validarResumenInbox(valor: unknown): ResumenInbox {
  if (!esObjeto(valor) || !('conversacion' in valor)) throw new ErrorCanalWhatsapp();
  if (valor['conversacion'] !== null) comprobarCanal(valor['conversacion']);
  return valor as unknown as ResumenInbox;
}
