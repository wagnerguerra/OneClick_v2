import { Module } from '@nestjs/common'
import { ReformaTributariaService } from './reforma-tributaria.service'

@Module({
  providers: [ReformaTributariaService],
  exports: [ReformaTributariaService],
})
export class ReformaTributariaModule {}
