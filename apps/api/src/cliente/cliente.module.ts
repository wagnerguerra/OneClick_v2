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
import { ClienteRelatorioService } from './relatorio/relatorio.service'
import { ClienteRelatorioController } from './relatorio/relatorio.controller'
import { ContratoSyncController } from './contrato-sync.controller'
import { AuthModule } from '../auth/auth.module'
import { CnpjModule } from '../cnpj/cnpj.module'
import { BiModule } from '../bi/bi.module'
import { ServicoModule } from '../servico/servico.module'
import { InativacaoProgramadaScheduler } from './inativacao-programada.scheduler'

@Module({
  // BiModule via forwardRef — Cliente emite BiSyncEvents quando idSistema muda
  // (SSE pro Launcher). Bi importa Cliente também → circular resolved por forwardRef.
  // ServicoModule: a inativação agendada precisa avançar o fluxo de offboarding
  // no dia da saída. forwardRef porque o grafo de serviços é um hub — hoje não
  // há ciclo, mas basta alguém importar Cliente lá dentro para haver.
  imports: [CnpjModule, forwardRef(() => BiModule), AuthModule, forwardRef(() => ServicoModule)],
  controllers: [ContratoSyncController, ClienteRelatorioController],
  providers: [
    InativacaoProgramadaScheduler,ClienteService, ClienteEnriquecimentoService, ClienteCapaService, ClienteLogoService, SincronizarResponsaveisService, LegacyImportService, SciService, OmieService, IntegrationService, ImportOneclickService, ContratoSyncService, DuplicidadeService, MesclagemService, ClienteRelatorioService],
  exports: [ClienteService, ClienteEnriquecimentoService, ClienteCapaService, ClienteLogoService, SincronizarResponsaveisService, LegacyImportService, SciService, OmieService, IntegrationService, ImportOneclickService, ContratoSyncService, DuplicidadeService, MesclagemService, ClienteRelatorioService],
})
export class ClienteModule {}
