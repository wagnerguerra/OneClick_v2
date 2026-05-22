import { Module } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { ClienteEnriquecimentoService } from './cliente-enriquecimento.service'
import { SincronizarResponsaveisService } from './sincronizar-responsaveis.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { CnpjModule } from '../cnpj/cnpj.module'

@Module({
  imports: [CnpjModule],
  providers: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService],
  exports: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService],
})
export class ClienteModule {}
