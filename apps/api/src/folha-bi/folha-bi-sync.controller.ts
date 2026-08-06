import {
  Body, Controller, Get, Headers, Param, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { folhaBiUploadSchema } from '@saas/types'
import { FolhaBiService } from './folha-bi.service'
import { AuthService } from '../auth/auth.service'

/**
 * Ingestao do BI de Folha. Espelha o padrao do `bi-sync` (REST direto, path proprio).
 * Aceita DUAS autenticacoes:
 *  - TOKEN de servico (env FOLHA_SYNC_TOKEN): scheduler headless (dia 10) e ETL automatica.
 *  - SESSAO Better Auth: uso manual pelo operador logado no launcher (Service Manager),
 *    identico ao balancete (bi-sync usa `assertAuth`).
 */
@Controller('api/folha-bi-sync')
export class FolhaBiSyncController {
  constructor(
    private readonly service: FolhaBiService,
    private readonly authService: AuthService,
  ) {}

  private async assertAuthOrToken(auth: string | undefined, req: Request) {
    // 1) token de servico (headless: scheduler / ETL automatica)
    const token = process.env.FOLHA_SYNC_TOKEN
    const provided = (auth ?? '').replace(/^Bearer\s+/i, '')
    if (token && provided && provided === token) return { via: 'token' as const }
    // 2) sessao Better Auth (uso manual pelo launcher logado). globalThis.Headers pois o
    // import `Headers` do @nestjs/common (decorator) sombreia o construtor Web global.
    const headers = new globalThis.Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    let session: Awaited<ReturnType<typeof this.authService.auth.api.getSession>> = null
    try {
      session = await this.authService.auth.api.getSession({ headers })
    } catch {
      // sem sessao valida -> cai no 401 abaixo (getSession pode lancar em vez de retornar null)
    }
    if (session?.user) return { via: 'session' as const, userId: session.user.id }
    throw new UnauthorizedException('Nao autenticado (nem token de servico nem sessao)')
  }

  @Post('upload')
  async upload(@Headers('authorization') auth: string, @Body() body: unknown, @Req() req: Request) {
    await this.assertAuthOrToken(auth, req)
    const data = folhaBiUploadSchema.parse(body)
    const saved = await this.service.upsertCache(data)
    return { ok: true, saved }
  }

  @Get('status')
  async status(
    @Headers('authorization') auth: string,
    @Query('clienteId') clienteId: string,
    @Req() req: Request,
  ) {
    await this.assertAuthOrToken(auth, req)
    return this.service.status(clienteId)
  }

  /**
   * Proximo pedido de sincronizacao da fila, ja marcado como EXECUTANDO.
   *
   * E o Service Manager quem PUXA: a API esta na VPS e o SCI so existe na LAN, sem
   * rota de uma para o outro. O botao da tela grava o pedido; quem roda perto do
   * Firebird vem busca-lo aqui.
   */
  @Get('jobs/proximo')
  async proximoJob(@Headers('authorization') auth: string, @Req() req: Request) {
    await this.assertAuthOrToken(auth, req)
    return this.service.proximoJob()
  }

  /** Progresso/desfecho de um pedido, reportado pelo Service Manager. */
  @Post('jobs/:id')
  async atualizarJob(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status?: string; log?: string; erro?: string; totalLinhas?: number },
    @Req() req: Request,
  ) {
    await this.assertAuthOrToken(auth, req)
    return this.service.atualizarJob(id, body ?? {})
  }

  /**
   * Empresas conhecidas pelo ETL (folha_dash.dim_empresa) — alimenta o seletor de
   * empresa no launcher. Distinto de /api/bi-sync/clientes (clientes do OneClick).
   */
  @Get('empresas')
  async empresas(@Headers('authorization') auth: string, @Req() req: Request) {
    await this.assertAuthOrToken(auth, req)
    return this.service.empresas()
  }
}
