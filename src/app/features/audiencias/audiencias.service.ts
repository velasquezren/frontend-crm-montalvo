import { inject, Injectable } from '@angular/core';

import { ApiService, ResourceRequest } from '../../core/api/api.service';
import { FiltroAudiencia } from './audiencia.model';

/** Audiencias para campañas. Solo lectura: el envío masivo es otra fase. */
@Injectable({ providedIn: 'root' })
export class AudienciasService {
  private readonly api = inject(ApiService);

  /** Petición para `httpResource()`: la reactividad vive en la página. */
  segmentarRequest(filtro: FiltroAudiencia): ResourceRequest {
    return this.api.request('/audiencias', {
      categorias: filtro.categorias.join(','),
      diasSinCampana: filtro.diasSinCampana,
      soloConversaron: filtro.soloConversaron ? 'true' : undefined,
      pagina: filtro.pagina,
    });
  }
}
