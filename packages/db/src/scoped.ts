import { prisma } from './client'
import { withTenant } from './tenant-prisma'

/**
 * Executa uma query no schema do tenant (se disponível) ou no public.
 *
 * Este helper é o ponto central para multi-tenancy em services.
 * Quando `tenantSchema` é informado, usa `SET LOCAL search_path`
 * dentro de uma transação para isolar os dados do tenant.
 * Quando não informado, executa normalmente no schema public.
 *
 * @param tenantSchema - Nome do schema do tenant (ex: "tenant_12345678901234") ou undefined
 * @param fn - Função que recebe o db client e executa as queries
 *
 * @example
 * ```typescript
 * // No service:
 * import { scoped } from '@saas/db'
 *
 * async list(tenantSchema?: string) {
 *   return scoped(tenantSchema, (db) => db.area.findMany())
 * }
 * ```
 */
export async function scoped<T>(
  tenantSchema: string | undefined,
  fn: (db: typeof prisma) => Promise<T>,
): Promise<T> {
  if (tenantSchema) {
    return withTenant(tenantSchema, (tx) => fn(tx as unknown as typeof prisma))
  }
  return fn(prisma)
}
