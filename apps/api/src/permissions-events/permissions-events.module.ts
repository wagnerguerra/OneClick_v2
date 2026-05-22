import { Global, Module } from '@nestjs/common'
import { PermissionsEventsService } from './permissions-events.service'
import { PermissionsEventsSseController } from './permissions-events-sse.controller'

/**
 * Global pra evitar import explícito em todos os módulos que precisam emitir
 * eventos (UserModule + qualquer outro que altere permissões no futuro).
 */
@Global()
@Module({
  providers: [PermissionsEventsService],
  controllers: [PermissionsEventsSseController],
  exports: [PermissionsEventsService],
})
export class PermissionsEventsModule {}
