import { Module, forwardRef } from '@nestjs/common'
import { OrcamentoService } from './orcamento.service'
import { OrcamentoScheduler } from './orcamento.scheduler'
import { OrcamentoEventsService } from './orcamento-events.service'
import { OrcamentoSseController } from './orcamento-sse.controller'
import { OrcamentoAiService } from './orcamento-ai.service'
import { OrcamentoAiController } from './orcamento-ai.controller'
import { PesquisaModule } from '../pesquisa/pesquisa.module'
import { ServicoModule } from '../servico/servico.module'
import { ProcessoModule } from '../processo/processo.module'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [
    forwardRef(() => PesquisaModule),
    forwardRef(() => ServicoModule),
    ProcessoModule,
    NotificationModule,
    AuthModule,
  ],
  controllers: [OrcamentoSseController, OrcamentoAiController],
  providers: [OrcamentoService, OrcamentoScheduler, OrcamentoEventsService, OrcamentoAiService],
  exports: [OrcamentoService, OrcamentoEventsService],
})
export class OrcamentoModule {}
