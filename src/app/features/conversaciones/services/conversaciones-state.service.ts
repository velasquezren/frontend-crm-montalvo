import {
  computed,
  effect,
  EffectCleanupRegisterFn,
  inject,
  Injectable,
  linkedSignal,
  signal,
} from '@angular/core';
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
  FiltrosInbox,
  ItemHilo,
  MensajeApi,
  PaginaInbox,
  PlantillaAgente,
  PlantillaResumen,
  ResumenInbox,
} from '../conversacion.model';
import { ConversacionesService } from '../conversaciones.service';
import { CategoriaCliente } from '../../../shared/models/cliente-categoria.model';

const LOTE_HISTORIAL = 50;

/**
 * Retardo del buscador del inbox.
 *
 * Antes la búsqueda era en memoria y no costaba nada teclear; ahora cada
 * término es una consulta, y desde Bolivia cada ida y vuelta son ~190 ms. 300
 * ms es lo que tarda en notarse una pausa al escribir, así que buscar sigue
 * sintiéndose inmediato sin mandar una petición por tecla.
 */
const RETARDO_BUSQUEDA_MS = 300;

/** Lo que se muestra mientras el inbox no ha contestado (o si falla). */
const PAGINA_VACIA: PaginaInbox = {
  datos: [],
  total: 0,
  pagina: 1,
  limite: 50,
  totalPaginas: 1,
  contadores: { total: 0, sinAsignar: 0, misChats: 0, sinResponder: 0 },
};

/**
 * Compara dos páginas por lo que de verdad cambia la pantalla.
 *
 * Evita repintar las ~50 filas cuando el respaldo de 60 s trae exactamente lo
 * mismo, que es lo que pasa la mayoría de las veces.
 */
function mismasFilas(a: readonly ConversacionResumen[], b: readonly ConversacionResumen[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (fila, i) =>
      fila.id === b[i].id &&
      fila.updatedAt === b[i].updatedAt &&
      fila.noLeidosCount === b[i].noLeidosCount &&
      fila.esperandoRespuesta === b[i].esperandoRespuesta,
  );
}

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
  /** Lo que la agente está tecleando ahora mismo. */
  readonly busqueda = signal('');
  /** Lo mismo, pero con retardo: es esto lo que viaja al servidor. */
  private readonly busquedaDebounced = signal('');
  readonly filtroTab = signal<FiltroInbox>('TODAS');
  readonly filtroAgenteId = signal<string | null>(null);
  readonly mostrarFiltroAgentes = signal(false);
  readonly dropdownAgenteAbierto = signal(false);
  readonly soloMisChatsAdmin = signal(false);

  /**
   * Lo que de verdad viaja al servidor. `busqueda` va con retardo (ver el
   * `effect` del constructor): sin él, cada tecla sería una petición.
   */
  readonly filtros = computed<FiltrosInbox>(() => ({
    tab: this.filtroTab(),
    /* El filtro por agente solo aplica en "Todas", igual que antes en memoria:
       combinarlo con "Mis chats" daría siempre vacío. */
    agenteId: this.filtroTab() === 'TODAS' ? this.filtroAgenteId() : null,
    busqueda: this.busquedaDebounced(),
    soloMios: this.isAdmin() && this.soloMisChatsAdmin(),
  }));

  /**
   * La PRIMERA página del inbox, ya filtrada por el servidor.
   *
   * Se re-pide sola al cambiar cualquier filtro porque `filtros()` se lee aquí
   * dentro. Antes esto traía las 500 conversaciones más recientes de una vez y
   * la vista filtraba en memoria; una conversación fuera de ese corte no
   * aparecía ni al buscarla por nombre.
   */
  readonly inbox = httpResource<PaginaInbox>(
    () => this.conversacionesService.listarRequest(this.filtros()),
    {
      defaultValue: PAGINA_VACIA,
      equal: (a, b) =>
        a.total === b.total &&
        a.pagina === b.pagina &&
        mismasFilas(a.datos, b.datos) &&
        a.contadores.sinResponder === b.contadores.sinResponder &&
        a.contadores.sinAsignar === b.contadores.sinAsignar &&
        a.contadores.misChats === b.contadores.misChats,
    },
  );

  /**
   * Las páginas siguientes que la agente fue pidiendo con "cargar más".
   *
   * `linkedSignal` sobre los filtros: cambiar de pestaña o escribir en el
   * buscador las descarta solas. Sin eso, al filtrar quedarían colgando filas
   * de la búsqueda anterior debajo de los resultados nuevos.
   */
  private readonly paginasExtra = linkedSignal<FiltrosInbox, ConversacionResumen[]>({
    source: this.filtros,
    computation: () => [],
  });

  /** La última página que se llegó a pedir; vuelve a 1 con cada filtro nuevo. */
  private readonly ultimaPagina = linkedSignal<FiltrosInbox, number>({
    source: this.filtros,
    computation: () => 1,
  });

  readonly cargandoMas = signal(false);

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

  /**
   * Los números de las cuatro pestañas, tal como los cuenta el servidor.
   *
   * Antes se calculaban aquí sobre la lista cargada, así que a partir de la
   * conversación 501 el badge decía "500" para siempre y "Sin responder"
   * escondía a las que llevaban más tiempo esperando — justo las que el número
   * existe para hacer visibles.
   */
  readonly stats = computed(() => this.inbox.value().contadores);

  /**
   * Lo que se pinta: la primera página más lo que se haya ido cargando.
   *
   * Ya viene filtrado y ordenado por el servidor; aquí no se filtra nada. El
   * nombre se conserva porque es el que usa la plantilla.
   */
  readonly conversacionesFiltradas = computed<readonly ConversacionResumen[]>(() => [
    ...this.inbox.value().datos,
    ...this.paginasExtra(),
  ]);

  /** Cuántas conversaciones cumplen el filtro actual, cargadas o no. */
  readonly totalFiltrado = computed(() => this.inbox.value().total);

  /** Si queda algo por debajo de lo que se está mostrando. */
  readonly hayMasConversaciones = computed(
    () => this.conversacionesFiltradas().length < this.totalFiltrado(),
  );

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

  /**
   * Si la ventana extendida de 72h por anuncio de Meta Ads (Free Entry Point)
   * está activa desde que se originó el anuncio.
   *
   * OJO: esta ventana **solo** habilita mandar PLANTILLAS sin costo. No
   * reemplaza ni extiende la ventana de servicio al cliente (CSW) de 24h, que
   * es la única que habilita texto libre. Son independientes — así lo dice la
   * documentación oficial de WhatsApp Business Platform (Pricing ›
   * "Free Entry Point conversations"). Se guarda aparte solo como dato
   * informativo (p. ej. para saber si una plantilla saldrá gratis), nunca
   * para decidir si se puede escribir texto libre — `fueraDeVentana24h` no
   * debe volver a leer esta señal.
   */
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

  /** El texto libre siempre depende únicamente de la CSW de 24h. */
  readonly horasVentanaMeta = computed(() => 24);

  /**
   * true si ya no se puede mandar texto libre: pasaron 24h desde el último
   * mensaje ENTRANTE del paciente. La ventana de 72h del anuncio (FEP) NO
   * entra acá — solo aplica a plantillas, ver `ventana72hMetaActiva`.
   */
  readonly fueraDeVentana24h = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return false;
    const ultimoEntrante = [...chat.mensajes].reverse().find(m => m.direccion === 'ENTRANTE');
    if (!ultimoEntrante) return true;

    const haceHoras = (Date.now() - new Date(ultimoEntrante.createdAt).getTime()) / (1000 * 60 * 60);
    return haceHoras >= 24;
  });

  /** Horas que quedan de la CSW de 24h antes de que se bloquee el texto libre. */
  readonly horasRestantesVentana = computed(() => {
    const chat = this.detalle.value();
    if (!chat) return 0;
    const ultimoEntrante = [...chat.mensajes].reverse().find(m => m.direccion === 'ENTRANTE');
    if (!ultimoEntrante) return 0;

    const haceHorasMsg = (Date.now() - new Date(ultimoEntrante.createdAt).getTime()) / (1000 * 60 * 60);
    return Math.round(Math.max(0, 24 - haceHorasMsg) * 10) / 10;
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

  constructor() {
    /* Retardo del buscador. `onCleanup` cancela el temporizador anterior en
       cada tecla, que es lo que impide una petición por pulsación y también
       una fuga si la vista muere con uno pendiente. */
    effect((onCleanup: EffectCleanupRegisterFn) => {
      const texto = this.busqueda();
      const id = setTimeout(() => this.busquedaDebounced.set(texto), RETARDO_BUSQUEDA_MS);
      onCleanup(() => clearTimeout(id));
    });
  }

  /* ── Métodos de Acción ─────────────────────────────────────────── */

  /**
   * Trae la siguiente página y la añade al final de la lista.
   *
   * No sustituye lo que ya está en pantalla: la agente puede seguir bajando sin
   * perder el sitio. Al cambiar cualquier filtro, `paginasExtra` se vacía sola.
   */
  async cargarMas(): Promise<void> {
    if (this.cargandoMas() || !this.hayMasConversaciones()) return;

    const siguiente = this.ultimaPagina() + 1;
    this.cargandoMas.set(true);
    try {
      const pagina = await this.conversacionesService.listarPagina(this.filtros(), siguiente);
      /* Se descartan las que ya estén: entre que se pidió y que llegó, un
         mensaje nuevo pudo subir una conversación a la primera página y
         entonces vendría repetida. */
      const yaVistas = new Set(this.conversacionesFiltradas().map(c => c.id));
      const nuevas = pagina.datos.filter(c => !yaVistas.has(c.id));

      this.paginasExtra.update(previas => [...previas, ...nuevas]);
      this.ultimaPagina.set(siguiente);
    } catch (err) {
      this.toastService.error(mensajeDeError(err, 'No se pudieron cargar más conversaciones.'));
    } finally {
      this.cargandoMas.set(false);
    }
  }

  /**
   * Refresca UNA conversación tras un aviso de tiempo real.
   *
   * Antes cualquier mensaje entrante disparaba una recarga del inbox completo
   * —500 conversaciones— para reflejar un cambio en una sola fila. Ahora se
   * pide esa fila y se coloca arriba, que es donde el orden por `updatedAt` la
   * pondría de todos modos.
   *
   * Si el servidor responde `conversacion: null`, la conversación dejó de
   * encajar en la vista activa (le contestaron y estás en "Sin responder", se
   * la reasignaron y estás en "Mis chats"): se quita en vez de dejar una fila
   * que ya no corresponde.
   */
  async refrescarFilaPorRealtime(conversacionId: string): Promise<void> {
    let respuesta: ResumenInbox;
    try {
      respuesta = await this.conversacionesService.resumenParaInbox(conversacionId, this.filtros());
    } catch {
      /* Un aviso de tiempo real que no se puede resolver no puede romper la
         pantalla: el respaldo de 60 s acabará poniéndola al día. */
      return;
    }

    const { conversacion, contadores } = respuesta;

    /* Fuera de las páginas siguientes en los dos casos: si vuelve, sube al
       tope; si no, es que ya no va. */
    this.paginasExtra.update(lista => lista.filter(c => c.id !== conversacionId));

    const pagina = this.inbox.value();
    const sinEsta = pagina.datos.filter(c => c.id !== conversacionId);

    this.inbox.set({
      ...pagina,
      datos: conversacion ? [conversacion, ...sinEsta] : sinEsta,
      contadores,
    });
  }

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
      this.inbox.reload();
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
      this.inbox.reload();
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
   * Antes de esto, el composer llamaba `inbox.reload()` +
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
      /*
       * El backend llama `emitirActividad()` de forma SÍNCRONA e
       * incondicional en cuanto guarda el mensaje —antes incluso de
       * responder el POST— para que las demás pestañas se refresquen. Ese
       * aviso viaja por el socket y puede llegarle al MISMO navegador que
       * envió, por un canal aparte, ANTES de que la promesa del propio POST
       * se resuelva aquí.
       *
       * Si eso pasa: el efecto de tiempo real de `conversaciones.page.ts`
       * dispara `detalle.reload()`, que trae el mensaje real por su cuenta
       * y REEMPLAZA el array entero —sin saber nada del `idOptimista`, que
       * es puramente local—. Cuando esta función corre después, busca el
       * optimista para reemplazarlo y ya no está: cayó al `else` de abajo y
       * agregaba el mensaje real POR SEGUNDA VEZ, aunque el reload ya lo
       * había traído. Es la causa de las imágenes (y en teoría cualquier
       * mensaje) que a veces se ven duplicadas — una carrera, no un
       * doble clic ni doble envío real a Meta.
       *
       * Por eso el primer chequeo es simple y cubre los dos casos a la vez:
       * si el id real YA está en el array —lo trajo el reload, o esta misma
       * función ya corrió antes por algún reintento— no se toca nada.
       */
      const yaEstaElReal = chat.mensajes.some(m => m.id === real.id);
      const yaHabiaOptimista = idOptimista !== null && chat.mensajes.some(m => m.id === idOptimista);

      /* Las plantillas (fuera de la ventana de 24h) no pasan por un mensaje
         optimista previo — el modal solo espera la respuesta— así que ahí
         no hay nada que reemplazar: se añade al final. */
      const mensajes = yaEstaElReal
        ? chat.mensajes
        : yaHabiaOptimista
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

    const pagina = this.inbox.value();
    const actual =
      pagina.datos.find(c => c.id === conversacionId) ??
      this.paginasExtra().find(c => c.id === conversacionId);
    if (!actual) return;

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
      /* Acaba de contestar una persona: sale de "Sin responder". Es la misma
         regla que aplica el backend en la transacción del mensaje, reproducida
         aquí para que la fila no se contradiga hasta el próximo refresco. */
      esperandoRespuesta: false,
    };

    /* Si estaba en una página siguiente, sube al tope de la primera: el orden
       por `updatedAt` la pondría ahí de todos modos. */
    this.paginasExtra.update(lista => lista.filter(c => c.id !== conversacionId));

    this.inbox.set({
      ...pagina,
      datos: [actualizada, ...pagina.datos.filter(c => c.id !== conversacionId)],
      /* Si sale de "Sin responder", el badge tiene que bajar en el acto: es la
         cuenta que la agente mira para saber a quién le falta contestar. */
      contadores: estaSinResponder(actual)
        ? { ...pagina.contadores, sinResponder: Math.max(0, pagina.contadores.sinResponder - 1) }
        : pagina.contadores,
    });
  }
}
