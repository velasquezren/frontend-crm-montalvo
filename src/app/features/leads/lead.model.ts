import { DatosExtra } from '../../core/api/datos-extra';

import { CategoriaCliente, OrigenLead as OrigenLeadApi, EstadoLead } from '../../core/api/db-enums';

export type { OrigenLeadApi, EstadoLead };

export const ORIGEN_LABEL: Record<OrigenLeadApi, string> = {
  FACEBOOK_LEAD_AD: 'Facebook · Lead Ad',
  FACEBOOK_COMENTARIO: 'Facebook · Comentario',
  FACEBOOK_MENSAJE: 'Facebook · Mensaje',
  INSTAGRAM_LEAD_AD: 'Instagram · Lead Ad',
  INSTAGRAM_COMENTARIO: 'Instagram · Comentario',
  INSTAGRAM_MENSAJE: 'Instagram · Mensaje',
  WHATSAPP_DIRECTO: 'WhatsApp directo',
  PRESENCIAL: 'Presencial',
  IMPORTACION: 'Importación histórica',
};

/**
 * Intereses que se ofrecen con un toque al dar de alta un lead. Una sola lista
 * para el alta rápida de Leads y el Registro presencial: el registro tenía una
 * propia de clínica dental (limpieza, ortodoncia, implantes) que no es de esta
 * clínica, y lo que la agente tocaba ahí quedaba guardado como interés.
 */
export const INTERESES_SUGERIDOS: readonly string[] = [
  'Parto Humanizado',
  'Cesárea',
  'Ginecología',
  'Ecografía 5D',
  'Cirugía Plástica',
  'Pediatría',
  'Laboratorio',
  'Consulta Médica',
];

/** Respuesta de GET /leads. */
export interface Lead {
  readonly id: string;
  readonly origen: OrigenLeadApi;
  readonly estado: EstadoLead;
  readonly cliente: {
    readonly id: string;
    readonly nombre: string;
    readonly telefono: string;
    readonly categoria: CategoriaCliente;
    readonly pac?: string | null;
    readonly ci?: string | null;
    readonly agente?: { readonly id: string; readonly nombre: string } | null;
    readonly datosExtra?: DatosExtra | null;
  };
  readonly agente: { readonly id: string; readonly nombre: string } | null;
  /**
   * Anuncio de Meta que trajo este lead (`referral.source_id`), si vino de uno.
   *
   * El backend lo devuelve desde siempre —`findAll` usa `include`, que trae
   * todos los escalares de Lead—, pero no estaba declarado aquí. Es lo único
   * que distingue dos leads del mismo canal y el mismo día al corregir la
   * atribución de una venta.
   */
  readonly anuncioId?: string | null;
  /** Solo tiene valor si `estado = 'PERDIDO'`; se limpia al volver a moverse. */
  readonly motivoPerdida?: string | null;
  readonly createdAt: string;
}
