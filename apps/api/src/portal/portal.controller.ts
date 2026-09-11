import {
  Controller, Get, Param, Req, Res, Inject, BadRequestException, NotFoundException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from '../auth/auth.service'
import { GestaoArquivosDriveService } from '../gestao-arquivos/gestao-arquivos-drive.service'
import { resolverVinculo } from './portal-escopo'

/**
 * Entrega arquivos do Google Drive para o PORTAL DO CLIENTE.
 *
 * Separado do controller do escritório de propósito, por duas razões que não
 * são estéticas:
 *
 *  - o caminho. A `UsuarioExternoGuard` libera `/api/portal` e barra o resto;
 *    pendurar esta rota em `/api/gestao-arquivos` a deixaria inalcançável para
 *    exatamente quem ela serve.
 *  - a autorização. Lá o acesso vem da responsabilidade interna do
 *    colaborador; aqui vem do VÍNCULO do usuário externo com o cliente. São
 *    perguntas diferentes, e juntá-las num `if` seria a forma mais fácil de um
 *    dia responder a errada.
 *
 * É este endpoint que cumpre a promessa do desenho: o cliente vê os arquivos
 * da pasta dele sem precisar de conta Google e sem compartilhamento que
 * sobreviva ao fim do contrato. Desativou o vínculo no cadastro, acabou o
 * acesso no mesmo instante.
 */
@Controller('api/portal')
export class PortalController {
  constructor(
    @Inject(GestaoArquivosDriveService) private readonly driveService: GestaoArquivosDriveService,
    private readonly authService: AuthService,
  ) {}

  private async userId(req: Request): Promise<string> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) throw new Error('sem sessão')
      return session.user.id
    } catch {
      throw new BadRequestException('Sessão inválida — faça login.')
    }
  }

  /**
   * GET /api/portal/drive/:clienteId/:fileId
   *
   * `inline` porque o uso é a pré-visualização ao lado da lista; `attachment`
   * faria o navegador baixar em vez de exibir.
   */
  @Get('drive/:clienteId/:fileId')
  async arquivoDoDrive(
    @Param('clienteId') clienteId: string,
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const userId = await this.userId(req)

    // `resolverVinculo` já devolve null para vínculo inativo, cliente inativo
    // ou inexistente — é a mesma porta que as rotas tRPC do portal atravessam.
    const vinculo = await resolverVinculo(userId, clienteId)
    if (!vinculo) throw new NotFoundException('Arquivo não encontrado.')

    let arquivo: Awaited<ReturnType<GestaoArquivosDriveService['abrirArquivoParaPortal']>>
    try {
      arquivo = await this.driveService.abrirArquivoParaPortal(vinculo, fileId)
    } catch {
      // Recusa vira 404: um 403 confirmaria que o arquivo existe na conta.
      throw new NotFoundException('Arquivo não encontrado.')
    }

    res.setHeader('Content-Type', arquivo.mimeType)
    if (arquivo.tamanho > 0) res.setHeader('Content-Length', String(arquivo.tamanho))
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
    )
    res.setHeader('Cache-Control', 'private, max-age=60')

    arquivo.stream.on('error', () => {
      if (!res.headersSent) res.status(502)
      res.end()
    })
    arquivo.stream.pipe(res)
  }
}
