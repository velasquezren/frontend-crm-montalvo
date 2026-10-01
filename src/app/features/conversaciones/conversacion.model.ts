import { LineaWhatsapp } from '../lineas-whatsapp/linea-whatsapp.model';
import { Rol } from '../../core/api/db-enums';
import { DatosExtra } from '../../core/api/datos-extra';
import { ZONA_CLINICA } from '../actividades/zona-clinica';

import { EstadoMensaje, TipoMensaje } from '../../core/api/db-enums';

export type { TipoMensaje };

import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/**
 * Ticks estilo WhatsApp — solo tiene sentido en mensajes SALIENTE.
 *
 * Sale del enum GENERADO desde `schema.prisma`, no de una lista a mano. Estaba
 * duplicado aquí y por eso `INCIERTO` no rompió el build al añadirse: el estado
 * nuevo caía en el `@default` de las plantillas y se pintaba como un envío
 * normal, que es justo la mentira que ese estado viene a evitar.
 */
export type EstadoEnvioMensaje = EstadoMensaje;

/** Tipo de contenido del mensaje. */
/** Respuestas de GET /conversaciones y GET /conversaciones/:id. */
export interface MensajeApi {
  readonly id: string;
  readonly direccion: 'ENTRANTE' | 'SALIENTE';
  readonly contenido: string;
  readonly createdAt: string;
  readonly estadoEnvio?: EstadoEnvioMensaje | null;
  readonly codigoErrorEnvio?: number | null;
  /**
   * Estado LOCAL de un mensaje que todavía no existe en el servidor. No viaja
   * nunca en una respuesta: lo pone el compositor al pintar el globo optimista
   * y lo borra la reconciliación al llegar el real.
   *
   * Es un campo aparte y no un valor más de `estadoEnvio` porque ese enum es
   * el de la base (`EstadoMensaje` en `schema.prisma`, verificado por
   * `check:tipos`) y significa otra cosa: `ENVIADO` ahí es «nuestro backend lo
   * despachó a Meta». `ENVIANDO` aquí es «todavía no sabemos si lo aceptó».
   * Mezclarlos convertiría una espera en una confirmación falsa.
   *
   * `ERROR` y `AMBIGUO` no son matices de redacción: deciden si se puede
   * reintentar. El backend persiste el mensaje y dispara el envío a Meta
   * ANTES de responder el POST, así que un error de red o un 5xx puede
   * significar que el mensaje ya salió hacia la paciente. Reintentar ahí
   * manda un segundo WhatsApp de verdad. `AMBIGUO` es ese caso y no ofrece
   * botón de reintento.
   */
  readonly envioLocal?: 'ENVIANDO' | 'ERROR' | 'AMBIGUO';
  /**
   * Identidad de la intención de envío, la misma que viaja al backend. Se
   * conserva entre reintentos: es lo que permite que reintentar un envío
   * ambiguo no pueda duplicar el mensaje. Solo existe en globos optimistas.
   */
  readonly clientMessageId?: string;
  /** true = lo mandó el sistema (acuse fuera de horario), no una persona. */
  readonly automatico?: boolean;
  readonly tipo?: TipoMensaje;
  /** Clave interna del archivo en R2 (e.g. `wa/<convId>/<msgId>`); la usa el proxy de descarga. */
  readonly mediaKey?: string | null;
  /** URL firmada (15 min) del archivo en R2; null mientras se descarga o si es solo texto. */
  readonly mediaUrl?: string | null;
  readonly mediaMime?: string | null;
  readonly mediaNombre?: string | null;
  /** Ancho y alto con que se ve la foto; el hilo reserva su caja antes de que llegue. */
  readonly mediaAncho?: number | null;
  readonly mediaAlto?: number | null;
}

export interface ConversacionResumen {
  readonly linea: Pick<LineaWhatsapp, 'id' | 'nombre' | 'telefono' | 'activa' | 'comercial'>;
  readonly id: string;
  readonly cliente: {
    id: string;
    nombre: string;
    telefono: string;
    email: string | null;
    categoria: CategoriaCliente;
    /** Fijada a mano, o null si es la calculada. Solo viaja en el DETALLE. */
    categoriaFijadaEn?: string | null;
    /* Columnas reales del paciente; viajan en listado y detalle. */
    pac?: string | null;
    ci?: string | null;
    fechaNacimiento?: string | null;
    ocupacion?: string | null;
    empresaTrabajo?: string | null;
    ciLugar?: string | null;
    datosExtra?: DatosExtra | null;
    intereses?: readonly { id: string; descripcion: string }[];
    /**
     * Cuándo pidió no recibir más promociones (tocó «No me interesa»), o null.
     * Solo viaja en el DETALLE del chat. Ver `Cliente.bajaPromocionesEn`.
     */
    bajaPromocionesEn?: string | null;
    /**
     * La DUEÑA de la paciente (su cartera comercial). No es quien atiende el
     * chat: eso es `agente`, más abajo. Solo en líneas comerciales; en las
     * demás llega `null`.
     */
    agente?: { readonly id: string; readonly nombre: string } | null;
  };
  /** Quien ATIENDE este chat, o `null` si está libre. Ver `duenaDelChatLibre`. */
  readonly agente: { id: string; nombre: string } | null;
  /** El listado incluye solo el último mensaje (take: 1, desc). */
  readonly mensajes: readonly MensajeApi[];
  /** No leídos del paciente. El backend ya lo expone así; `_count` no viaja. */
  readonly noLeidosCount?: number;
  readonly updatedAt: string;
  /**
   * Lo dice el servidor, no se deduce aquí: es la columna
   * `Conversacion.esperandoRespuesta`, que existe para que la pestaña "Sin
   * responder" se pueda filtrar y contar en SQL sobre TODAS las conversaciones
   * y no solo sobre las que el navegador tenga cargadas.
   */
  readonly esperandoRespuesta?: boolean;
  /**
   * Cuándo se dio por resuelta, o null si está abierta. Una cerrada no cuenta
   * en las pestañas de trabajo y se reabre sola cuando escribe la paciente o
   * le contesta la clínica. Ver `estado-conversacion.ts` del backend.
   */
  readonly cerradaEn?: string | null;
}

export interface ConversacionDetalle extends Omit<ConversacionResumen, 'mensajes'> {
  /** El detalle incluye el hilo completo en orden cronológico. */
  readonly mensajes: readonly MensajeApi[];
  /** Quién la cerró; null con `cerradaEn` = la cerró el sistema por inactividad. */
  readonly cerradaPor?: { readonly id: string; readonly nombre: string } | null;
}

/**
 * La franja de un chat cerrado: quién lo cerró y cuándo, y que se reabre solo.
 * Sin `cerradaPor` lo cerró el barrido de inactividad, no una persona.
 */
export function describirCierre(chat: Pick<ConversacionDetalle, 'cerradaEn' | 'cerradaPor'>): string | null {
  if (!chat.cerradaEn) return null;
  const fecha = new Date(chat.cerradaEn).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', timeZone: ZONA_CLINICA });
  const quien = chat.cerradaPor ? `por ${chat.cerradaPor.nombre.split(' ')[0]}` : 'por inactividad';
  return `Cerrada ${quien} el ${fecha}. Se reabre sola si la paciente escribe o si le contestas.`;
}

/** Lo que devuelven `POST /conversaciones/:id/cerrar` y `/reabrir`. */
export interface EstadoConversacion {
  readonly id: string;
  readonly cerradaEn: string | null;
  readonly cerradaPor: { readonly id: string; readonly nombre: string } | null;
}

/** Agente para dropdown de asignación (GET /conversaciones/meta/agentes). */
export interface AgenteResumen {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly lineasWhatsapp: readonly { lineaId: string }[];
}

/** Plantilla de WhatsApp aprobada (GET /conversaciones/meta/plantillas). */
export interface PlantillaResumen {
  readonly nombre: string;
  readonly idioma: string;
  readonly categoria: string;
  /** Cuerpo con placeholders `{{1}}` o `{{nombre}}`, tal como lo aprobó Meta. */
  readonly cuerpo: string;
  readonly variables: number;
  /** Las variables en el orden en que se mandan (`1`, `2`… o `nombre`, `fecha`…). */
  readonly nombresVariables: readonly string[];
  readonly formato: 'POSITIONAL' | 'NAMED';
  readonly pie: string | null;
  readonly botones: readonly string[];
  /** URL de la imagen de cabecera, si la lleva y el CRM la tiene; se adjunta sola al enviar. */
  readonly imagenCabecera: string | null;
  /** false si lleva algo que el chat no sabe rellenar (una imagen que el CRM no tiene, un enlace variable). */
  readonly enviable: boolean;
  readonly motivoNoEnviable: string | null;
}

/** Lo que devuelve `POST /conversaciones/iniciar`. */
export interface ConversacionIniciada {
  readonly conversacionId: string;
  readonly mensaje: MensajeApi;
}

/** Respuesta Rápida / Plantilla Personalizada del Agente (GET/POST /plantillas-agente). */
export interface PlantillaAgente {
  readonly id: string;
  readonly usuarioId: string;
  readonly titulo: string;
  readonly atajo: string | null;
  readonly contenido: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Filtros de la vista del inbox. Espejo de `TABS_INBOX` del backend.
 * Las cuatro primeras son de trabajo (solo abiertas); `CERRADAS` es el archivo.
 */
export const FILTROS_INBOX = ['TODAS', 'SIN_RESPONDER', 'SIN_ASIGNAR', 'MIS_CHATS', 'CERRADAS'] as const;
export type FiltroInbox = (typeof FILTROS_INBOX)[number];

/** Un valor que llega por URL solo cuenta si es una pestaña que existe. */
export function esFiltroInbox(valor: string | null): valor is FiltroInbox {
  return (FILTROS_INBOX as readonly string[]).includes(valor ?? '');
}

/**
 * Los números de las pestañas, calculados por el servidor con el MISMO filtro
 * que la lista: cada número es exactamente lo que aparece al pulsarla.
 */
export interface ContadoresInbox {
  /** Abiertas. */
  readonly total: number;
  readonly sinAsignar: number;
  readonly misChats: number;
  readonly sinResponder: number;
  readonly cerradas: number;
}

/** Filtros de vista que viajan al servidor con cada petición del listado. */
export interface FiltrosInbox {
  readonly lineaId?: string | null;
  readonly tab: FiltroInbox;
  readonly busqueda: string;
  readonly agenteId: string | null;
  readonly soloMios: boolean;
}

/**
 * La dueña de la paciente cuando el chat está LIBRE: «Sin asignar · paciente
 * de Ana». `null` si alguien lo atiende o si la paciente no tiene dueña.
 *
 * Quién atiende y de quién es la paciente son dos cosas. Hasta el 2026-09-30
 * el backend rellenaba `agente` con la dueña cuando el chat estaba libre, y la
 * fila decía «Ana» con el chat en «Sin asignar»: cualquiera podía contestarlo
 * y quedárselo. Es a propósito —la clínica prefiere que ninguna paciente de
 * Ventas se quede sin respuesta—, así que lo que se corrigió es la etiqueta.
 */
export function duenaDelChatLibre(
  chat: Pick<ConversacionResumen, 'agente' | 'cliente'>,
): { readonly id: string; readonly nombre: string } | null {
  return chat.agente ? null : (chat.cliente.agente ?? null);
}

/**
 * A quién mira un admin: todo el equipo, lo suyo más el pool sin asignar, o
 * una agente concreta.
 *
 * Es UN valor y no dos interruptores. Estuvieron separados —un botón
 * «Todo/Míos» junto al buscador y unos chips de agente plegables— y se podían
 * encender a la vez: «los de Ana que además son míos o del pool», un AND que
 * no significa nada y casi siempre daba vacío.
 *
 * Es ALCANCE, como la línea: acota las cuatro pestañas, las cerradas y todos
 * sus contadores (`whereAlcanceInbox` en el backend). Antes solo valía en
 * «Todas»: con una agente elegida, «Sin responder» marcaba los de ella, y al
 * pulsarla el filtro se soltaba y la lista traía los de todo el equipo —el
 * número no era lo que aparecía—.
 */
export type AlcanceInbox = 'EQUIPO' | 'MIOS' | { readonly agenteId: string };

/** El `value` del `<option>` que representa un alcance. */
export function opcionDeAlcance(alcance: AlcanceInbox): string {
  return typeof alcance === 'string' ? alcance : alcance.agenteId;
}

/** La vuelta de `opcionDeAlcance`. Un valor vacío es el equipo, nunca «la agente ''». */
export function alcanceDeOpcion(valor: string): AlcanceInbox {
  if (!valor || valor === 'EQUIPO') return 'EQUIPO';
  return valor === 'MIOS' ? 'MIOS' : { agenteId: valor };
}

/** Lo que el alcance pone en la petición del listado. */
export function filtrosDeAlcance(alcance: AlcanceInbox): Pick<FiltrosInbox, 'agenteId' | 'soloMios'> {
  return {
    agenteId: typeof alcance === 'string' ? null : alcance.agenteId,
    soloMios: alcance === 'MIOS',
  };
}

/** Lo que responde `GET /conversaciones`: una página más los contadores. */
export interface PaginaInbox {
  readonly datos: readonly ConversacionResumen[];
  readonly total: number;
  readonly pagina: number;
  readonly limite: number;
  readonly totalPaginas: number;
  readonly contadores: ContadoresInbox;
}

/** Lo que responde `GET /conversaciones/:id/resumen`. */
export interface ResumenInbox {
  /** `null` si la conversación dejó de encajar en la vista activa. */
  readonly conversacion: ConversacionResumen | null;
  readonly contadores: ContadoresInbox;
}

/**
 * Una conversación está sin responder si el ÚLTIMO mensaje lo escribió el
 * paciente: si nadie contestó después, sigue esperando.
 *
 * **El servidor ya manda esto en `esperandoRespuesta`** y esa es la fuente de
 * verdad —es lo que filtra y cuenta la pestaña—; esta función solo lo deduce
 * del último mensaje cuando el campo no viene, que es el caso de una fila
 * construida en memoria por el envío optimista antes de que el servidor
 * conteste.
 */
export function estaSinResponder(c: ConversacionResumen): boolean {
  /* Cerrada = resuelta: no espera a nadie, aunque lo último sea de la paciente. */
  if (c.cerradaEn) return false;
  if (c.esperandoRespuesta !== undefined) return c.esperandoRespuesta;

  const ultimo = c.mensajes[0];
  if (!ultimo) return false;
  /* Un acuse automático NO es una respuesta: si lo último que pasó es que el
     sistema dijo "estamos cerrados", el paciente sigue esperando a una persona.
     Sin esta línea, todo lo que entra un fin de semana desaparecería de la
     pestaña y el lunes nadie sabría quién escribió. */
  return ultimo.direccion === 'ENTRANTE' || ultimo.automatico === true;
}

/**
 * Los contadores justo después de que una persona conteste `chat`, hasta que
 * llegue el refresco del servidor. Contestar la saca de «Sin responder» y, si
 * estaba cerrada, la reabre: vuelve a contar como abierta.
 */
export function contadoresTrasResponder(c: ContadoresInbox, chat: ConversacionResumen): ContadoresInbox {
  if (chat.cerradaEn) return { ...c, cerradas: Math.max(0, c.cerradas - 1), total: c.total + 1 };
  return estaSinResponder(chat) ? { ...c, sinResponder: Math.max(0, c.sinResponder - 1) } : c;
}

/** Momento en que el paciente quedó esperando, o null si ya se le respondió. */
export function esperandoDesde(c: ConversacionResumen): Date | null {
  /* Si lo último es el acuse, su hora sirve igual: sale segundos después del
     mensaje del paciente, así que la espera que se muestra no se desvía. */
  return estaSinResponder(c) ? new Date(c.mensajes[0].createdAt) : null;
}

/** Elemento del hilo: mensaje real o separador de fecha. */
export type ItemHilo =
  | { readonly tipo: 'separador-fecha'; readonly fecha: string }
  | { readonly tipo: 'mensaje'; readonly mensaje: MensajeApi };

