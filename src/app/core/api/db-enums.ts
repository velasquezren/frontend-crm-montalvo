/**
 * ARCHIVO GENERADO — NO EDITAR A MANO.
 *
 * Fuente de verdad: backend-crm-montalvo/prisma/schema.prisma
 * Regenerar:  npm run sync:tipos
 * Verificar:  npm run check:tipos   (falla si el schema cambió y esto no)
 */
export type Rol = 'SUPER_ADMIN' | 'ADMIN' | 'AGENTE';

export type CategoriaCliente = 'PROSPECTO' | 'BRONZE' | 'SILVER' | 'GOLD';

export type OrigenLead =
  | 'FACEBOOK_LEAD_AD'
  | 'FACEBOOK_COMENTARIO'
  | 'FACEBOOK_MENSAJE'
  | 'INSTAGRAM_LEAD_AD'
  | 'INSTAGRAM_COMENTARIO'
  | 'INSTAGRAM_MENSAJE'
  | 'WHATSAPP_DIRECTO'
  | 'PRESENCIAL'
  | 'IMPORTACION';

export type EstadoVenta = 'GANADA' | 'EN_PROCESO' | 'PERDIDA';

export type EstadoLead = 'NUEVO' | 'CONTACTADO' | 'CONVERTIDO' | 'PERDIDO';

export type EstadoComision = 'PENDIENTE' | 'PAGADA';

export type DireccionMensaje = 'ENTRANTE' | 'SALIENTE';

export type TipoMensaje = 'TEXTO' | 'IMAGEN' | 'DOCUMENTO' | 'AUDIO' | 'VIDEO' | 'STICKER';

export type EstadoMensaje = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';

export type TipoRecursoMemoria = 'TEXTO' | 'IMAGEN' | 'DOCUMENTO' | 'ENLACE';

export type CategoriaRecursoMemoria =
  | 'GENERAL'
  | 'RESPUESTA_RAPIDA'
  | 'PROMOCION'
  | 'PRECIOS'
  | 'PRODUCTO_TRATAMIENTO'
  | 'INSTRUCCION_INTERNA';

export type CanalVenta = 'EMPRESA' | 'PROPIO';

export type UnidadNegocio = 'MATERNIDAD' | 'RA' | 'VARIOS';

export type ClasifComision =
  | 'PLANPAQ'
  | 'PLANNIN'
  | 'CIRUGIA'
  | 'CONSULTA'
  | 'LAB'
  | 'ECOGRAFIA'
  | 'OTROSS'
  | 'CAMPANA'
  | 'PROMOCION';

export type TipoComision = 'A' | 'B' | 'C';

export type NivelPlan = 'BRONCE' | 'SILVER' | 'GOLD';

export type TipoVendedora = 'JEFA' | 'VENDEDORA';

export type AreaVendedora = 'EJECUTIVA' | 'RA' | 'PUBLICIDAD';

export type EstadoPeriodo = 'BORRADOR' | 'CALCULADO' | 'CERRADO';
