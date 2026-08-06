import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { FerramentasModule } from '../ferramentas/ferramentas.module'
import { EmailModule } from '../common/email.module'
import { RelatorioTiService } from './relatorio-ti.service'
import { RelatorioTiController } from './relatorio-ti.controller'

// AuthModule pelo controller, que resolve a sessão antes de servir o anexo.
// FerramentasModule pelo HTML→PDF e pelo Juntar, que fazem o consolidado do dia.
@Module({
  imports: [AuthModule, FerramentasModule, EmailModule],
  controllers: [RelatorioTiController],
  providers: [RelatorioTiService],
  exports: [RelatorioTiService],
})
export class RelatorioTiModule {}
