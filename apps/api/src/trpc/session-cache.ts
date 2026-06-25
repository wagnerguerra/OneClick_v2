import type { TrpcContext } from './trpc.service'

/**
 * Cache em memória do contexto tRPC por request (cookie+auth), TTL curto.
 * Extraído do controller para um módulo NEUTRO (só import de tipo) de modo que
 * serviços possam INVALIDAR o ctx de um usuário sem criar ciclo de import —
 * ex.: ao trocar a empresa ativa, o `empresaId` resolvido precisa ser recalculado
 * (senão `getMyPermissions`/autorização ficariam stale por até o TTL). F-012.
 */
const sessionCache = new Map<string, { data: TrpcContext; expires: number }>()

export function getCachedSession(key: string): TrpcContext | null {
  const c = sessionCache.get(key)
  if (c && c.expires > Date.now()) return c.data
  return null
}

export function setCachedSession(key: string, data: TrpcContext, ttlMs: number): void {
  sessionCache.set(key, { data, expires: Date.now() + ttlMs })
  // Limpa entradas expiradas periodicamente
  if (sessionCache.size > 100) {
    const now = Date.now()
    for (const [k, v] of sessionCache) {
      if (v.expires < now) sessionCache.delete(k)
    }
  }
}

/** Invalida o ctx cacheado de um usuário (ex.: troca de empresa ativa). */
export function invalidateSessionCacheForUser(userId: string): void {
  for (const [k, v] of sessionCache) {
    if (v.data.userId === userId) sessionCache.delete(k)
  }
}
