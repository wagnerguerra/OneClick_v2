import { Module } from '@nestjs/common'
import { LeadService } from './lead.service'
import { LeadController } from './lead.controller'
import { CnpjModule } from '../cnpj/cnpj.module'
import { CrmModule } from '../crm/crm.module'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [CnpjModule, CrmModule, NotificationModule],
  controllers: [LeadController],
  providers: [LeadService],
  exports: [LeadService],
})
export class LeadModule {}
