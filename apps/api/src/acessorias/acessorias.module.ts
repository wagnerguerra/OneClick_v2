import { Module } from '@nestjs/common'
import { AcessoriasService } from './acessorias.service'
import { DivergenciaAcessoriasService } from './divergencia.service'
import { PainelEntregasService } from './painel-entregas.service'
import { RegrasObrigacaoService } from './regras-obrigacao.service'

@Module({
  providers: [AcessoriasService, DivergenciaAcessoriasService, PainelEntregasService, RegrasObrigacaoService],
  exports: [AcessoriasService, DivergenciaAcessoriasService, PainelEntregasService, RegrasObrigacaoService],
})
export class AcessoriasModule {}
