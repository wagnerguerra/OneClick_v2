import { Module } from '@nestjs/common'
import { FolhaService } from './folha.service'
import { FolhaParserService } from './folha-parser.service'

@Module({
  providers: [FolhaService, FolhaParserService],
  exports: [FolhaService, FolhaParserService],
})
export class FolhaModule {}
