import {
  Body, Controller, Delete, ForbiddenException, Get, Inject, Post, Query, Req, UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { prisma } from '@saas/db'
import { ferramentasModuleSlug } from '@saas/types'
import { AuthService } from '../auth/auth.service'
import { WebappGatewayService } from './webapp-gateway.service'

const SLUG = ferramentasModuleSlug('contabil') // 'ferramentas-contabil'

/**
 * Proxy do cadastro de clientes/fornecedores do Editor de Extrato.
 * O browser nunca fala com o webapp: o OneClick repassa para `/tools/extrato-edit/*`.
 * Auth (Better Auth) + permissão da área Contábil. Ver docs/plano-ferramentas.md (Fase 3).
 */
@Controller('api/tools/extrato-edit')
export class ExtratoEditController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(WebappGatewayService) private readonly gateway: WebappGatewayService,
  ) {}

  @Get('entidades')
  async list(
    @Query('q') q: string | undefined,
    @Query('tipo') tipo: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('offset') offset: string | undefined,
    @Req() req: Request,
  ) {
    await this.authorize(req, 'canRead')
    return this.gateway.extratoEditRequest('GET', 'entidades', { query: { q, tipo, limit, offset } })
  }

  @Get('entidades/counts')
  async counts(@Req() req: Request) {
    await this.authorize(req, 'canRead')
    return this.gateway.extratoEditRequest('GET', 'entidades/counts')
  }

  @Post('lookup')
  async lookup(@Body() body: unknown, @Req() req: Request) {
    await this.authorize(req, 'canRead')
    return this.gateway.extratoEditRequest('POST', 'lookup', { body })
  }

  @Post('entidades/import')
  async import(@Body() body: unknown, @Req() req: Request) {
    await this.authorize(req, 'canWrite')
    return this.gateway.extratoEditRequest('POST', 'entidades/import', { body })
  }

  @Delete('entidades/item')
  async deleteItem(@Query('tipo') tipo: string | undefined, @Query('codigo') codigo: string | undefined, @Req() req: Request) {
    await this.authorize(req, 'canWrite')
    return this.gateway.extratoEditRequest('DELETE', 'entidades/item', { query: { tipo, codigo } })
  }

  @Delete('entidades')
  async clear(@Query('tipo') tipo: string | undefined, @Req() req: Request) {
    await this.authorize(req, 'canWrite')
    return this.gateway.extratoEditRequest('DELETE', 'entidades', { query: { tipo } })
  }

  /** Resolve a sessão (Better Auth) e checa a permissão Contábil (master bypassa). */
  private async authorize(req: Request, action: 'canRead' | 'canWrite'): Promise<void> {
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
    if ((u.isMaster as boolean) || (u.isEmpresaMaster as boolean)) return

    const perms = await prisma.userPermission.findMany({
      where: { userId: session.user.id },
      select: { moduleSlug: true, canRead: true, canWrite: true },
    })
    const mod = perms.find((p) => p.moduleSlug === SLUG)
    if (!mod || !mod[action]) throw new ForbiddenException(`Sem permissão (${action}) no módulo "${SLUG}".`)
  }
}
