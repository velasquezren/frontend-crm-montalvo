import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import {
  CATEGORIA_BADGE,
  CATEGORIA_ICON,
  CATEGORIA_LABEL,
  CategoriaCliente,
} from '../../../../shared/models/cliente-categoria.model';
import { generarIniciales } from '../../../../core/auth/user.model';
import { calcularEdad } from '../../../../core/api/edad';
import { listaExtra, textoExtra } from '../../../../core/api/datos-extra';
import { ToastService } from '../../../../core/toast/toast.service';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import { ConversacionResumen } from '../../conversacion.model';

type ClienteChat = ConversacionResumen['cliente'];

function soloDigitos(telefono: string): string {
  return telefono.replace(/\D/g, '');
}

/**
 * Ficha lateral del paciente y asignación de agente.
 * Se presenta como tercera columna en escritorio (>=1280px)
 * o como cajón desplegable en móvil y tablet.
 */
@Component({
  selector: 'app-conversacion-sidebar',
  standalone: true,
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    IconComponent,
    InputComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-sidebar.component.html',
  styleUrl: './conversacion-sidebar.component.css',
})
export class ConversacionSidebarComponent {
  protected readonly state = inject(ConversacionesStateService);
  private readonly toast = inject(ToastService);

  /* ── Helpers visuales ──────────────────────────────────────────── */
  protected readonly categoriaLabel = CATEGORIA_LABEL;
  protected readonly categoriaBadge = CATEGORIA_BADGE;
  protected readonly categoriaIcon = CATEGORIA_ICON;
  protected readonly iniciales = generarIniciales;

  protected enlaceWhatsApp(telefono: string): string {
    return `https://wa.me/${soloDigitos(telefono)}`;
  }

  protected enlaceLlamada(telefono: string): string {
    return `tel:+${soloDigitos(telefono)}`;
  }

  protected empresaDe(cliente: ClienteChat): string {
    return cliente.empresaTrabajo || textoExtra(cliente.datosExtra, 'empresa');
  }

  protected lugarNacimientoDe(cliente: ClienteChat): string {
    return cliente.ciLugar || textoExtra(cliente.datosExtra, 'lugarNacimiento', 'CI.Lug.Pac');
  }

  protected ocupacionDe(cliente: ClienteChat): string {
    return cliente.ocupacion || textoExtra(cliente.datosExtra, 'ocupacion', 'Profesion');
  }

  protected notasDe(cliente: ClienteChat): string {
    return textoExtra(cliente.datosExtra, 'notas');
  }

  protected tagsDe(cliente: ClienteChat): string[] {
    const directIntereses = cliente.intereses?.map(i => i.descripcion) ?? [];
    const tagsExtra = listaExtra(cliente.datosExtra, 'tags', 'intereses');
    return [...new Set([...directIntereses, ...tagsExtra])];
  }

  protected edadDe(cliente: ClienteChat): string | null {
    return calcularEdad(cliente.fechaNacimiento);
  }

  protected copiarTexto(texto: string, label: string): void {
    navigator.clipboard.writeText(texto).then(() => {
      this.toast.success(`${label} copiado al portapapeles.`);
    });
  }

  protected tiempoRelativo(fecha: string): string {
    const ahora = Date.now();
    const diff = ahora - new Date(fecha).getTime();
    const minutos = Math.floor(diff / 60000);

    if (minutos < 1) return 'Ahora';
    if (minutos < 60) return `${minutos}m`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas}h`;
    const dias = Math.floor(horas / 24);
    if (dias < 7) return `${dias}d`;
    return new Date(fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' });
  }

  protected togglePanel(): void {
    this.state.panelAbierto.update(v => !v);
  }

  protected toggleDropdownAgente(): void {
    this.state.dropdownAgenteAbierto.update(v => !v);
  }
}
