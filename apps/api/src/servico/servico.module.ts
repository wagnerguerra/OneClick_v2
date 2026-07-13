import { Module, forwardRef } from '@nestjs/common'
import { ServicoService } from './servico.service'
import { ServicoScheduler } from './servico.scheduler'
import { ServicoExecucaoEventsService } from './servico-execucao-events.service'
import { ServicoFluxoAiService } from './servico-fluxo-ai.service'
import { ServicoExecucaoSseController } from './servico-execucao-sse.controller'
import { OrcamentoModule } from '../orcamento/orcamento.module'
import { ProcessoModule } from '../processo/processo.module'
import { NotificationModule } from '../notification/notification.module'
import { NotificacaoModule } from '../notificacao/notificacao.module'

@Module({
  imports: [forwardRef(() => OrcamentoModule), ProcessoModule, NotificationModule, forwardRef(() => NotificacaoModule)],
  controllers: [ServicoExecucaoSseController],
  providers: [ServicoService, ServicoScheduler, ServicoExecucaoEventsService, ServicoFluxoAiService],
  exports: [ServicoService, ServicoExecucaoEventsService],
})
export class ServicoModule {}
