import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'

export type SqlConsoleResult =
  | { ok: true; type: 'rows'; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; ms: number }
  | { ok: true; type: 'command'; rowCount: number; ms: number }
  | { ok: false; error: string; ms: number }

/**
 * Console SQL master-only. Executa SQL cru contra o banco do AMBIENTE atual
 * (em produção = banco de produção). Ferramenta interna de diagnóstico —
 * gateada por masterProcedure no router. NÃO expor a não-master.
 */
@Injectable()
export class SqlConsoleService {
  private readonly logger = new Logger(SqlConsoleService.name)

  /** Comandos que retornam linhas (usam $queryRawUnsafe); o resto usa $executeRawUnsafe. */
  private retornaLinhas(sql: string): boolean {
    const primeira = sql.trim().replace(/^\(+/, '').split(/\s+/)[0]?.toUpperCase() ?? ''
    return ['SELECT', 'WITH', 'SHOW', 'EXPLAIN', 'TABLE', 'VALUES'].includes(primeira)
  }

  /** Torna um valor JSON-serializável (BigInt/Date/Buffer viram string). */
  private serializar(v: unknown): unknown {
    if (typeof v === 'bigint') return v.toString()
    if (v instanceof Date) return v.toISOString()
    if (v && typeof v === 'object' && (v as { type?: string }).type === 'Buffer') return '[binário]'
    return v
  }

  /** Detalhes do banco do ambiente atual — nome no cabeçalho + modal de detalhes. */
  async dbInfo(): Promise<{
    database: string; usuario: string; versao: string; host: string | null;
    porta: number | null; tamanho: string; encoding: string; tabelas: number;
    conexoes: number; inicioServidor: string | null
  }> {
    const rows = await prisma.$queryRawUnsafe<Array<{
      database: string; usuario: string; versao: string; host: string | null;
      porta: number | null; tamanho: string; encoding: string; tabelas: number;
      conexoes: number; inicio_servidor: string | null
    }>>(
      `SELECT
         current_database() AS database,
         current_user       AS usuario,
         version()          AS versao,
         inet_server_addr()::text AS host,
         inet_server_port() AS porta,
         pg_size_pretty(pg_database_size(current_database())) AS tamanho,
         current_setting('server_encoding') AS encoding,
         (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE')::int AS tabelas,
         (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database())::int AS conexoes,
         to_char(pg_postmaster_start_time(), 'DD/MM/YYYY HH24:MI') AS inicio_servidor`,
    )
    const r = rows[0]
    if (!r) return { database: '?', usuario: '?', versao: '?', host: null, porta: null, tamanho: '?', encoding: '?', tabelas: 0, conexoes: 0, inicioServidor: null }
    return {
      database: r.database, usuario: r.usuario, versao: r.versao, host: r.host,
      porta: r.porta != null ? Number(r.porta) : null, tamanho: r.tamanho,
      encoding: r.encoding, tabelas: Number(r.tabelas), conexoes: Number(r.conexoes),
      inicioServidor: r.inicio_servidor,
    }
  }

  /** Estrutura do banco (schema public): tabelas + colunas, pra árvore tipo DBeaver. */
  async schema(): Promise<Array<{ table: string; columns: Array<{ name: string; type: string; nullable: boolean }> }>> {
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string }>>(
      `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position`,
    )
    const map = new Map<string, Array<{ name: string; type: string; nullable: boolean }>>()
    for (const r of rows) {
      if (!map.has(r.table_name)) map.set(r.table_name, [])
      map.get(r.table_name)!.push({ name: r.column_name, type: r.data_type, nullable: r.is_nullable === 'YES' })
    }
    return Array.from(map.entries()).map(([table, columns]) => ({ table, columns }))
  }

  async run(sql: string): Promise<SqlConsoleResult> {
    const inicio = Date.now()
    const query = (sql ?? '').trim()
    if (!query) return { ok: false, error: 'Query vazia.', ms: 0 }
    try {
      if (this.retornaLinhas(query)) {
        const raw = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(query)
        const rows = raw.map(r => {
          const o: Record<string, unknown> = {}
          for (const [k, val] of Object.entries(r)) o[k] = this.serializar(val)
          return o
        })
        const columns = rows.length > 0 ? Object.keys(rows[0]!) : []
        return { ok: true, type: 'rows', columns, rows, rowCount: rows.length, ms: Date.now() - inicio }
      }
      const count = await prisma.$executeRawUnsafe(query)
      return { ok: true, type: 'command', rowCount: count, ms: Date.now() - inicio }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      this.logger.warn(`[SqlConsole] erro: ${msg}`)
      return { ok: false, error: msg, ms: Date.now() - inicio }
    }
  }
}
