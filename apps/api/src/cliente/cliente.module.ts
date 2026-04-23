import { Module } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'
import { IntegrationService } from './integration.service'
import { CnpjModule } from '../cnpj/cnpj.module'

@Module({
  imports: [CnpjModule],
  providers: [ClienteService, LegacyImportService, SciService, IntegrationService],
  exports: [ClienteService, LegacyImportService, SciService, IntegrationService],
})
export class ClienteModule {}
