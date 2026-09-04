import { Controller, Get, Query, Req, Res, Inject, BadRequestException, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import { ClienteRelatorioService } from './relatorio.service'
import { AuthService } from '../../auth/auth.service'
import { hasSubPermission, getUserPermissions } from '../../trpc/trpc.service'

/**
 * Download do relatório de clientes (xlsx/csv/pdf).
 *
 * Por NAVEGAÇÃO, com `Content-Disposition` — o mesmo caminho do relatório de
 * orçamentos. Um download disparado por JavaScript é bloqueado pelo navegador
 * em várias situações; este não é.
 *
 * GET /api/cliente-relatorio?campos=a,b,c&formato=xlsx&filtros=<json>
 */
@Controller('api/cliente-relatorio')
export class ClienteRelatorioController {
  private readonly log = new Logger(ClienteRelatorioController.name)

  constructor(
    @Inject(ClienteRelatorioService) private readonly svc: ClienteRelatorioService,
    private readonly authService: AuthService,
  ) {}

  /** Sessão + escopo, no molde do controller de orçamentos. */
  private async resolverSessao(req: Request) {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    const sessao = await this.authService.auth.api.getSession({ headers }).catch(() => null)
    const user = sessao?.user as Record<string, unknown> | undefined
    if (!user?.id) throw new BadRequestException('Sessão inválida — faça login.')
    return {
      userId: user.id as string,
      isMaster: user.isMaster === true,
      isEmpresaMaster: user.isEmpresaMaster === true,
      empresaId: (user.empresaId as string | undefined) ?? undefined,
    }
  }

  @Get()
  async gerar(@Query() q: Record<string, string>, @Req() req: Request, @Res() res: Response): Promise<void> {
    const sessao = await this.resolverSessao(req)

    // Sem leitura no módulo não há relatório — nem o padrão. O guard do tRPC
    // não alcança este controller, então a checagem é explícita aqui.
    const perms = await getUserPermissions(sessao.userId)
    const podeLer = sessao.isMaster || sessao.isEmpresaMaster
      || perms.some(p => p.moduleSlug === 'clientes' && p.canRead)
    if (!podeLer) throw new BadRequestException('Sem permissão no módulo de clientes.')

    const campos = (q.campos ?? '').split(',').map(c => c.trim()).filter(Boolean)
    if (!campos.length) throw new BadRequestException('Escolha ao menos um campo.')

    let filtros: Record<string, unknown> = {}
    if (q.filtros) {
      try { filtros = JSON.parse(q.filtros) as Record<string, unknown> } catch {
        throw new BadRequestException('Filtros inválidos.')
      }
    }

    // Os filtros de campo chegam como JSON na querystring. Chave ou operador
    // invalido nao vira consulta: o motor descarta pelo catalogo.
    let filtrosCampos: Array<Record<string, unknown>> = []
    if (q.filtrosCampos) {
      try { filtrosCampos = JSON.parse(q.filtrosCampos) as Array<Record<string, unknown>> } catch {
        throw new BadRequestException('Filtros de campo inválidos.')
      }
    }

    const formato = (['xlsx', 'csv', 'pdf'].includes(q.formato ?? '') ? q.formato : 'xlsx') as 'xlsx' | 'csv' | 'pdf'

    const cache = new Map<string, boolean>()
    for (const sub of ['manage_commercial', 'manage_services', 'manage_contracts', 'manage_fiscal', 'edit_taxation']) {
      cache.set(sub, await hasSubPermission(sessao.userId, 'clientes', sub, {
        isMaster: sessao.isMaster, isEmpresaMaster: sessao.isEmpresaMaster,
      }))
    }

    this.log.log(`→ relatório de clientes (${formato}, ${campos.length} campos) por ${sessao.userId}`)
    const { buffer, filename, contentType } = await this.svc.gerarArquivo(
      {
        campos, filtros,
        filtrosCampos: filtrosCampos as never,
        ordenacao: q.ordenarPor ? { campo: q.ordenarPor, direcao: q.ordem === 'desc' ? 'desc' : 'asc' } : undefined,
      },
      { isMaster: sessao.isMaster, empresaId: sessao.empresaId, podeSub: (s) => cache.get(s) === true },
      formato,
      q.titulo || 'Relatório de clientes',
    )
    this.log.log(`✓ relatório entregue: ${filename} (${(buffer.length / 1024).toFixed(0)} KB)`)

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.end(buffer)
  }
}
