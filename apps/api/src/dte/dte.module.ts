import { Module } from '@nestjs/common'
import { DteService } from './dte.service'

@Module({
  providers: [DteService],
  exports: [DteService],
})
export class DteModule {}
