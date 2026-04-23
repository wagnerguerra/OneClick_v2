import { Module, forwardRef } from '@nestjs/common'
import { BiService } from './bi.service'
import { BiCalculosService } from './bi-calculos.service'
import { BiBalanceteService } from './bi-balancete.service'
import { ClienteModule } from '../cliente/cliente.module'

@Module({
  imports: [forwardRef(() => ClienteModule)],
  providers: [BiService, BiCalculosService, BiBalanceteService],
  exports: [BiService, BiCalculosService, BiBalanceteService],
})
export class BiModule {}
