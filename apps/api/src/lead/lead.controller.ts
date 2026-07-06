import { Body, Controller, Param, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { LeadService } from './lead.service'
import type { LeadChatMsg } from '@saas/types'

// Rate-limit in-memory simples (não há @nestjs/throttler no projeto). Protege o
// chat público contra spam/custo da API. Janela deslizante por chave.
const rateStore = new Map<string, { count: number; resetAt: number }>()
function dentroDoLimite(key: string, limite: number, janelaMs: number): boolean {
  const now = Date.now()
  let r = rateStore.get(key)
  if (!r || r.resetAt < now) { r = { count: 0, resetAt: now + janelaMs }; rateStore.set(key, r) }
  r.count++
  return r.count <= limite
}

/**
 * Endpoints PÚBLICOS do funil de captação (sem login). Identificação por token
 * de sessão. Streaming SSE sobre fetch (igual ao chat de orçamento, sem auth).
 */
@Controller('api/lead')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  private ipDe(req: Request): string {
    const fwd = (req.headers['x-forwarded-for'] as string | undefined) || ''
    return fwd.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown'
  }

  @Post(':slug/iniciar')
  async iniciar(
    @Param('slug') slug: string,
    @Body() body: { origem?: string | null; turnstileToken?: string | null },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = this.ipDe(req)
    if (!dentroDoLimite(`lead:iniciar:${ip}`, 10, 3_600_000)) {
      res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }); return
    }
    try {
      const r = await this.leadService.iniciarSessao({ slug, origem: body?.origem ?? null, ip, turnstileToken: body?.turnstileToken ?? null })
      res.json(r)
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  }

  @Post('chat/:token')
  async chat(
    @Param('token') token: string,
    @Body() body: { mensagens?: LeadChatMsg[] },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = this.ipDe(req)
    // teto por sessão (~40 msgs) + por IP (~120/h)
    if (!dentroDoLimite(`lead:chat:${token}`, 40, 3_600_000) || !dentroDoLimite(`lead:chatip:${ip}`, 120, 3_600_000)) {
      res.status(429).json({ error: 'Limite de mensagens atingido para esta sessão.' }); return
    }
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    const send = (event: { type: string; [k: string]: unknown }) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`) } catch { /* desconectou */ }
    }
    const hb = setInterval(() => { try { res.write(`: ping\n\n`) } catch { /* ignore */ } }, 15_000)
    req.on('close', () => clearInterval(hb))
    try {
      const mensagens = (Array.isArray(body?.mensagens) ? body!.mensagens! : [])
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-40)
      await this.leadService.chatStream(token, mensagens, send)
    } catch (e) {
      send({ type: 'error', message: (e as Error).message })
    } finally {
      clearInterval(hb); try { res.end() } catch { /* ignore */ }
    }
  }

  @Post(':token/agendar')
  async agendar(
    @Param('token') token: string,
    @Body() body: { data?: string; horaInicio?: string },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ip = this.ipDe(req)
    if (!dentroDoLimite(`lead:agendar:${ip}`, 20, 3_600_000)) { res.status(429).json({ error: 'Muitas tentativas.' }); return }
    try {
      if (!body?.data || !body?.horaInicio) throw new Error('Informe data e horário.')
      // [QA #26] Endpoint público: formato estrito antes de tocar o service.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.horaInicio)) {
        throw new Error('Data ou horário em formato inválido.')
      }
      const r = await this.leadService.agendarReuniao(token, body.data, body.horaInicio)
      res.json(r)
    } catch (e) {
      res.status(400).json({ error: (e as Error).message })
    }
  }
}
