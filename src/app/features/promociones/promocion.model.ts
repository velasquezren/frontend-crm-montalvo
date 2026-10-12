import { EstadoPromocion, FormatoBanner } from '../../core/api/db-enums';
import { BadgeVariant } from '../../shared/components/badge/badge.component';
import { fechaCorta, precioDeTexto } from '../../shared/models/catalogo';

/**
 * Promociones: espejo de `modules/promociones` del backend, que decide quién
 * puede qué y valida todo. Aquí se redacta, se revisa y se lee.
 * Diseño: backend-crm-montalvo/docs/promociones-y-directorio.md.
 */

export type { EstadoPromocion, FormatoBanner };

export type Vigencia = 'PROXIMA' | 'VIGENTE' | 'VENCIDA';
export type AccionPromocion = 'enviar' | 'devolver' | 'publicar' | 'pausar' | 'archivar';

/** Un servicio de la promoción con su precio («Ecografía Mamaria: Bs 268, antes Bs 446»). */
export interface ServicioPromocion {
  readonly id: string;
  readonly nombre: string;
  readonly precioRegular: number | null;
  readonly precioPromocional: number;
}

/** Lo que viaja al guardar: con `id` se edita ese servicio; sin él, se crea. */
export interface ServicioEditado {
  readonly id?: string;
  readonly nombre: string;
  readonly precioRegular: number | null;
  readonly precioPromocional: number;
}

/** Hasta 10: lo que cabe en la lista de WhatsApp para elegir cuál pagar. */
export const SERVICIOS_POR_PROMOCION = 10;

export interface PromocionResumen {
  readonly id: string;
  readonly codigo: string;
  readonly titulo: string;
  readonly resumen: string;
  readonly estado: EstadoPromocion;
  readonly vigencia: Vigencia;
  readonly vigenteDesde: string;
  readonly vigenteHasta: string | null;
  readonly etiquetaOferta: string | null;
  readonly precioRegular: number | null;
  readonly precioPromocional: number | null;
  /** Cuántos servicios trae (0 = una promoción de un solo precio) y el más barato. */
  readonly servicios: number;
  readonly desde: number | null;
  readonly destacada: boolean;
  readonly enLanding: boolean;
  readonly enWhatsapp: boolean;
  readonly especialidad: { readonly id: string; readonly nombre: string } | null;
  /** Firmada: se muestra, nunca se guarda (caduca). */
  readonly bannerUrl: string | null;
  readonly anuncios: number;
  readonly creadaPor: string | null;
  readonly updatedAt: string;
  readonly version: number;
}

export interface BannerPromocion {
  readonly id: string;
  readonly formato: FormatoBanner;
  readonly ancho: number;
  readonly alto: number;
  readonly bytes: number;
  readonly textoAlternativo: string;
  /** Firmada, para verla en el CRM. */
  readonly url: string | null;
  /** La que ve la landing; solo existe si está publicada. */
  readonly urlPublica: string | null;
}

export interface PromocionDetalle extends Omit<PromocionResumen, 'bannerUrl' | 'anuncios' | 'creadaPor' | 'especialidad' | 'servicios' | 'desde'> {
  /** Sus servicios con su precio, en orden. Vacío = una promoción de un solo precio. */
  readonly servicios: readonly ServicioPromocion[];
  readonly slug: string;
  readonly descripcion: string;
  readonly condiciones: string;
  readonly especialidad: { readonly id: string; readonly nombre: string; readonly slug: string } | null;
  readonly medicos: readonly { readonly id: string; readonly nombrePublico: string; readonly slug: string; readonly publicado: boolean }[];
  readonly imagenes: readonly BannerPromocion[];
  readonly anuncios: readonly { readonly anuncioId: string; readonly asignadoEn: string }[];
  readonly creadaPor: { readonly id: string; readonly nombre: string } | null;
  readonly revisadaPor: { readonly id: string; readonly nombre: string } | null;
  readonly publicadaEn: string | null;
  readonly motivoDevolucion: string | null;
  readonly createdAt: string;
  readonly mensajeWhatsapp: string;
  /** Lo que el servidor dice que falta para publicarla. Vacío = lista. */
  readonly faltantes: readonly string[];
  /** Si ESTA persona puede editarla en su estado actual. */
  readonly puedeEditar: boolean;
  /** Las transiciones que ESTA persona puede pedir ahora. */
  readonly acciones: readonly AccionPromocion[];
  readonly resultados: { readonly leads: number; readonly ventasGanadas: number; readonly montoVendido: number };
}

/** Lo que se manda al crear o editar. `null` borra; lo ausente no cambia. */
export interface CambiosPromocion {
  titulo?: string;
  resumen?: string;
  descripcion?: string;
  condiciones?: string;
  etiquetaOferta?: string | null;
  precioRegular?: number | null;
  precioPromocional?: number | null;
  vigenteDesde?: string;
  vigenteHasta?: string | null;
  destacada?: boolean;
  enLanding?: boolean;
  enWhatsapp?: boolean;
  especialidadId?: string | null;
  medicoIds?: string[];
  servicios?: ServicioEditado[];
}

export interface AnuncioSinPromocion {
  readonly anuncioId: string;
  readonly leads: number;
  readonly ultimoEn: string;
  readonly titular: string | null;
  readonly imagenUrl: string | null;
}

export const ESTADO_PROMOCION: Readonly<Record<EstadoPromocion, { readonly etiqueta: string; readonly variante: BadgeVariant }>> = {
  BORRADOR: { etiqueta: 'Borrador', variante: 'neutral' },
  EN_REVISION: { etiqueta: 'En revisión', variante: 'info' },
  PUBLICADA: { etiqueta: 'Publicada', variante: 'success' },
  PAUSADA: { etiqueta: 'Pausada', variante: 'neutral' },
  ARCHIVADA: { etiqueta: 'Archivada', variante: 'neutral' },
};

export const VIGENCIA: Readonly<Record<Vigencia, string>> = {
  PROXIMA: 'Empieza pronto',
  VIGENTE: 'Vigente',
  VENCIDA: 'Vencida',
};

/** Los filtros del listado, en el orden en que se trabaja: lo que espera a alguien primero. */
export const FILTROS_ESTADO: readonly (EstadoPromocion | null)[] = [null, 'EN_REVISION', 'BORRADOR', 'PUBLICADA', 'PAUSADA', 'ARCHIVADA'];

/** Cómo se dice cada acción en un botón, y el aviso cuando sale bien. */
export const ACCION: Readonly<Record<AccionPromocion, { readonly boton: string; readonly exito: string }>> = {
  enviar: { boton: 'Enviar a revisión', exito: 'Enviada: un administrador la revisa y la publica.' },
  devolver: { boton: 'Devolver', exito: 'Devuelta a borrador con tu motivo.' },
  publicar: { boton: 'Publicar', exito: 'Publicada: ya la ven la landing y WhatsApp mientras esté vigente.' },
  pausar: { boton: 'Pausar', exito: 'Pausada: deja de mostrarse hasta que la vuelvas a publicar.' },
  archivar: { boton: 'Archivar', exito: 'Archivada. Para repetirla, crea otra.' },
};

/**
 * Espejo de `FORMATOS_BANNER` del backend, que es quien valida. Aquí sirve para
 * decirle a la agente QUÉ medida subir antes de que el servidor la rechace.
 */
export const FORMATOS: readonly { readonly formato: FormatoBanner; readonly nombre: string; readonly medida: string; readonly uso: string; readonly obligatorio: boolean }[] = [
  { formato: 'CUADRADO', nombre: 'Cuadrado 1:1', medida: '1080×1080 o más', uso: 'WhatsApp, tarjetas de la landing y feed', obligatorio: true },
  { formato: 'VERTICAL', nombre: 'Vertical 4:5', medida: '1080×1350 o más', uso: 'Feed de Instagram y Facebook en el teléfono', obligatorio: false },
  { formato: 'HISTORIA', nombre: 'Historia 9:16', medida: '1080×1920 o más', uso: 'Historias y Reels', obligatorio: false },
  { formato: 'HORIZONTAL', nombre: 'Horizontal 1,91:1', medida: '1200×628 o más', uso: 'Cabecera en la landing y enlaces compartidos', obligatorio: false },
];


/** «Del 1 oct al 31 oct 2026», «Desde el 1 oct 2026». */
export function rangoVigencia(desde: string, hasta: string | null): string {
  return hasta ? `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}` : `Desde el ${fechaCorta(desde)}, sin fecha de fin`;
}


/** Lo que el formulario de la ficha edita, como texto (así se teclea). */
/** Una fila del editor de servicios: los precios como se escriben. `clave` solo identifica la fila en pantalla. */
export interface FilaServicio {
  readonly clave: string;
  readonly id?: string;
  readonly nombre: string;
  readonly precioRegular: string;
  readonly precioPromocional: string;
}

export interface BorradorPromocion {
  titulo: string;
  resumen: string;
  descripcion: string;
  condiciones: string;
  etiquetaOferta: string;
  precioRegular: string;
  precioPromocional: string;
  vigenteDesde: string;
  vigenteHasta: string;
  destacada: boolean;
  enLanding: boolean;
  enWhatsapp: boolean;
  especialidadId: string;
  servicios: FilaServicio[];
}

export function borradorDe(p: PromocionDetalle): BorradorPromocion {
  return {
    titulo: p.titulo,
    resumen: p.resumen,
    descripcion: p.descripcion,
    condiciones: p.condiciones,
    etiquetaOferta: p.etiquetaOferta ?? '',
    precioRegular: p.precioRegular === null ? '' : String(p.precioRegular),
    precioPromocional: p.precioPromocional === null ? '' : String(p.precioPromocional),
    vigenteDesde: p.vigenteDesde,
    vigenteHasta: p.vigenteHasta ?? '',
    destacada: p.destacada,
    enLanding: p.enLanding,
    enWhatsapp: p.enWhatsapp,
    especialidadId: p.especialidad?.id ?? '',
    servicios: p.servicios.map(s => ({
      clave: s.id, id: s.id, nombre: s.nombre,
      precioRegular: s.precioRegular === null ? '' : String(s.precioRegular), precioPromocional: String(s.precioPromocional),
    })),
  };
}

/**
 * Las filas del editor como viajan al servidor, o el motivo por el que todavía
 * no se pueden guardar. Las mismas reglas que el servidor (`problemasDeServicios`),
 * dichas antes de guardar.
 */
export function serviciosDeFilas(filas: readonly FilaServicio[]): { servicios: ServicioEditado[] } | { error: string } {
  if (filas.length > SERVICIOS_POR_PROMOCION) return { error: `Una promoción lleva como mucho ${SERVICIOS_POR_PROMOCION} servicios.` };
  const servicios: ServicioEditado[] = [];
  const vistos = new Set<string>();
  for (const f of filas) {
    const nombre = f.nombre.trim();
    if (nombre.length < 2) return { error: 'Cada servicio necesita su nombre.' };
    const clave = nombre.toLocaleLowerCase('es');
    if (vistos.has(clave)) return { error: `«${nombre}» está dos veces.` };
    vistos.add(clave);
    const regular = precioDeTexto(f.precioRegular);
    const promocional = precioDeTexto(f.precioPromocional);
    if (regular === undefined || promocional === undefined) return { error: `En «${nombre}», escribe los precios solo con números, por ejemplo 268 o 268,50.` };
    if (promocional === null || promocional <= 0) return { error: `«${nombre}» necesita su precio de promoción.` };
    if (regular !== null && promocional >= regular) return { error: `En «${nombre}», el precio de promoción tiene que ser menor que el de siempre.` };
    servicios.push({ ...(f.id ? { id: f.id } : {}), nombre, precioRegular: regular, precioPromocional: promocional });
  }
  return { servicios };
}

/**
 * Lo que cambió respecto de la promoción guardada, listo para el PATCH, o el
 * motivo por el que todavía no se puede guardar. Solo viaja lo que se tocó:
 * así una edición no pisa campos que otra persona cambió (y el 409 de la
 * versión ya cubre el resto).
 */
export function cambiosDe(p: PromocionDetalle, b: BorradorPromocion): { cambios: CambiosPromocion } | { error: string } {
  const regular = precioDeTexto(b.precioRegular);
  const promocional = precioDeTexto(b.precioPromocional);
  if (regular === undefined || promocional === undefined) return { error: 'Escribe los precios solo con números, por ejemplo 480 o 480,50.' };
  if (regular !== null && promocional !== null && promocional >= regular) return { error: 'El precio promocional tiene que ser menor que el regular.' };
  if (!b.titulo.trim() || !b.resumen.trim()) return { error: 'El título y el resumen no pueden quedar vacíos.' };
  const servicios = serviciosDeFilas(b.servicios);
  if ('error' in servicios) return servicios;
  if (servicios.servicios.length && (regular !== null || promocional !== null)) {
    return { error: 'Con servicios, el precio va en cada servicio: deja vacíos los precios de la promoción.' };
  }
  if (!b.vigenteDesde) return { error: 'Falta el día en que empieza.' };
  if (b.vigenteHasta && b.vigenteHasta < b.vigenteDesde) return { error: 'La vigencia termina antes de empezar.' };

  const cambios: CambiosPromocion = {};
  if (b.titulo.trim() !== p.titulo) cambios.titulo = b.titulo.trim();
  if (b.resumen.trim() !== p.resumen) cambios.resumen = b.resumen.trim();
  if (b.descripcion.trim() !== p.descripcion) cambios.descripcion = b.descripcion.trim();
  if (b.condiciones.trim() !== p.condiciones) cambios.condiciones = b.condiciones.trim();
  if ((b.etiquetaOferta.trim() || null) !== p.etiquetaOferta) cambios.etiquetaOferta = b.etiquetaOferta.trim() || null;
  if (regular !== p.precioRegular) cambios.precioRegular = regular;
  if (promocional !== p.precioPromocional) cambios.precioPromocional = promocional;
  if (b.vigenteDesde !== p.vigenteDesde) cambios.vigenteDesde = b.vigenteDesde;
  if ((b.vigenteHasta || null) !== p.vigenteHasta) cambios.vigenteHasta = b.vigenteHasta || null;
  if (b.destacada !== p.destacada) cambios.destacada = b.destacada;
  if (b.enLanding !== p.enLanding) cambios.enLanding = b.enLanding;
  if (b.enWhatsapp !== p.enWhatsapp) cambios.enWhatsapp = b.enWhatsapp;
  if ((b.especialidadId || null) !== (p.especialidad?.id ?? null)) cambios.especialidadId = b.especialidadId || null;
  const antes = p.servicios.map(({ id, nombre, precioRegular, precioPromocional }) => ({ id, nombre, precioRegular, precioPromocional }));
  if (JSON.stringify(antes) !== JSON.stringify(servicios.servicios.map(s => ({ id: s.id, nombre: s.nombre, precioRegular: s.precioRegular, precioPromocional: s.precioPromocional })))) {
    cambios.servicios = servicios.servicios;
  }
  return { cambios };
}
