import { Module } from '@nestjs/common'
import { FolhaBiService } from './folha-bi.service'
import { FolhaBiSyncController } from './folha-bi-sync.controller'

@Module({
  controllers: [FolhaBiSyncController],
  providers: [FolhaBiService],
  exports: [FolhaBiService],
})
export class FolhaBiModule {}
