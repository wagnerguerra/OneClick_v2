import { Module } from '@nestjs/common'
import { FeriadoService } from './feriado.service'

@Module({
  providers: [FeriadoService],
  exports: [FeriadoService],
})
export class FeriadoModule {}
