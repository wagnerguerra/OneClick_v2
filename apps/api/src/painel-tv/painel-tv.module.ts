import { Module } from '@nestjs/common'
import { PainelTvService } from './painel-tv.service'
import { CrmModule } from '../crm/crm.module'
import { OrcamentoModule } from '../orcamento/orcamento.module'
import { ContratoModule } from '../contrato/contrato.module'
import { HelpdeskModule } from '../helpdesk/helpdesk.module'

@Module({
  imports: [CrmModule, OrcamentoModule, ContratoModule, HelpdeskModule],
  providers: [PainelTvService],
  exports: [PainelTvService],
})
export class PainelTvModule {}
