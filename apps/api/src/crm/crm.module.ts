import { Module, forwardRef } from '@nestjs/common'
import { CrmService } from './crm.service'
import { CrmEventsService } from './crm-events.service'
import { CrmSseController } from './crm-sse.controller'
import { ImportComercialService } from './import-comercial.service'
import { OrcamentoModule } from '../orcamento/orcamento.module'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [forwardRef(() => OrcamentoModule), NotificationModule],
  controllers: [CrmSseController],
  providers: [CrmService, CrmEventsService, ImportComercialService],
  exports: [CrmService, CrmEventsService, ImportComercialService],
})
export class CrmModule {}
