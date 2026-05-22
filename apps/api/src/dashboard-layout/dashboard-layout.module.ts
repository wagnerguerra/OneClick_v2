import { Module } from '@nestjs/common'
import { DashboardLayoutService } from './dashboard-layout.service'
import { DashboardLayoutEventsService } from './dashboard-layout-events.service'
import { DashboardLayoutSseController } from './dashboard-layout-sse.controller'

@Module({
  providers: [DashboardLayoutService, DashboardLayoutEventsService],
  controllers: [DashboardLayoutSseController],
  exports: [DashboardLayoutService, DashboardLayoutEventsService],
})
export class DashboardLayoutModule {}
