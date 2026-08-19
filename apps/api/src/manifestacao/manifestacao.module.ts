import { Module } from '@nestjs/common'
import { ManifestacaoService } from './manifestacao.service'
import { ManifestacaoPublicController } from './manifestacao-public.controller'

// O portal público (fase 5) vive num controller próprio, fora do tRPC, com
// as proteções que uma rota aberta exige (limite por IP, campo-isca).
@Module({
  controllers: [ManifestacaoPublicController],
  providers: [ManifestacaoService],
  exports: [ManifestacaoService],
})
export class ManifestacaoModule {}
