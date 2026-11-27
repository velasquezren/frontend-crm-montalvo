import { EstadoMensaje } from '../../../core/api/db-enums';
import { RespuestaPaginada } from '../../../core/api/pagination.model';
import { BadgeVariant } from '../../../shared/components/badge/badge.component';
import { nombreMes } from '../../../shared/models/meses';
import { explicacionErrorWhatsapp } from '../../conversaciones/error-whatsapp';
import { NOMBRES_TIPO, TIPOS_INFORME, TipoInforme } from '../resultado.model';

/**
 * Espejo de `FilaConstancia` y `ConstanciaMensual` (backend:
 * modules/resultados/constancia-resultados.service.ts). Lo que consta de cada
 * aviso de resultado enviado en un mes, para imprimirlo y notariarlo.
 */
export interface EntregaWhatsapp {
  readonly estado: EstadoMensaje | null;
  readonly enviadoEn: string;
  readonly entregadoEn: string | null;
  readonly leidoEn: string | null;
  readonly codigoError: number | null;
}

export interface UsoPortal {
  readonly veces: number;
  readonly primera: string;
  readonly ultima: string;
}

export interface FilaConstancia {
  readonly avisoId: string;
  readonly enviadoEn: string;
  readonly enviadoPor: { readonly nombre: string | null; readonly usuarioFilemaker: string | null };
  /** `telefonoAlEnviar: false` = aviso anterior al 18/11/2026: es el número ACTUAL de la ficha. */
  readonly destinatario: {
    readonly nombre: string;
    readonly telefono: string | null;
    readonly telefonoAlEnviar: boolean;
    readonly otraFicha: boolean;
  } | null;
  readonly informeId: string;
  readonly estudio: string | null;
  /** `null` = el informe ya no existe en el portal. */
  readonly informe: {
    readonly tipo: TipoInforme;
    readonly fechaEstudio: string;
    readonly estado: 'BORRADOR' | 'PUBLICADO' | 'RETIRADO';
    readonly publicadoEn: string | null;
    readonly retiradoEn: string | null;
    readonly paciente: { readonly nombre: string; readonly pac: string | null; readonly ci: string | null };
    readonly medico: string;
  } | null;
  readonly whatsapp: EntregaWhatsapp | null;
  /** La línea de WhatsApp por la que salió (LABORATORIO sale por la de Laboratorio Climon). */
  readonly linea: { readonly nombre: string; readonly telefono: string | null } | null;
  readonly portal: {
    readonly primera: string | null;
    readonly pdf: UsoPortal | null;
    readonly original: UsoPortal | null;
    readonly adjuntos: UsoPortal | null;
  } | null;
  readonly pdfPorWhatsapp: ReadonlyArray<{ readonly solicitadoEn: string; readonly envio: EntregaWhatsapp | null }>;
}

export interface ConstanciaMensual extends RespuestaPaginada<FilaConstancia> {
  readonly mes: string;
  readonly desde: string;
  readonly hasta: string;
  /** Cuándo se calcularon los datos: el momento de validar, si es la copia validada. */
  readonly generadoEn: string;
  /** `VALIDADA` = la copia congelada al validar el mes; `EN_VIVO` = recalculada ahora. */
  readonly version: VersionConstancia;
  /** El mes validado (aunque se pida en vivo), o `null`. */
  readonly validacion: ValidacionConstancia | null;
}

export type VersionConstancia = 'VALIDADA' | 'EN_VIVO';

/** Quién validó el mes (solo SUPER_ADMIN) y cuándo, con el nombre que tenía entonces. */
export interface ValidacionConstancia {
  readonly en: string;
  readonly porNombre: string;
  readonly totalAvisos: number;
}

/** Un mes del historial de la constancia. */
export interface MesConstancia {
  readonly mes: string;
  readonly avisos: number;
  /** El mes no terminó: no se puede validar todavía. */
  readonly enCurso: boolean;
  readonly validacion: ValidacionConstancia | null;
  readonly impresiones: { readonly total: number; readonly ultima: { readonly en: string; readonly porNombre: string | null } | null };
}

/** Lo que se registra al imprimir: quién imprimió lo pone el backend. */
export interface ImpresionConstancia {
  readonly tipo?: GrupoConstancia;
  readonly filtro?: string;
  readonly filas: number;
  readonly version: VersionConstancia;
}

/** Lo que la pantalla muestra arriba: cuántos de cada cosa en el mes. */
export interface ResumenConstancia {
  readonly avisos: number;
  /** WhatsApp confirmó que llegó al teléfono (entregado o leído). */
  readonly entregados: number;
  readonly leidos: number;
  /** Meta lo rechazó: no llegó. */
  readonly noEntregados: number;
  /** Se usó el enlace del portal al menos una vez. */
  readonly abiertos: number;
  /** El paciente pidió el PDF por el chat. */
  readonly pdfPedidos: number;
}

/** Cuántos de `total` son `n`, en porcentaje entero («95 %»); sin total no hay porcentaje. */
export function porcentaje(n: number, total: number): string | null {
  return total > 0 ? `${Math.round((n / total) * 100)} %` : null;
}

/** ¿Consta que el mensaje llegó al teléfono? */
export function llegoAlTelefono(w: EntregaWhatsapp | null): boolean {
  return !!w && (!!w.entregadoEn || !!w.leidoEn || w.estado === 'ENTREGADO' || w.estado === 'LEIDO');
}

export function resumenConstancia(filas: readonly FilaConstancia[]): ResumenConstancia {
  return {
    avisos: filas.length,
    entregados: filas.filter(f => llegoAlTelefono(f.whatsapp)).length,
    leidos: filas.filter(f => !!f.whatsapp?.leidoEn || f.whatsapp?.estado === 'LEIDO').length,
    noEntregados: filas.filter(f => f.whatsapp?.estado === 'FALLIDO').length,
    abiertos: filas.filter(f => !!f.portal?.primera).length,
    pdfPedidos: filas.filter(f => f.pdfPorWhatsapp.length > 0).length,
  };
}

/**
 * El estado del mensaje en palabras de una constancia: lo que consta, sin
 * suponer. Un ENVIADO sin confirmación no dice «no llegó»: dice que WhatsApp
 * no confirmó la entrega (el teléfono pudo estar apagado o sin datos).
 */
export function estadoWhatsapp(w: EntregaWhatsapp | null): string {
  if (!w) return 'Sin registro del mensaje';
  if (w.estado === 'FALLIDO') return w.codigoError ? `No entregado (WhatsApp, código ${w.codigoError})` : 'No entregado';
  if (w.leidoEn || w.estado === 'LEIDO') return 'Leído';
  if (w.entregadoEn || w.estado === 'ENTREGADO') return 'Entregado';
  if (w.estado === 'INCIERTO') return 'Envío sin confirmar';
  return 'Enviado, sin confirmación de entrega';
}

/** La insignia del estado de WhatsApp: llegó (verde), Meta lo rechazó (negro), lo demás sin confirmar. */
export function varianteWhatsapp(w: EntregaWhatsapp | null): BadgeVariant {
  if (w?.estado === 'FALLIDO') return 'critical';
  return llegoAlTelefono(w) ? 'success' : 'neutral';
}

/**
 * Lo que dice la insignia: el estado en una o dos palabras, para que quepa en
 * la columna (~11rem). El matiz va debajo, con `detalleWhatsapp`.
 */
export function etiquetaWhatsapp(w: EntregaWhatsapp | null): string {
  if (!w) return 'Sin registro';
  if (w.estado === 'FALLIDO') return 'No entregado';
  if (w.leidoEn || w.estado === 'LEIDO') return 'Leído';
  if (w.entregadoEn || w.estado === 'ENTREGADO') return 'Entregado';
  if (w.estado === 'INCIERTO') return 'Sin confirmar';
  return 'Enviado';
}

/** La línea bajo la insignia: por qué no llegó (código de Meta y su explicación) o qué falta confirmar. */
export function detalleWhatsapp(w: EntregaWhatsapp | null): string | null {
  if (!w) return 'No se encontró el mensaje del aviso';
  if (w.estado === 'FALLIDO') return w.codigoError ? `Código ${w.codigoError}: ${explicacionErrorWhatsapp(w.codigoError)}` : 'WhatsApp no dio el motivo';
  if (llegoAlTelefono(w)) return null;
  return w.estado === 'INCIERTO' ? 'No se sabe si WhatsApp lo aceptó' : 'WhatsApp no confirmó la entrega';
}

/**
 * Un tipo de informe en la constancia. `SIN_PORTAL` = el informe ya no existe
 * en el portal y no se sabe de qué tipo era: va aparte, al final, sin
 * mezclarse con ningún tipo.
 */
export type GrupoConstancia = TipoInforme | 'SIN_PORTAL';
export const GRUPOS_CONSTANCIA: readonly GrupoConstancia[] = [...TIPOS_INFORME, 'SIN_PORTAL'];
export const NOMBRES_GRUPO: Readonly<Record<GrupoConstancia, string>> = {
  ...NOMBRES_TIPO,
  SIN_PORTAL: 'Informes que ya no están en el portal',
};

export function grupoDe(f: FilaConstancia): GrupoConstancia {
  return f.informe?.tipo ?? 'SIN_PORTAL';
}

export interface SeccionConstancia {
  readonly grupo: GrupoConstancia;
  readonly nombre: string;
  readonly filas: readonly FilaConstancia[];
  readonly resumen: ResumenConstancia;
  /** Las líneas por las que salieron sus avisos, con cuántos cada una (la más usada primero). */
  readonly lineas: ReadonlyArray<{ readonly nombre: string; readonly telefono: string | null; readonly avisos: number }>;
}

/**
 * Los avisos separados por tipo de informe, en el orden fijo de los tipos y
 * conservando el orden de envío dentro de cada uno. Solo los tipos con avisos.
 */
export function seccionesPorTipo(filas: readonly FilaConstancia[]): SeccionConstancia[] {
  return GRUPOS_CONSTANCIA.flatMap(grupo => {
    const propias = filas.filter(f => grupoDe(f) === grupo);
    if (!propias.length) return [];
    const lineas = new Map<string, { nombre: string; telefono: string | null; avisos: number }>();
    for (const f of propias) {
      if (!f.linea) continue;
      const clave = `${f.linea.nombre}|${f.linea.telefono ?? ''}`;
      const actual = lineas.get(clave) ?? { ...f.linea, avisos: 0 };
      actual.avisos++;
      lineas.set(clave, actual);
    }
    return [{
      grupo, nombre: NOMBRES_GRUPO[grupo], filas: propias, resumen: resumenConstancia(propias),
      lineas: [...lineas.values()].sort((a, b) => b.avisos - a.avisos),
    }];
  });
}

/** El tipo elegido en la URL; cualquier otra cosa es «todos». */
export function grupoDeUrl(valor: string | null): GrupoConstancia | null {
  return GRUPOS_CONSTANCIA.find(g => g === valor) ?? null;
}

/** Filtro por lo que pasó con el aviso. Cada uno es una pregunta que se hace a la constancia. */
export const FILTROS_ESTADO = {
  TODOS: 'Todos los estados',
  ENTREGADOS: 'Entregados al teléfono',
  LEIDOS: 'Leídos',
  SIN_CONFIRMAR: 'Sin confirmación de entrega',
  NO_ENTREGADOS: 'No entregados',
  ABIERTOS: 'Abiertos en el portal',
  SIN_ABRIR: 'Sin abrir en el portal',
  PDF_PEDIDO: 'Con PDF pedido por WhatsApp',
} as const;
export type FiltroEstado = keyof typeof FILTROS_ESTADO;

export function filtroEstadoDeUrl(valor: string | null): FiltroEstado {
  /* `hasOwn`, no `in`: «toString» está en el prototipo y la URL la escribe cualquiera. */
  return valor && Object.hasOwn(FILTROS_ESTADO, valor) ? (valor as FiltroEstado) : 'TODOS';
}

export function cumpleEstado(f: FilaConstancia, filtro: FiltroEstado): boolean {
  switch (filtro) {
    case 'TODOS': return true;
    case 'ENTREGADOS': return llegoAlTelefono(f.whatsapp);
    case 'LEIDOS': return !!f.whatsapp?.leidoEn || f.whatsapp?.estado === 'LEIDO';
    case 'SIN_CONFIRMAR': return f.whatsapp?.estado !== 'FALLIDO' && !llegoAlTelefono(f.whatsapp);
    case 'NO_ENTREGADOS': return f.whatsapp?.estado === 'FALLIDO';
    case 'ABIERTOS': return !!f.portal?.primera;
    /* Sin datos del portal no consta que se abriera, pero tampoco que no: no entra. */
    case 'SIN_ABRIR': return !!f.portal && !f.portal.primera;
    case 'PDF_PEDIDO': return f.pdfPorWhatsapp.length > 0;
  }
}

/** Minúsculas y sin tildes: «García» se encuentra escribiendo «garcia». */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/**
 * ¿El aviso coincide con lo que se escribió en «Buscar»? Por número, en
 * dígitos (así «7000 0001», «+591 70000001» y «70000001» encuentran lo mismo),
 * y por texto en nombre del paciente o de quien recibió el WhatsApp, PAC, CI,
 * estudio, médico y cuenta que lo envió. Vacío = todos.
 */
export function coincideBusqueda(f: FilaConstancia, busqueda: string): boolean {
  const texto = normalizar(busqueda);
  if (!texto) return true;
  const digitos = texto.replace(/\D/g, '');
  /* Lo que se escribió es un número (con espacios, + o guiones): se compara en dígitos. */
  if (digitos.length >= 3 && /^[\d\s+()-]+$/.test(texto)) {
    return [f.destinatario?.telefono, f.informe?.paciente.ci, f.informe?.paciente.pac]
      .some(v => !!v && v.replace(/\D/g, '').includes(digitos));
  }
  return [
    f.destinatario?.nombre, f.destinatario?.telefono, f.informe?.paciente.nombre, f.informe?.paciente.pac,
    f.informe?.paciente.ci, f.estudio, f.informe?.medico, f.enviadoPor.nombre, f.enviadoPor.usuarioFilemaker,
  ].some(v => !!v && normalizar(v).includes(texto));
}

/** «2026-11». La URL la escribe cualquiera: lo que no es un mes vale el de por defecto. */
export function mesDeUrl(valor: string | null, porDefecto: string): string {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : porDefecto;
}

/** El mes anterior a `mes` («2026-01» → «2025-12»). */
export function mesAnterior(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number);
  return numero === 1 ? `${anio - 1}-12` : `${anio}-${String(numero - 1).padStart(2, '0')}`;
}

/** «Noviembre de 2026». */
export function nombreDelMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number);
  return `${nombreMes(numero)} de ${anio}`;
}

/** Los últimos `n` meses hasta `actual`, del más reciente al más antiguo. */
export function mesesParaElegir(actual: string, n = 12): ReadonlyArray<{ readonly valor: string; readonly etiqueta: string }> {
  const meses: Array<{ valor: string; etiqueta: string }> = [];
  let mes = actual;
  for (let i = 0; i < n; i++) {
    meses.push({ valor: mes, etiqueta: i === 0 ? `${nombreDelMes(mes)} (en curso)` : nombreDelMes(mes) });
    mes = mesAnterior(mes);
  }
  return meses;
}
