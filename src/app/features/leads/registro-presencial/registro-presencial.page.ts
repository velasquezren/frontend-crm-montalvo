import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { mensajeDeError } from '../../../core/api/http-error';
import { AuthService } from '../../../core/auth/auth.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CardComponent } from '../../../shared/components/card/card.component';
import { FilterChipComponent } from '../../../shared/components/filter-chip/filter-chip.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../shared/components/input/input.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { LeadsService } from '../leads.service';

/**
 * Registro Presencial — POST real a /leads/presencial (RF-07/RF-08, RNF-07).
 * El backend crea o reutiliza el cliente por teléfono (RF-02) y registra
 * el interés; el agente y la fecha salen del JWT en el servidor.
 */
@Component({
  selector: 'app-registro-presencial',
  imports: [
    PageHeaderComponent,
    CardComponent,
    InputComponent,
    ButtonComponent,
    IconComponent,
    AvatarComponent,
    FilterChipComponent,
    RouterLink,
  ],
  templateUrl: './registro-presencial.page.html',
})
export class RegistroPresencialPage {
  private readonly authService = inject(AuthService);
  private readonly leadsService = inject(LeadsService);

  protected readonly nombre = signal('');
  protected readonly telefono = signal('');
  protected readonly interes = signal('');

  protected readonly errorNombre = signal<string | undefined>(undefined);
  protected readonly errorTelefono = signal<string | undefined>(undefined);
  protected readonly errorGeneral = signal('');
  protected readonly enviando = signal(false);
  protected readonly registrado = signal(false);
  protected readonly horaRegistro = signal('');

  protected readonly agente = computed(() => this.authService.user());

  /* Intereses frecuentes — un toque en vez de tipear (RNF-07) */
  protected readonly interesesRapidos: readonly string[] = [
    'Limpieza dental',
    'Ortodoncia',
    'Blanqueamiento',
    'Implantes',
    'Consulta general',
  ];

  protected alternarInteres(opcion: string): void {
    this.interes.set(this.interes() === opcion ? '' : opcion);
  }

  /** Bolivia: 8 dígitos locales → +591XXXXXXXX (formato que exige el backend). */
  private normalizarTelefono(valor: string): string | null {
    const limpio = valor.replace(/[^\d+]/g, '');
    if (/^\+\d{9,13}$/.test(limpio)) {
      return limpio;
    }
    if (/^\d{8}$/.test(limpio)) {
      return `+591${limpio}`;
    }
    return null;
  }

  protected async registrar(event: Event): Promise<void> {
    event.preventDefault();
    this.errorNombre.set(undefined);
    this.errorTelefono.set(undefined);
    this.errorGeneral.set('');

    const nombre = this.nombre().trim();
    const telefono = this.normalizarTelefono(this.telefono());

    if (!nombre) {
      this.errorNombre.set('El nombre es obligatorio.');
    }
    if (!telefono) {
      this.errorTelefono.set('Ingresa un celular de 8 dígitos o formato +591…');
    }
    if (!nombre || !telefono) {
      return;
    }

    this.enviando.set(true);
    try {
      await this.leadsService.crearPresencial({
        nombre,
        telefono,
        ...(this.interes().trim() ? { interes: this.interes().trim() } : {}),
      });
      this.horaRegistro.set(
        new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }),
      );
      this.telefono.set(telefono);
      this.registrado.set(true);
    } catch (err) {
      this.errorGeneral.set(
        mensajeDeError(err, 'No se pudo registrar. Verifica el servidor e intenta de nuevo.'),
      );
    } finally {
      this.enviando.set(false);
    }
  }

  protected registrarOtro(): void {
    this.nombre.set('');
    this.telefono.set('');
    this.interes.set('');
    this.registrado.set(false);
  }
}
