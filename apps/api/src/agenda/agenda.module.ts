import { Module } from '@nestjs/common'
import { AgendaService } from './agenda.service'
import { AgendaGoogleService } from './agenda-google.service'
import { AgendaConfigService } from './agenda-config.service'
import { AgendaSalaService } from './agenda-sala.service'
import { AgendaDisparoService } from './agenda-disparo.service'
import { AgendaEmailTemplateService } from './agenda-email-template.service'
import { AgendaLembreteService } from './agenda-lembrete.service'
import { AgendaTarefaService } from './agenda-tarefa.service'
import { AgendaLembreteEventsService } from './agenda-lembrete-events.service'
import { AgendaLembreteController } from './agenda-lembrete.controller'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'
import { PushModule } from '../push/push.module'

@Module({
  imports: [NotificationModule, AuthModule, PushModule],
  controllers: [AgendaLembreteController],
  providers: [AgendaService, EmailService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService, AgendaEmailTemplateService, AgendaLembreteService, AgendaLembreteEventsService, AgendaTarefaService],
  exports: [AgendaService, AgendaGoogleService, AgendaConfigService, AgendaSalaService, AgendaDisparoService, AgendaLembreteService, AgendaTarefaService],
})
export class AgendaModule {}
