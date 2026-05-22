import { Module } from '@nestjs/common'
import { HelpdeskService } from './helpdesk.service'
import { HelpdeskScheduler } from './helpdesk.scheduler'
import { HelpdeskInboundController } from './helpdesk-inbound.controller'
import { NotificationModule } from '../notification/notification.module'
import { EmailModule } from '../common/email.module'

@Module({
  imports: [NotificationModule, EmailModule],
  controllers: [HelpdeskInboundController],
  providers: [HelpdeskService, HelpdeskScheduler],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
