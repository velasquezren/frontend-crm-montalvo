import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, TemplateRef, untracked, viewChild, ViewContainerRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { OverlayRef } from '@angular/cdk/overlay';

import { campoEnConflicto, Choque, choqueDe, datoDeConflicto, esConflicto, mensajeDeError } from '../../core/api/http-error';
import { paginaVacia, RespuestaPaginada } from '../../core/api/pagination.model';
import { BadgeComponent } from '../../shared/components/badge/badge.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DialogService } from '../../shared/components/dialog/dialog.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorCargaComponent } from '../../shared/components/error-carga/error-carga.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { InputComponent } from '../../shared/components/input/input.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PaginatorComponent } from '../../shared/components/paginator/paginator.component';
import { TableComponent } from '../../shared/components/table/table.component';
import { nombreParaMostrar } from '../../shared/models/nombre-cliente';
import { AVISO_TELEFONO_INVALIDO, telefonoParaEscribir } from '../../shared/models/telefono';
import { NombreClientePipe } from '../../shared/pipes/nombre-cliente.pipe';
import { ToastService } from '../../core/toast/toast.service';
import { EntregaResultado, estadoEntrega, FichaVinculable, fichaVinculable, motivoBloqueo, nombresDistintos, sePuedeEntregar, sePuedeRenovar } from './resultado.model';
import { ResultadosService } from './resultados.service';

/**
 * Entrega de resultados: la cola de informes publicados en el portal, con el
 * botón para mandarle al paciente el enlace por WhatsApp.
 *
 * El permiso NO se deduce del rol: lo decide el backend por la membresía en la
 * línea de resultados. Por eso un 404 aquí no es "no hay nada", es "esta cuenta
 * no entrega resultados", y la vista lo dice con esas palabras.
 */
@Component({
  selector: 'app-resultados-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    ErrorCargaComponent,
    IconComponent,
    InputComponent,
    LoadingSkeletonComponent,
    NombreClientePipe,
    PageHeaderComponent,
    PaginatorComponent,
    TableComponent,
  ],
  templateUrl: './resultados.page.html',
})
export class ResultadosPage {
  private readonly resultadosService = inject(ResultadosService);
  private readonly dialog = inject(DialogService);
  private readonly vcr = inject(ViewContainerRef);
  private readonly toast = inject(ToastService);

  private readonly plantillaConfirmar = viewChild.required<TemplateRef<unknown>>('confirmar');
  private readonly plantillaTelefono = viewChild.required<TemplateRef<unknown>>('editarTelefono');
  private readonly plantillaAlta = viewChild.required<TemplateRef<unknown>>('crearFicha');
  private overlay: OverlayRef | null = null;

  /**
   * Los tres modales de la vista se abren igual: cierra el que hubiera, limpia
   * su estado también al salir con Escape o tocando el fondo (`onClose`), y
   * pone el foco en el primer campo para que se pueda teclear sin buscar el
   * cursor — la asistente abre «Cambiar» para escribir un número, nada más.
   */
  private abrirModal(plantilla: TemplateRef<unknown>, alCerrar: () => void): void {
    this.overlay?.dispose();
    this.overlay = this.dialog.openTemplate(plantilla, this.vcr, { onClose: alCerrar });
    this.overlay.overlayElement.querySelector<HTMLInputElement>('input')?.focus();
  }

  protected readonly pagina = signal(1);
  /** Informe que se está enviando: bloquea solo su fila, no la tabla entera. */
  protected readonly enviando = signal<string | null>(null);
  /** A quién se va a enviar y si antes hay que renovar su enlace vencido. */
  protected readonly candidato = signal<{ fila: EntregaResultado; renovar: boolean } | null>(null);

  protected readonly entregas = httpResource<RespuestaPaginada<EntregaResultado>>(
    () => this.resultadosService.pendientesRequest(this.pagina()),
    { defaultValue: paginaVacia<EntregaResultado>() },
  );

  /* Las dos reglas viven en el modelo: la plantilla las consulta y la prueba
     las fija, y escritas dos veces divergen. */
  protected readonly sePuedeEnviar = sePuedeEntregar;
  protected readonly sePuedeRenovar = sePuedeRenovar;
  protected readonly motivoBloqueo = motivoBloqueo;
  protected readonly estadoEntrega = estadoEntrega;
  protected readonly distintos = nombresDistintos;

  /** Ficha cuyo teléfono se está corrigiendo, y el valor tecleado. */
  /* Se guarda el INFORME, no la ficha: el backend decide a qué ficha va. */
  protected readonly editando = signal<{ informeId: string; nombre: string; telefono: string } | null>(null);
  protected readonly telefonoNuevo = signal('');
  protected readonly guardandoTelefono = signal(false);
  /** Lo tecleado en el formato que exige el backend: `70012345` → `+59170012345`. */
  protected readonly telefonoNuevoE164 = computed(() => telefonoParaEscribir(this.telefonoNuevo()));
  /** Número que el servidor ya rechazó por ser de otra ficha, y lo que dijo. */
  private readonly telefonoChocado = signal<Choque | null>(null);
  protected readonly errorTelefonoNuevo = computed(
    () =>
      choqueDe(this.telefonoChocado(), this.telefonoNuevoE164()) ??
      errorDeTelefono(this.telefonoNuevo(), this.telefonoNuevoE164()),
  );
  /** Guardar el mismo número no cambia nada: el botón no se ofrece. */
  protected readonly telefonoSinCambios = computed(() => this.telefonoNuevoE164() === this.editando()?.telefono);

  /**
   * El número al que va el mensaje sale de la ficha del CRM, no del portal. Si
   * está mal, hasta ahora había que salir a Clientes, buscar y volver — y el
   * aviso se manda una sola vez.
   */
  protected abrirTelefono(fila: EntregaResultado): void {
    if (!fila.paciente) return;
    this.editando.set({ informeId: fila.informeId, nombre: nombreParaMostrar(fila.paciente), telefono: fila.paciente.telefono });
    this.telefonoNuevo.set(fila.paciente.telefono);
    this.telefonoChocado.set(null);
    this.abrirModal(this.plantillaTelefono(), () => this.cerrarTelefono());
  }

  protected cerrarTelefono(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.editando.set(null);
  }

  protected async guardarTelefono(): Promise<void> {
    const edicion = this.editando();
    const telefono = this.telefonoNuevoE164();
    if (!edicion || !telefono || this.telefonoSinCambios() || this.errorTelefonoNuevo() || this.guardandoTelefono()) return;
    this.guardandoTelefono.set(true);
    try {
      await this.resultadosService.corregirTelefono(edicion.informeId, telefono);
      this.cerrarTelefono();
      this.toast.success('El aviso saldrá a ese número.', 'Teléfono actualizado');
      this.entregas.reload();
    } catch (err) {
      /* El teléfono es único en el CRM. Que ya sea de otra ficha no es un
         fallo del sistema: es un dato que corregir, y el backend dice de quién
         es. Se marca el campo y el modal sigue abierto con lo tecleado. */
      if (esConflicto(err)) {
        this.telefonoChocado.set({ valor: telefono, mensaje: mensajeDeError(err, MENSAJE_DUPLICADO) });
        return;
      }
      this.toast.error(mensajeDeError(err, 'No se pudo cambiar el teléfono.'), 'Error');
    } finally {
      this.guardandoTelefono.set(false);
    }
  }

  /** Informe cuyo enlace de revisión se está pidiendo. */
  protected readonly abriendo = signal<string | null>(null);

  /**
   * Abre el informe en el visor del portal de resultados —el mismo del
   * médico— para comprobar qué se va a enviar.
   *
   * El CRM solo pide el enlace (un viaje corto); el PDF lo carga el navegador
   * directo del portal, en su versión liviana y con la barra de progreso del
   * propio visor. Antes el CRM bajaba el PDF entero (3-5 MB) y recién entonces
   * lo mostraba. El enlace no es el del paciente: no marca «abierto por el
   * paciente».
   */
  protected async verInforme(fila: EntregaResultado): Promise<void> {
    if (this.abriendo()) return;
    this.abriendo.set(fila.informeId);
    /* La pestaña se abre YA, dentro del clic, y la dirección se le pone al
       llegar. Abrirla después del `await` la bloquea el navegador —Safari
       siempre—: ya no cuenta como gesto de la usuaria. */
    const pestana = window.open('', '_blank');
    if (pestana) {
      pestana.document.title = 'Informe';
      pestana.document.body.textContent = 'Abriendo el informe…';
    }
    try {
      const { url } = await this.resultadosService.enlaceRevision(fila.informeId);
      if (pestana) {
        pestana.opener = null;
        pestana.location.href = url;
      } else {
        this.toast.error('El navegador bloqueó la pestaña nueva. Permite las ventanas emergentes de este sitio.', 'No se pudo abrir');
      }
    } catch (err) {
      pestana?.close();
      this.toast.error(mensajeDeError(err, 'No se pudo abrir el informe.'), 'Error');
    } finally {
      this.abriendo.set(null);
    }
  }

  /** Paciente del portal que no tiene ficha: se está creando la suya. */
  protected readonly creando = signal<EntregaResultado | null>(null);
  protected readonly telefonoAlta = signal('');
  protected readonly guardandoAlta = signal(false);
  protected readonly telefonoAltaE164 = computed(() => telefonoParaEscribir(this.telefonoAlta()));
  /**
   * Informe cuya ficha se acaba de crear. Crear la ficha es solo el medio: lo
   * que la asistente quería era enviarlo. En cuanto la cola vuelve del
   * servidor con la fila ya vinculada, se le ofrece el envío sin que tenga que
   * buscarla — con la fila que dice el SERVIDOR, no con una armada aquí: el
   * cruce por PAC lo hace el backend y es él quien sabe si ya se puede.
   */
  private readonly ofrecerEnvioDe = signal<string | null>(null);

  constructor() {
    effect(() => {
      const informeId = this.ofrecerEnvioDe();
      if (!informeId || this.entregas.isLoading()) return;
      const fila = this.entregas.value().datos.find(f => f.informeId === informeId);
      untracked(() => {
        this.ofrecerEnvioDe.set(null);
        if (fila && sePuedeEntregar(fila)) {
          this.pedirConfirmacion(fila);
        } else {
          this.toast.info(
            fila ? motivoBloqueo(fila) : 'El informe ya no está en esta página de la cola.',
            'Ficha creada, sin enviar',
          );
        }
      });
    });
  }
  /** Número que el servidor ya rechazó al dar de alta, y lo que dijo. */
  private readonly altaChocada = signal<Choque | null>(null);
  protected readonly errorTelefonoAlta = computed(
    () =>
      choqueDe(this.altaChocada(), this.telefonoAltaE164()) ??
      errorDeTelefono(this.telefonoAlta(), this.telefonoAltaE164()),
  );

  /**
   * Alta desde la cola de un paciente que el portal conoce y el CRM no.
   *
   * Pasa más de lo que parece: la importación de FileMaker dejó fuera 36.372
   * fichas por no tener celular válido, y son justo ésas las que el médico
   * sigue atendiendo. Sin ficha no hay número, y sin número no hay aviso; hasta
   * ahora había que ir a Clientes, darla de alta a mano copiando el nombre y el
   * PAC, y volver.
   *
   * El nombre y los identificadores vienen del portal; lo único que falta —y
   * que el CRM no puede inventar— es el teléfono.
   */
  protected abrirAlta(fila: EntregaResultado): void {
    this.creando.set(fila);
    this.telefonoAlta.set('');
    this.altaChocada.set(null);
    this.vinculable.set(null);
    this.abrirModal(this.plantillaAlta(), () => this.cerrarAlta());
  }

  protected cerrarAlta(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.creando.set(null);
    this.vinculable.set(null);
  }

  /**
   * La ficha que ya tiene el número tecleado, cuando puede ser la misma
   * paciente (sin PAC, nada que la contradiga). Mientras está puesta, el modal
   * pregunta en vez de crear. Ver `FichaVinculable`.
   */
  protected readonly vinculable = signal<{ ficha: FichaVinculable; telefono: string } | null>(null);
  protected readonly vinculando = signal(false);

  /** Enter en el modal hace lo que dice el botón principal que se ve. */
  protected alEnviarAlta(): void {
    void (this.vinculable() ? this.confirmarVinculo() : this.guardarAlta());
  }

  protected async confirmarVinculo(): Promise<void> {
    const fila = this.creando();
    const candidata = this.vinculable();
    if (!fila || !candidata || this.vinculando()) return;
    this.vinculando.set(true);
    try {
      await this.resultadosService.vincularFicha(fila.informeId, candidata.telefono);
      this.cerrarAlta();
      /* Mismo final que un alta: la cola ahora la reconoce por PAC y el effect
         del constructor abre la confirmación de envío. */
      this.toast.success('Desde ahora sus informes se reconocen solos.', 'Ficha vinculada');
      this.entregas.reload();
      this.ofrecerEnvioDe.set(fila.informeId);
    } catch (err) {
      /* La ficha cambió entre la pregunta y el «sí»: se vuelve al número. */
      this.vinculable.set(null);
      this.toast.warning(mensajeDeError(err, 'No se pudo vincular la ficha.'), 'No se vinculó');
    } finally {
      this.vinculando.set(false);
    }
  }

  /**
   * No es ella: casi siempre un familiar con el mismo WhatsApp. El CRM admite
   * una ficha por número, así que lo que queda es otro número de la paciente.
   */
  protected noEsLaMisma(): void {
    const candidata = this.vinculable();
    this.vinculable.set(null);
    if (candidata) {
      this.altaChocada.set({
        valor: candidata.telefono,
        mensaje: 'Ese número ya es de otra persona y el CRM admite una ficha por número. Usa otro WhatsApp de la paciente.',
      });
    }
  }

  protected async guardarAlta(): Promise<void> {
    const fila = this.creando();
    const telefono = this.telefonoAltaE164();
    if (!fila || !telefono || this.errorTelefonoAlta() || this.guardandoAlta()) return;
    this.guardandoAlta.set(true);
    try {
      /* Nombre, PAC y CI los pone el backend desde el portal: aquí solo viaja
         lo que el CRM no puede saber. */
      await this.resultadosService.crearFicha(fila.informeId, telefono);
      this.cerrarAlta();
      /* Al recargar, el backend vuelve a cruzar por PAC; cuando llega, el
         effect del constructor abre la confirmación de envío. */
      this.toast.success('Revisa el envío del informe.', 'Ficha creada');
      this.entregas.reload();
      this.ofrecerEnvioDe.set(fila.informeId);
    } catch (err) {
      /* Teléfono y PAC son únicos. El teléfono se corrige aquí mismo; un PAC
         repetido significa que la ficha ya existe y el cruce no la encontró,
         y eso no se arregla en este modal: se avisa sin pintarlo de rojo. */
      /* El número ya es de una ficha sin PAC: puede ser ella. Se pregunta. */
      const candidata = fichaVinculable(datoDeConflicto(err, 'vinculable'));
      if (candidata) {
        this.vinculable.set({ ficha: candidata, telefono });
        return;
      }
      if (esConflicto(err)) {
        const aviso = mensajeDeError(err, MENSAJE_DUPLICADO);
        if (campoEnConflicto(err) === 'telefono') {
          this.altaChocada.set({ valor: telefono, mensaje: aviso });
        } else {
          this.toast.warning(aviso, 'Esa ficha ya existe');
        }
        return;
      }
      this.toast.error(mensajeDeError(err, 'No se pudo crear la ficha.'), 'Error');
    } finally {
      this.guardandoAlta.set(false);
    }
  }

  protected pedirConfirmacion(fila: EntregaResultado, renovar = false): void {
    this.candidato.set({ fila, renovar });
    this.abrirModal(this.plantillaConfirmar(), () => this.cerrarConfirmacion());
  }

  protected cerrarConfirmacion(): void {
    this.overlay?.dispose();
    this.overlay = null;
    this.candidato.set(null);
  }

  protected async confirmarEnvio(): Promise<void> {
    const candidato = this.candidato();
    if (!candidato) return;
    const { fila, renovar } = candidato;
    this.cerrarConfirmacion();
    this.enviando.set(fila.informeId);
    try {
      await (renovar ? this.resultadosService.renovarYEnviar(fila.informeId) : this.resultadosService.enviar(fila.informeId));
      this.toast.success(
        /* Meta confirma después: el estado real aparece en la fila. */
        `El enlace del informe va en camino a ${fila.paciente ? nombreParaMostrar(fila.paciente) : 'el paciente'}.`,
        'Aviso enviado',
      );
      this.entregas.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo enviar el aviso.'), 'Error');
    } finally {
      this.enviando.set(null);
    }
  }
}

/**
 * El aviso de un teléfono mal escrito, solo cuando ya hay algo escrito: un
 * campo vacío recién abierto no es un error, es un campo por llenar.
 */
function errorDeTelefono(tecleado: string, e164: string | null): string | undefined {
  if (!tecleado.trim() || e164) return undefined;
  return AVISO_TELEFONO_INVALIDO;
}

/** Si el backend no nombró al dueño del dato, al menos que se entienda qué pasa. */
const MENSAJE_DUPLICADO = 'Ya existe un paciente con ese número.';
