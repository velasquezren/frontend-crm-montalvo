import { ModoAsistente, ResultadoTurnoAsistente } from '../../core/api/db-enums';

/*
 * El asistente de IA de una línea (backend: docs/asistente-ia.md). Las reglas
 * las aplica el servidor; aquí se dicen y se adelanta lo que rechazaría.
 */

/** Espejo de `LIMITES_ASISTENTE` del backend. Si divergen, manda el backend. */
export const LIMITES_ASISTENTE = {
  conocimiento: 8000,
  criterioDerivacion: 2000,
  criterioMinimo: 40,
} as const;

export interface EstadoProveedorIA {
  readonly encendido: boolean;
  readonly proyecto: boolean;
  readonly credenciales: 'ARCHIVO' | 'ARCHIVO_INEXISTENTE' | 'AMBIENTE';
  readonly ubicacion: string;
  readonly modelo: string;
  readonly modeloClasificador: string;
  readonly listo: boolean;
}

/** `GET /asistente/lineas/:lineaId`. */
export interface AsistenteEditable {
  readonly linea: { readonly id: string; readonly nombre: string; readonly comercial: boolean };
  readonly configuracion: {
    readonly modo: ModoAsistente;
    readonly conocimiento: string;
    readonly criterioDerivacion: string;
    readonly leerComprobantes: boolean;
    readonly actualizadoEn: string | null;
    readonly actualizadoPor: { readonly nombre: string } | null;
  };
  readonly proveedor: EstadoProveedorIA;
  readonly actividad: {
    readonly dias: number;
    readonly porResultado: Partial<Record<ResultadoTurnoAsistente, number>>;
    readonly tokensEntrada: number;
    readonly tokensSalida: number;
  };
}

export interface GuardarAsistente {
  modo: ModoAsistente;
  conocimiento: string;
  criterioDerivacion: string;
  leerComprobantes: boolean;
}

/** Los tres modos, dichos para quien decide encenderlo. */
export const MODOS_ASISTENTE: readonly { readonly modo: ModoAsistente; readonly titulo: string; readonly texto: string }[] = [
  { modo: 'APAGADO', titulo: 'Apagado', texto: 'La línea funciona como siempre.' },
  {
    modo: 'SUGERIR', titulo: 'Sugerir respuestas',
    texto: 'Prepara una respuesta en el chat; la agente la revisa, la edita y la manda ella. No le escribe a nadie.',
  },
  {
    modo: 'RESPONDER', titulo: 'Responder solo',
    texto: 'Contesta lo comercial e informativo. Lo médico, las quejas y lo dudoso los pasa a una persona en «Atención».',
  },
];

/** Qué hizo, para el resumen de la semana. */
export const RESULTADO_TURNO: Readonly<Record<ResultadoTurnoAsistente, string>> = {
  RESPONDIO: 'Respondió',
  SUGIRIO: 'Sugirió',
  DERIVO: 'Pasó a una persona',
  OMITIDO: 'No intervino',
  FALLO: 'Falló',
};

/** Espejo de `motivoParaNoGuardar` del backend: por qué no se puede guardar, o `null`. */
export function motivoParaNoGuardar(c: Pick<GuardarAsistente, 'modo' | 'criterioDerivacion'>): string | null {
  if (c.modo === 'RESPONDER' && c.criterioDerivacion.trim().length < LIMITES_ASISTENTE.criterioMinimo) {
    return 'Para que responda solo, escribe primero qué temas pasan siempre a una persona.';
  }
  return null;
}

/** Lo que falta en el servidor para que funcione, en una frase; `null` si está listo. */
export function faltaEnElServidor(p: EstadoProveedorIA): string | null {
  if (!p.encendido) return 'El servidor todavía no tiene encendido el asistente (ASISTENTE_IA).';
  if (!p.proyecto) return 'Falta el proyecto de Google Cloud en el servidor (GOOGLE_CLOUD_PROJECT).';
  if (p.credenciales === 'ARCHIVO_INEXISTENTE') return 'La llave de la cuenta de servicio no está donde dice GOOGLE_APPLICATION_CREDENTIALS.';
  return null;
}

/** `POST /asistente/probar`: la prueba de punta a punta con datos sintéticos. */
export interface ResultadoPrueba {
  readonly ok: boolean;
  readonly pasos: readonly { readonly paso: 'CONFIGURACION' | 'FILTRO' | 'CONVERSACION' | 'COMPROBANTE'; readonly ok: boolean; readonly detalle: string; readonly ms: number }[];
}

export const PASO_PRUEBA: Readonly<Record<ResultadoPrueba['pasos'][number]['paso'], string>> = {
  CONFIGURACION: 'Configuración del servidor',
  FILTRO: 'Filtro de entrada',
  CONVERSACION: 'Conversación con herramienta',
  COMPROBANTE: 'Lectura de comprobante',
};
