import { Module, forwardRef } from '@nestjs/common'
import { ClienteObrigacaoService } from './cliente-obrigacao.service'
import { NotificacaoModule } from '../notificacao/notificacao.module'

@Module({
  imports: [forwardRef(() => NotificacaoModule)],
  providers: [ClienteObrigacaoService],
  exports: [ClienteObrigacaoService],
})
export class ClienteObrigacaoModule {}
