import { Module } from '@nestjs/common'
import { PesquisaService } from './pesquisa.service'

@Module({
  providers: [PesquisaService],
  exports: [PesquisaService],
})
export class PesquisaModule {}

