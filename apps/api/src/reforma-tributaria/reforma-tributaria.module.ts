import { Module } from '@nestjs/common'
import { ClienteModule } from '../cliente/cliente.module'
import { ReformaTributariaService } from './reforma-tributaria.service'
import { ReformaAiService } from './reforma-ai.service'

@Module({
  imports: [ClienteModule],
  providers: [ReformaTributariaService, ReformaAiService],
  exports: [ReformaTributariaService],
})
export class ReformaTributariaModule {}
