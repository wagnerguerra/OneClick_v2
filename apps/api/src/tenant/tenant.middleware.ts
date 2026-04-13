import { Injectable, NestMiddleware } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string
      tenantSlug?: string
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Resolução por header (útil para dev e API calls)
    const headerTenant = req.headers['x-tenant-id'] as string | undefined
    if (headerTenant) {
      req.tenantId = headerTenant
      next()
      return
    }

    // Resolução por subdomínio (produção: empresa.app.com)
    const host = req.hostname
    const parts = host.split('.')
    if (parts.length >= 3) {
      req.tenantSlug = parts[0]
    }

    next()
  }
}
