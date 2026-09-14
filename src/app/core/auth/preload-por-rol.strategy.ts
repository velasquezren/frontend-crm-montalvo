import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

import { AuthService } from './auth.service';
import { cubreRol, rolExigidoPor } from './roles';

/**
 * Precarga en segundo plano **solo las rutas que este usuario puede abrir**.
 *
 * Antes había `PreloadAllModules`, que descarga la aplicación entera en cuanto
 * termina la primera navegación. Medido sobre el `ng build` del 2026-09-14
 * (cierre transitivo de los chunks de cada ruta, comprimidos):
 *
 * | | Bruto | gzip |
 * |---|---|---|
 * | Todo lo lazy que bajaba `PreloadAllModules` | 1.378,2 kB | **388,4 kB** |
 * | De eso, exclusivo de rutas ADMIN/SUPER_ADMIN | 391,8 kB | **109,6 kB** |
 *
 * Una agente o recepción descargaba esos 109,6 kB —Finanzas, Planilla,
 * Analítica, Resumen Anual, Desempeño, Servicios, Usuarios y Líneas— para nada:
 * `exigeRol` le cierra la ruta y el backend le devolvería 403 igual. Es casi
 * exactamente el peso del paquete inicial entero (105,69 kB transferidos),
 * bajado por segunda vez y para nada, compitiendo por el ancho de banda con las
 * peticiones que sí está haciendo. Y este CRM se usa desde el móvil con
 * conexión mediocre: ahí 110 kB no son gratis.
 *
 * **Por qué hacía falta escribir esto y no bastaba con los guards:** el
 * precargador de Angular no consulta `canActivate`. Verificado en la fuente
 * instalada (21.2.22, `_router_module-chunk.mjs:730`): solo mira `canLoad`, y
 * solo para `loadChildren`. Todas las rutas de este CRM usan `loadComponent`,
 * así que ningún guard llegaba a estorbarle.
 *
 * **Lo que NO se pierde:** `RouterPreloader` reintenta en cada `NavigationEnd`
 * y salta lo ya cargado, así que devolver `of(null)` no es definitivo. En la
 * pantalla de login todavía no hay usuario, no se precarga nada y al entrar la
 * primera navegación vuelve a pasar por aquí con el rol ya resuelto. Un ADMIN
 * sigue precargándolo todo, igual que antes.
 */
@Injectable({ providedIn: 'root' })
export class PreloadPorRol implements PreloadingStrategy {
  private readonly auth = inject(AuthService);

  preload(ruta: Route, cargar: () => Observable<unknown>): Observable<unknown> {
    const rolMinimo = rolExigidoPor(ruta);
    if (rolMinimo === undefined) return cargar();

    return cubreRol(this.auth.user()?.rol, rolMinimo) ? cargar() : of(null);
  }
}
