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
    readonly agente?: { readonly id: string; readonly nombre: string } | null;
    readonly datosExtra?: Record<string, any> | null;
  };
  readonly agente: { readonly id: string; readonly nombre: string } | null;
  readonly createdAt: string;
}
