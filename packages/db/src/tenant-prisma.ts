import { prisma } from './client'
import type { PrismaClient } from './generated/client'

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/**
 * Executa uma operação dentro de um schema de tenant específico.
 *
 * Usa uma interactive transaction do Prisma para garantir que:
 * 1. O search_path é definido na mesma conexão
 * 2. Todas as queries dentro do callback usam o schema do tenant
 * 3. O search_path é restaurado ao final (via rollback da sessão ou nova transação)
 *
 * @param tenantSchema - Nome do schema (ex: "tenant_12345678901234")
 * @param fn - Função que recebe o transaction client e executa queries
 * @returns Resultado da função
 *
 * @example
 * ```typescript
 * const areas = await withTenant('tenant_123', async (tx) => {
 *   return tx.area.findMany()
 * })
 * ```
 */
export async function withTenant<T>(
  tenantSchema: string,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  // Validar schema name
  if (!/^tenant_[a-zA-Z0-9_]+$/.test(tenantSchema)) {
    throw new Error(`Schema de tenant inválido: ${tenantSchema}`)
  }

  return prisma.$transaction(async (tx) => {
    // Definir search_path: tenant primeiro, public como fallback
    // Isso faz com que tabelas sem schema explícito busquem no tenant primeiro
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${tenantSchema}", "public"`)
    return fn(tx)
  }, {
    maxWait: 10000,  // 10s max para pegar uma conexão
    timeout: 30000,  // 30s timeout da transação
  })
}

/**
 * Resolve o schema name a partir do tenantId.
 * Busca o tenant no banco e retorna o campo `schema`.
 * Retorna null se o tenant não for encontrado ou não tiver schema.
 */
export async function resolveTenantSchema(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { schema: true },
  })
  return tenant?.schema ?? null
}

/**
 * Helper que resolve o schema e executa a operação.
 * Combina resolveTenantSchema + withTenant em uma chamada.
 * Se o tenantId for nulo ou o schema não existir, executa no public (sem SET search_path).
 */
export async function withTenantId<T>(
  tenantId: string | undefined,
  fn: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) {
    // Sem tenant — executar no schema public (comportamento padrão)
    return fn(prisma as unknown as TransactionClient)
  }

  const schema = await resolveTenantSchema(tenantId)
  if (!schema) {
    // Tenant sem schema definido — fallback para public
    return fn(prisma as unknown as TransactionClient)
  }

  return withTenant(schema, fn)
}
