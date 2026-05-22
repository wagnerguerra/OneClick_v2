import { Module } from '@nestjs/common'
import { DashboardCalendarioService } from './dashboard-calendario.service'

@Module({
  providers: [DashboardCalendarioService],
  exports: [DashboardCalendarioService],
})
export class DashboardCalendarioModule {}
