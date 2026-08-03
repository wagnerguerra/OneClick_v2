import { Module } from '@nestjs/common'
import { AcessoriasService } from './acessorias.service'
import { DivergenciaAcessoriasService } from './divergencia.service'
import { PainelEntregasService } from './painel-entregas.service'
import { RegrasObrigacaoService } from './regras-obrigacao.service'
import { VinculosAcessoriasService } from './vinculos.service'
import { IndicadoresAcessoriasService } from './indicadores.service'

const SERVICOS = [
  AcessoriasService,
  DivergenciaAcessoriasService,
  PainelEntregasService,
  RegrasObrigacaoService,
  VinculosAcessoriasService,
  IndicadoresAcessoriasService,
]

@Module({ providers: SERVICOS, exports: SERVICOS })
export class AcessoriasModule {}
