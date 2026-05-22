import { Module } from '@nestjs/common'
import { AcessoriasService } from './acessorias.service'

@Module({
  providers: [AcessoriasService],
  exports: [AcessoriasService],
})
export class AcessoriasModule {}
