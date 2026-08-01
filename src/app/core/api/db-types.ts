/**
 * FUENTE ÚNICA DE VERDAD DE MODELOS DE BASE DE DATOS (SSOT)
 * Ref: schema.prisma (backend-crm-montalvo)
 *
 * Todos los tipos, enums e interfaces de la base de datos se exportan desde este
 * archivo central para evitar desincronización manual en tiempo de desarrollo.
 */

/* ── ENUMS SSOT (schema.prisma) ─────────────────────────────────── */

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

export type TipoMensaje =
  | 'TEXTO'
  | 'IMAGEN'
  | 'DOCUMENTO'
  | 'AUDIO'
  | 'VIDEO'
  | 'STICKER';

export type EstadoMensaje = 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';

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

/* ── MODELOS DE ENTIDAD PRINCIPALES (schema.prisma) ──────────────── */

export interface DbUsuario {
  readonly id: string;
  readonly nombre: string;
  readonly email: string;
  readonly rol: Rol;
  readonly activo: boolean;
  readonly foto?: string | null;
  readonly codigo?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DbCliente {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string;
  readonly email?: string | null;
  readonly categoria: CategoriaCliente;
  readonly agenteId?: string | null;
  readonly agente?: { readonly id: string; readonly nombre: string } | null;
  readonly pac?: string | null;
  readonly fechaNacimiento?: string | null;
  readonly sexo?: string | null;
  readonly ocupacion?: string | null;
  readonly ci?: string | null;
  readonly ciLugar?: string | null;
  readonly estadoCivil?: string | null;
  readonly direccion?: string | null;
  readonly nacionalidad?: string | null;
  readonly telefonoFijo?: string | null;
  readonly datosExtra?: Record<string, any> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DbLead {
  readonly id: string;
  readonly clienteId: string;
  readonly origen: OrigenLead;
  readonly estado: EstadoLead;
  readonly metaLeadId?: string | null;
  readonly agenteId?: string | null;
  readonly agente?: { readonly id: string; readonly nombre: string } | null;
  readonly cliente: DbCliente;
  readonly createdAt: string;
}

export interface DbVenta {
  readonly id: string;
  readonly clienteId: string;
  readonly agenteId: string;
  readonly producto: string;
  readonly monto: number | string;
  readonly estado: EstadoVenta;
  readonly cliente?: DbCliente;
  readonly agente?: { readonly id: string; readonly nombre: string };
  readonly createdAt: string;
}

export interface DbPeriodoComision {
  readonly id: string;
  readonly anio: number;
  readonly mes: number;
  readonly tipoCambio: number | string;
  readonly estado: EstadoPeriodo;
  readonly archivoNombre?: string | null;
  readonly filasTotales: number;
  readonly filasValidas: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DbVentaImportada {
  readonly id: string;
  readonly periodoId: string;
  readonly fecha?: string | null;
  readonly modulo?: string | null;
  readonly codOrigen?: string | null;
  readonly estadoPlan?: string | null;
  readonly codItem?: string | null;
  readonly detalle: string;
  readonly pac?: string | null;
  readonly paciente?: string | null;
  readonly medicoPk?: string | null;
  readonly medico?: string | null;
  readonly vendedoraPk?: string | null;
  readonly vendedoraNombre?: string | null;
  readonly captacion?: string | null;
  readonly seguro?: string | null;
  readonly promocion?: string | null;
  readonly precio: number | string;
  readonly anticipoPlan?: number | string | null;
  readonly tc?: number | string | null;
  readonly obs?: string | null;
  readonly clasificacionPlan?: string | null;
  readonly canal: CanalVenta;
  readonly ingresoNeto: number | string;
  readonly unidadNegocio: UnidadNegocio;
  readonly clasif: ClasifComision;
  readonly tipo: TipoComision;
  readonly nivel?: NivelPlan | null;
  readonly comisionable: boolean;
  readonly motivoExclusion?: string | null;
  readonly requiereRevision: boolean;
  readonly ajustadaManual: boolean;
  readonly vendedoraId?: string | null;
  readonly createdAt: string;
}

export interface DbVendedoraComision {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly tipo: TipoVendedora;
  readonly area: AreaVendedora;
  readonly sueldoBase: number | string;
  readonly activa: boolean;
  readonly configurada: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
