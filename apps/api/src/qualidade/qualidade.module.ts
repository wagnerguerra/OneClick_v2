import { Module } from '@nestjs/common'
import { QualidadeService } from './qualidade.service'

@Module({
  providers: [QualidadeService],
  exports: [QualidadeService],
})
export class QualidadeModule {}
