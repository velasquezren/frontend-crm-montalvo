import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from '../../core/api/api.constants';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
} from '../../shared/models/cliente-categoria.model';
import { ConversacionDetalle, ConversacionResumen } from './conversacion.model';

/**
 * Conversaciones — WhatsApp Inbox real (RF-09/RF-10).
 * Lista y detalle desde el backend; enviar persiste el mensaje SALIENTE
 * (la llamada real a WhatsApp Cloud API se activa al configurar el token en el backend).
 * Visibilidad por rol resuelta en el servidor.
 */
@Component({
  selector: 'app-conversaciones',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    InputComponent,
    EmptyStateComponent,
    DatePipe,
  ],
  templateUrl: './conversaciones.page.html',
  styleUrl: './conversaciones.page.css',
})
export class ConversacionesPage {
  private readonly http = inject(HttpClient);

  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

  protected readonly busqueda = signal('');
  protected readonly mensajeNuevo = signal('');
  protected readonly enviando = signal(false);
  protected readonly seleccionadaId = signal<string | null>(null);

  protected readonly conversaciones = httpResource<ConversacionResumen[]>(
    () => `${API_URL}/conversaciones`,
    { defaultValue: [] },
  );

  protected readonly detalle = httpResource<ConversacionDetalle | undefined>(() => {
    const id = this.seleccionadaId();
    return id ? `${API_URL}/conversaciones/${id}` : undefined;
  });

  protected readonly filtradas = computed(() => {
    const termino = this.busqueda().trim().toLowerCase();
    const lista = this.conversaciones.value();
    return termino
      ? lista.filter(c => c.cliente.nombre.toLowerCase().includes(termino))
      : lista;
  });

  protected seleccionar(id: string): void {
    this.seleccionadaId.set(id);
  }

  protected async enviar(event: Event): Promise<void> {
    event.preventDefault();
    const texto = this.mensajeNuevo().trim();
    const id = this.seleccionadaId();
    if (!texto || !id || this.enviando()) {
      return;
    }

    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${API_URL}/conversaciones/${id}/mensajes`, { contenido: texto }),
      );
      this.mensajeNuevo.set('');
      this.detalle.reload();
      this.conversaciones.reload();
    } finally {
      this.enviando.set(false);
    }
  }
}
