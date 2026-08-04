import { Module } from '@nestjs/common'
import { BeneficioFiscalService } from './beneficio-fiscal.service'
import { BeneficioFiscalSchedulerService } from './beneficio-fiscal.scheduler'
import { OrcamentoModule } from '../orcamento/orcamento.module'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [OrcamentoModule, NotificationModule],
  providers: [BeneficioFiscalService, EmailService, BeneficioFiscalSchedulerService],
  exports: [BeneficioFiscalService],
})
export class BeneficioFiscalModule {}
