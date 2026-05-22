import { Module } from '@nestjs/common'
import { DriveSyncService } from './drive-sync.service'
import { DriveSyncScheduler } from './drive-sync.scheduler'
import { DriveSyncController } from './drive-sync.controller'
import { AuthModule } from '../auth/auth.module'

/**
 * Módulo de sincronização de pastas do Google Drive + pasta local (via Launcher).
 * Depende de DanfeService (registrado como @Global no DanfeModule) pra
 * reaproveitar o pipeline de processamento de XML → DANFE.
 */
@Module({
  imports: [AuthModule],
  providers: [DriveSyncService, DriveSyncScheduler],
  controllers: [DriveSyncController],
  exports: [DriveSyncService, DriveSyncScheduler],
})
export class DriveSyncModule {}
