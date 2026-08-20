import { Module } from '@nestjs/common'
import { ControleFeriasService } from './controle-ferias.service'

@Module({
  providers: [ControleFeriasService],
  exports: [ControleFeriasService],
})
export class ControleFeriasModule {}
