export interface Agente {
  id: string;
  nombre: string;
  email: string;
  rol: 'ADMIN' | 'AGENTE';
  activo: boolean;
  foto?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentePayload {
  nombre: string;
  email: string;
  password: string;
  rol: 'ADMIN' | 'AGENTE';
}
