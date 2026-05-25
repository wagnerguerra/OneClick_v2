/**
 * Controller REST direto pro fluxo de importação do SCI.
 *
 * Por que existir além do tRPC: Chrome (com ou sem extensões) trava
 * indefinidamente em POSTs pra `/trpc/bi.balanceteRefreshPeriodo` e similares —
 * preflight CORS nunca volta. Curl no mesmo path funciona em 3ms.
 * Suspeita: filtro do AdBlock / network filter / SW cacheando.
 * REST tradicional num path totalmente diferente (`/api/bi-sync/*`) bypassa.
 */

import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { prisma } from '@saas/db'
import { BiService } from './bi.service'
import { BiBalanceteService } from './bi-balancete.service'
import type { SciBalanceteLinha } from '../cliente/sci.service'
import { AuthService } from '../auth/auth.service'

@Controller('api/bi-sync')
export class BiSyncController {
  constructor(
    private readonly biService: BiService,
    private readonly balanceteService: BiBalanceteService,
    private readonly authService: AuthService,
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
    return this.balanceteService.uploadBalanceteMes(
      body.clienteId,
      body.ref,
      body.linhas,
      body.substituirExistentes ?? true,
    )
  }
}
