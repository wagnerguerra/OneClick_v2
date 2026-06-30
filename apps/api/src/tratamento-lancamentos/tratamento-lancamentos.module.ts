import { Module } from '@nestjs/common'
import { TratamentoLancamentosService } from './tratamento-lancamentos.service'

@Module({
  providers: [TratamentoLancamentosService],
  exports: [TratamentoLancamentosService],
})
export class TratamentoLancamentosModule {}
