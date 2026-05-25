import { Module, forwardRef } from '@nestjs/common'
import { BiService } from './bi.service'
import { BiCalculosService } from './bi-calculos.service'
import { BiBalanceteService } from './bi-balancete.service'
import { BiSyncController } from './bi-sync.controller'
import { BiSyncEventsService } from './bi-sync-events.service'
import { ClienteModule } from '../cliente/cliente.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [forwardRef(() => ClienteModule), AuthModule],
  controllers: [BiSyncController],
  providers: [BiService, BiCalculosService, BiBalanceteService, BiSyncEventsService],
  exports: [BiService, BiCalculosService, BiBalanceteService, BiSyncEventsService],
})
export class BiModule {}
