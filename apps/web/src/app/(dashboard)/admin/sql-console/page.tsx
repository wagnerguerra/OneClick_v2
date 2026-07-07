'use client'

/**
 * Console SQL — master-only, estilo DBeaver: árvore de tabelas/campos à esquerda;
 * à direita duas abas — "Dados" (clica na tabela → colunas + linhas) e "Editor SQL".
 * Roda SQL cru contra o banco do AMBIENTE atual (produção = banco de produção).
 * Gate duplo: masterProcedure + isMaster.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Database, Play, Loader2, AlertTriangle, Table2, ChevronRight, ChevronDown, KeyRound, Search, RefreshCw, Terminal, TableProperties, Rows3, ArrowUp, ArrowDown } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

type DbInfo = {
  database: string; usuario: string; versao: string; host: string | null
  porta: number | null; tamanho: string; encoding: string; tabelas: number
  conexoes: number; inicioServidor: string | null
}

// Monaco (editor do VS Code) é pesado — lazy load, sem SSR.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-[220px] bg-muted flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>,
})

const MODULE_COLOR = 'var(--mod-ajuda, #0891b2)'
const tint = (pct: number) => `color-mix(in srgb, ${MODULE_COLOR} ${pct}%, transparent)`

type RunResult =
  | { ok: true; type: 'rows'; columns: string[]; rows: Array<Record<string, unknown>>; rowCount: number; ms: number }
  | { ok: true; type: 'command'; rowCount: number; ms: number }
  | { ok: false; error: string; ms: number }

type SchemaTable = { table: string; columns: Array<{ name: string; type: string; nullable: boolean }> }
type Aba = 'dados' | 'editor'

async function runSql(sql: string): Promise<RunResult> {
  try { return await (trpc as any).sqlConsole.run.mutate({ sql }) as RunResult }
  catch (e) { return { ok: false, error: (e as Error).message, ms: 0 } }
}

export default function SqlConsolePage() {
  const { profile, loading } = useCurrentUserProfile()

  // Tema resolvido (segue a classe .dark do <html>, reativo ao toggle).
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'))
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const [schema, setSchema] = useState<SchemaTable[]>([])
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [aberta, setAberta] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('dados')

  // Aba Dados
  const [dadosResult, setDadosResult] = useState<RunResult | null>(null)
  const [dadosLoading, setDadosLoading] = useState(false)
  const [dadosTotal, setDadosTotal] = useState<number | null>(null)

  // Aba Editor
  const [sql, setSql] = useState('SELECT * FROM clientes LIMIT 50;')
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)

  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null)
  const [dbModal, setDbModal] = useState(false)

  const carregarSchema = useCallback(async () => {
    setSchemaLoading(true)
    try { setSchema(await (trpc as any).sqlConsole.schema.query() as SchemaTable[]) }
    catch { /* silencioso */ } finally { setSchemaLoading(false) }
  }, [])
  useEffect(() => {
    if (!profile?.isMaster) return
    void carregarSchema()
    void (trpc as any).sqlConsole.dbInfo.query().then(setDbInfo).catch(() => {})
  }, [profile?.isMaster, carregarSchema])

  const abrirDados = useCallback(async (table: string) => {
    setSel(table); setAba('dados'); setDadosLoading(true); setDadosResult(null); setDadosTotal(null)
    setDadosResult(await runSql(`SELECT * FROM ${table} LIMIT 100;`))
    setDadosLoading(false)
    // Total real de linhas (best-effort, depois do grid já aparecer).
    const c = await runSql(`SELECT count(*)::int AS total FROM ${table};`)
    if (c.ok && c.type === 'rows' && c.rows[0]) setDadosTotal(Number(c.rows[0].total))
  }, [])

  const executar = useCallback(async () => {
    if (!sql.trim() || running) return
    setRunning(true); setResult(null)
    setResult(await runSql(sql))
    setRunning(false)
  }, [sql, running])
  // Ref pro Ctrl+Enter do Monaco chamar sempre o executar mais recente.
  const executarRef = useRef(executar)
  useEffect(() => { executarRef.current = executar }, [executar])

  const tabelasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    if (!q) return schema
    return schema.filter(t => t.table.toLowerCase().includes(q) || t.columns.some(c => c.name.toLowerCase().includes(q)))
  }, [schema, filtro])

  const toggle = (t: string) => setAberta(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
  const colunasSel = useMemo(() => schema.find(t => t.table === sel)?.columns ?? [], [schema, sel])

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
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
      {/* Modal de detalhes do banco */}
      <Dialog open={dbModal} onOpenChange={setDbModal}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={Database} color="cyan">
            <DialogTitle>Detalhes do banco</DialogTitle>
            <DialogDescription>Conexão do ambiente atual (produção mostra o banco de produção).</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {dbInfo ? (
              <dl className="divide-y divide-border rounded-lg border border-border overflow-hidden text-[13px]">
                <DbRow label="Banco" value={dbInfo.database} mono strong />
                <DbRow label="Usuário" value={dbInfo.usuario} mono />
                <DbRow label="Host" value={dbInfo.host ?? 'socket local'} mono />
                <DbRow label="Porta" value={dbInfo.porta != null ? String(dbInfo.porta) : '—'} mono />
                <DbRow label="Tamanho" value={dbInfo.tamanho} />
                <DbRow label="Tabelas (public)" value={String(dbInfo.tabelas)} />
                <DbRow label="Conexões ativas" value={String(dbInfo.conexoes)} />
                <DbRow label="Encoding" value={dbInfo.encoding} />
                <DbRow label="Servidor no ar desde" value={dbInfo.inicioServidor ?? '—'} />
                <DbRow label="Versão" value={dbInfo.versao} />
              </dl>
            ) : (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Header padrão de módulo (skill padroniza-modulo — inline /orcamentos) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
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
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Sidebar — árvore de tabelas */}
        <div className="w-72 shrink-0 flex flex-col rounded-xl border border-border bg-card shadow-sm overflow-hidden min-h-0">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border" style={{ background: tint(10) }}>
            <TableProperties className="h-4 w-4 shrink-0" style={{ color: MODULE_COLOR }} />
            <span className="text-[13px] font-semibold">Tabelas</span>
            <span className="ml-auto text-[11px] font-medium tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: tint(18), color: MODULE_COLOR }}>{schema.length}</span>
            <button onClick={carregarSchema} title="Recarregar" className="text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw className={`h-3.5 w-3.5 ${schemaLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="px-2.5 py-2 border-b border-border/60">
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-ring">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar tabela ou campo"
                className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 overflow-auto py-1.5">
            {schemaLoading && schema.length === 0 ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : (
              tabelasFiltradas.map(t => {
                const ativa = sel === t.table
                return (
                  <div key={t.table} className="px-1.5">
                    <div
                      className="flex items-center gap-1 px-1.5 py-1 rounded-lg group cursor-pointer transition-colors"
                      style={ativa ? { background: tint(16) } : undefined}
                      onMouseEnter={e => { if (!ativa) (e.currentTarget as HTMLElement).style.background = tint(8) }}
                      onMouseLeave={e => { if (!ativa) (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <button onClick={() => toggle(t.table)} className="text-muted-foreground hover:text-foreground shrink-0">
                        {aberta.has(t.table) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <Table2 className="h-4 w-4 shrink-0" style={{ color: MODULE_COLOR }} />
                      <button onClick={() => abrirDados(t.table)} title="Ver dados" className="flex-1 text-left text-[13px] font-medium truncate" style={ativa ? { color: MODULE_COLOR } : undefined}>
                        {t.table}
                      </button>
                      <span className="text-[10px] text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100 shrink-0 pr-1">{t.columns.length}</span>
                    </div>
                    {aberta.has(t.table) && (
                      <div className="ml-[18px] mt-0.5 mb-1 border-l-2 pl-2.5 py-0.5 space-y-px" style={{ borderColor: tint(30) }}>
                        {t.columns.map(c => (
                          <div key={c.name} className="flex items-center gap-1.5 py-0.5 text-[12px] font-mono">
                            <KeyRound className={`h-3 w-3 shrink-0 ${c.name === 'id' ? 'text-amber-500' : 'text-transparent'}`} />
                            <span className="truncate text-foreground/90">{c.name}</span>
                            <span className="ml-auto shrink-0 text-[10px] px-1 rounded bg-muted/70 text-muted-foreground">{c.type}{c.nullable ? '' : ' •'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Painel direito — abas */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Barra de abas */}
          <div className="flex items-center gap-1 px-2 pt-2 border-b border-border bg-muted/20 shrink-0">
            <TabBtn active={aba === 'dados'} onClick={() => setAba('dados')} icon={<Rows3 className="h-3.5 w-3.5" />}>
              Dados{sel ? <span className="font-mono opacity-70"> · {sel}</span> : ''}
            </TabBtn>
            <TabBtn active={aba === 'editor'} onClick={() => setAba('editor')} icon={<Terminal className="h-3.5 w-3.5" />}>
              Editor SQL
            </TabBtn>
            {dbInfo && (
              <button
                type="button"
                onClick={() => setDbModal(true)}
                title="Ver detalhes do banco"
                className="ml-auto mr-2 mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] hover:brightness-95 transition"
                style={{ background: tint(8) }}
              >
                <Database className="h-3 w-3" style={{ color: MODULE_COLOR }} />
                <span className="text-muted-foreground">banco:</span>
                <span className="font-mono font-semibold" style={{ color: MODULE_COLOR }}>{dbInfo.database}</span>
              </button>
            )}
          </div>

          {/* Conteúdo */}
          {aba === 'dados' ? (
            <div className="flex-1 flex flex-col min-h-0">
              {sel && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border shrink-0" style={{ background: tint(8) }}>
                  <Table2 className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />
                  <span className="text-[13px] font-semibold font-mono">{sel}</span>
                  {dadosResult?.ok && dadosResult.type === 'rows' && (
                    <span className="text-[11px] text-muted-foreground">
                      {dadosTotal !== null
                        ? <>— {dadosTotal.toLocaleString('pt-BR')} linha(s){dadosTotal > dadosResult.rowCount ? ` · mostrando ${dadosResult.rowCount}` : ''} · {dadosResult.ms} ms</>
                        : <>— {dadosResult.rowCount} linha(s) · {dadosResult.ms} ms</>}
                    </span>
                  )}
                  <button onClick={() => abrirDados(sel)} title="Recarregar" className="ml-auto text-muted-foreground hover:text-foreground">
                    <RefreshCw className={`h-3.5 w-3.5 ${dadosLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
              {/* Resumo das colunas da tabela selecionada */}
              {sel && colunasSel.length > 0 && (
                <div className="shrink-0 border-b border-border px-3 py-2 bg-muted/10">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{colunasSel.length} colunas · <span className="text-rose-500">•</span> = NOT NULL</div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-auto">
                    {colunasSel.map(c => (
                      <span key={c.name} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] shadow-sm">
                        {c.name === 'id' && <KeyRound className="h-3 w-3 text-amber-500 shrink-0" />}
                        <span className="font-mono font-medium text-foreground/90">{c.name}</span>
                        <span className="text-muted-foreground">{c.type}</span>
                        {!c.nullable && <span title="NOT NULL" className="text-rose-500 font-bold leading-none">•</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <ResultGrid res={dadosResult} loading={dadosLoading}
                empty={<><TableProperties className="h-8 w-8 opacity-30" /><span className="text-[13px]">Clique numa tabela à esquerda para ver os dados.</span></>} />
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Editor escuro */}
              <div className="shrink-0 border-b border-border">
                <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 border-b border-border">
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/80">
                    <Terminal className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Query
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground">Ctrl / Cmd + Enter</span>
                    <Button variant="success" size="sm" className="h-7" onClick={executar} disabled={running || !sql.trim()}>
                      {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Executar
                    </Button>
                  </div>
                </div>
                <MonacoEditor
                  height="220px"
                  defaultLanguage="sql"
                  value={sql}
                  onChange={v => setSql(v ?? '')}
                  theme={isDark ? 'vs-dark' : 'light'}
                  onMount={(editor: any, monaco: any) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => executarRef.current())
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    padding: { top: 10, bottom: 10 },
                    renderLineHighlight: 'line',
                    tabSize: 2,
                    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  }}
                />
              </div>
              <ResultGrid res={result} loading={running}
                empty={<><Database className="h-8 w-8 opacity-30" /><span className="text-[13px]">Execute uma query para ver o resultado.</span></>} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${active ? 'bg-card' : 'text-muted-foreground hover:text-foreground border-transparent'}`}
      style={active ? { color: MODULE_COLOR, borderColor: MODULE_COLOR } : undefined}>
      {icon}{children}
    </button>
  )
}

function ResultGrid({ res, loading, empty }: { res: RunResult | null; loading?: boolean; empty: React.ReactNode }) {
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // Reseta a ordenação a cada novo resultado.
  useEffect(() => { setSortCol(null); setSortDir('asc') }, [res])

  const rows = useMemo(() => {
    if (!res || res.ok === false || res.type !== 'rows' || !sortCol) return res && res.ok && res.type === 'rows' ? res.rows : []
    const dir = sortDir === 'asc' ? 1 : -1
    return [...res.rows].sort((a, b) => cmpVal(a[sortCol], b[sortCol]) * dir)
  }, [res, sortCol, sortDir])

  const clicarCol = (c: string) => {
    if (sortCol === c) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(c); setSortDir('asc') }
  }

  if (loading && !res) return <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!res) return <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">{empty}</div>
  if (res.ok === false) {
    return (
      <div className="flex-1 overflow-auto bg-rose-500/5 min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[12px] font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Erro · {res.ms} ms
        </div>
        <pre className="px-4 py-3 text-[13px] font-mono whitespace-pre-wrap text-rose-700 dark:text-rose-300">{res.error}</pre>
      </div>
    )
  }
  if (res.type === 'command') {
    return <div className="flex items-center gap-2 px-4 py-3 text-[13px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 shrink-0">
      <div className="h-2 w-2 rounded-full bg-emerald-500" /> OK — {res.rowCount} linha(s) afetada(s) · {res.ms} ms
    </div>
  }
  return (
    <div className="flex-1 overflow-auto min-h-0">
      <table className="w-full text-[12px] border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>{res.columns.map(c => (
            <th key={c} onClick={() => clicarCol(c)}
              className="text-left font-semibold px-3 py-2 border-b-2 whitespace-nowrap text-foreground cursor-pointer select-none hover:brightness-95"
              style={{ background: tint(sortCol === c ? 22 : 12), borderColor: tint(35) }}>
              <span className="inline-flex items-center gap-1">
                {c}
                {sortCol === c && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" style={{ color: MODULE_COLOR }} /> : <ArrowDown className="h-3 w-3" style={{ color: MODULE_COLOR }} />)}
              </span>
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/40 transition-colors odd:bg-muted/15">
              {res.columns.map(c => (
                <td key={c} className="px-3 py-1.5 border-b border-border/50 font-mono whitespace-nowrap max-w-[420px] truncate" title={fmt(row[c])}>{cell(row[c])}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={Math.max(1, res.columns.length)} className="px-3 py-4 text-center text-muted-foreground">Nenhuma linha.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/** Comparador estável: null por último; número numérico; resto por string (numeric). */
function cmpVal(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
}

function DbRow({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 odd:bg-muted/20">
      <span className="text-muted-foreground shrink-0 w-40">{label}</span>
      <span className={`flex-1 min-w-0 break-words ${mono ? 'font-mono' : ''} ${strong ? 'font-semibold' : ''}`} style={strong ? { color: MODULE_COLOR } : undefined}>{value}</span>
    </div>
  )
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function cell(v: unknown) {
  if (v === null || v === undefined) return <span className="text-muted-foreground/50 italic">null</span>
  if (typeof v === 'boolean') return <span className={v ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{String(v)}</span>
  if (typeof v === 'number') return <span className="text-sky-700 dark:text-sky-300">{String(v)}</span>
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
