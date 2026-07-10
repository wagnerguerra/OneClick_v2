/**
 * Controller REST direto pro fluxo de importação do SCI.
 *
 * Por que existir além do tRPC: Chrome (com ou sem extensões) trava
 * indefinidamente em POSTs pra `/trpc/bi.balanceteRefreshPeriodo` e similares —
 * preflight CORS nunca volta. Curl no mesmo path funciona em 3ms.
 * Suspeita: filtro do AdBlock / network filter / SW cacheando.
 * REST tradicional num path totalmente diferente (`/api/bi-sync/*`) bypassa.
 */

import { Body, Controller, Get, Param, Post, Req, Sse } from '@nestjs/common'
import type { Request } from 'express'
import { Observable, map, merge, interval } from 'rxjs'
import { prisma } from '@saas/db'
import { BiService } from './bi.service'
import { BiBalanceteService } from './bi-balancete.service'
import { BiSyncEventsService } from './bi-sync-events.service'
import type { SciBalanceteLinha } from '../cliente/sci.service'
import { AuthService } from '../auth/auth.service'

@Controller('api/bi-sync')
export class BiSyncController {
  constructor(
    private readonly biService: BiService,
    private readonly balanceteService: BiBalanceteService,
    private readonly authService: AuthService,
    private readonly events: BiSyncEventsService,
  ) {}

  /**
   * SSE — Stream de eventos BI Sync pro Launcher escutar em tempo real.
   * Emite ping a cada 30s pra manter a conexão (evita timeout de proxy).
   */
  @Sse('eventos')
  sse(): Observable<MessageEvent> {
    const ping$ = interval(30000).pipe(
      map(() => ({ data: JSON.stringify({ type: 'ping', timestamp: Date.now() }) }) as MessageEvent),
    )
    const events$ = this.events.events$.pipe(
      map(event => ({ data: JSON.stringify(event) }) as MessageEvent),
    )
    return merge(events$, ping$)
  }

  private async assertAuth(req: Request) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const session = await this.authService.auth.api.getSession({ headers })
    if (!session?.user) throw new Error('Não autenticado')
    return { userId: session.user.id }
  }

  @Post('importar')
  async importar(
    @Body() body: {
      clienteId: string
      anoInicio: number
      mesInicio: number
      anoFim: number
      mesFim: number
      substituirExistentes?: boolean
    },
    @Req() req: Request,
  ) {
    await this.assertAuth(req)
    return this.biService.balanceteRefreshPeriodo(
      body.clienteId, body.anoInicio, body.mesInicio, body.anoFim, body.mesFim,
      body.substituirExistentes ?? true,
    )
  }

  @Get('status/:clienteId/:refInicio/:refFim')
  async status(
    @Param('clienteId') clienteId: string,
    @Param('refInicio') refInicio: string,
    @Param('refFim') refFim: string,
    @Req() req: Request,
  ) {
    await this.assertAuth(req)
    return this.biService.balanceteRefreshStatusByRange(clienteId, Number(refInicio), Number(refFim))
  }

  /**
   * Lista todos os clientes ativos com flag `temSci` (id_sistema preenchido).
   * Launcher exibe a lista inteira com indicador visual; sync só permitido
   * pra clientes com PRCODEMP > 0.
   */
  @Get('clientes')
  async listarClientes(@Req() req: Request) {
    await this.assertAuth(req)
    const clientes = await prisma.cliente.findMany({
      where: { deletedAt: null },
      select: { id: true, razaoSocial: true, documento: true, idSistema: true, cidade: true },
      orderBy: { razaoSocial: 'asc' },
    })
    return clientes.map(c => ({
      ...c,
      temSci: !!(c.idSistema && Number(c.idSistema) > 0),
    }))
  }

  /**
   * Upload de balancete pré-importado (do SCI local no Launcher).
   * Recebe linhas no formato `SciBalanceteLinha` (mesmo do sci_balancete.py).
   *
   * Path: POST /api/bi-sync/upload-balancete
   * Body: { clienteId, ref (AAAAMM), linhas: SciBalanceteLinha[], substituirExistentes }
   */
  @Post('upload-balancete')
  async uploadBalancete(
    @Body() body: {
      clienteId: string
      ref: number
      linhas: SciBalanceteLinha[]
      substituirExistentes?: boolean
    },
    @Req() req: Request,
  ) {
    await this.assertAuth(req)
    if (!body.clienteId || !body.ref || !Array.isArray(body.linhas)) {
      throw new Error('Payload inválido: requer clienteId, ref (AAAAMM) e linhas[]')
    }
    if (body.ref < 200001 || body.ref > 209912) {
      throw new Error(`Ref inválida: ${body.ref} (esperado AAAAMM)`)
    }
    const r = await this.balanceteService.uploadBalanceteMes(
      body.clienteId,
      body.ref,
      body.linhas,
      body.substituirExistentes ?? true,
    )
    // Avança o job do fluxo via launcher (se houver um rodando pra este cliente/ref).
    this.balanceteService.advanceLauncherJob(body.clienteId, body.ref, r.inserted ?? 0)
    return r
  }

  /**
   * Sinal de conclusão do import via launcher — o SM chama após subir todos os
   * meses. Finaliza o job (status done/error) e sincroniza categorias no servidor.
   * Path: POST /api/bi-sync/import-done
   */
  @Post('import-done')
  async importDone(
    @Body() body: {
      clienteId: string
      refInicio: number
      refFim: number
      ok?: number
      skipped?: number
      failed?: number
      errorsByMes?: Record<number, string>
      erro?: string
    },
    @Req() req: Request,
  ) {
    await this.assertAuth(req)
    if (!body.clienteId || !body.refInicio || !body.refFim) {
      throw new Error('Requer clienteId, refInicio e refFim (AAAAMM)')
    }
    return this.balanceteService.finalizeLauncherJob(body.clienteId, body.refInicio, body.refFim, body)
  }
}
