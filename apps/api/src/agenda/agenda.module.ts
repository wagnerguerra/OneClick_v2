import { Module } from '@nestjs/common'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'
import { AgendaConfigService } from './agenda-config.service'
import { AgendaSalaService } from './agenda-sala.service'
import { AgendaDisparoService } from './agenda-disparo.service'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  providers: [AgendaService, EmailService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService],
  exports: [AgendaService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService],
})
export class AgendaModule {}
