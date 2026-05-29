import { Body, Controller, Inject, Param, Post, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, filter, interval, map, merge } from 'rxjs'
import { ChatEventsService } from './chat-events.service'
import { AuthService } from '../auth/auth.service'

/**
 * SSE do chat — só entrega eventos pra users que devem receber (filter por
 * `destinatarios` no payload). Mantém conexão viva com pings de 30s.
 */
@Controller('api/chat')
export class ChatController {
  constructor(
    @Inject(ChatEventsService) private readonly events: ChatEventsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  private async resolveUserId(req: Request): Promise<string | null> {
    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      const session = await this.authService.auth.api.getSession({ headers })
      return session?.user?.id ?? null
    } catch { return null }
  }

  @Sse('events')
  async events$(@Req() req: Request): Promise<Observable<MessageEvent>> {
    const userId = await this.resolveUserId(req)
    const ping$ = interval(30_000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const eventsForMe$ = this.events.events$.pipe(
      filter(ev => !userId ? false : ev.destinatarios.includes(userId)),
      map(ev => ({ data: JSON.stringify(ev) }) as MessageEvent),
    )
    return merge(eventsForMe$, ping$)
  }

  /**
   * Notifica que o user está digitando numa conversa. Body opcional inclui
   * `nome` pra o destinatário poder mostrar "Fabiana está digitando…" sem
   * fazer query extra.
   */
  @Post('typing/:conversaId')
  async typing(
    @Req() req: Request,
    @Param('conversaId') conversaId: string,
    @Body() body: { nome?: string },
  ): Promise<{ ok: boolean }> {
    const userId = await this.resolveUserId(req)
    if (!userId) return { ok: false }
    // Pra simplificar, broadcast pra qualquer destinatário — só quem participa
    // da conversa vai receber via SSE (filter no events$). Mas precisamos da
    // lista de participantes pra montar `destinatarios`.
    // Carrega participantes via prisma (sem importar service pra evitar ciclo)
    const { prisma } = await import('@saas/db')
    const parts = await prisma.chatParticipante.findMany({
      where: { conversaId },
      select: { usuarioId: true },
    })
    const destinatarios = parts.map(p => p.usuarioId).filter(id => id !== userId)
    if (destinatarios.length === 0) return { ok: true }
    this.events.emit('typing', { conversaId, usuarioId: userId, nome: body.nome ?? '', destinatarios })
    return { ok: true }
  }
}
