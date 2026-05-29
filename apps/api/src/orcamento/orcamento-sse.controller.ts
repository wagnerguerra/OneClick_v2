import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { OrcamentoEventsService } from './orcamento-events.service'

@Controller('api/orcamentos')
export class OrcamentoSseController {
  constructor(private readonly events: OrcamentoEventsService) {}

  /**
   * Stream de eventos do módulo Orçamentos. Cliente abre EventSource e filtra:
   *  - Kanban/listagem (`/orcamentos`): por `empresaId`.
   *  - Detalhe (`/orcamentos/[id]`): por `orcamentoId`, e despacha o refetch
   *    de acordo com `type` (kanban → header/status; dados-gerais → bloco
   *    dados; itens → bloco itens/totais).
   *
   * Sem auth no canal — o payload só carrega IDs (sem dado sensível); o
   * refetch subsequente passa pelo tRPC autenticado.
   */
  @Sse('events')
  sse(): Observable<MessageEvent> {
    const ping$ = interval(30_000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const events$ = this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
    return merge(events$, ping$)
  }
}
