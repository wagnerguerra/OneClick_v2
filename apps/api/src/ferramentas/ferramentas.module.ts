import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FerramentasController } from './ferramentas.controller'
import { ExtratoEditController } from './extrato-edit.controller'
import { FerramentasService } from './ferramentas.service'
import { WebappGatewayService } from './webapp-gateway.service'

// Módulo das Ferramentas (integração webapp → OneClick).
// AuthModule p/ o controller resolver a sessão (Better Auth).
@Module({
  imports: [AuthModule],
  controllers: [FerramentasController, ExtratoEditController],
  providers: [FerramentasService, WebappGatewayService],
  exports: [FerramentasService],
})
export class FerramentasModule {}
