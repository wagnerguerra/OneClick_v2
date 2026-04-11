import { All, Controller, Req, Res, Next } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import * as trpcExpress from '@trpc/server/adapters/express'
import { TrpcService, type TrpcContext } from './trpc.service'
import { AuthService } from '../auth/auth.service'

// Cache de sessão em memória (TTL 30s para evitar queries repetidas)
const sessionCache = new Map<string, { data: TrpcContext; expires: number }>()
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
  ) {}

  onModuleInit() {
    const authInstance = this.authService.auth

    this.handler = trpcExpress.createExpressMiddleware({
      router: this.trpcService.appRouter,
      createContext: async ({ req }): Promise<TrpcContext> => {
        // Verificar cache
        const cacheKey = getCacheKey(req)
        const cached = sessionCache.get(cacheKey)
        if (cached && cached.expires > Date.now()) {
          return cached.data
        }

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
            empresaId = user.empresaId as string | undefined
            isMaster = (user.isMaster as boolean) ?? false
            isEmpresaMaster = (user.isEmpresaMaster as boolean) ?? false
          }
        } catch {
          // Sem sessão válida
        }

        const context: TrpcContext = {
          tenantId: tenantId ?? req.tenantId,
          userId,
          empresaId,
          isMaster,
          isEmpresaMaster,
        }

        // Salvar no cache
        sessionCache.set(cacheKey, { data: context, expires: Date.now() + SESSION_TTL })

        // Limpar entradas expiradas periodicamente
        if (sessionCache.size > 100) {
          const now = Date.now()
          for (const [key, val] of sessionCache) {
            if (val.expires < now) sessionCache.delete(key)
          }
        }

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
