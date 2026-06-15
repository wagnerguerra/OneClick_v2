import { Module } from '@nestjs/common'
import { BeneficioFiscalService } from './beneficio-fiscal.service'
import { OrcamentoModule } from '../orcamento/orcamento.module'

@Module({
  imports: [OrcamentoModule],
  providers: [BeneficioFiscalService],
  exports: [BeneficioFiscalService],
})
export class BeneficioFiscalModule {}
