import { Controller, Get, Inject, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { OnlineUsersService } from './online-users.service'
import { AuthService } from '../auth/auth.service'

/**
 * Endpoints de monitoramento de presença.
 *
 * Controle de acesso (server-side) — três níveis (F-001):
 *  - FULL (global + PII: e-mail/IP/path): apenas master global da plataforma
 *    (sessão `isMaster`) ou Service Manager autenticado via `ADMIN_API_KEY`
 *    (header `x-admin-key`). É o painel de monitoramento.
 *  - SCOPED (só presença, sem PII): qualquer sessão autenticada — recebe a lista
 *    de presença (id/nome/avatar/status) escopada à PRÓPRIA empresa. É o que o
 *    chat web consome. NÃO inclui e-mail, IP nem caminho de navegação.
 *  - NONE: sem sessão e sem chave → lista vazia (não vaza nada).
 *
 * Por que não exigir `isEmpresaMaster` no FULL: o usuário do finding é admin de
 * tenant (isEmpresaMaster) em trial — ele NÃO deve ver IP/e-mail de terceiros.
 */
@Controller('api/admin/online-users')
export class OnlineUsersController {
  constructor(
    @Inject(OnlineUsersService) private readonly svc: OnlineUsersService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  /** Resolve o nível de acesso a partir da sessão (cookie) ou da chave admin. */
  private async resolveAccess(
    req: Request,
  ): Promise<{ tier: 'full' | 'scoped' | 'none'; empresaId: string | null }> {
    // Service Manager (sem sessão Better Auth) → autentica por API key dedicada.
    const adminKey = process.env.ADMIN_API_KEY
    const headerKey = req.headers['x-admin-key']
    if (adminKey && typeof headerKey === 'string' && headerKey === adminKey) {
      return { tier: 'full', empresaId: null }
    }

    try {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      }
      const session = await this.authService.auth.api.getSession({ headers })
      if (session?.user) {
        const user = session.user as Record<string, unknown>
        // Master global → monitoramento completo (todos os tenants + PII).
        if (user.isMaster === true) return { tier: 'full', empresaId: null }
        // Demais sessões → só presença da própria empresa, sem PII.
        return { tier: 'scoped', empresaId: (user.empresaId as string | undefined) ?? null }
      }
    } catch {
      // Sem sessão válida — cai em NONE.
    }
    return { tier: 'none', empresaId: null }
  }

  /** Busca a lista conforme o nível de acesso resolvido. */
  private async listFor(access: { tier: 'full' | 'scoped' | 'none'; empresaId: string | null }) {
    if (access.tier === 'none') return []
    if (access.tier === 'full') return this.svc.getOnline(undefined, { includeSensitive: true })
    return this.svc.getOnline(access.empresaId, { includeSensitive: false })
  }

  /** Snapshot atual (REST simples — pra polling fallback ou primeiro load). */
  @Get()
  async list(@Req() req: Request) {
    const access = await this.resolveAccess(req)
    return this.listFor(access)
  }

  /**
   * SSE stream — emite a lista atual a cada 15s. Cliente conecta uma vez
   * e recebe updates contínuos sem precisar refetch.
   *
   * Formato do evento: `data: {"users": [...], "ts": <epoch ms>}\n\n`
   */
  @Get('events')
  async events(@Req() req: Request, @Res() res: Response) {
    const access = await this.resolveAccess(req)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')  // nginx — evita buffering
    res.flushHeaders()

    const send = async () => {
      try {
        const users = await this.listFor(access)
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
