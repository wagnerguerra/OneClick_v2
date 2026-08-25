import { Module } from '@nestjs/common'
import { ContatoService } from './contato.service'

@Module({
  providers: [ContatoService],
  exports: [ContatoService],
})
export class ContatoModule {}
