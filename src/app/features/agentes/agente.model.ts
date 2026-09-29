import { RolUsuario } from '../../core/auth/user.model';

export interface Agente {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  activo: boolean;
  lineasWhatsapp: { lineaId: string }[];
  /**
   * Líneas que ve pero no le suenan. Es una preferencia de la persona, que
   * ella misma cambia desde su perfil: la admin la ve y la puede fijar aquí,
   * pero no es parte del acceso.
   */
  lineasSilenciadas: string[];
  foto?: string | null;
  /**
   * Identificador que usa la empresa para esta persona (el `vendedora_pk` de
   * FileMaker, ej. Pe2455). Es lo que vincula al agente con sus ventas en la
   * Planilla de Comisiones sin depender de cómo esté escrito el nombre.
   */
  codigo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentePayload {
  lineaIds: string[];
  /** Subconjunto de `lineaIds` cuyos mensajes no le suenan. */
  lineasSilenciadas?: string[];
  nombre: string;
  email: string;
  password: string;
  rol: RolUsuario;
}
