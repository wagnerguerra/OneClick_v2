/**
 * Handshake de sessão pro aplicativo desktop Electron.
 *
 * Fluxo (deep-link):
 *   1. User abre o app desktop, clica "Entrar via browser"
 *   2. App abre `${APP_URL}/login?desktop=1` no browser default
 *   3. User loga (form, OAuth, MFA) — Better Auth seta cookie de sessão normal
 *   4. /login com ?desktop=1 redireciona pra /desktop-handshake
 *   5. /desktop-handshake (autenticado) chama POST /api/auth/desktop-handshake,
 *      recebe { token } e redireciona pra `oneclick-chat://auth?token=X`
 *   6. SO abre o app desktop, handler captura a URL, faz POST /api/auth/desktop-consume,
 *      recebe { sessionToken }, seta cookie better-auth.session_token na BrowserWindow
 *      e recarrega a janela já autenticada
 *
 * Implementação:
 *   - Token de uso único persistido na tabela Verification (já existe pro Better Auth).
 *     identifier = `desktop-handshake:<uuid>`, value = userId, expira em 5 min.
 *   - desktop-consume cria uma SESSAO NOVA via prisma.session (não compartilha
 *     com a sessão web — assim logout web não derruba o desktop e vice-versa).
 */

import { Body, Controller, ForbiddenException, Post, Req } from '@nestjs/common'
import type { Request } from 'express'
import { prisma } from '@saas/db'
import { randomBytes } from 'node:crypto'
import { AuthService } from './auth.service'

const HANDSHAKE_PREFIX = 'desktop-handshake:'
const HANDSHAKE_TTL_MS = 5 * 60 * 1000 // 5 min
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias (= Better Auth default)

@Controller('api/auth')
export class AuthDesktopController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/desktop-handshake
   * Autenticado por cookie de sessão (Better Auth). Gera token uso único
   * que o aplicativo desktop vai trocar por uma sessão própria.
   */
  @Post('desktop-handshake')
  async handshake(@Req() req: Request) {
    const userId = await this.getUserIdFromRequest(req)
    if (!userId) throw new ForbiddenException('Não autenticado')

    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + HANDSHAKE_TTL_MS)
    await prisma.verification.create({
      data: {
        identifier: `${HANDSHAKE_PREFIX}${token}`,
        value: userId,
        expiresAt,
      },
    })
    return { token, expiresAt: expiresAt.toISOString() }
  }

  /**
   * POST /api/auth/desktop-consume
   * Público. Recebe { token } gerado pelo handshake e devolve uma sessão
   * nova (sessionToken + expiresAt). O aplicativo Electron usa esses
   * dados pra criar o cookie better-auth.session_token na sua BrowserWindow.
   */
  @Post('desktop-consume')
  async consume(@Body() body: { token?: string }) {
    const token = (body?.token ?? '').trim()
    if (!token) throw new ForbiddenException('Token ausente')

    const identifier = `${HANDSHAKE_PREFIX}${token}`
    const record = await prisma.verification.findFirst({ where: { identifier } })
    if (!record) throw new ForbiddenException('Token inválido')
    if (record.expiresAt < new Date()) {
      await prisma.verification.delete({ where: { id: record.id } }).catch(() => {})
      throw new ForbiddenException('Token expirado')
    }

    // Token só pode ser usado uma vez — remove antes de criar a sessão
    await prisma.verification.delete({ where: { id: record.id } })

    const userId = record.value
    const sessionToken = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    await prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        expiresAt,
        ipAddress: 'desktop-app',
        userAgent: 'OneClickChatDesktop',
      },
    })

    return {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      // O cookie name é o padrão do Better Auth v1.2.x
      cookieName: 'better-auth.session_token',
    }
  }

  /**
   * Extrai o userId da sessão Better Auth lendo o cookie da request.
   * Reusa o handler do Better Auth pra validar a sessão sem reimplementar.
   */
  private async getUserIdFromRequest(req: Request): Promise<string | null> {
    try {
      const url = new URL('/api/auth/get-session', `${req.protocol}://${req.get('host')}`)
      const headers = new Headers()
      const cookie = req.headers.cookie
      if (cookie) headers.set('cookie', cookie)
      const webReq = new Request(url.toString(), { method: 'GET', headers })
      const response = await this.authService.handleRequest(webReq)
      if (!response.ok) return null
      const data = await response.json() as { user?: { id?: string } } | null
      return data?.user?.id ?? null
    } catch {
      return null
    }
  }
}
