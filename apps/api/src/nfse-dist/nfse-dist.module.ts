import { Module } from '@nestjs/common'
import { NfseDistService } from './nfse-dist.service'
import { NfseDistScheduler } from './nfse-dist.scheduler'
import { NfseDistController } from './nfse-dist.controller'

/**
 * Módulo NFS-e Distribuição (Emissor Nacional / ADN).
 *
 * - `NfseDistService` registrado pela classe + ALSO via token `'NfseDistService'`
 *   (useExisting) — o scheduler injeta por string token.
 * - Reaproveita `DanfeStorage` instanciado dentro do service (mesma config S3).
 */
@Module({
  providers: [
    NfseDistService,
    { provide: 'NfseDistService', useExisting: NfseDistService },
    NfseDistScheduler,
  ],
  controllers: [NfseDistController],
  exports: [NfseDistService, NfseDistScheduler],
})
export class NfseDistModule {}
