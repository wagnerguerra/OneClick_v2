import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { NotificationsEventsService } from './notifications-events.service'

@Controller('api/notifications')
export class NotificationsEventsSseController {
  constructor(private readonly events: NotificationsEventsService) {}

  /**
   * Stream de eventos da inbox de notificações. Cliente abre EventSource e
   * filtra por userId — só reage quando o evento é do próprio user logado.
   * Sem auth no canal — payload só carrega userId-alvo (sem dado sensível);
   * a chamada subsequente que recarrega/conta notificações é autenticada via tRPC.
   */
  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
