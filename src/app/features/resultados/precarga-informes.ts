import { DestroyRef, inject, Injectable, Signal, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { ResultadosService } from './resultados.service';

/** Un PDF bajando —o ya bajado— a la memoria de la página. */
export interface DescargaInforme {
  /** De 0 a 1, o `null` mientras el servidor no dijo cuánto pesa. */
  readonly progreso: Signal<number | null>;
  /** Bytes que llevan llegados; sirve cuando no hay total. */
  readonly cargados: Signal<number>;
  /** El PDF completo. Rechaza si la descarga falla. */
  readonly pdf: Promise<Blob>;
}

interface Descarga extends DescargaInforme {
  cancelar(): void;
}

/** Cuántas filas pendientes se precargan: las primeras de la cola. */
export const PRECARGAS_POR_PAGINA = 3;

/** Techo de PDFs en memoria (3-5 MB cada uno): los más viejos ya bajados se sueltan. */
const MAXIMO_EN_MEMORIA = 6;

/**
 * Los PDF de la cola, bajados ANTES de que la asistente toque «Ver el
 * informe».
 *
 * El servidor entrega el PDF en ~0,1 s; lo que tarda es el viaje: un informe
 * de ecografía son 3-5 MB, y con la conexión de la clínica eso son segundos
 * con la pestaña en blanco (medido en producción el 29/09/2026: 10 informes,
 * 3,3 MB de media, hasta 4,8 MB). No se pueden achicar —es el documento
 * firmado— ni guardarse en la caché del navegador —las computadoras de la
 * clínica se comparten y quedaría un informe médico en el disco—. Lo que queda
 * es empezar antes: al abrir la cola se bajan, de a uno, los de las primeras
 * filas por enviar, que son los que se van a mirar.
 *
 * Todo vive en memoria y solo mientras la página está abierta: se provee en
 * la página, no en `root`, y al salir se aborta lo que sigue bajando y se
 * sueltan los PDF.
 */
@Injectable()
export class PrecargaInformes {
  private readonly resultados = inject(ResultadosService);

  /** Por informe, en orden de llegada: el primero es el más viejo. */
  private readonly descargas = new Map<string, Descarga>();
  private cola: string[] = [];
  /** Una precarga a la vez: varias en paralelo se reparten la misma conexión y ninguna llega antes. */
  private precargando = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cola = [];
      for (const descarga of this.descargas.values()) descarga.cancelar();
      this.descargas.clear();
    });
  }

  /** La descarga de ese informe: la precargada si existe, o una que arranca ya. */
  obtener(informeId: string): DescargaInforme {
    return this.descargas.get(informeId) ?? this.iniciar(informeId);
  }

  /** Encola estos informes para bajarlos de a uno, sin repetir los que ya están. */
  precargar(informeIds: readonly string[]): void {
    this.cola = informeIds.filter(id => !this.descargas.has(id));
    this.siguiente();
  }

  private siguiente(): void {
    if (this.precargando) return;
    const informeId = this.cola.shift();
    if (!informeId) return;
    if (this.descargas.has(informeId)) return this.siguiente();

    this.precargando = true;
    void this.iniciar(informeId).pdf.catch(() => undefined).finally(() => {
      this.precargando = false;
      this.siguiente();
    });
  }

  private iniciar(informeId: string): Descarga {
    const progreso = signal<number | null>(null);
    const cargados = signal(0);
    let suscripcion: Subscription | undefined;

    const pdf = new Promise<Blob>((resolver, rechazar) => {
      suscripcion = this.resultados.pdf(informeId).subscribe({
        next: estado => {
          if (estado.listo) {
            progreso.set(1);
            resolver(estado.blob);
            return;
          }
          cargados.set(estado.cargados);
          progreso.set(estado.total ? estado.cargados / estado.total : null);
        },
        error: rechazar,
      });
    });
    /* Una descarga fallida no se queda: el próximo clic la vuelve a pedir. */
    pdf.catch(() => this.descargas.delete(informeId));

    const descarga: Descarga = {
      progreso: progreso.asReadonly(),
      cargados: cargados.asReadonly(),
      pdf,
      cancelar: () => suscripcion?.unsubscribe(),
    };
    this.descargas.set(informeId, descarga);
    this.soltarLasViejas();
    return descarga;
  }

  /** Por encima del techo se sueltan las más viejas que ya terminaron. */
  private soltarLasViejas(): void {
    for (const [informeId, descarga] of this.descargas) {
      if (this.descargas.size <= MAXIMO_EN_MEMORIA) return;
      if (descarga.progreso() === 1) this.descargas.delete(informeId);
    }
  }
}
