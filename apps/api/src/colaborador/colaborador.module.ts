import { Module } from '@nestjs/common'
import { ColaboradorService } from './colaborador.service'

@Module({
  providers: [ColaboradorService],
  exports: [ColaboradorService],
})
export class ColaboradorModule {}
