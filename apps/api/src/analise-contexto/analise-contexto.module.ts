import { Module } from '@nestjs/common'
import { AnaliseContextoService } from './analise-contexto.service'

@Module({
  providers: [AnaliseContextoService],
  exports: [AnaliseContextoService],
})
export class AnaliseContextoModule {}
