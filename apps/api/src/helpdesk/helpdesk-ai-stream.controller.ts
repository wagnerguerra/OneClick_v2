import { Controller, Get, Param, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { HelpdeskService } from './helpdesk.service'
import { HelpdeskAiAgentService } from './helpdesk-ai-agent.service'
import { AuthService } from '../auth/auth.service'

/**
 * SSE pra execução automática do plano IA com streaming do pensamento.
 *
 * Por que controller REST e não tRPC: streaming/SSE é nativo do Express;
 * tRPC subscriptions exigem WebSocket. SSE funciona em qualquer ambiente
 * e usa a infra de cookies do Better Auth pra autenticar (same-origin).
 *
 * Fluxo:
 *   - Frontend abre EventSource em /api/helpdesk/{id}/ai-execute-stream
 *   - Backend valida sessão (cookie) + acesso ao ticket
 *   - Chama HelpdeskAiAgentService.executarPlanoAutomaticoStream
 *   - Cada evento (thinking_delta, tool_input_delta, status, done) vira
 *     uma linha SSE no response
 *   - Frontend renderiza thinking incrementalmente, recarrega ticket no done
 */
@Controller('api/helpdesk')
export class HelpdeskAiStreamController {
  constructor(
    private readonly helpdeskService: HelpdeskService,
    private readonly aiAgent: HelpdeskAiAgentService,
    private readonly authService: AuthService,
  ) {}

  @Get(':ticketId/ai-execute-stream')
  async stream(
    @Param('ticketId') ticketId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Auth via Better Auth (cookies same-origin)
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const session = await this.authService.auth.api.getSession({ headers })
    if (!session?.user) {
      res.status(401).json({ error: 'Não autenticado' })
      return
    }
    try {
      await this.helpdeskService.assertCanAccess(session.user.id, ticketId)
    } catch {
      res.status(403).json({ error: 'Sem acesso ao ticket' })
      return
    }

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // nginx: desabilita buffer
    res.flushHeaders()

    const send = (event: { type: string; [k: string]: unknown }) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // cliente desconectou — ignora
      }
    }

    // Heartbeat a cada 15s pra não fechar a conexão por timeout de proxy
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`)
      } catch { /* ignore */ }
    }, 15_000)

    // Quando o cliente desconecta, paramos o heartbeat (a stream Claude
    // continua até concluir — não dá pra abortar facilmente sem AbortController
    // por agora; resultado fica gravado mesmo se o user fechar a aba).
    req.on('close', () => {
      clearInterval(heartbeat)
    })

    try {
      await this.aiAgent.executarPlanoAutomaticoStream(ticketId, send)
    } catch (e) {
      send({ type: 'error', message: (e as Error).message })
    } finally {
      clearInterval(heartbeat)
      try { res.end() } catch { /* ignore */ }
    }
  }
}
