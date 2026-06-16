import { Controller, Inject, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, filter, interval, map, merge } from 'rxjs'
import { WhatsappEventsService } from './whatsapp-events.service'
import { AuthService } from '../auth/auth.service'

// SSE do WhatsApp — entrega só eventos cujo `destinatarios` inclui o user.
@Controller('api/whatsapp')
export class WhatsappController {
  constructor(
    @Inject(WhatsappEventsService) private readonly events: WhatsappEventsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  private async resolveUserId(req: Request): Promise<string | null> {
    try {
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) {
        if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
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
}
