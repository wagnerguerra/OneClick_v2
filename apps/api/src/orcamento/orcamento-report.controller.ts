import { Controller, Get, Query, Req, Res, Inject, BadRequestException, Logger } from '@nestjs/common'
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
  /**
   * Log de ENTRADA e de conclusão de cada download. O pino-http só registra a
   * requisição quando a resposta termina, então um download que trava não
   * deixava rastro nenhum — foi exatamente o que dificultou diagnosticar o
   * primeiro relato de "carregando pra sempre". Com isso, uma requisição
   * pendurada fica visível (aparece o "→" e nunca o "✓").
   */
  private readonly log = new Logger(OrcamentoReportController.name)

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

  /**
   * #HLP0265 — exportação da LISTA de orçamentos, com os filtros que estão
   * aplicados na tela. Reproduz o que o time já fazia no sistema legado, onde a
   * listagem era um DataTables e o botão de Excel exportava o resultado
   * filtrado (não a base inteira).
   *
   * Diferente de /coluna, aqui `status` é OPCIONAL — a conferência por área
   * normalmente atravessa mais de uma etapa, e era justamente o que o relatório
   * por coluna não conseguia entregar numa planilha só.
   *
   * GET /api/orcamento-report/lista?formato=&campos=&status=&de=&ate=&areas=&tipo=
   *     &search=&clienteId=&numero=&itemCatalogoId=&responsavelId=&solicitanteId=
   *     &arquivado=&comReaberturas=&incluirParalizados=
   */
  @Get('lista')
  async lista(@Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const t0 = Date.now()
    this.log.log(`→ export lista: ${JSON.stringify(q)}`)
    const { userId } = await this.resolveSession(req)
    const formato = (q.formato && ['xlsx', 'csv', 'pdf'].includes(q.formato) ? q.formato : 'xlsx') as 'xlsx' | 'csv' | 'pdf'
    // Query string só carrega texto: '1'/'true' viram boolean, e o que vier
    // vazio fica undefined pra não virar filtro por engano.
    const bool = (v: string | undefined) => (v === undefined || v === '' ? undefined : v === '1' || v === 'true')
    const txt = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : undefined)

    const { buffer, filename, contentType } = await this.svc.gerarRelatorioColunaArquivo(
      {
        status: txt(q.status),
        dataInicio: txt(q.de),
        dataFim: txt(q.ate),
        tipo: q.tipo === 'MENSAL' || q.tipo === 'EXTRA' ? q.tipo : undefined,
        areas: q.areas ? q.areas.split(',').filter(Boolean) : undefined,
        campos: q.campos ? q.campos.split(',').filter(Boolean) : undefined,
        filtrosLista: {
          search: txt(q.search),
          clienteId: txt(q.clienteId),
          numero: q.numero && /^\d+$/.test(q.numero) ? Number(q.numero) : undefined,
          itemCatalogoId: txt(q.itemCatalogoId),
          responsavelId: txt(q.responsavelId),
          solicitanteId: txt(q.solicitanteId),
          arquivado: bool(q.arquivado),
          comReaberturas: bool(q.comReaberturas),
          incluirParalizados: bool(q.incluirParalizados),
        },
      },
      userId,
      formato,
    )
    this.log.log(`✓ export lista: ${filename} (${buffer.length} bytes) em ${Date.now() - t0}ms`)
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buffer)
  }
}
