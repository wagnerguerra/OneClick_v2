import { Controller, Inject, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, filter, interval, map, merge } from 'rxjs'
import { AgendaLembreteEventsService } from './agenda-lembrete-events.service'
import { AuthService } from '../auth/auth.service'

/**
 * SSE de lembretes da agenda — entrega apenas pros participantes do evento
 * (filter por `destinatarios`). Ping de 30s pra manter conexão viva atrás
 * do nginx (proxy_read_timeout default 120s).
 */
@Controller('api/agenda/lembretes')
export class AgendaLembreteController {
  constructor(
    @Inject(AgendaLembreteEventsService) private readonly events: AgendaLembreteEventsService,
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
    const lembretes$ = this.events.events$.pipe(
      filter(ev => !userId ? false : ev.destinatarios.includes(userId)),
      map(ev => ({ data: JSON.stringify(ev) }) as MessageEvent),
    )
    return merge(lembretes$, ping$)
  }
}
