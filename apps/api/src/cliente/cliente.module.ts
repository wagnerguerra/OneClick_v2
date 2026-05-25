import { Module, forwardRef } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { ClienteEnriquecimentoService } from './cliente-enriquecimento.service'
import { SincronizarResponsaveisService } from './sincronizar-responsaveis.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { CnpjModule } from '../cnpj/cnpj.module'
import { BiModule } from '../bi/bi.module'

@Module({
  // BiModule via forwardRef — Cliente emite BiSyncEvents quando idSistema muda
  // (SSE pro Launcher). Bi importa Cliente também → circular resolved por forwardRef.
  imports: [CnpjModule, forwardRef(() => BiModule)],
  providers: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService],
  exports: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService],
})
export class ClienteModule {}
