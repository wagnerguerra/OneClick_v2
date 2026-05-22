/**
 * Controller REST direto pro template de assinatura.
 *
 * Por que existir além do tRPC: Chrome (modo anônimo, sem extensions) trava
 * indefinidamente em POSTs pra `/trpc/emailSig.*` — preflight CORS nunca volta.
 * Curl no mesmo path funciona; outros routers tRPC (tabs.*, user.*) funcionam.
 * Comportamento não-explicável, possivelmente um filtro de Chrome pra paths
 * com nomes específicos. REST tradicional bypassa o problema.
 */

import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { SignatureTemplateService, type SignatureTemplateInput } from './signature-template.service'
import { SignatureService } from './signature.service'
import { AuthService } from '../auth/auth.service'

@Controller('api/email-template')
export class SignatureTemplateController {
  constructor(
    private readonly templateSvc: SignatureTemplateService,
    private readonly authService: AuthService,
  ) {}

  private async getCtx(req: Request) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const session = await this.authService.auth.api.getSession({ headers })
    if (!session?.user) throw new Error('Não autenticado')
    const user = session.user as Record<string, unknown>
    return {
      userId: session.user.id,
      isMaster: (user.isMaster as boolean) ?? false,
    }
  }

  @Get(':empresaId')
  async get(@Param('empresaId') empresaId: string, @Req() req: Request) {
    await this.getCtx(req)
    return this.templateSvc.getTemplate(empresaId)
  }

  @Post(':empresaId')
  async update(
    @Param('empresaId') empresaId: string,
    @Body() body: SignatureTemplateInput,
    @Req() req: Request,
  ) {
    console.log('[SignatureTemplateController.update] entered empresaId=', empresaId, 'bodyKeys=', Object.keys(body || {}))
    const ctx = await this.getCtx(req)
    console.log('[SignatureTemplateController.update] ctx isMaster=', ctx.isMaster)
    return this.templateSvc.updateTemplate(empresaId, ctx.isMaster, body)
  }

  @Post(':empresaId/reset')
  async reset(@Param('empresaId') empresaId: string, @Req() req: Request) {
    const ctx = await this.getCtx(req)
    return this.templateSvc.resetTemplate(empresaId, ctx.isMaster)
  }
}

/**
 * Controller separado pro compose da foto (path diferente pra evitar conflito
 * com `:empresaId` do controller acima).
 */
@Controller('api/email-signature-photo')
export class SignaturePhotoController {
  constructor(
    private readonly signatureSvc: SignatureService,
    private readonly authService: AuthService,
  ) {}

  @Post('compose')
  async compose(@Body() body: { originalUrl: string }, @Req() req: Request) {
    const headers = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    }
    const session = await this.authService.auth.api.getSession({ headers })
    if (!session?.user) throw new Error('Não autenticado')
    return this.signatureSvc.composeFromUpload(session.user.id, body.originalUrl)
  }
}
