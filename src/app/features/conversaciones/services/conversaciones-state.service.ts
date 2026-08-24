import { computed, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/toast/toast.service';
import { mensajeDeError } from '../../../core/api/http-error';
import { listaExtra, textoExtra } from '../../../core/api/datos-extra';
import { ClientesService } from '../../clientes/clientes.service';
import {
  AgenteResumen,
  ConversacionDetalle,
  ConversacionResumen,
  estaSinResponder,
  FiltroInbox,
  ItemHilo,
  MensajeApi,
  PlantillaAgente,
  PlantillaResumen,
} from '../conversacion.model';
import { ConversacionesService } from '../conversaciones.service';
import { CategoriaCliente } from '../../../shared/models/cliente-categoria.model';

const LOTE_HISTORIAL = 50;

/**
 * Gestor de Estado Centralizado para el módulo de Conversaciones.
 * Centraliza la reactividad con Angular Signals y httpResource,
 * desacoplando la lógica de negocio de los componentes de presentación.
 */
@Injectable({ providedIn: 'root' })
export class ConversacionesStateService {
  private readonly conversacionesService = inject(ConversacionesService);
  private readonly clientesService = inject(ClientesService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  /* ── Estado de Usuario ─────────────────────────────────────────── */
  readonly isAdmin = this.authService.isAdmin;
  readonly currentUserId = computed(() => this.authService.user()?.id ?? '');

  /* ── Selección & Navegación ────────────────────────────────────── */
  readonly seleccionadaId = signal<string | null>(null);

  /* ── Listado & Filtros ─────────────────────────────────────────── */
  readonly busqueda = signal('');
  readonly filtroTab = signal<FiltroInbox>('TODAS');
  readonly filtroAgenteId = signal<string | null>(null);
  readonly mostrarFiltroAgentes = signal(false);
  readonly dropdownAgenteAbierto = signal(false);
  readonly soloMisChatsAdmin = signal(false);

  readonly conversacionesRecurso = httpResource<ConversacionResumen[]>(
    () => this.conversacionesService.listarRequest(),
    {
      defaultValue: [],
      equal: (a, b) => {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
          if (a[i].id !== b[i].id || a[i].updatedAt !== b[i].updatedAt || a[i].noLeidosCount !== b[i].noLeidosCount) {
            return false;
          }
        }
        return true;
      },
    },
  );

  readonly agentes = httpResource<AgenteResumen[]>(
    () => (this.isAdmin() ? this.conversacionesService.agentesRequest() : undefined),
    { defaultValue: [] },
  );

  /* ── Detalle de Conversación Activa ────────────────────────────── */
  readonly detalle = httpResource<ConversacionDetalle | null>(
    () => {
      const id = this.seleccionadaId();
      if (!id) return undefined;
      return this.conversacionesService.detalleRequest(id);
    },
    {
      defaultValue: null,
      equal: (a, b) => a?.id === b?.id && a?.updatedAt === b?.updatedAt && a?.mensajes.length === b?.mensajes.length,
    },
  );

  /* ── Paginación de Historial ────────────────────────────────────── */
  readonly hayMasHistorial = linkedSignal({
    source: this.seleccionadaId,
    computation: () => true,
  });
  readonly cargandoHistorial = signal(false);

  /* ── Buscador en el Chat Abierto ────────────────────────────────── */
  readonly buscadorAbierto = signal(false);
  readonly busquedaChat = signal('');
  readonly indiceCoincidencia = signal(0);

  /* ── Panel Lateral / Ficha del Paciente ─────────────────────────── */
  readonly pantallaAncha = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
  readonly panelAbierto = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches);
  readonly editandoFicha = signal(false);
  readonly editNombre = signal('');
  readonly editEmail = signal('');
  readonly editEmpresa = signal('');
  readonly editFechaNacimiento = signal('');
  readonly editLugarNacimiento = signal('');
  readonly editCategoria = signal<CategoriaCliente>('PROSPECTO');
  readonly editNotas = signal('');
  readonly editTags = signal('');
  readonly guardandoFicha = signal(false);

  /* ── Notas Médicas Fijadas ──────────────────────────────────────── */
  readonly editandoNotaFijada = signal(false);
  readonly editNotaFijada = signal('');
  readonly guardandoNotaFijada = signal(false);

  /* ── Composer & Plantillas ──────────────────────────────────────── */
  readonly mensajeNuevo = signal('');
  readonly enviando = signal(false);
  readonly asignando = signal(false);
  readonly lightboxImagenUrl = signal<string | null>(null);
  readonly velocidadesAudio = signal<Record<string, number>>({});

  /** Sube cada vez que `reconciliarEnvioLocal` reconcilia un envío PROPIO
   *  (nunca uno entrante). El hilo lo usa para saber que debe bajar al fondo
   *  aunque la agente estuviera leyendo historial viejo — enviar es una
   *  acción deliberada suya, a diferencia de un mensaje que llega solo. */
  readonly versionEnvioPropio = signal(0);

  readonly plantillasAgente = httpResource<PlantillaAgente[]>(
    () => (this.seleccionadaId() ? this.conversacionesService.plantillasAgenteRequest() : undefined),
    { defaultValue: [] },
  );

  readonly plantillasWhatsApp = httpResource<PlantillaResumen[]>(
    () => this.conversacionesService.plantillasRequest(),
    { defaultValue: [] },
  );

  /* ── Señales Derivadas (Computed) ───────────────────────────────── */
  readonly stats = computed(() => {
    const lista = this.conversacionesRecurso.value();
    const myId = this.currentUserId();
    return {
      total: lista.length,
      sinAsignar: lista.filter(c => !c.agente).length,
      misChats: lista.filter(c => c.agente?.id === myId).length,
      sinResponder: lista.filter(c => estaSinResponder(c)).length,
    };
  });

  readonly conversacionesFiltradas = computed(() => {
    let lista = this.conversacionesRecurso.value();
    const tab = this.filtroTab();
    const query = this.busqueda().trim().toLowerCase();
    const agente = this.filtroAgenteId();
    const myId = this.currentUserId();

    if (tab === 'SIN_ASIGNAR') {
      lista = lista.filter(c => !c.agente);
    } else if (tab === 'MIS_CHATS') {
      lista = lista.filter(c => c.agente?.id === myId);
    } else if (tab === 'SIN_RESPONDER') {
      lista = lista.filter(c => estaSinResponder(c));
    }

    if (agente && tab === 'TODAS') {
      lista = lista.filter(c => c.agente?.id === agente);
    }

    /* Filtro Míos del Super Admin: mis chats + pool sin asignar */
    if (this.isAdmin() && this.soloMisChatsAdmin()) {
      lista = lista.filter(c => !c.agente || c.agente.id === myId);
    }

    if (query) {
      lista = lista.filter(
        c =>
          c.cliente.nombre.toLowerCase().includes(query) ||
          c.cliente.telefono.includes(query) ||
          (c.mensajes[0]?.contenido && c.mensajes[0].contenido.toLowerCase().includes(query)),
      );
    }

    return lista;
  });

  readonly sugerenciasAtajo = computed(() => {
    const texto = this.mensajeNuevo().trim();
    if (!texto.startsWith('/')) return [];
    const busquedaAtajo = texto.toLowerCase();
    const lista = this.plantillasAgente.value();
    return lista.filter(
      p =>
        (p.atajo && p.atajo.toLowerCase().includes(busquedaAtajo)) ||
        p.titulo.toLowerCase().includes(busquedaAtajo.substring(1)),
    );
  });

  /** Fecha en que el lead hizo clic en el anuncio de Meta Ads, si aplica. */
  readonly fechaCampanaMeta = computed<Date | null>(() => {
    const chat = this.detalle.value();
    if (!chat) return null;
    const datos = chat.cliente.datosExtra;
    if (!datos || typeof datos !== 'object') return null;
    const campana = (datos as Record<string, unknown>)['campanaOrigen'] as { fecha?: string } | undefined;
    const referral = (datos as Record<string, unknown>)['referral'] as { fecha?: string } | undefined;
    const fechaStr = campana?.fecha || referral?.fecha;
    if (!fechaStr) return null;
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? null : d;
  });

  /** Si la ventana extendida de 72h por anuncio de Meta Ads está actualmente activa desde que se originó el anuncio. */
  readonly ventana72hMetaActiva = computed(() => {
    const fechaCampana = this.fechaCampanaMeta();
    if (!fechaCampana) return false;
    const horasDesdeCampana = (Date.now() - fechaCampana.getTime()) / (1000 * 60 * 60);
    return horasDesdeCampana >= 0 && horasDesdeCampana < 72;
  });

  readonly esLeadMetaAds = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return false;
    const datos = chat.cliente.datosExtra;
    return Boolean(datos?.['campanaOrigen'] || datos?.['referral']);
  });

  readonly horasVentanaMeta = computed(() => (this.ventana72hMetaActiva() ? 72 : 24));

  readonly fueraDeVentana24h = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return false;
    const ultimoEntrante = [...chat.mensajes].reverse().find(m => m.direccion === 'ENTRANTE');
    if (!ultimoEntrante) return true;

    // Si la ventana de 72h por anuncio Click-to-WhatsApp sigue vigente desde la fecha del anuncio
    if (this.ventana72hMetaActiva()) return false;

    // Ventana estándar de servicio al cliente: 24h desde el último mensaje entrante del paciente
    const haceHoras = (Date.now() - new Date(ultimoEntrante.createdAt).getTime()) / (1000 * 60 * 60);
    return haceHoras >= 24;
  });

  readonly horasRestantesVentana = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return 0;
    const ultimoEntrante = [...chat.mensajes].reverse().find(m => m.direccion === 'ENTRANTE');
    if (!ultimoEntrante) return 0;

    const haceHorasMsg = (Date.now() - new Date(ultimoEntrante.createdAt).getTime()) / (1000 * 60 * 60);
    const restanteMsg = Math.max(0, 24 - haceHorasMsg);

    if (this.ventana72hMetaActiva()) {
      const fechaCampana = this.fechaCampanaMeta();
      if (fechaCampana) {
        const haceHorasCampana = (Date.now() - fechaCampana.getTime()) / (1000 * 60 * 60);
        const restanteCampana = Math.max(0, 72 - haceHorasCampana);
        return Math.round(Math.max(restanteMsg, restanteCampana) * 10) / 10;
      }
    }

    return Math.round(restanteMsg * 10) / 10;
  });

  readonly notaMedicaFijada = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return null;
    const datos = chat.cliente.datosExtra;
    const texto = textoExtra(datos, 'notaFijada');
    return texto || null;
  });

  readonly coincidenciasChat = computed(() => {
    const query = this.busquedaChat().trim().toLowerCase();
    if (!query) return [];
    const chat = this.detalle.value();
    if (!chat) return [];
    const matches: string[] = [];
    for (const m of chat.mensajes) {
      if (m.contenido && m.contenido.toLowerCase().includes(query)) {
        matches.push(m.id);
      }
    }
    return matches;
  });

  readonly mensajesConFecha = computed<ItemHilo[]>(() => {
    const chat = this.detalle.value();
    if (!chat) return [];

    const result: ItemHilo[] = [];
    let ultimaFecha = '';

    for (const msg of chat.mensajes) {
      const fechaMsg = new Date(msg.createdAt).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      if (fechaMsg !== ultimaFecha) {
        ultimaFecha = fechaMsg;
        result.push({ tipo: 'separador-fecha', fecha: fechaMsg });
      }

      result.push({ tipo: 'mensaje', mensaje: msg });
    }

    return result;
  });

  /* ── Métodos de Acción ─────────────────────────────────────────── */
  seleccionar(id: string): void {
    if (this.seleccionadaId() === id) return;
    this.router.navigate([], { queryParams: { id }, queryParamsHandling: 'merge' });
  }

  deseleccionar(): void {
    this.router.navigate([], { queryParams: { id: null }, queryParamsHandling: 'merge' });
  }

  async cargarHistorialAnterior(): Promise<number> {
    const chat = this.detalle.value();
    const id = this.seleccionadaId();
    if (!chat || !id || this.cargandoHistorial() || !this.hayMasHistorial()) return 0;

    const primerMensaje = chat.mensajes[0];
    if (!primerMensaje) return 0;

    this.cargandoHistorial.set(true);
    try {
      const anteriores = await this.conversacionesService.obtenerMensajesAnteriores(
        id,
        primerMensaje.createdAt,
        LOTE_HISTORIAL,
      );

      if (anteriores.length < LOTE_HISTORIAL) {
        this.hayMasHistorial.set(false);
      }

      if (anteriores.length > 0) {
        const idsExistentes = new Set(chat.mensajes.map(m => m.id));
        const nuevos = anteriores.filter(m => !idsExistentes.has(m.id));
        if (nuevos.length > 0) {
          const actualizados = [...nuevos, ...chat.mensajes];
          const nuevoDetalle = { ...chat, mensajes: actualizados };
          this.conversacionesService.setCachedDetalle(id, nuevoDetalle);
          this.detalle.set(nuevoDetalle);
          return nuevos.length;
        }
      }
      return 0;
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo cargar el historial anterior.'));
      return 0;
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  async asignarAgente(agenteId: string | null): Promise<void> {
    const id = this.seleccionadaId();
    if (!id || this.asignando()) return;

    this.asignando.set(true);
    try {
      const actualizado = await this.conversacionesService.asignarAgente(id, agenteId);
      this.detalle.set(actualizado);
      this.conversacionesRecurso.reload();
      this.dropdownAgenteAbierto.set(false);
      const agente = this.agentes.value().find(a => a.id === agenteId);
      this.toastService.success(
        agenteId ? `Conversación asignada a ${agente?.nombre ?? 'agente'}.` : 'Conversación movida a sin asignar.',
      );
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo asignar el agente.'));
    } finally {
      this.asignando.set(false);
    }
  }

  async guardarNotaFijada(): Promise<void> {
    const chat = this.detalle.value();
    if (!chat || this.guardandoNotaFijada()) return;

    const texto = this.editNotaFijada().trim();
    this.guardandoNotaFijada.set(true);
    try {
      const datosExtraActuales = chat.cliente.datosExtra ?? {};
      const nuevosDatosExtra = {
        ...datosExtraActuales,
        notaFijada: texto || null,
      };

      await this.clientesService.actualizar(chat.cliente.id, { datosExtra: nuevosDatosExtra });
      this.toastService.success(texto ? 'Nota clínica fijada en la cabecera' : 'Nota fijada eliminada');
      this.editandoNotaFijada.set(false);
      this.detalle.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo guardar la nota fijada.'));
    } finally {
      this.guardandoNotaFijada.set(false);
    }
  }

  iniciarEdicionFicha(): void {
    const chat = this.detalle.value();
    if (!chat) return;
    const c = chat.cliente;
    this.editNombre.set(c.nombre);
    this.editEmail.set(c.email || '');
    this.editEmpresa.set(c.empresaTrabajo || textoExtra(c.datosExtra, 'empresa'));
    this.editFechaNacimiento.set(c.fechaNacimiento?.slice(0, 10) ?? '');
    this.editLugarNacimiento.set(c.ciLugar || textoExtra(c.datosExtra, 'lugarNacimiento', 'CI.Lug.Pac'));
    this.editCategoria.set(c.categoria || 'PROSPECTO');
    this.editNotas.set(textoExtra(c.datosExtra, 'notas'));
    this.editTags.set(listaExtra(c.datosExtra, 'tags').join(', '));
    this.editandoFicha.set(true);
  }

  cancelarEdicionFicha(): void {
    this.editandoFicha.set(false);
  }

  async guardarFicha(): Promise<void> {
    const chat = this.detalle.value();
    if (!chat || this.guardandoFicha()) return;

    const nombre = this.editNombre().trim();
    if (!nombre) {
      this.toastService.warning('El nombre del paciente es obligatorio.');
      return;
    }

    this.guardandoFicha.set(true);
    try {
      const tagsArray = this.editTags()
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const datosExtraPrevios = (chat.cliente.datosExtra as Record<string, unknown>) ?? {};
      const nuevosDatosExtra = {
        ...datosExtraPrevios,
        empresa: this.editEmpresa().trim() || null,
        lugarNacimiento: this.editLugarNacimiento().trim() || null,
        fechaNacimiento: this.editFechaNacimiento() || null,
        notas: this.editNotas().trim() || null,
        tags: tagsArray,
      };

      const payload = {
        nombre,
        email: this.editEmail().trim() || null,
        categoria: this.editCategoria(),
        datosExtra: nuevosDatosExtra,
      };

      await this.clientesService.actualizar(chat.cliente.id, payload);
      this.toastService.success('Ficha de cliente actualizada.');
      this.editandoFicha.set(false);
      this.detalle.reload();
      this.conversacionesRecurso.reload();
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudo guardar la ficha.'));
    } finally {
      this.guardandoFicha.set(false);
    }
  }

  irACoincidencia(delta: number): void {
    const lista = this.coincidenciasChat();
    if (lista.length === 0) return;
    let nuevoIdx = this.indiceCoincidencia() + delta;
    if (nuevoIdx < 0) nuevoIdx = lista.length - 1;
    if (nuevoIdx >= lista.length) nuevoIdx = 0;
    this.indiceCoincidencia.set(nuevoIdx);
  }

  cambiarVelocidadAudio(msgId: string, audioElement: HTMLAudioElement): void {
    const actual = this.velocidadesAudio()[msgId] ?? 1;
    const siguiente = actual === 1 ? 1.5 : actual === 1.5 ? 2 : 1;
    audioElement.playbackRate = siguiente;
    this.velocidadesAudio.update(v => ({ ...v, [msgId]: siguiente }));
  }

  /**
   * Reemplaza el mensaje optimista por el real que devolvió el POST —
   * en memoria, sin volver a pedirle nada al servidor.
   *
   * El backend ya está diseñado para esto: `enviarMensaje()` (backend)
   * responde en cuanto guarda en base, con `estadoEnvio: 'ENVIADO'` real —
   * el envío a Meta va sin `await` a propósito ("el agente no debe esperar
   * el round-trip a Meta, 300-900ms típico") — y el tick final llega
   * DESPUÉS por WebSocket ("se corrige en segundo plano... sin que el
   * agente tenga que refrescar", dice su propio comentario).
   *
   * Antes de esto, el composer llamaba `conversacionesRecurso.reload()` +
   * `detalle.reload()` justo después del POST — dos peticiones completas
   * que Meta todavía no había contestado, así que en el mejor caso volvían
   * a traer lo mismo que el mensaje optimista ya mostraba, y en el peor
   * (una charla con más de 50 mensajes) el `findOne` de `detalle` trae solo
   * los últimos 50 y **descartaba el historial** que la agente había
   * cargado con `cargarHistorialAnterior()`. El aviso real de WebSocket
   * (`conversacion:actividad`, disparado por `registrarResultadoEnvio` en
   * cuanto Meta contesta) sigue llegando igual y sigue reconciliando el
   * tick — ver el efecto de `conversaciones.page.ts` — así que quitar estos
   * dos reloads no pierde nada, solo el viaje redundante.
   */
  reconciliarEnvioLocal(conversacionId: string, idOptimista: string | null, real: MensajeApi): void {
    const chat = this.detalle.value();
    if (chat && chat.id === conversacionId) {
      /* Las plantillas (fuera de la ventana de 24h) no pasan por un mensaje
         optimista previo — el modal solo espera la respuesta— así que aquí
         no hay nada que reemplazar: se añade al final. */
      const yaHabiaOptimista = idOptimista !== null && chat.mensajes.some(m => m.id === idOptimista);
      const mensajes = yaHabiaOptimista
        ? chat.mensajes.map(m =>
            m.id === idOptimista
              ? { ...m, id: real.id, createdAt: real.createdAt, estadoEnvio: real.estadoEnvio }
              : m,
          )
        : [...chat.mensajes, real];
      const nuevoDetalle = { ...chat, mensajes, updatedAt: real.createdAt };
      this.conversacionesService.setCachedDetalle(conversacionId, nuevoDetalle);
      this.detalle.set(nuevoDetalle);
      this.versionEnvioPropio.update(v => v + 1);
    }

    const lista = this.conversacionesRecurso.value();
    const idx = lista.findIndex(c => c.id === conversacionId);
    if (idx === -1) return;

    const actual = lista[idx];
    /* El backend reclama la conversación del pool al primer envío —ver la
       nota de `enviarMensaje()`— pero el POST no devuelve el `agente`
       resultante. La regla es determinista, así que se reproduce aquí en
       vez de dejar la fila con el dueño viejo hasta el próximo reload:
       si estaba sin asignar, ahora es de quien acaba de escribir. */
    const actualizada: ConversacionResumen = {
      ...actual,
      mensajes: [real],
      updatedAt: real.createdAt,
      agente: actual.agente ?? { id: this.currentUserId(), nombre: this.authService.user()?.nombre ?? '' },
    };

    const resto = lista.filter((_, i) => i !== idx);
    this.conversacionesRecurso.set([actualizada, ...resto]);
  }
}
