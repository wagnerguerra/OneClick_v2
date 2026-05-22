import { Controller, Sse } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { ServicoExecucaoEventsService } from './servico-execucao-events.service'

@Controller('api/servicos/execucoes')
export class ServicoExecucaoSseController {
  constructor(private readonly events: ServicoExecucaoEventsService) {}

  /**
   * Stream de eventos de execuções de serviço. Clientes filtram por:
   *  - userId logado dentro de `candidatos` (widget, /meus-servicos)
   *  - empresaId (master/diretor vendo dashboard global)
   */
  @Sse('events')
  sse(): Observable<MessageEvent> {
    return this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
  }
}
