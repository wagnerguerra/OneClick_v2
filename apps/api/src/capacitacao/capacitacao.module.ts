import { Module } from '@nestjs/common'
import { CapacitacaoService } from './capacitacao.service'

// Sem controller: tudo por tRPC. Anexos sobem pelo /api/upload padrao.
@Module({
  providers: [CapacitacaoService],
  exports: [CapacitacaoService],
})
export class CapacitacaoModule {}
