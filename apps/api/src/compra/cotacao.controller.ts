import { Controller, Get, Param, Query, Req, Res, Inject, BadRequestException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { CotacaoService } from './cotacao.service'
import { AuthService } from '../auth/auth.service'

/**
 * Download do PDF do pedido de cotação via NAVEGAÇÃO (Content-Disposition:
 * attachment) — imune ao bloqueio de download por JS do navegador. Mesmo padrão
 * do orcamento-report/danfe controller.
 *
 * GET /api/cotacao/:id/pdf?fornecedor=<cotacaoFornecedorId>
 * Sem `fornecedor`, sai o PDF genérico (sem o bloco do destinatário).
 */
@Controller('api/cotacao')
export class CotacaoController {
  constructor(
    @Inject(CotacaoService) private readonly svc: CotacaoService,
    private readonly authService: AuthService,
  ) {}

  private async resolveSession(req: Request): Promise<{ userId: string }> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) throw new BadRequestException('Sessão inválida — faça login.')
      return { userId: session.user.id }
    } catch {
      throw new BadRequestException('Sessão inválida — faça login.')
    }
  }

  @Get(':id/pdf')
  async pdf(
    @Param('id') id: string,
    @Query('fornecedor') fornecedor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.resolveSession(req)
    const { buffer, filename } = await this.svc.pdf(id, fornecedor || null)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buffer)
  }
}
