import { Module } from '@nestjs/common'
import { CompraService } from './compra.service'
import { CotacaoService } from './cotacao.service'
import { CotacaoPdfService } from './cotacao-pdf.service'
import { CompraPdfService } from './compra-pdf.service'
import { CotacaoController } from './cotacao.controller'
import { CompraController } from './compra.controller'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [NotificationModule, AuthModule],
  controllers: [CotacaoController, CompraController],
  providers: [CompraService, CotacaoService, CotacaoPdfService, CompraPdfService, EmailService],
  exports: [CompraService, CotacaoService],
})
export class CompraModule {}
