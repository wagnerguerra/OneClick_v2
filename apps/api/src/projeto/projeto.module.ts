import { Module } from '@nestjs/common'
import { ProjetoService } from './projeto.service'

@Module({
  providers: [ProjetoService],
  exports: [ProjetoService],
})
export class ProjetoModule {}
