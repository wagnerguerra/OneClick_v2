import { Module } from '@nestjs/common'
import { MinhasObrigacoesService } from './minhas-obrigacoes.service'

@Module({
  providers: [MinhasObrigacoesService],
  exports: [MinhasObrigacoesService],
})
export class MinhasObrigacoesModule {}
