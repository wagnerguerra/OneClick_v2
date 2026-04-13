import { Module } from '@nestjs/common'
import { SitfisService } from './sitfis.service'

@Module({
  providers: [SitfisService],
  exports: [SitfisService],
})
export class SitfisModule {}
