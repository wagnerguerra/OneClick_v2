import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { ClientErrorEventsService } from './client-error-events.service'

/**
 * SSE pra eventos do log de erros. Frontend abre EventSource em
 * /api/client-errors/events e usa pra atualizar:
 *  - Badge contador no header (incrementa em "new", recalcula em "resolved")
 *  - Listagem em tempo real em /admin/erros-cliente
 *
 * Sem auth no canal — payload é só metadata (hash + level + type), sem
 * conteúdo sensível.
 */
@Controller('api/client-errors')
export class ClientErrorSseController {
  constructor(private readonly events: ClientErrorEventsService) {}

  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
