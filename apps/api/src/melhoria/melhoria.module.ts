import { Module } from '@nestjs/common'
import { MelhoriaService } from './melhoria.service'

@Module({
  providers: [MelhoriaService],
  exports: [MelhoriaService],
})
export class MelhoriaModule {}
