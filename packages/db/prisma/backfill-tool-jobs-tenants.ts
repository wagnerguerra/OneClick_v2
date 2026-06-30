/**
 * Backfill: cria as tabelas de Ferramentas (tool_jobs, tool_job_eventos) em
 * TODOS os schemas de tenant já existentes — `createTenantSchema` só roda na
 * criação do tenant, então sem isto os tenants antigos ficam sem as tabelas.
 *
 * Idempotente (CREATE ... IF NOT EXISTS). Rodar DEPOIS do `db:push` (que cria as
 * tabelas no `public`, usadas como molde via LIKE).
 *
 *   pnpm --filter @saas/db exec tsx prisma/backfill-tool-jobs-tenants.ts
 *
 * Ver memória `oneclick-multitenant-provisioning` e docs/plano-ferramentas.md.
 */
import { prisma } from '../src/client'
import { listTenantSchemas } from '../src/tenant-manager'

// Ordem importa: tool_jobs antes de tool_job_eventos.
const NEW_TABLES = ['tool_jobs', 'tool_job_eventos'] as const

async function main() {
  const schemas = await listTenantSchemas()
  console.log(`Tenants encontrados: ${schemas.length}`)

  for (const schema of schemas) {
    // Defesa em profundidade contra injeção (mesma regra do tenant-manager).
    if (!/^tenant_[a-zA-Z0-9_]+$/.test(schema)) {
      console.warn(`  ! pulando schema com nome inválido: ${schema}`)
      continue
    }

    for (const table of NEW_TABLES) {
      await prisma.$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "${schema}"."${table}" ` +
          `(LIKE "public"."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`,
      )
    }

    // Sequence independente por tenant para tool_jobs.code (autoincrement).
    const seq = 'tool_jobs_code_seq'
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${schema}"."${seq}" START 1`)
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${schema}"."tool_jobs" ALTER COLUMN code SET DEFAULT nextval('"${schema}"."${seq}"')`,
    )

    console.log(`  ✓ ${schema}`)
  }

  console.log('Backfill concluído.')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Backfill falhou:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
