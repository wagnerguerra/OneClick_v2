import { Module } from '@nestjs/common'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  providers: [AgendaService, EmailService, AgendaGoogleService],
  exports: [AgendaService, AgendaGoogleService],
})
export class AgendaModule {}
