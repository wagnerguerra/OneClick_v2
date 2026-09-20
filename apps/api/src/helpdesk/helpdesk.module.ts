import { Module, forwardRef } from '@nestjs/common'
import { HelpdeskService } from './helpdesk.service'
import { HelpdeskScheduler } from './helpdesk.scheduler'
import { HelpdeskInboundController } from './helpdesk-inbound.controller'
import { HelpdeskAiAgentService } from './helpdesk-ai-agent.service'
import { HelpdeskAiStreamController } from './helpdesk-ai-stream.controller'
import { NotificationModule } from '../notification/notification.module'
import { EmailModule } from '../common/email.module'
import { AuthModule } from '../auth/auth.module'
import { OrcamentoModule } from '../orcamento/orcamento.module'
import { ServicoModule } from '../servico/servico.module'

@Module({
  // `forwardRef` no ServicoModule: ele importa OrcamentoModule e vice-versa
  // (ambos já com forwardRef entre si), e este módulo importa os dois — sem o
  // forwardRef o triângulo estoura na resolução dos módulos, no boot.
  imports: [NotificationModule, EmailModule, AuthModule, OrcamentoModule, forwardRef(() => ServicoModule)],
  controllers: [HelpdeskInboundController, HelpdeskAiStreamController],
  providers: [HelpdeskService, HelpdeskScheduler, HelpdeskAiAgentService],
  exports: [HelpdeskService, HelpdeskAiAgentService],
})
export class HelpdeskModule {}
