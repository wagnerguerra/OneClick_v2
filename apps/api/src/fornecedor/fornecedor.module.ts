import { Module } from '@nestjs/common'
import { FornecedorService } from './fornecedor.service'

@Module({
  providers: [FornecedorService],
  exports: [FornecedorService],
})
export class FornecedorModule {}
