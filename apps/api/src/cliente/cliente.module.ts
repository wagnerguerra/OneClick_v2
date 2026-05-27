import { Module, forwardRef } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { ClienteEnriquecimentoService } from './cliente-enriquecimento.service'
import { SincronizarResponsaveisService } from './sincronizar-responsaveis.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { ContratoSyncService } from './contrato-sync.service'
import { ContratoSyncController } from './contrato-sync.controller'
import { AuthModule } from '../auth/auth.module'
import { CnpjModule } from '../cnpj/cnpj.module'
import { BiModule } from '../bi/bi.module'

@Module({
  // BiModule via forwardRef — Cliente emite BiSyncEvents quando idSistema muda
  // (SSE pro Launcher). Bi importa Cliente também → circular resolved por forwardRef.
  imports: [CnpjModule, forwardRef(() => BiModule), AuthModule],
  controllers: [ContratoSyncController],
  providers: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService, ContratoSyncService],
  exports: [ClienteService, ClienteEnriquecimentoService, SincronizarResponsaveisService, LegacyImportService, SciService, IntegrationService, ImportOneclickService, ContratoSyncService],
})
export class ClienteModule {}
