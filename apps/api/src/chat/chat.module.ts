import { Module } from '@nestjs/common'
import { ChatService } from './chat.service'
import { ChatEventsService } from './chat-events.service'
import { ChatController } from './chat.controller'
import { AuthModule } from '../auth/auth.module'

@Module({
  imports: [AuthModule],
  providers: [ChatService, ChatEventsService],
  controllers: [ChatController],
  exports: [ChatService, ChatEventsService],
})
export class ChatModule {}
