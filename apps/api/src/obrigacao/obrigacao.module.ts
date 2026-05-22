import { Module, forwardRef } from '@nestjs/common'
import { ObrigacaoService } from './obrigacao.service'
import { NotificacaoModule } from '../notificacao/notificacao.module'

@Module({
  imports: [forwardRef(() => NotificacaoModule)],
  providers: [ObrigacaoService],
  exports: [ObrigacaoService],
})
export class ObrigacaoModule {}
