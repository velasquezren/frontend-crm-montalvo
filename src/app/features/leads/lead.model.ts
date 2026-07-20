import { CategoriaCliente } from '../../shared/models/cliente-categoria.model';

/** Enums espejo del schema.prisma del backend. */
export type OrigenLeadApi =
  | 'FACEBOOK_LEAD_AD'
  | 'FACEBOOK_COMENTARIO'
  | 'FACEBOOK_MENSAJE'
  | 'INSTAGRAM_LEAD_AD'
  | 'INSTAGRAM_COMENTARIO'
  | 'INSTAGRAM_MENSAJE'
  | 'WHATSAPP_DIRECTO'
  | 'PRESENCIAL'
  | 'IMPORTACION';

export type EstadoLead = 'NUEVO' | 'CONTACTADO' | 'CONVERTIDO' | 'PERDIDO';

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
    id: string;
    nombre: string;
    telefono: string;
    categoria: CategoriaCliente;
  };
  readonly agente: { id: string; nombre: string } | null;
  readonly createdAt: string;
}
