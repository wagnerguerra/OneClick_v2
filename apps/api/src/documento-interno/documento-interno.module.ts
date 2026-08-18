import { Module } from '@nestjs/common'
import { DocumentoInternoService } from './documento-interno.service'

// Sem controller: tudo passa por tRPC. O arquivo de cada revisão sobe pelo
// mesmo /api/upload que os demais módulos usam, e o download sai pela URL
// devolvida por ele.
@Module({
  providers: [DocumentoInternoService],
  exports: [DocumentoInternoService],
})
export class DocumentoInternoModule {}
