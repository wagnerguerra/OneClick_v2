import { Module } from '@nestjs/common'
import { ControleFeriasService } from './controle-ferias.service'
import { ControleFeriasReportsService } from './controle-ferias-reports.service'
import { ControleFeriasSchedulerService } from './controle-ferias.scheduler'

@Module({
  providers: [ControleFeriasService, ControleFeriasReportsService, ControleFeriasSchedulerService],
  exports: [ControleFeriasService, ControleFeriasReportsService],
})
export class ControleFeriasModule {}
