import { Module } from '@nestjs/common'
import { ClienteModule } from '../cliente/cliente.module'
import { ReformaTributariaService } from './reforma-tributaria.service'

@Module({
  imports: [ClienteModule],
  providers: [ReformaTributariaService],
  exports: [ReformaTributariaService],
})
export class ReformaTributariaModule {}
