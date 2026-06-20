import { Controller, Get, Param, Req, Res, Inject, BadRequestException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { BeneficioService } from './beneficio.service'
import { AuthService } from '../auth/auth.service'

/**
 * Download do fechamento mensal de benefícios em XLSX.
 * GET /api/beneficios/competencias/:id/export.xlsx
 * Auth via better-auth (mesmo padrão do danfe.controller).
 */
@Controller('api/beneficios')
export class BeneficioController {
  constructor(
    @Inject(BeneficioService) private readonly svc: BeneficioService,
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

  @Get('competencias/:id/export.xlsx')
  async export(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.resolveSession(req)
    const buf = await this.svc.exportarXlsx(id)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="beneficios-${id}.xlsx"`)
    res.end(buf)
  }
}
