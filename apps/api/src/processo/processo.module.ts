import { Module } from '@nestjs/common'
import { ProcessoService } from './processo.service'

@Module({
  providers: [ProcessoService],
  exports: [ProcessoService],
})
export class ProcessoModule {}
