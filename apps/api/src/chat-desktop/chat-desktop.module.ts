import { Module } from '@nestjs/common'
import { ChatDesktopUpdatesController } from './chat-desktop-updates.controller'

/**
 * Módulo do aplicativo desktop do chat. Por enquanto só serve os artefatos
 * de build (instalador + auto-update). O backend do chat em si fica em
 * apps/api/src/chat (não muda — o desktop consome a mesma API/SSE).
 */
@Module({
  controllers: [ChatDesktopUpdatesController],
})
export class ChatDesktopModule {}
