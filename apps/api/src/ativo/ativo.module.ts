import { Module } from '@nestjs/common'
import { AtivoService } from './ativo.service'

@Module({
  providers: [AtivoService],
  exports: [AtivoService],
})
export class AtivoModule {}
