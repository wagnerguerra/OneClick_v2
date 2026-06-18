import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { OrcamentoAiService, type ChatMsg, type AnexoIA } from './orcamento-ai.service'
import { AuthService } from '../auth/auth.service'

/**
 * Chat de IA do orçamento, com streaming.
 *
 * POST (e não GET/EventSource) porque a conversa vai no corpo. O frontend
 * consome via fetch + ReadableStream, lendo linhas SSE (`data: {...}`).
 * Auth pela sessão Better Auth (cookie same-origin), igual ao stream do
 * Helpdesk.
 */
@Controller('api/orcamentos')
export class OrcamentoAiController {
  constructor(
    private readonly aiService: OrcamentoAiService,
    private readonly authService: AuthService,
  ) {}

  @Post(':id/ai-chat')
  async chat(
    @Param('id') id: string,
    @Body() body: { mensagens?: ChatMsg[]; anexos?: AnexoIA[] },
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

    const heartbeat = setInterval(() => {
      try { res.write(`: ping\n\n`) } catch { /* ignore */ }
    }, 15_000)
    req.on('close', () => clearInterval(heartbeat))

    try {
      // Sanitiza: só user/assistant com conteúdo, no máximo as últimas 30 trocas
      const mensagens = (Array.isArray(body?.mensagens) ? body!.mensagens! : [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-30)
      // Sanitiza anexos: só image/* e application/pdf, com data base64; no máx. 5.
      const anexos = (Array.isArray(body?.anexos) ? body!.anexos! : [])
        .filter(a => a && typeof a.data === 'string' && a.data.length > 0
          && (a.kind === 'image' || a.kind === 'pdf')
          && typeof a.mediaType === 'string'
          && (a.mediaType.startsWith('image/') || a.mediaType === 'application/pdf'))
        .slice(0, 5)
        .map(a => ({ name: String(a.name || 'anexo'), mediaType: a.mediaType, kind: a.kind, data: a.data }))
      await this.aiService.chatStream(id, mensagens, session.user.id, anexos, send)
    } catch (e) {
      send({ type: 'error', message: (e as Error).message })
    } finally {
      clearInterval(heartbeat)
      try { res.end() } catch { /* ignore */ }
    }
  }
}
