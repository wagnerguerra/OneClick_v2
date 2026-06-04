import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { AuthDesktopController } from './auth-desktop.controller'

@Module({
  providers: [AuthService],
  // IMPORTANTE: AuthDesktopController vem ANTES do AuthController.
  // O catch-all `@All('*path')` do AuthController captura QUALQUER rota
  // sob /api/auth/* — registrar antes garante que /api/auth/desktop-*
  // resolve nos handlers específicos primeiro.
  controllers: [AuthDesktopController, AuthController],
  exports: [AuthService],
})
export class AuthModule {}
