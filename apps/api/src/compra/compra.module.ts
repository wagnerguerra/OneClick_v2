import { Module } from '@nestjs/common'
import { CompraService } from './compra.service'
import { CotacaoService } from './cotacao.service'
import { CotacaoPdfService } from './cotacao-pdf.service'
import { CotacaoController } from './cotacao.controller'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [NotificationModule, AuthModule],
  controllers: [CotacaoController],
  providers: [CompraService, CotacaoService, CotacaoPdfService, EmailService],
  exports: [CompraService, CotacaoService],
})
export class CompraModule {}
