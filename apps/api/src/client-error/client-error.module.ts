import { Module, Global } from '@nestjs/common'
import { ClientErrorService } from './client-error.service'
import { ClientErrorEventsService } from './client-error-events.service'
import { ClientErrorSseController } from './client-error-sse.controller'

@Global()
@Module({
  providers: [ClientErrorService, ClientErrorEventsService],
  controllers: [ClientErrorSseController],
  exports: [ClientErrorService, ClientErrorEventsService],
})
export class ClientErrorModule {}
