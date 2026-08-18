import { Module } from '@nestjs/common'
import { TabelaRegistroService } from './tabela-registro.service'

@Module({
  providers: [TabelaRegistroService],
  exports: [TabelaRegistroService],
})
export class TabelaRegistroModule {}
