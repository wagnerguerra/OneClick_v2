import { Module } from '@nestjs/common'
import { CertificadoDigitalService } from './certificado-digital.service'
import { CertificadoDigitalScheduler } from './certificado-digital.scheduler'
import { LegacyImportCertService } from './legacy-import-cert.service'
import { BulkImportCertService } from './bulk-import-cert.service'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [CertificadoDigitalService, CertificadoDigitalScheduler, LegacyImportCertService, BulkImportCertService],
  exports: [CertificadoDigitalService, LegacyImportCertService, BulkImportCertService],
})
export class CertificadoDigitalModule {}
