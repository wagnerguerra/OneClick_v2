import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { AnyFilesInterceptor } from '@nestjs/platform-express'
import type { Request, Response } from 'express'
import { Readable } from 'node:stream'
import { prisma, resolveTenantSchema } from '@saas/db'
import { ferramentasModuleSlug, jobToolIdSchema, TOOL_AREA, type JobToolId } from '@saas/types'
import { AuthService } from '../auth/auth.service'
import { FerramentasService } from './ferramentas.service'
import { WebappGatewayService, type GatewayUploadFile } from './webapp-gateway.service'

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024 // cobre nfse/gnre (300MB); ver §4 risco (streaming).
const TEXT_FIELDS = ['sheets', 'presentRegs', 'sheet'] as const

interface SessionCtx {
  userId: string
  empresaId?: string
  isMaster: boolean
  isEmpresaMaster: boolean
  tenantSchema?: string
}

/**
 * Controller REST das ferramentas (upload/status/download/inspect). Faz o proxy
 * server-to-server (via FerramentasService + WebappGatewayService). Auth + tenant
 * + permissão da ÁREA do tool (ferramentas-fiscal/-contabil) resolvidos por request,
 * no padrão da casa (Better Auth manual). Ver docs/plano-ferramentas.md §Fase 1 passo 5.
 */
@Controller('api/tools')
export class FerramentasController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(FerramentasService) private readonly svc: FerramentasService,
    @Inject(WebappGatewayService) private readonly gateway: WebappGatewayService,
  ) {}

  @Post(':tool/jobs')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async create(
    @Param('tool') toolParam: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    const tool = this.parseTool(toolParam)
    const ctx = await this.authorize(req, tool, 'canWrite')
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.')

    const uploads = this.toUploads(files)
    return this.svc.create(
      { tool, files: uploads, fields: this.textFields(req), fileNameIn: files[0]!.originalname },
      ctx.isMaster,
      ctx.empresaId,
      ctx.userId,
      ctx.tenantSchema,
    )
  }

  @Get(':tool/jobs/:id')
  async status(@Param('tool') toolParam: string, @Param('id') id: string, @Req() req: Request) {
    const tool = this.parseTool(toolParam)
    const ctx = await this.authorize(req, tool, 'canRead')
    return this.svc.refreshStatus(id, ctx.isMaster, ctx.empresaId, ctx.userId, ctx.tenantSchema)
  }

  @Get(':tool/jobs/:id/download')
  async download(
    @Param('tool') toolParam: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const tool = this.parseTool(toolParam)
    const ctx = await this.authorize(req, tool, 'canRead')
    const target = await this.svc.getDownloadTarget(id, ctx.isMaster, ctx.empresaId, ctx.tenantSchema)
    const upstream = await this.gateway.streamDownload(target.tool, target.webappJobId, target.token)

    const fn = target.fileName.replace(/[\r\n"]/g, '_')
    const ascii = fn.replace(/[^\x20-\x7e]/g, '_')
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fn)}`)
    this.pipeUpstream(upstream, res)
  }

  @Post(':tool/inspect')
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async inspect(
    @Param('tool') toolParam: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Req() req: Request,
  ) {
    const tool = this.parseTool(toolParam)
    await this.authorize(req, tool, 'canRead')
    if (!files?.length) throw new BadRequestException('Nenhum arquivo enviado.')
    return this.gateway.inspect(tool, this.toUploads(files))
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private parseTool(toolParam: string): JobToolId {
    const parsed = jobToolIdSchema.safeParse(toolParam)
    if (!parsed.success) throw new NotFoundException(`Ferramenta desconhecida: ${toolParam}`)
    return parsed.data
  }

  private toUploads(files: Express.Multer.File[]): GatewayUploadFile[] {
    return files.map((f) => ({
      field: f.fieldname,
      filename: f.originalname,
      content: f.buffer,
      contentType: f.mimetype,
    }))
  }

  private textFields(req: Request): Record<string, string> {
    const body = (req.body ?? {}) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const key of TEXT_FIELDS) {
      const v = body[key]
      if (typeof v === 'string' && v.length > 0) out[key] = v
    }
    return out
  }

  private pipeUpstream(upstream: Response | { body: unknown }, res: Response): void {
    const body = (upstream as { body: unknown }).body
    if (!body) {
      res.end()
      return
    }
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
  }

  /** Resolve a sessão (Better Auth) + tenantSchema. Lança 401 se não autenticado. */
  private async resolveSession(req: Request): Promise<SessionCtx> {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    let session: Awaited<ReturnType<typeof this.authService.auth.api.getSession>>
    try {
      session = await this.authService.auth.api.getSession({ headers })
    } catch {
      throw new UnauthorizedException('Sessão inválida — faça login.')
    }
    if (!session?.user?.id) throw new UnauthorizedException('Sessão inválida — faça login.')

    const u = session.user as Record<string, unknown>
    const tenantId = (u.tenantId as string | undefined) ?? req.tenantId
    let tenantSchema: string | undefined
    if (tenantId) {
      try {
        tenantSchema = (await resolveTenantSchema(tenantId)) ?? undefined
      } catch {
        tenantSchema = undefined
      }
    }
    return {
      userId: session.user.id,
      empresaId: (u.empresaId as string | undefined) ?? undefined,
      isMaster: (u.isMaster as boolean) ?? false,
      isEmpresaMaster: (u.isEmpresaMaster as boolean) ?? false,
      tenantSchema,
    }
  }

  /** Resolve sessão e checa permissão da ÁREA do tool (master/empresaMaster bypassa). */
  private async authorize(
    req: Request,
    tool: JobToolId,
    action: 'canRead' | 'canWrite' | 'canDelete',
  ): Promise<SessionCtx> {
    const ctx = await this.resolveSession(req)
    if (ctx.isMaster || ctx.isEmpresaMaster) return ctx

    const slug = ferramentasModuleSlug(TOOL_AREA[tool])
    const perms = await prisma.userPermission.findMany({
      where: { userId: ctx.userId },
      select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
    })
    const mod = perms.find((p) => p.moduleSlug === slug)
    if (!mod || !mod[action]) {
      throw new ForbiddenException(`Sem permissão (${action}) no módulo "${slug}".`)
    }
    // Sub-permissão por ferramenta: opt-out (bloqueia só se explicitamente false).
    const subs = (mod.subPermissions ?? {}) as Record<string, boolean>
    if (subs[tool] === false) {
      throw new ForbiddenException(`Sem permissão para a ferramenta "${tool}".`)
    }
    return ctx
  }
}
