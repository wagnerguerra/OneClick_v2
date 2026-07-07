'use client'

/**
 * Console SQL — master-only, estilo DBeaver: árvore de tabelas/campos à esquerda,
 * editor + resultados à direita. Roda SQL cru contra o banco do AMBIENTE atual
 * (em produção = banco de produção). Gate duplo: masterProcedure + isMaster.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Database, Play, Loader2, AlertTriangle, Table2, ChevronRight, ChevronDown, KeyRound, Search, RefreshCw } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-ajuda, #0891b2)'

type RunResult =
  | { ok: true; type: 'rows'; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; ms: number }
  | { ok: true; type: 'command'; rowCount: number; ms: number }
  | { ok: false; error: string; ms: number }

type SchemaTable = { table: string; columns: Array<{ name: string; type: string; nullable: boolean }> }

export default function SqlConsolePage() {
  const { profile, loading } = useCurrentUserProfile()
  const [sql, setSql] = useState('SELECT * FROM clientes LIMIT 50;')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const [schema, setSchema] = useState<SchemaTable[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [aberta, setAberta] = useState<Set<string>>(new Set())

  const carregarSchema = useCallback(async () => {
    setSchemaLoading(true)
    try {
      const s = await (trpc as any).sqlConsole.schema.query()
      setSchema(s as SchemaTable[])
    } catch { /* silencioso */ } finally { setSchemaLoading(false) }
  }, [])

  useEffect(() => { if (profile?.isMaster) void carregarSchema() }, [profile?.isMaster, carregarSchema])

  const run = useCallback(async () => {
    if (!sql.trim() || running) return
    setRunning(true)
    setResult(null)
    try {
      const r = await (trpc as any).sqlConsole.run.mutate({ sql })
      setResult(r as RunResult)
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message, ms: 0 })
    } finally {
      setRunning(false)
    }
  }, [sql, running])

  const tabelasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return schema
    return schema.filter(t => t.table.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)))
  }, [schema, filtro])

  const toggle = (t: string) => setAberta(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  const selectTabela = (t: string) => setSql(`SELECT * FROM ${t} LIMIT 100;`)

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }
  if (!profile?.isMaster) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-2">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">O Console SQL é exclusivo do administrador da plataforma.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-8rem)]">
      {/* Header inline */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Database className="h-6 w-6" />
          </div>
          <div>
            <h1>Console SQL</h1>
            <p className="text-sm text-muted-foreground">Navegue pelas tabelas e execute queries no banco do ambiente atual</p>
          </div>
        </div>
        <Button variant="success" size="sm" onClick={run} disabled={running || !sql.trim()}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Executar
        </Button>
      </div>

      {/* Corpo: árvore | editor+resultado */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar — árvore de tabelas */}
        <div className="w-72 shrink-0 flex flex-col rounded-md border border-border bg-muted/20 min-h-0">
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar tabela/campo"
              className="flex-1 bg-transparent text-[13px] focus:outline-none" />
            <button onClick={carregarSchema} title="Recarregar" className="text-muted-foreground hover:text-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${schemaLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="flex-1 overflow-auto py-1">
            {schemaLoading && schema.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">{tabelasFiltradas.length} tabelas</div>
                {tabelasFiltradas.map(t => (
                  <div key={t.table}>
                    <div className="flex items-center gap-1 px-1.5 py-1 hover:bg-muted/50 rounded-sm group">
                      <button onClick={() => toggle(t.table)} className="text-muted-foreground shrink-0">
                        {aberta.has(t.table) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <Table2 className="h-3.5 w-3.5 shrink-0" style={{ color: MODULE_COLOR }} />
                      <button onClick={() => selectTabela(t.table)} title="Gerar SELECT" className="flex-1 text-left text-[13px] font-medium truncate">
                        {t.table}
                      </button>
                      <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 pr-1">{t.columns.length}</span>
                    </div>
                    {aberta.has(t.table) && (
                      <div className="ml-6 border-l border-border/60 pl-2 py-0.5">
                        {t.columns.map(c => (
                          <div key={c.name} className="flex items-center gap-1.5 py-0.5 text-[12px] font-mono">
                            <KeyRound className={`h-3 w-3 shrink-0 ${c.name === 'id' ? 'text-amber-500' : 'text-transparent'}`} />
                            <span className="truncate">{c.name}</span>
                            <span className="text-muted-foreground/70 text-[10px] ml-auto shrink-0">{c.type}{c.nullable ? '' : ' *'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Editor + resultado */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <textarea
            value={sql}
            onChange={e => setSql(e.target.value)}
            onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void run() } }}
            spellCheck={false}
            className="w-full h-40 shrink-0 rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-[13px] text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden flex flex-col">
            {!result ? (
              <div className="flex items-center justify-center h-full text-[13px] text-muted-foreground">Execute uma query para ver o resultado.</div>
            ) : result.ok === false ? (
              <div className="bg-rose-500/10 text-rose-700 dark:text-rose-300 px-3 py-2 text-[13px] font-mono whitespace-pre-wrap overflow-auto">{result.error}</div>
            ) : result.type === 'command' ? (
              <div className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-2 text-[13px]">OK — {result.rowCount} linha(s) afetada(s) · {result.ms} ms</div>
            ) : (
              <>
                <div className="bg-muted/40 px-3 py-1.5 text-[12px] text-muted-foreground border-b border-border shrink-0">{result.rowCount} linha(s) · {result.ms} ms</div>
                <div className="overflow-auto flex-1">
                  <table className="w-full text-[12px] border-collapse">
                    <thead className="sticky top-0 bg-muted/60">
                      <tr>{result.columns.map(c => <th key={c} className="text-left font-semibold px-3 py-1.5 border-b border-border whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i} className="odd:bg-muted/20">
                          {result.columns.map(c => (
                            <td key={c} className="px-3 py-1 border-b border-border/60 font-mono whitespace-nowrap max-w-[420px] truncate" title={fmt(row[c])}>{fmt(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                      {result.rows.length === 0 && <tr><td colSpan={Math.max(1, result.columns.length)} className="px-3 py-3 text-center text-muted-foreground">Nenhuma linha.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
