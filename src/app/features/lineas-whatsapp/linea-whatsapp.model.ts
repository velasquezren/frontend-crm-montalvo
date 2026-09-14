export interface LineaWhatsapp {
  readonly id: string;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly activa: boolean;
  readonly comercial: boolean;
  readonly conectada: boolean;
  readonly phoneNumberId?: string | null;
  readonly wabaId?: string | null;
  readonly tokenEnv?: string;
}
export interface ActualizarLinea {
  nombre: string;
  telefono?: string;
  phoneNumberId?: string;
  wabaId?: string;
  tokenEnv?: string;
  activa: boolean;
}
