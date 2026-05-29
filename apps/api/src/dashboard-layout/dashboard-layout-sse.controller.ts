import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { DashboardLayoutEventsService } from './dashboard-layout-events.service'

@Controller('api/dashboard-layout')
export class DashboardLayoutSseController {
  constructor(private readonly events: DashboardLayoutEventsService) {}

  /**
   * Stream de eventos do layout. Frontend abre EventSource e filtra por empresaId.
   * Sem auth aqui — o `empresaId` é informação pública e o payload não traz dado
   * sensível (só sinaliza que algo mudou; o cliente busca via tRPC autenticado).
   *
   * Ping a cada 30s pra manter conexão viva — sem isso o nginx (timeout 120s)
   * mata e o cliente reconecta em loop, gerando carga.
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
