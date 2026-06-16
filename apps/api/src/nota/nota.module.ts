import { Module } from '@nestjs/common'
import { NotaService } from './nota.service'

@Module({
  providers: [NotaService],
  exports: [NotaService],
})
export class NotaModule {}
