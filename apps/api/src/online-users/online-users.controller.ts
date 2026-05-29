import { Controller, Get, Inject, Res } from '@nestjs/common'
import type { Response } from 'express'
import { OnlineUsersService } from './online-users.service'

/**
 * Endpoints de monitoramento de usuários online — consumidos pelo Service Manager
 * (Electron launcher) que mostra a lista em tempo real via SSE.
 *
 * Auth: SEM proteção de cookie (Service Manager não tem sessão Better Auth).
 * Em produção real, considerar proteger via API key em header (env ADMIN_API_KEY).
 */
@Controller('api/admin/online-users')
export class OnlineUsersController {
  constructor(@Inject(OnlineUsersService) private readonly svc: OnlineUsersService) {}

  /** Snapshot atual (REST simples — pra polling fallback ou primeiro load). */
  @Get()
  async list() {
    return this.svc.getOnline()
  }

  /**
   * SSE stream — emite a lista atual a cada 5s. Cliente conecta uma vez
   * e recebe updates contínuos sem precisar refetch.
   *
   * Formato do evento: `data: {"users": [...], "ts": <epoch ms>}\n\n`
   */
  @Get('events')
  async events(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')  // nginx — evita buffering
    res.flushHeaders()

    const send = async () => {
      try {
        const users = await this.svc.getOnline()
        res.write(`data: ${JSON.stringify({ users, ts: Date.now() })}\n\n`)
      } catch (e) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: (e as Error).message })}\n\n`)
      }
    }

    // 1º envio imediato
    await send()

    // Tick a cada 15s — antes era 5s, mas com vários clientes (web + launcher)
    // conectados, isso virava 1 query SQL × N a cada 5s, saturando o pool.
    // 15s ainda é "quase tempo real" pra um painel de presença.
    const interval = setInterval(send, 15_000)

    // Ping a cada 30s pra manter a conexão viva atrás de proxies
    const ping = setInterval(() => {
      res.write(': ping\n\n')
    }, 30_000)

    res.on('close', () => {
      clearInterval(interval)
      clearInterval(ping)
      res.end()
    })
  }
}
