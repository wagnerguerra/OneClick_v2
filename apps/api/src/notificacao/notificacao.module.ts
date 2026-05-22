import { Module, forwardRef } from '@nestjs/common'
import { EmailService } from '../common/email.service'
import { NotificacaoService } from './notificacao.service'
import { RecorrenciaScheduler } from './recorrencia.scheduler'
import { PrazoProximoScheduler } from './prazo-proximo.scheduler'
import { ServicoModule } from '../servico/servico.module'

@Module({
  imports: [forwardRef(() => ServicoModule)],
  providers: [EmailService, NotificacaoService, RecorrenciaScheduler, PrazoProximoScheduler],
  exports: [NotificacaoService, RecorrenciaScheduler],
})
export class NotificacaoModule {}
