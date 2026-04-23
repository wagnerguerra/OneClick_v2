import { Module } from '@nestjs/common'
import { CaixaPostalService } from './caixapostal.service'
import { CaixaPostalSchedulerService } from './caixapostal.scheduler'

@Module({
  providers: [CaixaPostalService, CaixaPostalSchedulerService],
  exports: [CaixaPostalService, CaixaPostalSchedulerService],
})
export class CaixaPostalModule {}
