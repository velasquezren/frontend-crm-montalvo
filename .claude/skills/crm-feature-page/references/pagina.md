# Página

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

```ts
export class ClientesPage {
  private readonly clientesService = inject(ClientesService);
  private readonly toast = inject(ToastService);

  protected readonly filtro = signal<FiltroCategoria>('TODOS');

  protected readonly clientes = httpResource<Cliente[]>(
    () => {
      const filtro = this.filtro();
      return this.clientesService.listarRequest({ categoria: filtro === 'TODOS' ? undefined : filtro });
    },
    { defaultValue: [] },
  );

  protected async guardar(): Promise<void> {
    try {
      await this.clientesService.actualizar(id, cambios);
      this.toast.success('Guardado', 'Listo');
      this.clientes.reload();
    } catch (err) {
      this.toast.error(mensajeDeError(err, 'No se pudo guardar.'), 'Error');
    }
  }
}
```

Reglas:
- `httpResource()` para lecturas reactivas; se re-dispara solo al cambiar un signal leído dentro.
- `signal()` para estado de UI, `computed()` para derivados. **Nunca** `BehaviorSubject`.
- `inject()`, nunca inyección por constructor.
- Tras un comando exitoso: `recurso.reload()`.
- Errores: siempre `mensajeDeError(err, respaldo)` de `core/api/http-error.ts` — nunca `err.error?.message` a mano ni `catch (err: any)`.
- Debounce de búsqueda: `effect(onCleanup => …)` con `clearTimeout` en el `onCleanup` (evita fugas al destruir).
- Pestañas y filtros de una lista viven en la URL (`?tab=`, `?estado=`, `?q=`): se
  leen del `snapshot` al crear los signals, validando cada valor (la URL la escribe
  cualquiera: lo desconocido es el valor por defecto), y se escriben con
  `reflejarEnUrl(() => ({ … }))` de `core/ui/reflejar-en-url.ts` (`replaceUrl` +
  `merge`, `null` para el valor por defecto, no navega si la URL ya lo dice). Solo
  escribe: leer también los cambios de la URL pisaría lo que se está tecleando. La
  búsqueda va ya con su pausa, nunca una navegación por tecla. Lo usan Ventas
  (`filtrosVentasDeUrl`), Pacientes, Leads (`?origen=` también por input) y Reservas;
  las pestañas siguen el patrón de arriba (`pestanaServiciosDe`). Al quitar
  parámetros de un enlace de entrada (`?nuevo=1`) se ponen a `null` solo esos:
  `queryParams: {}` borraba los filtros.
