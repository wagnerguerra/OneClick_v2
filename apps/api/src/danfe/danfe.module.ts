import { Module, Global } from '@nestjs/common'
import { DanfeService } from './danfe.service'
import { DanfeLoteService } from './danfe-lote.service'
import { DanfeLoteEventsService } from './danfe-lote-events.service'
import { DanfeController } from './danfe.controller'
import { AuthModule } from '../auth/auth.module'

@Global()
@Module({
  imports: [AuthModule],
  providers: [DanfeService, DanfeLoteService, DanfeLoteEventsService],
  controllers: [DanfeController],
  exports: [DanfeService, DanfeLoteService, DanfeLoteEventsService],
})
export class DanfeModule {}
