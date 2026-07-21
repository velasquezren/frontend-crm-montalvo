import { inject, Injectable } from '@angular/core';

import { ApiService } from '../../core/api/api.service';
import { UsuarioApi } from '../../core/auth/user.model';

/** Campos que el propio usuario puede editar de su cuenta. */
export interface ActualizarPerfilDto {
  nombre: string;
  email: string;
  /** Data URL de la foto, o null para quitarla. */
  foto: string | null;
  /** Solo se envía si el usuario quiere cambiarla. */
  password?: string;
}

/**
 * Perfil — cuenta del usuario autenticado (GET/PATCH /auth/perfil).
 * El backend resuelve de quién es el perfil por el JWT: nunca se manda un id.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private readonly api = inject(ApiService);

  actualizar(cambios: ActualizarPerfilDto): Promise<UsuarioApi> {
    return this.api.patch<UsuarioApi>('/auth/perfil', cambios);
  }
}
