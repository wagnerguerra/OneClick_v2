import { Controller, Get, Param, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { RelatorioTiService } from './relatorio-ti.service'

/**
 * Download do anexo de um relatório.
 *
 * Existe separado da rota genérica de anexos de propósito: aquela não pede
 * sessão — a proteção dela é o nome do arquivo ser impossível de adivinhar.
 * Relatório interno da equipe, escrito para a diretoria, não deve depender
 * disso. Aqui a sessão é conferida antes de o arquivo sair do servidor.
 */
@Controller('api/relatorios-ti')
export class RelatorioTiController {
  constructor(
    private readonly service: RelatorioTiService,
    private readonly authService: AuthService,
  ) {}

  @Get('arquivo/:id')
  async arquivo(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    const sessao = await this.authService.auth.api.getSession({ headers }).catch(() => null)
    if (!sessao?.user?.id) throw new UnauthorizedException('Sessão inválida — faça login.')

    try {
      const arq = await this.service.arquivo(id, sessao.user.id)
      res.setHeader('Content-Type', arq.mime)
      // `inline`: HTML e PDF abrem na aba, que é o caminho comum de quem só
      // quer ler. Salvar continua sendo um clique no visualizador.
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(arq.nome)}"`)
      res.end(arq.conteudo)
    } catch (e) {
      res.status(404).json({ message: (e as Error).message })
    }
  }
}
