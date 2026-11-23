# Servicio de dominio

> Parte de la skill `crm-feature-page`: lee antes su [índice](../SKILL.md).

Dos tipos de método:

```ts
@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly api = inject(ApiService);

  // 1) Lectura → devuelve la PETICIÓN, la reactividad vive en la página
  listarRequest(filtro: FiltroClientes): ResourceRequest {
    return this.api.request('/clientes', { busqueda: filtro.busqueda, categoria: filtro.categoria });
  }

  // 2) Comandos → devuelven Promise
  actualizar(id: string, cambios: ActualizarClienteDto): Promise<Cliente> {
    return this.api.patch<Cliente>(`/clientes/${id}`, cambios);
  }
}
```

`ApiService.request()` descarta parámetros vacíos automáticamente: no hace falta armar objetos condicionales.
