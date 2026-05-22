import { Module, forwardRef } from '@nestjs/common'
import { GrupoObrigacaoService } from './grupo-obrigacao.service'
import { NotificacaoModule } from '../notificacao/notificacao.module'

@Module({
  imports: [forwardRef(() => NotificacaoModule)],
  providers: [GrupoObrigacaoService],
  exports: [GrupoObrigacaoService],
})
export class GrupoObrigacaoModule {}
