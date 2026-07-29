/**
 * Endpoints REST + SSE pra sincronização ERP via Launcher local.
 *
 * Esquema:
 *   Launcher (rede local) ──── SSE GET /api/contratos-sync/eventos ────→ VPS
 *      ↑                                                                  │
 *      └──── POST /api/contratos-sync/callback/:requestId ←───────────────┘
 *            { dados } ou { erro }
 *
 * Auth: ambos os endpoints exigem session válida (cookie Better Auth) — o
 * Launcher faz login via /api/auth/sign-in/email igual ao app web e mantém
 * o cookie de sessão.
 */

import { Body, Controller, Get, Param, Post, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, map, merge, interval } from 'rxjs'
import { AuthService } from '../auth/auth.service'
import { ContratoSyncService } from './contrato-sync.service'

@Controller('api/contratos-sync')
export class ContratoSyncController {
  constructor(
    private readonly authService: AuthService,
    private readonly syncService: ContratoSyncService,
  ) {}

  private async assertAuth(req: Request) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const session = await this.authService.auth.api.getSession({ headers })
    if (!session?.user) throw new Error('Não autenticado')
    return { userId: session.user.id }
  }

  /**
   * SSE — stream que o Launcher escuta. Publica pedidos de consulta ERP e
   * pings a cada 30s pra manter conexão viva (evita timeout de proxy).
   */
  @Sse('eventos')
  sse(): Observable<MessageEvent> {
    const ping$ = interval(30_000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const events$ = this.syncService.events$.pipe(
      map((ev) => ({ data: JSON.stringify(ev) }) as MessageEvent),
    )
    return merge(events$, ping$)
  }

  /**
   * Callback do Launcher após executar SCI local. Resolve a Promise do pedido
   * que está aguardando no service (criada por requestErpRemote).
   */
  @Post('callback/:requestId')
  async callback(
    @Req() req: Request,
    @Param('requestId') requestId: string,
    @Body() body: { dados?: Record<string, unknown>; erro?: string },
  ): Promise<{ ok: boolean; resolved: boolean }> {
    await this.assertAuth(req)
    // erro pode vir como string vazia (Launcher que perdeu a mensagem original); ainda
    // assim é um erro — rejeita o pedido pendente (não trata "" como sucesso).
    if (body.erro !== undefined) {
      const msg = String(body.erro || '').trim() || 'Falha ao ler o cadastro legado no Service Manager (sem detalhe do erro).'
      const ok = this.syncService.rejectRemoteRequest(requestId, msg)
      return { ok: true, resolved: ok }
    }
    // Nem dados nem erro: NÃO derruba em 500 (isso deixava a promise pendurada até o
    // timeout). Rejeita o pedido com mensagem clara e responde 200.
    if (body.dados === undefined) {
      const ok = this.syncService.rejectRemoteRequest(requestId, 'Service Manager respondeu sem dados nem erro.')
      return { ok: true, resolved: ok }
    }
    const resolved = this.syncService.resolveRemoteRequest(requestId, body.dados)
    return { ok: true, resolved }
  }

  /**
   * Status do sistema de sync — usado pra mostrar badge "Launcher conectado"
   * no app e debug.
   */
  @Get('status')
  async status(@Req() req: Request) {
    await this.assertAuth(req)
    return this.syncService.getStatus()
  }
}
