import { Module } from '@nestjs/common'
import { SitfisService } from './sitfis.service'
import { SitfisController } from './sitfis.controller'

@Module({
  controllers: [SitfisController],
  providers: [SitfisService],
  exports: [SitfisService],
})
export class SitfisModule {}
