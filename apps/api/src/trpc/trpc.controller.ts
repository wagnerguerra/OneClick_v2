import { All, Controller, Req, Res, Next } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import * as trpcExpress from '@trpc/server/adapters/express'
import { TrpcService, type TrpcContext, type BillingState } from './trpc.service'
import { AuthService } from '../auth/auth.service'
import { OnlineUsersService } from '../online-users/online-users.service'
import { resolveTenantSchema, prisma } from '@saas/db'
import { getCachedSession, setCachedSession } from './session-cache'

/**
 * Calcula o estado de billing do tenant (trial/assinatura/suspensão).
 * Roda no createContext (cacheado 30s junto da sessão). Master global e
 * usuários sem tenant (ex.: durante onboarding) nunca são bloqueados.
 * trialEndsAt NULL = tenant antigo isento (grandfathered) → ACTIVE.
 */
async function computeBillingState(
  tenantId: string | undefined,
  isMaster: boolean,
): Promise<{ billingState: BillingState; trialEndsAt?: Date }> {
  if (isMaster || !tenantId) return { billingState: 'ACTIVE' }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true, trialEndsAt: true },
    })
    if (!tenant) return { billingState: 'ACTIVE' }
    const trialEndsAt = tenant.trialEndsAt ?? undefined
    if (tenant.status === 'SUSPENDED') return { billingState: 'SUSPENDED', trialEndsAt }

    const now = Date.now()
    // Assinatura paga/trial vigente no Stripe → acesso liberado
    const sub = await prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
      orderBy: { currentPeriodEnd: 'desc' },
      select: { currentPeriodEnd: true },
    })
    if (sub && sub.currentPeriodEnd.getTime() > now) return { billingState: 'ACTIVE', trialEndsAt }

    // Sem assinatura: avaliar o trial local
    if (trialEndsAt) {
      return trialEndsAt.getTime() > now
        ? { billingState: 'TRIAL', trialEndsAt }
        : { billingState: 'TRIAL_EXPIRED', trialEndsAt }
    }
    // trialEndsAt NULL = isento/grandfathered
    return { billingState: 'ACTIVE' }
  } catch {
    // Falha ao calcular não deve trancar o usuário — liberar por segurança
    return { billingState: 'ACTIVE' }
  }
}

// Cache de sessão em memória (TTL 30s para evitar queries repetidas)
const SESSION_TTL = 30_000 // 30 segundos

function getCacheKey(req: Request): string {
  const cookie = req.headers.cookie ?? ''
  const auth = req.headers.authorization ?? ''
  return `${cookie}:${auth}`
}

@Controller()
export class TrpcController {
  private handler!: ReturnType<typeof trpcExpress.createExpressMiddleware>

  constructor(
    private readonly trpcService: TrpcService,
    private readonly authService: AuthService,
    private readonly onlineUsersService: OnlineUsersService,
  ) {}

  /** Extrai IP do client respeitando proxies (X-Forwarded-For/X-Real-IP). */
  private extractIp(req: Request): string | null {
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string') return xff.split(',')[0]!.trim()
    if (Array.isArray(xff) && xff[0]) return xff[0].split(',')[0]!.trim()
    const real = req.headers['x-real-ip']
    if (typeof real === 'string') return real
    return req.ip || req.socket.remoteAddress || null
  }

  onModuleInit() {
    const authInstance = this.authService.auth

    this.handler = trpcExpress.createExpressMiddleware({
      router: this.trpcService.appRouter,
      createContext: async ({ req }): Promise<TrpcContext> => {
        // Verificar cache
        const cacheKey = getCacheKey(req)
        const cached = getCachedSession(cacheKey)
        if (cached) return cached

        let userId: string | undefined
        let tenantId: string | undefined
        let empresaId: string | undefined
        let isMaster = false
        let isEmpresaMaster = false

        try {
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (value) {
              headers.set(key, Array.isArray(value) ? value.join(', ') : value)
            }
          }

          const session = await authInstance.api.getSession({ headers })

          if (session?.user) {
            const user = session.user as Record<string, unknown>
            userId = session.user.id
            tenantId = user.tenantId as string | undefined
            isMaster = (user.isMaster as boolean) ?? false
            isEmpresaMaster = (user.isEmpresaMaster as boolean) ?? false
            // Empresa ATIVA server-authoritative (F-012): o master segue a empresa
            // ativa (multi-empresa); o não-master é SEMPRE a home — um activeEmpresaId
            // divergente é ignorado (defesa). Este é o ÚNICO empresaId usado pelas
            // permissões (getMyPermissions), pela autorização e pelos resolvers.
            const homeEmpresaId = user.empresaId as string | undefined
            const activeEmpresaId = user.activeEmpresaId as string | undefined
            empresaId = isMaster ? (activeEmpresaId ?? homeEmpresaId) : homeEmpresaId
          }
        } catch {
          // Sem sessão válida
        }

        // Resolver o schema do tenant (se disponível)
        const resolvedTenantId = tenantId ?? req.tenantId
        let tenantSchema: string | undefined
        if (resolvedTenantId) {
          try {
            tenantSchema = (await resolveTenantSchema(resolvedTenantId)) ?? undefined
          } catch {
            // Falha silenciosa — usar schema public como fallback
          }
        }

        // Estado de billing (trial/assinatura/suspensão) — gate de acesso
        const { billingState, trialEndsAt } = await computeBillingState(resolvedTenantId, isMaster)

        const context: TrpcContext = {
          tenantId: resolvedTenantId,
          tenantSchema,
          userId,
          empresaId,
          isMaster,
          isEmpresaMaster,
          billingState,
          trialEndsAt,
        }

        // Tracking de presença — fire-and-forget, throttled internamente a 30s/user.
        // Path vem do header X-Page (frontend manda o pathname atual) com fallback
        // pra Referer pra requests legadas.
        if (userId) {
          const headerPage = req.headers['x-page']
          const pageFromHeader = typeof headerPage === 'string'
            ? headerPage
            : Array.isArray(headerPage) ? headerPage[0] : null
          let pathFinal: string | null = pageFromHeader ?? null
          if (!pathFinal) {
            const ref = req.headers.referer
            if (typeof ref === 'string') {
              try { pathFinal = new URL(ref).pathname } catch { /* ignora */ }
            }
          }
          this.onlineUsersService.touch(userId, pathFinal, this.extractIp(req))
        }

        // Salvar no cache (limpeza de expirados é feita dentro do helper)
        setCachedSession(cacheKey, context, SESSION_TTL)

        return context
      },
    })
  }

  @All('trpc/*path')
  handleTrpc(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    req.url = req.url.replace('/trpc', '')
    this.handler(req, res, next)
  }
}
