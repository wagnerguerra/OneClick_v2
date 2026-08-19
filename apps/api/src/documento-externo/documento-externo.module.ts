import { Module } from '@nestjs/common'
import { DocumentoExternoService } from './documento-externo.service'

@Module({
  providers: [DocumentoExternoService],
  exports: [DocumentoExternoService],
})
export class DocumentoExternoModule {}
