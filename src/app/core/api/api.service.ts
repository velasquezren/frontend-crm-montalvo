import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { API_URL } from './api.constants';

/** Parámetros de query admitidos por la API (se omiten los vacíos). */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** Forma de petición que consume `httpResource()` en las páginas. */
export interface ResourceRequest {
  url: string;
  params?: Record<string, string | number | boolean>;
}

/**
 * ApiService — única puerta de salida HTTP del frontend.
 * Ref: CRM_MANIFESTO.md §4.4 (core/api/api.service.ts).
 *
 * Las páginas NO deben inyectar HttpClient ni construir URLs a mano:
 * cada dominio tiene su servicio (clientes, leads, ventas…) que se apoya aquí.
 * El JWT lo adjunta `tokenInterceptor`, no este servicio.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  /** Construye la URL absoluta de un endpoint: `('/clientes')` → `http://…/clientes`. */
  url(path: string): string {
    return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  }

  /**
   * Arma la petición para `httpResource()`, descartando parámetros vacíos
   * (evita mandar `?busqueda=` y que el backend filtre por cadena vacía).
   */
  request(path: string, params?: QueryParams): ResourceRequest {
    return { url: this.url(path), params: limpiarParams(params) };
  }

  get<T>(path: string, params?: QueryParams): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { params: limpiarParams(params) }));
  }

  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.url(path), body));
  }

  patch<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.url(path), body));
  }

  /**
   * Para endpoints que crean o reemplazan según la clave de la ruta (upsert),
   * donde `patch` mentiría: no hay nada que parchear si el recurso aún no existe.
   */
  put<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.put<T>(this.url(path), body));
  }

  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(this.url(path)));
  }

  /**
   * Descarga binaria con nombre de archivo (Excel, PDF…).
   *
   * Va por `HttpClient` con `responseType: 'blob'` y no por un `<a href>`
   * directo: el endpoint exige el Bearer, que solo añade `tokenInterceptor`
   * sobre peticiones de `HttpClient`. Un enlace directo saldría sin cabecera
   * de autorización y volvería 401.
   */
  async getBlob(path: string, params?: QueryParams): Promise<{ blob: Blob; nombre: string }> {
    const respuesta = await firstValueFrom(
      this.http.get(this.url(path), {
        params: limpiarParams(params),
        responseType: 'blob',
        observe: 'response',
      }),
    );
    const cabecera = respuesta.headers.get('content-disposition') ?? '';
    const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? 'descarga';
    return { blob: respuesta.body as Blob, nombre };
  }
}

function limpiarParams(params?: QueryParams): Record<string, string | number | boolean> {
  const limpio: Record<string, string | number | boolean> = {};
  if (!params) {
    return limpio;
  }
  for (const [clave, valor] of Object.entries(params)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      limpio[clave] = valor;
    }
  }
  return limpio;
}
