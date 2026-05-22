import { Global, Module } from '@nestjs/common'
import { NotificationsEventsService } from './notifications-events.service'
import { NotificationsEventsSseController } from './notifications-events-sse.controller'

@Global()
@Module({
  providers: [NotificationsEventsService],
  controllers: [NotificationsEventsSseController],
  exports: [NotificationsEventsService],
})
export class NotificationsEventsModule {}
