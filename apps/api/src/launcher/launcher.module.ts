import { Module } from '@nestjs/common'
import { LauncherUpdatesController } from './launcher-updates.controller'

/**
 * Módulo do Launcher — serve artefatos de auto-update via LAN.
 * Sem providers/services próprios (controller faz tudo direto).
 */
@Module({
  controllers: [LauncherUpdatesController],
})
export class LauncherModule {}
