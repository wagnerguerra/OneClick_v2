import { Module } from '@nestjs/common'
import { GoogleBackupService } from './google-backup.service'
import { GoogleBackupScheduler } from './google-backup.scheduler'

@Module({
  providers: [GoogleBackupService, GoogleBackupScheduler],
  exports: [GoogleBackupService],
})
export class GoogleBackupModule {}
