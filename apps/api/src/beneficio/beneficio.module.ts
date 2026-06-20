import { Module } from '@nestjs/common'
import { BeneficioService } from './beneficio.service'

@Module({
  providers: [BeneficioService],
  exports: [BeneficioService],
})
export class BeneficioModule {}
