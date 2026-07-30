export interface Agente {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'AGENTE';
  activo: boolean;
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
  nombre: string;
  email: string;
  password: string;
  rol: 'ADMIN' | 'AGENTE';
}
