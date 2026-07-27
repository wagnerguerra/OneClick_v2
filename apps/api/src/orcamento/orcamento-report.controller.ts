import { Controller, Get, Query, Req, Res, Inject, BadRequestException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { OrcamentoService } from './orcamento.service'
import { AuthService } from '../auth/auth.service'

/**
 * Download do relatório por coluna do kanban (xlsx/csv/pdf) via NAVEGAÇÃO
 * (Content-Disposition: attachment) — imune ao bloqueio de download por JS do
 * navegador. Auth via better-auth (mesmo padrão do beneficio/danfe controller).
 * GET /api/orcamento-report/coluna?status=&formato=&campos=&de=&ate=&areas=&tipo=
 */
@Controller('api/orcamento-report')
export class OrcamentoReportController {
  constructor(
    @Inject(OrcamentoService) private readonly svc: OrcamentoService,
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

  @Get('coluna')
  async coluna(@Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { userId } = await this.resolveSession(req)
    if (!q.status) throw new BadRequestException('Parâmetro "status" é obrigatório.')
    const formato = (q.formato && ['xlsx', 'csv', 'pdf'].includes(q.formato) ? q.formato : 'xlsx') as 'xlsx' | 'csv' | 'pdf'
    const { buffer, filename, contentType } = await this.svc.gerarRelatorioColunaArquivo(
      {
        status: q.status,
        dataInicio: q.de || undefined,
        dataFim: q.ate || undefined,
        tipo: q.tipo === 'MENSAL' || q.tipo === 'EXTRA' ? q.tipo : undefined,
        areas: q.areas ? q.areas.split(',').filter(Boolean) : undefined,
        campos: q.campos ? q.campos.split(',').filter(Boolean) : undefined,
      },
      userId,
      formato,
    )
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buffer)
  }
}
