import { Controller, Get, Inject, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { OnlineUsersService } from './online-users.service'
import { AuthService } from '../auth/auth.service'

/**
 * Endpoints de monitoramento de usuários online.
 *
 * Dois consumidores:
 *  - Service Manager (Electron launcher): SEM sessão Better Auth → visão GLOBAL
 *    (todos os tenants), comportamento legado preservado.
 *  - Chat web (apps/web): envia o cookie de sessão → a lista é ESCOPADA à empresa
 *    do usuário logado (isolamento multi-tenant — não vaza presença entre tenants).
 *
 * Em produção real, considerar proteger a visão global via API key (env ADMIN_API_KEY).
 */
@Controller('api/admin/online-users')
export class OnlineUsersController {
  constructor(
    @Inject(OnlineUsersService) private readonly svc: OnlineUsersService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  /**
   * Resolve o escopo de empresa a partir do cookie de sessão:
   *  - `undefined` → sem sessão válida (Service Manager) → visão global
   *  - string/`null` → empresa do usuário logado (chat web). `null` = sem empresa
   *    (default-deny no service: nunca lista usuários de outra empresa).
   */
  private async resolveEmpresaScope(req: Request): Promise<string | null | undefined> {
    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      const session = await this.authService.auth.api.getSession({ headers })
      if (session?.user) {
        const user = session.user as Record<string, unknown>
        // Master global enxerga todos os tenants
        if (user.isMaster === true) return undefined
        return (user.empresaId as string | undefined) ?? null
      }
    } catch {
      // Sem sessão válida — cai no comportamento global (launcher)
    }
    return undefined
  }

  /** Snapshot atual (REST simples — pra polling fallback ou primeiro load). */
  @Get()
  async list(@Req() req: Request) {
    const empresaId = await this.resolveEmpresaScope(req)
    return this.svc.getOnline(empresaId)
  }

  /**
   * SSE stream — emite a lista atual a cada 15s. Cliente conecta uma vez
   * e recebe updates contínuos sem precisar refetch.
   *
   * Formato do evento: `data: {"users": [...], "ts": <epoch ms>}\n\n`
   */
  @Get('events')
  async events(@Req() req: Request, @Res() res: Response) {
    const empresaId = await this.resolveEmpresaScope(req)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')  // nginx — evita buffering
    res.flushHeaders()

    const send = async () => {
      try {
        const users = await this.svc.getOnline(empresaId)
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
