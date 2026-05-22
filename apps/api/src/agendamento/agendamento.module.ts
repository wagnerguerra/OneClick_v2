import { Module } from '@nestjs/common'
import { AgendamentoService } from './agendamento.service'

@Module({
  providers: [AgendamentoService],
  exports: [AgendamentoService],
})
export class AgendamentoModule {}
