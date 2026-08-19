import { Module } from '@nestjs/common'
import { NaoConformidadeService } from './nao-conformidade.service'

@Module({
  providers: [NaoConformidadeService],
  exports: [NaoConformidadeService],
})
export class NaoConformidadeModule {}
