import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { ToastService } from '../../core/toast/toast.service';
import { Agente, CreateAgentePayload } from './agente.model';
import { AgentesService } from './agentes.service';

/**
 * Gestión de Agentes y Usuarios — Solo administradores
 * Ref: CRM_MANIFESTO.md §1.2, §3
 */
@Component({
  selector: 'app-agentes-page',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    IconComponent,
    InputComponent,
    DatePipe,
  ],
  templateUrl: './agentes.page.html',
  styleUrl: './agentes.page.css',
})
export class AgentesPage {
  private readonly agentesService = inject(AgentesService);
  private readonly toastService = inject(ToastService);

  protected readonly iniciales = generarIniciales;

  /* ── Estado de UI ──────────────────────────────────────────────── */
  protected readonly busqueda = signal('');
  protected readonly modalCrearAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorMensaje = signal<string | null>(null);

  /* Formulario de creación */
  protected readonly formNombre = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPassword = signal('');
  protected readonly formRol = signal<'ADMIN' | 'AGENTE'>('AGENTE');

  /* ── Datos del Servidor ────────────────────────────────────────── */
  protected readonly agentes = httpResource<Agente[]>(
    () => this.agentesService.listarRequest(),
    { defaultValue: [] },
  );

  /* ── Datos Derivados ───────────────────────────────────────────── */
  protected readonly stats = computed(() => {
    const lista: Agente[] = this.agentes.value() ?? [];
    return {
      total: lista.length,
      activos: lista.filter((a: Agente) => a.activo).length,
      admins: lista.filter((a: Agente) => a.rol === 'ADMIN').length,
      agentes: lista.filter((a: Agente) => a.rol === 'AGENTE').length,
    };
  });

  protected readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const lista: Agente[] = this.agentes.value() ?? [];
    if (!q) return lista;
    return lista.filter(
      (a: Agente) => a.nombre.toLowerCase().includes(q) || a.email.toLowerCase().includes(q),
    );
  });

  abrirModal(): void {
    this.formNombre.set('');
    this.formEmail.set('');
    this.formPassword.set('');
    this.formRol.set('AGENTE');
    this.errorMensaje.set(null);
    this.modalCrearAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalCrearAbierto.set(false);
  }

  crearAgente(event: Event): void {
    event.preventDefault();
    if (!this.formNombre().trim() || !this.formEmail().trim() || !this.formPassword().trim()) {
      this.errorMensaje.set('Completa todos los campos requeridos.');
      return;
    }

    if (this.formPassword().length < 8) {
      this.errorMensaje.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.guardando.set(true);
    this.errorMensaje.set(null);

    const payload: CreateAgentePayload = {
      nombre: this.formNombre().trim(),
      email: this.formEmail().trim().toLowerCase(),
      password: this.formPassword(),
      rol: this.formRol(),
    };

    this.agentesService
      .crear(payload)
      .then(res => {
        this.guardando.set(false);
        this.modalCrearAbierto.set(false);
        this.toastService.success(`Agente ${res.nombre} registrado correctamente`, 'Cuenta Creada');
        this.agentes.reload();
      })
      .catch((err: unknown) => {
        this.guardando.set(false);
        const mensaje = mensajeDeError(err, 'Ocurrió un error al crear la cuenta del agente.');
        this.errorMensaje.set(mensaje);
        this.toastService.error(mensaje, 'Error al Registrar');
      });
  }

  toggleEstado(agente: Agente): void {
    const nuevoEstado = !agente.activo;
    this.agentesService
      .cambiarActivo(agente.id, nuevoEstado)
      .then(() => {
        this.toastService.info(
          `Cuenta de ${agente.nombre} ${nuevoEstado ? 'activada' : 'desactivada'}`,
          'Estado de Cuenta',
        );
        this.agentes.reload();
      })
      .catch((err: unknown) => {
        this.toastService.error(
          mensajeDeError(err, 'No se pudo actualizar el estado del agente'),
          'Error de Red',
        );
      });
  }
}
