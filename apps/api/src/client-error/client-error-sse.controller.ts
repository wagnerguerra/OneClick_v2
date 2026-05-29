import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
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
    // Ping a cada 30s pra manter conexão viva (proxy timeout).
    const ping$ = interval(30_000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const events$ = this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
    return merge(events$, ping$)
  }
}
