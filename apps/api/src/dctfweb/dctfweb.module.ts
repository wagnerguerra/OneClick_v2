import { Module } from '@nestjs/common'
import { DctfwebService } from './dctfweb.service'
import { SitfisModule } from '../sitfis/sitfis.module'

@Module({
  imports: [SitfisModule],
  providers: [DctfwebService],
  exports: [DctfwebService],
})
export class DctfwebModule {}
