import { Module } from '@nestjs/common'
import { AcessoriasService } from './acessorias.service'
import { DivergenciaAcessoriasService } from './divergencia.service'
import { PainelEntregasService } from './painel-entregas.service'

@Module({
  providers: [AcessoriasService, DivergenciaAcessoriasService, PainelEntregasService],
  exports: [AcessoriasService, DivergenciaAcessoriasService, PainelEntregasService],
})
export class AcessoriasModule {}
