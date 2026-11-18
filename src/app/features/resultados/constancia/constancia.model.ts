import { EstadoMensaje } from '../../../core/api/db-enums';
import { RespuestaPaginada } from '../../../core/api/pagination.model';
import { nombreMes } from '../../../shared/models/meses';
import { TipoInforme } from '../resultado.model';

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
  readonly generadoEn: string;
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
