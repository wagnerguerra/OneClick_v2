import {
  Controller, Get, Param, Req, Res, Inject, BadRequestException, NotFoundException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { prisma } from '@saas/db'
import { AuthService } from '../auth/auth.service'
import { GestaoArquivosDriveService } from './gestao-arquivos-drive.service'
import type { ContextoInterno } from './gestao-arquivos-escopo'

/**
 * Entrega arquivos do Google Drive pela NOSSA API.
 *
 * É REST, e não tRPC, porque o retorno é binário: o tRPC serializa JSON, e
 * mandar um PDF por JSON significaria base64 na memória inteiro antes de sair.
 *
 * A razão de existir é a permissão. O `webViewLink` do Drive exige que o
 * NAVEGADOR de quem olha tenha acesso ao arquivo — e quem tem acesso é a conta
 * do escritório, não o usuário. Servindo por aqui, quem decide é o escopo do
 * módulo: vínculo do colaborador com o cliente, e contenção do arquivo dentro
 * da pasta daquele cliente. O cliente não precisa de conta Google, e revogar o
 * acesso é desativar a pessoa no cadastro.
 */
@Controller('api/gestao-arquivos')
export class GestaoArquivosController {
  constructor(
    @Inject(GestaoArquivosDriveService) private readonly driveService: GestaoArquivosDriveService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Resolve a sessão e monta o contexto que o escopo precisa.
   *
   * Busca o usuário no banco em vez de confiar só na sessão: `role`,
   * `empresaId` e `isMaster` decidem o que a pessoa alcança, e eles podem ter
   * mudado depois que a sessão foi criada.
   */
  private async contexto(req: Request): Promise<ContextoInterno> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v)
    }

    let userId: string
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) throw new Error('sem sessão')
      userId = session.user.id
    } catch {
      throw new BadRequestException('Sessão inválida — faça login.')
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isMaster: true, empresaId: true, isActive: true },
    })
    if (!user?.isActive) throw new BadRequestException('Sessão inválida — faça login.')

    return {
      userId: user.id,
      role: user.role,
      isMaster: user.isMaster,
      empresaId: user.empresaId,
    }
  }

  /**
   * GET /api/gestao-arquivos/drive/:clienteId/:fileId
   *
   * `inline` no Content-Disposition porque o uso principal é a pré-visualização
   * ao lado da lista — `attachment` faria o navegador baixar em vez de exibir.
   */
  @Get('drive/:clienteId/:fileId')
  async arquivoDoDrive(
    @Param('clienteId') clienteId: string,
    @Param('fileId') fileId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const ctx = await this.contexto(req)

    let arquivo: Awaited<ReturnType<GestaoArquivosDriveService['abrirArquivo']>>
    try {
      arquivo = await this.driveService.abrirArquivo({ clienteId, fileId }, ctx)
    } catch {
      // Qualquer recusa vira 404: distinguir "não existe" de "não pode" diria a
      // quem tentou que o arquivo existe em algum lugar da conta.
      throw new NotFoundException('Arquivo não encontrado.')
    }

    res.setHeader('Content-Type', arquivo.mimeType)
    if (arquivo.tamanho > 0) res.setHeader('Content-Length', String(arquivo.tamanho))
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
    )
    // Documento de cliente não entra em cache compartilhado. `private` deixa o
    // navegador guardar durante a navegação sem que um proxy no caminho sirva o
    // arquivo de um cliente para outro usuário.
    res.setHeader('Cache-Control', 'private, max-age=60')

    arquivo.stream.on('error', () => {
      if (!res.headersSent) res.status(502)
      res.end()
    })
    arquivo.stream.pipe(res)
  }
}
