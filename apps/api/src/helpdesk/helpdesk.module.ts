import { Module } from '@nestjs/common'
import { HelpdeskService } from './helpdesk.service'
import { HelpdeskScheduler } from './helpdesk.scheduler'
import { HelpdeskInboundController } from './helpdesk-inbound.controller'
import { HelpdeskAiAgentService } from './helpdesk-ai-agent.service'
import { HelpdeskAiStreamController } from './helpdesk-ai-stream.controller'
import { NotificationModule } from '../notification/notification.module'
import { EmailModule } from '../common/email.module'
import { AuthModule } from '../auth/auth.module'
import { OrcamentoModule } from '../orcamento/orcamento.module'

@Module({
  imports: [NotificationModule, EmailModule, AuthModule, OrcamentoModule],
  controllers: [HelpdeskInboundController, HelpdeskAiStreamController],
  providers: [HelpdeskService, HelpdeskScheduler, HelpdeskAiAgentService],
  exports: [HelpdeskService, HelpdeskAiAgentService],
})
export class HelpdeskModule {}
