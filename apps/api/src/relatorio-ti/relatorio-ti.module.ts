import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RelatorioTiService } from './relatorio-ti.service'
import { RelatorioTiController } from './relatorio-ti.controller'

// AuthModule pelo controller, que resolve a sessão antes de servir o anexo.
@Module({
  imports: [AuthModule],
  controllers: [RelatorioTiController],
  providers: [RelatorioTiService],
  exports: [RelatorioTiService],
})
export class RelatorioTiModule {}
