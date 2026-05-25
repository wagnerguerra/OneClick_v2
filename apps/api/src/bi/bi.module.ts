import { Module, forwardRef } from '@nestjs/common'
import { BiService } from './bi.service'
import { BiCalculosService } from './bi-calculos.service'
import { BiBalanceteService } from './bi-balancete.service'
import { BiSyncController } from './bi-sync.controller'
import { ClienteModule } from '../cliente/cliente.module'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [forwardRef(() => ClienteModule), AuthModule],
  controllers: [BiSyncController],
  providers: [BiService, BiCalculosService, BiBalanceteService],
  exports: [BiService, BiCalculosService, BiBalanceteService],
})
export class BiModule {}
