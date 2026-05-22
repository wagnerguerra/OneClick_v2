import { Module } from '@nestjs/common'
import { NfeDistService } from './nfe-dist.service'
import { NfeDistScheduler } from './nfe-dist.scheduler'

/**
 * Módulo NFe Distribuição (SEFAZ Nacional via SOAP cru sobre mTLS).
 *
 * - `NfeDistService` registrado pela classe + ALSO via token `'NfeDistService'`
 *   (useExisting) — o scheduler injeta por string token.
 * - `DanfeService` é @Global no DanfeModule, então não precisa import explícito.
 */
@Module({
  providers: [
    NfeDistService,
    { provide: 'NfeDistService', useExisting: NfeDistService },
    NfeDistScheduler,
  ],
  exports: [NfeDistService, NfeDistScheduler],
})
export class NfeDistModule {}
