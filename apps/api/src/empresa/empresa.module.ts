import { Module } from '@nestjs/common'
import { EmpresaService } from './empresa.service'

@Module({
  providers: [EmpresaService],
  exports: [EmpresaService],
})
export class EmpresaModule {}
