import { Module, forwardRef } from '@nestjs/common'
import { OrcamentoService } from './orcamento.service'
import { OrcamentoScheduler } from './orcamento.scheduler'
import { OrcamentoEventsService } from './orcamento-events.service'
import { OrcamentoSseController } from './orcamento-sse.controller'
import { PesquisaModule } from '../pesquisa/pesquisa.module'
import { ServicoModule } from '../servico/servico.module'
import { ProcessoModule } from '../processo/processo.module'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [
    forwardRef(() => PesquisaModule),
    forwardRef(() => ServicoModule),
    ProcessoModule,
    NotificationModule,
  ],
  controllers: [OrcamentoSseController],
  providers: [OrcamentoService, OrcamentoScheduler, OrcamentoEventsService],
  exports: [OrcamentoService, OrcamentoEventsService],
})
export class OrcamentoModule {}
