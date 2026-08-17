import { Controller, Get, Param, Req, Res, Inject, BadRequestException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { CompraService } from './compra.service'
import { AuthService } from '../auth/auth.service'

/**
 * Impressão do pedido de compra via NAVEGAÇÃO (Content-Disposition), e não por
 * fetch + blob: assim o download não esbarra no bloqueio de download por JS que
 * alguns navegadores aplicam. Mesmo padrão do cotacao/orcamento-report/danfe.
 *
 * GET /api/compra/:id/pdf
 */
@Controller('api/compra')
export class CompraController {
  constructor(
    @Inject(CompraService) private readonly svc: CompraService,
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
  async pdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.resolveSession(req)
    // Escopo de empresa fica com o service (mesma trava do getById): esta rota
    // resolve só a sessão, como a de cotação.
    const { buffer, filename } = await this.svc.pdf(id, false, undefined)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buffer)
  }
}
