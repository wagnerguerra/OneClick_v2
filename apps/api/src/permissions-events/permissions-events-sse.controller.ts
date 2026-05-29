import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { PermissionsEventsService } from './permissions-events.service'

@Controller('api/permissions')
export class PermissionsEventsSseController {
  constructor(private readonly events: PermissionsEventsService) {}

  /**
   * Stream de eventos de permissões. Cliente abre EventSource e filtra por
   * userId — só reage quando o evento é do próprio usuário logado.
   *
   * Sem auth aqui — o payload só carrega o userId alvo (sem dado sensível);
   * a query subsequente que recarrega as permissões é autenticada via tRPC.
   *
   * Ping a cada 30s pra manter conexão viva (proxy timeout).
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
