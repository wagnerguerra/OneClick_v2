'use client'

/**
 * Página /chat-desktop — chat interno fullscreen pro aplicativo Electron.
 * Reusa o ChatHeaderButton em modo embed (sem trigger, sem Sheet wrapper).
 */

import { ChatHeaderButton } from '@/components/chat/chat-header-button'

export default function ChatDesktopPage() {
  return <ChatHeaderButton embed />
}
