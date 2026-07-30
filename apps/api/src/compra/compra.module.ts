import { Module } from '@nestjs/common'
import { CompraService } from './compra.service'
import { EmailService } from '../common/email.service'
import { NotificationModule } from '../notification/notification.module'

@Module({
  imports: [NotificationModule],
  providers: [CompraService, EmailService],
  exports: [CompraService],
})
export class CompraModule {}
