import { Module } from '@nestjs/common'
import { CnpjService } from './cnpj.service'

@Module({
  providers: [CnpjService],
  exports: [CnpjService],
})
export class CnpjModule {}
