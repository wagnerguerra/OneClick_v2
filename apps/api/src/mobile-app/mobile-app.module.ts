import { Module } from '@nestjs/common'
import { MobileAppController } from './mobile-app.controller'

/**
 * Distribuição do app mobile (Android/iOS) pelo dashboard. Só serve artefatos —
 * o backend do app é a própria API/tRPC.
 */
@Module({
  controllers: [MobileAppController],
})
export class MobileAppModule {}
