import type { IconName } from '../../shared/components/icon/icon.component';
import type { InteraccionVista } from '../conversaciones/components/interaccion-preview/interaccion-preview.component';

/*
 * El menú de atención de una línea, tal como lo edita la pantalla de Líneas.
 * Las reglas viven en el backend (`modules/menu-atencion/menu-atencion.ts`): al
 * guardar, el servidor responde 400 con sus motivos y aquí se muestran tal cual.
 * Lo de este archivo es ayuda para quien configura, nunca la autoridad.
 */

export type TipoOpcion = 'PERSONA' | 'EMERGENCIA' | 'CITA' | 'RESPUESTA' | 'UBICACION' | 'PROMOCIONES';

export interface OpcionMenu {
  tipo: TipoOpcion;
  titulo: string;
  descripcion?: string;
  respuesta?: string;
  /** Identidad de una respuesta informativa; la asigna el servidor. */
  clave?: string;
  /** Solo de la pantalla: identidad estable de la fila al reordenar. No viaja. */
  uid?: string;
}

export interface MenuAtencion {
  activo: boolean;
  saludo: string;
  opciones: OpcionMenu[];
}

/** `GET /menu-atencion/:lineaId`. */
export interface MenuEditable {
  readonly lineaId: string;
  readonly linea: { readonly nombre: string; readonly comercial: boolean };
  readonly menu: MenuAtencion | null;
  readonly errores: readonly string[];
  readonly actualizadoEn: string | null;
  readonly actualizadoPor: { readonly id: string; readonly nombre: string } | null;
  /** Apagado en el servidor (`WHATSAPP_INTERACCIONES`): ningún menú sale. */
  readonly enviosHabilitados: boolean;
}

/** Los límites de Meta que aplica el servidor, para avisar mientras se escribe. */
export const LIMITES = { opciones: 10, titulo: 24, tituloBoton: 20, descripcion: 72, texto: 1024 } as const;

export interface DefinicionTipo {
  readonly nombre: string;
  readonly icono: IconName;
  /** Qué pasa cuando la paciente la toca. Una frase. */
  readonly efecto: string;
  readonly unica: boolean;
  readonly respuesta: { readonly etiqueta: string; readonly obligatoria: boolean; readonly ayuda: string } ;
  /** Título que se propone al agregarla. Es un punto de partida editable, no contenido. */
  readonly tituloSugerido: string;
}

/** El catálogo, en el orden en que se ofrece al agregar. */
export const TIPOS: Readonly<Record<TipoOpcion, DefinicionTipo>> = {
  PERSONA: {
    nombre: 'Hablar con una persona',
    icono: 'user',
    efecto: 'Pasa a «Atención» con prioridad alta y la automatización se calla.',
    unica: true,
    respuesta: { etiqueta: 'Confirmación (opcional)', obligatoria: false, ayuda: 'Lo que recibe al tocarla. Sin prometer tiempos: si no hay nadie, igual queda en espera.' },
    tituloSugerido: 'Hablar con una persona',
  },
  EMERGENCIA: {
    nombre: 'Es una emergencia',
    icono: 'alert-circle',
    efecto: 'Primera en «Atención» (prioridad crítica) y le suena a todo el equipo de la línea.',
    unica: true,
    respuesta: {
      etiqueta: 'Orientación de emergencia',
      obligatoria: true,
      ayuda: 'Texto aprobado por la clínica: a dónde acudir o a qué número llamar. Sin diagnosticar ni prometer atención inmediata por WhatsApp.',
    },
    tituloSugerido: 'Es una emergencia',
  },
  CITA: {
    nombre: 'Solicitar una cita',
    icono: 'calendar',
    efecto: 'Pasa a «Atención» como solicitud de cita. No reserva nada.',
    unica: true,
    respuesta: { etiqueta: 'Confirmación (opcional)', obligatoria: false, ayuda: 'Por ejemplo, que recepción le escribirá para acordar día y hora.' },
    tituloSugerido: 'Solicitar una cita',
  },
  RESPUESTA: {
    nombre: 'Información',
    icono: 'file-text',
    efecto: 'Se contesta sola con el texto de abajo. No pasa a «Atención».',
    unica: false,
    respuesta: { etiqueta: 'Lo que se le responde', obligatoria: true, ayuda: 'Horarios, requisitos, preparación… Solo información vigente y confirmada.' },
    tituloSugerido: 'Horarios',
  },
  UBICACION: {
    nombre: 'Ubicación',
    icono: 'map-pin',
    efecto: 'Se contesta sola con el mapa de la clínica.',
    unica: true,
    respuesta: { etiqueta: 'Texto antes del mapa (opcional)', obligatoria: false, ayuda: 'Una referencia para llegar, si ayuda.' },
    tituloSugerido: 'Cómo llegar',
  },
  PROMOCIONES: {
    nombre: 'Promociones',
    icono: 'percent',
    efecto: 'Muestra las promociones publicadas para WhatsApp en Promociones. La que elija recibe su tarjeta, con «Pagar ahora» si la línea tiene QR.',
    unica: true,
    respuesta: { etiqueta: 'Texto de la lista', obligatoria: true, ayuda: 'Acompaña la lista. Las promociones salen del módulo Promociones (las mismas de la landing); sin ninguna publicada, la opción no se muestra.' },
    tituloSugerido: 'Ver promociones',
  },
};
export const ORDEN_TIPOS: readonly TipoOpcion[] = ['PERSONA', 'EMERGENCIA', 'CITA', 'RESPUESTA', 'UBICACION', 'PROMOCIONES'];

/**
 * Copia editable con una identidad por fila (`uid`): sin ella, al reordenar o
 * quitar, Angular reutiliza los campos de la fila vecina y el foco queda
 * escribiendo en la opción equivocada.
 */
export function editable(menu: MenuAtencion): MenuAtencion {
  return {
    ...menu,
    opciones: menu.opciones.map(o => ({ ...o, uid: crypto.randomUUID() })),
  };
}

/** Un menú nuevo: solo lo que no es contenido. El saludo y los textos los escribe la clínica. */
export function menuInicial(): MenuAtencion {
  return { activo: false, saludo: '', opciones: [{ tipo: 'PERSONA', titulo: TIPOS.PERSONA.tituloSugerido }] };
}

/** Los tipos que todavía se pueden agregar. */
export function tiposDisponibles(menu: MenuAtencion): TipoOpcion[] {
  if (menu.opciones.length >= LIMITES.opciones) return [];
  return ORDEN_TIPOS.filter(t => !TIPOS[t].unica || !menu.opciones.some(o => o.tipo === t));
}

/** Copia del menú sin campos vacíos: lo que viaja al servidor. */
export function paraGuardar(menu: MenuAtencion): MenuAtencion {
  const limpio = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);
  return {
    activo: menu.activo,
    saludo: menu.saludo.trim(),
    opciones: menu.opciones.map(o => ({
      tipo: o.tipo,
      titulo: o.titulo.trim(),
      ...(limpio(o.descripcion) ? { descripcion: limpio(o.descripcion) } : {}),
      ...(limpio(o.respuesta) ? { respuesta: limpio(o.respuesta) } : {}),
      ...(o.clave ? { clave: o.clave } : {}),
    })),
  };
}

/**
 * Cómo lo verá la paciente. Misma regla que `mensajeDelMenu` del backend: hasta
 * tres opciones cortas sin descripción ni emojis son botones; si no, lista.
 * Si alguna vez divergen, manda el backend: esto es solo la vista previa.
 */
export function vistaPrevia(borrador: MenuAtencion): InteraccionVista {
  /* Sobre lo que viajaría (sin espacios sobrantes): es lo que el servidor mira. */
  const menu = paraGuardar(borrador);
  const opciones = menu.opciones.map((o, i) => ({ id: `${o.tipo}-${i}`, titulo: o.titulo || TIPOS[o.tipo].nombre, ...(o.descripcion ? { descripcion: o.descripcion } : {}) }));
  const botones = menu.opciones.length <= 3
    && menu.opciones.every(o => !o.descripcion && o.titulo.length <= LIMITES.tituloBoton && !/[*_~`]|\p{Extended_Pictographic}/u.test(o.titulo));
  return { tipo: botones ? 'botones' : 'lista', cuerpo: menu.saludo || 'Escribe el saludo…', opciones };
}
