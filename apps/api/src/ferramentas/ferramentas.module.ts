import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ContratoModule } from '../contrato/contrato.module'
import { FerramentasController } from './ferramentas.controller'
import { ExtratoEditController } from './extrato-edit.controller'
import { FerramentasService } from './ferramentas.service'
import { WebappGatewayService } from './webapp-gateway.service'
import { HtmlPdfService } from './html-pdf.service'
import { JuntarPdfService } from './juntar-pdf.service'
import { AssinaturaPdfService } from './assinatura-pdf.service'

// Módulo das Ferramentas (integração webapp → OneClick).
// AuthModule p/ o controller resolver a sessão (Better Auth).
@Module({
  // ContratoModule pelo PdfSignService, que ja faz a assinatura PAdES.
  imports: [AuthModule, ContratoModule],
  controllers: [FerramentasController, ExtratoEditController],
  providers: [FerramentasService, WebappGatewayService, HtmlPdfService, JuntarPdfService, AssinaturaPdfService],
  exports: [FerramentasService, HtmlPdfService, JuntarPdfService, AssinaturaPdfService],
})
export class FerramentasModule {}
