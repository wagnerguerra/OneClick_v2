import { Controller, Sse } from '@nestjs/common'
import { Observable, interval, map, merge } from 'rxjs'
import { ServicoExecucaoEventsService } from './servico-execucao-events.service'

@Controller('api/servicos/execucoes')
export class ServicoExecucaoSseController {
  constructor(private readonly events: ServicoExecucaoEventsService) {}

  /**
   * Stream de eventos de execuções de serviço. Clientes filtram por:
   *  - userId logado dentro de `candidatos` (widget, /meus-servicos)
   *  - empresaId (master/diretor vendo dashboard global)
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
