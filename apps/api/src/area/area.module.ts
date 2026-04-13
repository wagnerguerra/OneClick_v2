import { Module } from '@nestjs/common'
import { AreaService } from './area.service'

@Module({
  providers: [AreaService],
  exports: [AreaService],
})
export class AreaModule {}
