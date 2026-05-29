import { Module } from '@nestjs/common'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'
import { AgendaConfigService } from './agenda-config.service'
import { AgendaSalaService } from './agenda-sala.service'
import { AgendaDisparoService } from './agenda-disparo.service'
import { AgendaLembreteService } from './agenda-lembrete.service'
import { AgendaLembreteEventsService } from './agenda-lembrete-events.service'
import { AgendaLembreteController } from './agenda-lembrete.controller'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [NotificationModule, AuthModule],
  controllers: [AgendaLembreteController],
  providers: [AgendaService, EmailService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService, AgendaLembreteService, AgendaLembreteEventsService],
  exports: [AgendaService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService, AgendaLembreteService],
})
export class AgendaModule {}
