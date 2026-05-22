import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { DashboardLayoutEventsService } from './dashboard-layout-events.service'

@Controller('api/dashboard-layout')
export class DashboardLayoutSseController {
  constructor(private readonly events: DashboardLayoutEventsService) {}

  /**
   * Stream de eventos do layout. Frontend abre EventSource e filtra por empresaId.
   * Sem auth aqui — o `empresaId` é informação pública e o payload não traz dado
   * sensível (só sinaliza que algo mudou; o cliente busca via tRPC autenticado).
   */
  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
