import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';

import { mensajeDeError } from '../../core/api/http-error';
import { AuthService } from '../../core/auth/auth.service';
import { generarIniciales } from '../../core/auth/user.model';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { CardComponent } from '../../shared/components/card/card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { ToastService } from '../../core/toast/toast.service';
import { IconName } from '../../shared/components/icon/icon.component';
import { ROL_LABEL } from '../../core/auth/roles';
import { RolUsuario } from '../../core/auth/user.model';
import { Agente, CreateAgentePayload } from './agente.model';
import { AgentesService } from './agentes.service';

import { DialogService } from '../../shared/components/dialog/dialog.service';
import { OverlayRef } from '@angular/cdk/overlay';
import { TemplateRef, ViewContainerRef } from '@angular/core';

/**
 * Los tres roles, no dos: filtrar sin SUPER_ADMIN dejaba invisible justo al rol
 * que administra el sistema, y era imposible ver cuántos hay.
 */
export type FiltroRolAgentes = 'TODOS' | 'SUPER_ADMIN' | 'ADMIN' | 'AGENTE';

/**
 * Gestión de Agentes y Usuarios — Solo administradores
 * Ref: CRM_MANIFESTO.md §1.2, §3, §2.11 (CDK Overlay Portals)
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './agentes.page.html',
  styleUrl: './agentes.page.css',
})
export class AgentesPage {
  private readonly agentesService = inject(AgentesService);
  private readonly toastService = inject(ToastService);
  private readonly authService = inject(AuthService);
  private readonly dialogService = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);

  private activeOverlayRef?: OverlayRef;

  /** Usuario autenticado — para no dejar que se bloquee a sí mismo. */
  protected readonly usuarioActual = this.authService.user;

  protected readonly iniciales = generarIniciales;

  /* ── Estado de UI ──────────────────────────────────────────────── */
  protected readonly busqueda = signal('');
  protected readonly filtroRol = signal<FiltroRolAgentes>('TODOS');
  protected readonly modalCrearAbierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly errorMensaje = signal<string | null>(null);

  /* Formulario de creación */
  protected readonly formNombre = signal('');
  protected readonly formEmail = signal('');
  protected readonly formPassword = signal('');
  protected readonly formRol = signal<'ADMIN' | 'AGENTE'>('AGENTE');

  /** Etiquetas de rol — vienen de core/auth/roles.ts, no se redefinen aquí. */
  protected readonly rolLabel = ROL_LABEL;

  /* ── Datos del Servidor ────────────────────────────────────────── */
  protected readonly agentes = httpResource<Agente[]>(
    () => this.agentesService.listarRequest(),
    { defaultValue: [] },
  );

  /* ── Datos Derivados ───────────────────────────────────────────── */
  protected readonly stats = computed(() => {
    const lista: Agente[] = this.agentes.value() ?? [];
    const porRol = { SUPER_ADMIN: 0, ADMIN: 0, AGENTE: 0 } as Record<RolUsuario, number>;
    for (const usuario of lista) porRol[usuario.rol] += 1;

    return {
      total: lista.length,
      activos: lista.filter((usuario: Agente) => usuario.activo).length,
      porRol,
    };
  });

  /**
   * Las pestañas de rol, derivadas de la lista real.
   *
   * Se generan en vez de escribirse a mano porque antes eran tres bloques de
   * HTML casi idénticos y añadir un rol significaba copiar veinte líneas — que
   * es exactamente por lo que SUPER_ADMIN nunca se agregó y los super admins
   * quedaban invisibles al filtrar.
   */
  protected readonly filtrosRol = computed(() => {
    const { total, porRol } = this.stats();

    return [
      { valor: 'TODOS' as const, etiqueta: 'Todos', icono: 'users' as IconName, total },
      { valor: 'SUPER_ADMIN' as const, etiqueta: 'Super administradores', icono: 'shield' as IconName, total: porRol.SUPER_ADMIN },
      { valor: 'ADMIN' as const, etiqueta: 'Administradores', icono: 'shield' as IconName, total: porRol.ADMIN },
      { valor: 'AGENTE' as const, etiqueta: 'Agentes comerciales', icono: 'message-circle' as IconName, total: porRol.AGENTE },
    ];
  });

  protected readonly filtrados = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const rol = this.filtroRol();
    const lista: Agente[] = this.agentes.value() ?? [];

    let res = lista;
    if (rol !== 'TODOS') {
      res = res.filter((a: Agente) => a.rol === rol);
    }
    if (q) {
      /* También por código: es la clave con la que FileMaker identifica a la
         persona y con la que se enlaza su ficha de vendedora o de médico, así
         que buscar «Pe2455» tiene que encontrarla igual que buscar su nombre. */
      res = res.filter(
        (usuario: Agente) =>
          usuario.nombre.toLowerCase().includes(q) ||
          usuario.email.toLowerCase().includes(q) ||
          (usuario.codigo ?? '').toLowerCase().includes(q),
      );
    }
    return res;
  });

  abrirModal(template?: TemplateRef<unknown>): void {
    this.formNombre.set('');
    this.formEmail.set('');
    this.formPassword.set('');
    this.formRol.set('AGENTE');
    this.errorMensaje.set(null);
    this.modalCrearAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  cerrarModal(): void {
    this.modalCrearAbierto.set(false);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
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
        this.cerrarModal();
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

  /* ══════════════════════════════════════════════════════════════════
     Edición de agente
     ══════════════════════════════════════════════════════════════════ */

  protected readonly agenteEditando = signal<Agente | null>(null);
  protected readonly modalEditarAbierto = signal(false);
  protected readonly editNombre = signal('');
  protected readonly editEmail = signal('');
  protected readonly editRol = signal<RolUsuario>('AGENTE');
  protected readonly editPassword = signal('');
  protected readonly editCodigo = signal('');

  /** True si el admin se está editando a sí mismo: no puede degradarse ni desactivarse. */
  protected readonly editandoseASiMismo = computed(
    () => this.agenteEditando()?.id === this.usuarioActual()?.id,
  );

  abrirEdicion(agente: Agente, template?: TemplateRef<unknown>): void {
    this.agenteEditando.set(agente);
    this.editNombre.set(agente.nombre);
    this.editEmail.set(agente.email);
    this.editCodigo.set(agente.codigo ?? '');
    this.editRol.set(agente.rol);
    this.editPassword.set('');
    this.errorMensaje.set(null);
    this.modalEditarAbierto.set(true);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  cerrarEdicion(): void {
    this.modalEditarAbierto.set(false);
    this.agenteEditando.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  guardarEdicion(event: Event): void {
    event.preventDefault();
    const agente = this.agenteEditando();
    if (!agente || this.guardando()) return;

    const nombre = this.editNombre().trim();
    const email = this.editEmail().trim().toLowerCase();
    const password = this.editPassword();

    if (!nombre || !email) {
      this.errorMensaje.set('Nombre y correo son requeridos.');
      return;
    }
    if (password && password.length < 8) {
      this.errorMensaje.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.guardando.set(true);
    this.errorMensaje.set(null);

    this.agentesService
      .actualizar(agente.id, {
        nombre,
        email,
        rol: this.editRol(),
        /* Vacío = se limpia el código (el backend lo guarda como NULL). */
        codigo: this.editCodigo().trim(),
        /* La contraseña solo se envía si el admin escribió una nueva. */
        ...(password ? { password } : {}),
      })
      .then(res => {
        this.guardando.set(false);
        this.cerrarEdicion();
        this.toastService.success(`Datos de ${res.nombre} actualizados`, 'Agente Actualizado');
        this.agentes.reload();
      })
      .catch((err: unknown) => {
        this.guardando.set(false);
        const mensaje = mensajeDeError(err, 'No se pudo guardar los cambios del agente.');
        this.errorMensaje.set(mensaje);
        this.toastService.error(mensaje, 'Error al Guardar');
      });
  }

  /* ══════════════════════════════════════════════════════════════════
     Baja de agente (desactivación, nunca borrado)
     ══════════════════════════════════════════════════════════════════ */

  protected readonly agenteABaja = signal<Agente | null>(null);
  protected readonly dandoDeBaja = signal(false);

  confirmarBaja(agente: Agente, template?: TemplateRef<unknown>): void {
    this.agenteABaja.set(agente);
    if (template) {
      this.activeOverlayRef?.dispose();
      this.activeOverlayRef = this.dialogService.openTemplate(template, this.vcr);
    }
  }

  cancelarBaja(): void {
    this.agenteABaja.set(null);
    this.activeOverlayRef?.dispose();
    this.activeOverlayRef = undefined;
  }

  ejecutarBaja(): void {
    const agente = this.agenteABaja();
    if (!agente || this.dandoDeBaja()) return;

    this.dandoDeBaja.set(true);
    this.agentesService
      .desactivar(agente.id)
      .then(() => {
        this.dandoDeBaja.set(false);
        this.cancelarBaja();
        this.toastService.info(
          `${agente.nombre} ya no puede iniciar sesión. Su historial se conserva.`,
          'Cuenta Desactivada',
        );
        this.agentes.reload();
      })
      .catch((err: unknown) => {
        this.dandoDeBaja.set(false);
        this.cancelarBaja();
        this.toastService.error(
          mensajeDeError(err, 'No se pudo desactivar la cuenta.'),
          'Error',
        );
      });
  }

  /** Cierra cualquier modal abierto con Escape. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.agenteABaja()) return this.cancelarBaja();
    if (this.modalEditarAbierto()) return this.cerrarEdicion();
    if (this.modalCrearAbierto()) this.cerrarModal();
  }
}
