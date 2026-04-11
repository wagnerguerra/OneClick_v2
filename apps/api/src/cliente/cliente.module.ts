import { Module } from '@nestjs/common'
import { ClienteService } from './cliente.service'
import { LegacyImportService } from './legacy-import.service'
import { SciService } from './sci.service'

@Module({
  providers: [ClienteService, LegacyImportService, SciService],
  exports: [ClienteService, LegacyImportService, SciService],
})
export class ClienteModule {}
