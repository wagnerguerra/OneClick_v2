import { Module } from '@nestjs/common'
import { CompraService } from './compra.service'

@Module({
  providers: [CompraService],
  exports: [CompraService],
})
export class CompraModule {}
