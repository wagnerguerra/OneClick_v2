import { Module } from '@nestjs/common'
import { WhatsappService } from './whatsapp.service'
import { WhatsappCloudService } from './whatsapp-cloud.service'
import { WhatsappEventsService } from './whatsapp-events.service'
import { WhatsappController } from './whatsapp.controller'
import { WhatsappWebhookController } from './whatsapp-webhook.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [WhatsappService, WhatsappCloudService, WhatsappEventsService],
  controllers: [WhatsappController, WhatsappWebhookController],
  exports: [WhatsappService, WhatsappCloudService],
})
export class WhatsappModule {}
