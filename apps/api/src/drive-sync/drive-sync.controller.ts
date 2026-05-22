import { Controller, Post, Get, Req, UploadedFiles, UseInterceptors, Inject, BadRequestException, UnauthorizedException, Body, Param } from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import type { Request } from 'express'
import { DriveSyncService } from './drive-sync.service'
import { AuthService } from '../auth/auth.service'

/**
 * Endpoints REST do Drive Sync — pra Launcher Electron consumir.
 *
 * Auth: aceita 2 modos:
 *   1) Cookie de sessão (better-auth) — uso humano via browser
 *   2) Header `X-Daemon-Secret` com valor de `LAUNCHER_DAEMON_SECRET` (env) —
 *      uso programático pelo Launcher Electron rodando no mesmo PC.
 *
 * tRPC cobre as rotas com cookie obrigatório (UI no browser).
 */
@Controller('api/drive-sync')
export class DriveSyncController {
  constructor(
    @Inject(DriveSyncService) private readonly svc: DriveSyncService,
    private readonly authService: AuthService,
  ) {}

  /** Tenta autenticar via cookie. Se falhar, tenta via daemon secret. */
  private async resolveAuth(req: Request): Promise<{ userId: string; isDaemon: boolean }> {
    // 1) Daemon secret (uso pelo Launcher)
    const daemonSecret = req.headers['x-daemon-secret']
    if (daemonSecret && typeof daemonSecret === 'string') {
      const expected = process.env.LAUNCHER_DAEMON_SECRET
      if (!expected) {
        throw new UnauthorizedException('Daemon não configurado no servidor (LAUNCHER_DAEMON_SECRET ausente).')
      }
      if (daemonSecret !== expected) {
        throw new UnauthorizedException('X-Daemon-Secret inválido.')
      }
      // Resolve userId de sistema (primeiro master ativo) — propaga em uploadedBy
      const masterId = await this.svc.resolveSystemUserId()
      if (!masterId) throw new UnauthorizedException('Nenhum usuário master no sistema.')
      return { userId: masterId, isDaemon: true }
    }

    // 2) Cookie de sessão
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    try {
      const session = await this.authService.auth.api.getSession({ headers })
      if (!session?.user?.id) throw new UnauthorizedException('Sessão inválida — faça login.')
      return { userId: session.user.id, isDaemon: false }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e
      throw new UnauthorizedException('Sessão inválida — faça login.')
    }
  }

  /** Lista clientes com pasta local configurada. Consumido pelo Launcher pra saber o que monitorar. */
  @Get('configs-locais')
  async listarConfigsLocais(@Req() req: Request) {
    await this.resolveAuth(req)
    return this.svc.listarConfigsLocais()
  }

  /** Daemon avisa quais clientes estão sendo observados agora. Atualiza status na UI. */
  @Post('heartbeat-local')
  async heartbeatLocal(@Req() req: Request, @Body() body: { items?: Array<{ clienteId: string; watching: boolean; ultimoErro?: string | null }> }) {
    await this.resolveAuth(req)
    const items = Array.isArray(body?.items) ? body.items : []
    await this.svc.heartbeatLocal(items)
    return { ok: true, count: items.length }
  }

  /** Daemon consulta requisições pendentes de sync local (UI clicou em "Sincronizar agora"). */
  @Get('sync-requests')
  async syncRequests(@Req() req: Request) {
    await this.resolveAuth(req)
    const ids = await this.svc.listarSyncRequests()
    return { clienteIds: ids }
  }

  /** Daemon avisa que terminou de processar uma request. */
  @Post('sync-requests/:clienteId/done')
  async syncRequestDone(@Req() req: Request, @Param('clienteId') clienteId: string) {
    await this.resolveAuth(req)
    if (!clienteId) throw new BadRequestException('clienteId obrigatório.')
    await this.svc.limparSyncRequest(clienteId)
    return { ok: true }
  }

  /**
   * Recebe XMLs/ZIPs do daemon Electron (watcher de pasta local).
   * Campos multipart:
   *   - files[] : XML/ZIP (1+, até 100 por chamada)
   *   - clienteId (string, obrigatório)
   *   - paths[] (array de string, opcional) — caminho relativo de cada arquivo na ordem
   */
  @Post('batch-local')
  @UseInterceptors(FilesInterceptor('files', 100, { limits: { fileSize: 100 * 1024 * 1024 } }))
  async batchLocal(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.')
    const { userId, isDaemon } = await this.resolveAuth(req)
    const body = req.body as { clienteId?: string; paths?: string | string[] }
    const clienteId = body?.clienteId
    if (!clienteId) throw new BadRequestException('clienteId obrigatório.')

    const pathsRaw = body?.paths
    const paths: string[] = Array.isArray(pathsRaw) ? pathsRaw : pathsRaw ? [pathsRaw] : []

    const arquivos = files.map((f, i) => ({
      buffer: f.buffer,
      nome: f.originalname,
      pathRelativo: paths[i] ?? f.originalname,
    }))

    const r = await this.svc.processarBatchLocal({
      clienteId,
      arquivos,
      iniciadoPor: isDaemon ? undefined : userId,
    })
    return { ok: true, ...r }
  }
}
