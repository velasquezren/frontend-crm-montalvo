import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { InputComponent } from '../../../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../../../shared/components/loading-skeleton/loading-skeleton.component';
import { generarIniciales } from '../../../../core/auth/user.model';
import { ConversacionesStateService } from '../../services/conversaciones-state.service';
import {
  ConversacionResumen,
  esperandoDesde,
  FiltroInbox,
} from '../../conversacion.model';

/**
 * Panel lateral izquierdo con la bandeja de entrada (Inbox).
 * Permite filtrar por pestañas (Todas, Sin responder, Sin asignar, Mis chats),
 * filtrar por agente asignado (en vista Admin) y buscar por nombre/teléfono.
 */
@Component({
  selector: 'app-conversacion-lista',
  imports: [
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './conversacion-lista.component.html',
  styleUrl: './conversacion-lista.component.css',
})
export class ConversacionListaComponent {
  protected readonly state = inject(ConversacionesStateService);
  protected readonly iniciales = generarIniciales;

  /* ── Agentes con chats para filtro rápido de Admin ──────────────── */
  protected readonly agentesConChats = computed(() => {
    const lista = this.state.conversacionesRecurso.value();
    const todosAgentes = this.state.agentes.value();
    const conteos = new Map<string, number>();

    for (const c of lista) {
      if (c.agente) {
        conteos.set(c.agente.id, (conteos.get(c.agente.id) ?? 0) + 1);
      }
    }

    if (todosAgentes.length > 0) {
      return todosAgentes.map(ag => ({
        id: ag.id,
        nombre: ag.nombre,
        rol: ag.rol,
        count: conteos.get(ag.id) ?? 0,
      })).sort((a, b) => b.count - a.count || a.nombre.localeCompare(b.nombre));
    }

    const map = new Map<string, { id: string; nombre: string; count: number }>();
    for (const c of lista) {
      if (c.agente) {
        const prev = map.get(c.agente.id);
        map.set(c.agente.id, {
          id: c.agente.id,
          nombre: c.agente.nombre,
          count: (prev?.count ?? 0) + 1,
        });
      }
    }
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  /* ── Filtro tabs & agentes ──────────────────────────────────────── */
  protected setFiltroTab(tab: FiltroInbox): void {
    this.state.filtroTab.set(tab);
    if (tab !== 'TODAS') {
      this.state.filtroAgenteId.set(null);
    }
  }

  protected filtrarPorAgente(agenteId: string | null): void {
    this.state.filtroAgenteId.set(agenteId);
    if (agenteId) {
      this.state.filtroTab.set('TODAS');
    }
  }

  protected toggleMostrarFiltroAgente(): void {
    this.state.mostrarFiltroAgentes.update(v => !v);
  }

  /* ── Helpers de tiempo de espera ───────────────────────────────── */
  protected tiempoEsperando(c: ConversacionResumen): string | null {
    const desde = esperandoDesde(c);
    if (!desde) return null;

    const minutos = Math.floor((Date.now() - desde.getTime()) / 60000);
    if (minutos < 60) return `${Math.max(minutos, 1)} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `${horas} h`;
    return `${Math.floor(horas / 24)} d`;
  }

  protected esperaLarga(c: ConversacionResumen): boolean {
    const desde = esperandoDesde(c);
    return !!desde && Date.now() - desde.getTime() > 24 * 60 * 60 * 1000;
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

  protected seleccionar(id: string): void {
    this.state.seleccionar(id);
  }

  protected recargarInbox(): void {
    this.state.conversacionesRecurso.reload();
  }
}
