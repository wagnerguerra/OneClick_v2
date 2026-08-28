import { Module, forwardRef } from '@nestjs/common'
import { CnpjModule } from '../../cnpj/cnpj.module'
import { AuthModule } from '../../auth/auth.module'
import { ProvedorOpenCnpj } from './provedor-opencnpj'
import { ProvedorBrasilApi } from './provedor-brasilapi'
import { ProvedorSerpro } from './provedor-serpro'
import { CadeiaProvedoresService } from './cadeia-provedores.service'
import { DossieService } from './dossie.service'
import { DossieBackfillService } from './dossie-backfill.service'
import { DossieSchedulerService } from './dossie.scheduler'
import { DossieStreamController } from './dossie-stream.controller'

/**
 * Dossiê do Cliente. Módulo próprio para não engordar o `ClienteModule`, que já
 * carrega uma dúzia de services.
 */
@Module({
  imports: [forwardRef(() => CnpjModule), AuthModule],
  controllers: [DossieStreamController],
  providers: [
    ProvedorOpenCnpj,
    ProvedorBrasilApi,
    ProvedorSerpro,
    CadeiaProvedoresService,
    DossieService,
    DossieBackfillService,
    DossieSchedulerService,
  ],
  exports: [DossieService, DossieBackfillService, DossieSchedulerService],
})
export class DossieModule {}
