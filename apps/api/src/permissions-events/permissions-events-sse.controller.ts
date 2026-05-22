import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
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
   */
  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
