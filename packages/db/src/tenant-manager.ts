import { prisma } from './client'

/**
 * Tabelas que existem no schema de cada tenant (isoladas por empresa).
 * A ordem respeita dependências de foreign keys para criação.
 */
const TENANT_TABLES = [
  'empresas',
  'empresa_events',
  'areas',
  'cargos',
  'cargo_events',
  'colaboradores',
  'colaborador_events',
  'clientes',
  'cliente_events',
  'cliente_arquivos',
  'cliente_contatos',
  'cliente_inscricoes',
  'cliente_contrato_params',
  'cliente_erp_snapshots',
  'cliente_historicos',
  'fornecedores',
  'fornecedor_events',
  'socios',
  'socio_arquivos',
  'socio_mensagens',
  'socio_events',
  // Contábil — Tratamento de Lançamentos (modelo antes das versões)
  'tratamento_modelos',
  'tratamento_modelo_versoes',
]

/**
 * Cria o schema PostgreSQL para um tenant e replica as tabelas tenant-scoped.
 * As tabelas são criadas com a mesma estrutura do schema `public`,
 * mas sem dados — o tenant começa vazio.
 */
export async function createTenantSchema(schemaName: string): Promise<void> {
  // Validar nome do schema (prevenir SQL injection)
  if (!/^tenant_[a-zA-Z0-9_]+$/.test(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }

  // Criar o schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`)

  // Clonar cada tabela do public para o novo schema.
  // Resiliente: se a tabela-template não existir no public (ex.: entrada órfã
  // em TENANT_TABLES), pula com aviso em vez de abortar todo o provisionamento.
  const skipped: string[] = []
  for (const table of TENANT_TABLES) {
    const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) as exists`,
      table,
    )
    if (!exists[0]?.exists) {
      skipped.push(table)
      continue
    }
    // CREATE TABLE ... (LIKE ...) copia a estrutura (colunas, defaults, constraints)
    // mas NÃO copia foreign keys para tabelas de outros schemas
    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."${table}" (LIKE "public"."${table}" INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)`
    )
  }
  if (skipped.length > 0) {
    console.warn(`[createTenantSchema] ${schemaName}: tabelas-template ausentes no public, ignoradas: ${skipped.join(', ')}`)
  }

  // Recriar sequences (autoincrement) independentes para o tenant
  for (const table of TENANT_TABLES) {
    const seqName = `${table}_code_seq`
    try {
      // Verificar se a tabela tem coluna code (autoincrement)
      const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = 'code'`,
        schemaName, table,
      )
      if (cols.length > 0) {
        await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS "${schemaName}"."${seqName}" START 1`)
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "${schemaName}"."${table}" ALTER COLUMN code SET DEFAULT nextval('"${schemaName}"."${seqName}"')`
        )
      }
    } catch {
      // Tabela pode não ter coluna code — ignorar
    }
  }
}

/**
 * Remove o schema de um tenant (CUIDADO: apaga todos os dados).
 */
export async function dropTenantSchema(schemaName: string): Promise<void> {
  if (!/^tenant_[a-zA-Z0-9_]+$/.test(schemaName)) {
    throw new Error(`Nome de schema inválido: ${schemaName}`)
  }
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
}

/**
 * Verifica se o schema de um tenant existe.
 */
export async function tenantSchemaExists(schemaName: string): Promise<boolean> {
  const result = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) as exists`,
    schemaName,
  )
  return result[0]?.exists ?? false
}

/**
 * Lista todos os schemas de tenant existentes.
 */
export async function listTenantSchemas(): Promise<string[]> {
  const result = await prisma.$queryRawUnsafe<Array<{ schema_name: string }>>(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%' ORDER BY schema_name`,
  )
  return result.map(r => r.schema_name)
}

export { TENANT_TABLES }
