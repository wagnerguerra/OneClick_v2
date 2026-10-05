import { Controller, Get, Param, Req, Res, NotFoundException, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { getUserPermissions } from '../trpc/trpc.service'
import { CndService } from './cnd.service'

/** Mesmo slug do router (`cnd.router.ts`). */
const MODULE = 'certidoes-cnd'

/**
 * PDF da CND federal.
 *
 * Estas rotas serviam o PDF a quem soubesse o id, sem sessão e sem empresa —
 * a certidão de qualquer cliente de qualquer escritório. Agora: sessão válida,
 * leitura no módulo e o registro precisa ser da empresa ativa do usuário. O
 * guard do tRPC não alcança controllers REST, por isso a conferência é aqui.
 */
@Controller('api/cnd')
export class CndController {
  constructor(
    private readonly cndService: CndService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Sessão + empresa, na mesma regra do contexto do tRPC (trpc.controller):
   * usuário inativo vale como anônimo; o master segue a empresa ativa, o
   * não-master é sempre a empresa da casa. Usuário de cliente (portal) não entra.
   */
  private async exigirSessao(req: Request): Promise<{ userId: string; empresaId: string }> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const sessao = await this.authService.auth.api.getSession({ headers }).catch(() => null)
    const user = sessao?.user as Record<string, unknown> | undefined
    if (!user?.id || user.isActive === false) throw new UnauthorizedException('Sessão inválida — faça login.')
    if (user.role === 'COLABORADOR_CLIENTE') throw new ForbiddenException('Esta área é do escritório.')

    const isMaster = user.isMaster === true
    const isEmpresaMaster = user.isEmpresaMaster === true
    const home = (user.empresaId as string | undefined) ?? undefined
    const ativa = (user.activeEmpresaId as string | undefined) ?? undefined
    const empresaId = isMaster ? (ativa ?? home) : home
    if (!empresaId) throw new ForbiddenException('Selecione a empresa.')

    const userId = user.id as string
    if (!isMaster && !isEmpresaMaster) {
      const perms = await getUserPermissions(userId)
      if (!perms.some(p => p.moduleSlug === MODULE && p.canRead)) throw new ForbiddenException('Sem permissão no módulo de certidões.')
    }
    return { userId, empresaId }
  }

  @Get(':id/pdf')
  async visualizarPdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { empresaId } = await this.exigirSessao(req)
    const pdfBase64 = await this.cndService.getPdf(empresaId, id)
    if (!pdfBase64) throw new NotFoundException('PDF nao disponivel para esta consulta.')

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'inline; filename="cnd.pdf"')
    res.setHeader('Content-Length', pdfBuffer.length)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(pdfBuffer)
  }

  @Get(':id/download-pdf')
  async downloadPdf(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { empresaId } = await this.exigirSessao(req)
    // getById já recorta pela empresa: registro de outro tenant = não encontrado.
    const record = await this.cndService.getById(empresaId, id).catch(() => null)
    const pdfBase64 = record ? await this.cndService.getPdf(empresaId, id) : null
    if (!record || !pdfBase64) throw new NotFoundException('PDF nao disponivel para esta consulta.')

    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    // Documento só com letras/dígitos: o nome vai num cabeçalho HTTP.
    const docNome = String(record.documento).replace(/[^0-9A-Za-z]/g, '')
    const filename = `cnd_${docNome}_${new Date().toISOString().slice(0, 10)}.pdf`

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', pdfBuffer.length)
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(pdfBuffer)
  }
}
