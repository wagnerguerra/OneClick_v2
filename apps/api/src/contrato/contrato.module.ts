import { Module } from '@nestjs/common'
import { ContratoService } from './contrato.service'
import { PdfSignService } from './pdf-sign.service'
import { TsaSerproService } from './tsa-serpro.service'

@Module({
  providers: [ContratoService, PdfSignService, TsaSerproService],
  exports: [ContratoService, PdfSignService, TsaSerproService],
})
export class ContratoModule {}
