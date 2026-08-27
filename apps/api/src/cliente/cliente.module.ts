import { Module, forwardRef } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { ClienteEnriquecimentoService } from './cliente-enriquecimento.service'
import { ClienteCapaService } from './cliente-capa.service'
import { ClienteLogoService } from './cliente-logo.service'
import { SincronizarResponsaveisService } from './sincronizar-responsaveis.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { OmieService } from './omie.service'
import { IntegrationService } from './integration.service'
import { ImportOneclickService } from './import-oneclick.service'
import { ContratoSyncService } from './contrato-sync.service'
import { DuplicidadeService } from './duplicidade.service'
import { MesclagemService } from './mesclagem.service'
import { ContratoSyncController } from './contrato-sync.controller'
import { AuthModule } from '../auth/auth.module'
import { CnpjModule } from '../cnpj/cnpj.module'
import { BiModule } from '../bi/bi.module'

@Module({
  // BiModule via forwardRef — Cliente emite BiSyncEvents quando idSistema muda
  // (SSE pro Launcher). Bi importa Cliente também → circular resolved por forwardRef.
  imports: [CnpjModule, forwardRef(() => BiModule), AuthModule],
  controllers: [ContratoSyncController],
  providers: [ClienteService, ClienteEnriquecimentoService, ClienteCapaService, ClienteLogoService, SincronizarResponsaveisService, LegacyImportService, SciService, OmieService, IntegrationService, ImportOneclickService, ContratoSyncService, DuplicidadeService, MesclagemService],
  exports: [ClienteService, ClienteEnriquecimentoService, ClienteCapaService, ClienteLogoService, SincronizarResponsaveisService, LegacyImportService, SciService, OmieService, IntegrationService, ImportOneclickService, ContratoSyncService, DuplicidadeService, MesclagemService],
})
export class ClienteModule {}
