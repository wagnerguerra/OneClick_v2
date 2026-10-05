import { Module } from '@nestjs/common'
import { ManifestacaoService } from './manifestacao.service'
import { ManifestacaoPublicController } from './manifestacao-public.controller'
import { ManifestacaoNotificacaoService } from './manifestacao-notificacao.service'
import { NotificationModule } from '../notification/notification.module'
import { EmailModule } from '../common/email.module'

// O portal público (fase 5) vive num controller próprio, fora do tRPC, com
// as proteções que uma rota aberta exige (limite por IP, campo-isca).
@Module({
  // Avisos dos eventos: sino (NotificationModule) e e-mail (EmailModule).
  imports: [NotificationModule, EmailModule],
  controllers: [ManifestacaoPublicController],
  providers: [ManifestacaoService, ManifestacaoNotificacaoService],
  exports: [ManifestacaoService, ManifestacaoNotificacaoService],
})
export class ManifestacaoModule {}
