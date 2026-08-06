import { Module } from '@nestjs/common'
import { ManifestacaoService } from './manifestacao.service'

// Sem controller: por enquanto tudo passa por tRPC. O portal público da fase 5
// trará um controller próprio, com as proteções que uma rota aberta exige.
@Module({
  providers: [ManifestacaoService],
  exports: [ManifestacaoService],
})
export class ManifestacaoModule {}
