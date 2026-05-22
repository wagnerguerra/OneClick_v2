'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bug, RefreshCw, Search, Loader2, CheckCircle2, AlertTriangle, AlertOctagon,
  ExternalLink, Trash2, ChevronDown, ChevronUp, User as UserIcon, RotateCw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  FileText, BarChart3, ListTree, StickyNote, Save, TrendingUp,
} from 'lucide-react'
import {
  Button, Input, Card, cn, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = '#dc2626' // red

const LEVEL_META: Record<string, { label: string; cor: string; icon: typeof Bug }> = {
  ERROR:     { label: 'Erro',     cor: 'rose',   icon: AlertOctagon },
  WARN:      { label: 'Warning',  cor: 'amber',  icon: AlertTriangle },
  REJECTION: { label: 'Promise',  cor: 'violet', icon: Bug },
}

const LEVEL_CHIP_CLS: Record<string, string> = {
  rose:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800',
  amber:  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  violet: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-800',
}

function fmtRelative(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s atrás`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min atrás`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d atrás`
  return date.toLocaleDateString('pt-BR')
}

interface ErrorRow {
  id: string
  hash: string
  level: 'ERROR' | 'WARN' | 'REJECTION'
  message: string
  stack: string | null
  url: string | null
  userAgent: string | null
  environment: string
  modulo: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
  user:       { id: string; name: string; image: string | null } | null
  resolvedBy: { id: string; name: string } | null
}

export default function ErrosClientePage() {
  const [data, setData] = useState<ErrorRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<{ total: number; abertos: number; errors: number; warns: number; rejections: number; ultimos24h: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(30)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'__all__' | 'ERROR' | 'WARN' | 'REJECTION'>('__all__')
  const [resolvedFilter, setResolvedFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'lista' | 'analise'>('lista')

  // Anotações por erro: cache local de notas + autor + status de save
  const [notesById, setNotesById] = useState<Record<string, { notas: string; autor: string | null; atualizadoEm: string | null; carregado: boolean }>>({})
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({})
  const saveNotesTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.clientError as any).list.query({
        page, limit,
        search: debouncedSearch || undefined,
        level: levelFilter === '__all__' ? undefined : levelFilter,
        resolved: resolvedFilter,
      })
      setData(result.data); setTotal(result.total)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, levelFilter, resolvedFilter])

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.clientError as any).getStats.query()
      setStats(s)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])
  useEffect(() => { void fetchStats() }, [fetchStats])

  // SSE removido daqui — o ClientErrorBadge no header já mantém um EventSource
  // pro mesmo endpoint. Duplicar ocupa 2 slots de conexão HTTP/1.1 (limite 6
  // por origem) e satura junto com o SSE de notificações, fazendo mutations
  // ficarem na fila e travarem. fetchData() é disparado manualmente após cada
  // ação do usuário (handleResolved, handleResolveAll, handleDeleteResolved).

  function toggleExpand(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
      // Carrega notas se ainda não foi carregado
      if (!notesById[id]?.carregado) {
        void (async () => {
          try {
            const r = await (trpc.clientError as any).getNotas.query({ id }) as { notas: string; autor: string | null; atualizadoEm: string | null }
            setNotesById(prev => ({ ...prev, [id]: { notas: r.notas ?? '', autor: r.autor, atualizadoEm: r.atualizadoEm, carregado: true } }))
          } catch { setNotesById(prev => ({ ...prev, [id]: { notas: '', autor: null, atualizadoEm: null, carregado: true } })) }
        })()
      }
    }
    setExpanded(next)
  }

  function setNotaLocal(id: string, notas: string) {
    setNotesById(prev => ({ ...prev, [id]: { ...(prev[id] ?? { autor: null, atualizadoEm: null, carregado: true }), notas } }))
    // Debounce save 800ms
    if (saveNotesTimers.current[id]) clearTimeout(saveNotesTimers.current[id])
    saveNotesTimers.current[id] = setTimeout(() => { void persistNota(id, notas) }, 800)
  }

  async function persistNota(id: string, notas: string) {
    setSavingNotes(s => ({ ...s, [id]: true }))
    try {
      await callMutation('clientError.updateNotas', { id, notas })
      // Recarrega meta (autor/timestamp) após salvar
      try {
        const r = await (trpc.clientError as any).getNotas.query({ id }) as { notas: string; autor: string | null; atualizadoEm: string | null }
        setNotesById(prev => ({ ...prev, [id]: { notas: r.notas ?? '', autor: r.autor, atualizadoEm: r.atualizadoEm, carregado: true } }))
      } catch { /* silent */ }
    } catch (e) {
      alerts.error('Erro ao salvar nota', (e as Error).message)
    } finally {
      setSavingNotes(s => ({ ...s, [id]: false }))
    }
  }

  async function handleResolved(id: string, resolved: boolean) {
    // Optimistic update — feedback visual instantâneo.
    // Se o filtro é 'open' e estamos resolvendo, a row some imediatamente.
    // Se o filtro é 'resolved' e estamos reabrindo, idem.
    // Caso contrário, atualiza o resolvedAt local.
    const prevData = data
    const prevTotal = total
    setData(curr => {
      if (!resolved && resolvedFilter === 'open') {
        return curr.filter(r => r.id !== id)
      }
      if (resolved && resolvedFilter === 'resolved') {
        return curr.filter(r => r.id !== id)
      }
      return curr.map(r => r.id === id
        ? { ...r, resolvedAt: resolved ? null : new Date().toISOString() }
        : r,
      )
    })
    if ((!resolved && resolvedFilter === 'open') || (resolved && resolvedFilter === 'resolved')) {
      setTotal(t => Math.max(0, t - 1))
    }
    const t0 = performance.now()
    const route = resolved ? 'clientError.markUnresolved' : 'clientError.markResolved'
    console.info(`[erros-cliente] POST /trpc/${route}`, { id })

    // Fetch nativo direto — bypassa qualquer issue do trpc client (batching, links, etc).
    // tRPC v11 sem transformer: body = input direto (sem wrapper { json: ... }).
    try {
      const res = await fetch(`${getApiUrl()}/trpc/${route}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const ms = Math.round(performance.now() - t0)
      const text = await res.text()
      let payload: any = null
      try { payload = JSON.parse(text) } catch { /* não-JSON */ }

      if (!res.ok || payload?.error) {
        const errMsg = payload?.error?.message ?? `HTTP ${res.status}`
        console.error(`[erros-cliente] mutation FALHOU em ${ms}ms — status=${res.status}`, payload)
        setData(prevData)
        setTotal(prevTotal)
        alerts.error('Falha ao resolver', `${errMsg}\n\nstatus=${res.status} · tempo=${ms}ms\nRota: ${route}`)
        return
      }

      console.info(`[erros-cliente] mutation OK em ${ms}ms`, payload?.result?.data)
      void fetchData()
      void fetchStats()
    } catch (err) {
      const ms = Math.round(performance.now() - t0)
      console.error(`[erros-cliente] fetch FALHOU em ${ms}ms`, err)
      setData(prevData)
      setTotal(prevTotal)
      const msg = (err as Error)?.message ?? String(err)
      alerts.error('Falha de rede', `${msg}\n\ntempo=${ms}ms`)
    }
  }

  // Helper: chama uma mutation tRPC via fetch nativo (bypassa trpc client).
  // Necessário enquanto investigamos por que o trpc client trava nessas rotas.
  async function callMutation<T = unknown>(route: string, input: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${getApiUrl()}/trpc/${route}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    const text = await res.text()
    let payload: any = null
    try { payload = JSON.parse(text) } catch { /* não-JSON */ }
    if (!res.ok || payload?.error) {
      throw new Error(payload?.error?.message ?? `HTTP ${res.status}`)
    }
    return payload?.result?.data as T
  }

  async function handleResolveAll() {
    const ok = await alerts.confirm({
      title: 'Marcar todos como resolvidos',
      text: `Os ${stats?.abertos ?? 0} erros abertos serão marcados como resolvidos.`,
      confirmText: 'Resolver todos',
    })
    if (!ok) return
    try {
      await callMutation('clientError.markAllResolved')
      void fetchData(); void fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteResolved() {
    const ok = await alerts.confirm({
      title: 'Excluir resolvidos',
      text: 'Todos os erros marcados como resolvidos serão excluídos permanentemente.',
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      const r = await callMutation<{ count: number }>('clientError.deleteResolved')
      await alerts.success('Removidos', `${r.count} erros excluídos.`)
      void fetchData(); void fetchStats()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <Bug className="h-6 w-6" />
          </div>
          <div>
            <h1>Erros do navegador</h1>
            <p className="text-sm text-muted-foreground">Captura em tempo real — só ambiente de desenvolvimento</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void fetchData(); void fetchStats() }} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          {(stats?.abertos ?? 0) > 0 && (
            <Button size="sm" onClick={handleResolveAll} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolver todos
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDeleteResolved} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50">
            <Trash2 className="h-3.5 w-3.5" /> Limpar resolvidos
          </Button>
        </div>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <StatCard icon={Bug}            label="Total"       value={stats?.total ?? 0} color="slate" />
          <StatCard icon={AlertOctagon}   label="Abertos"     value={stats?.abertos ?? 0} color="rose" />
          <StatCard icon={AlertOctagon}   label="Errors"      value={stats?.errors ?? 0} color="rose" />
          <StatCard icon={AlertTriangle}  label="Warnings"    value={stats?.warns ?? 0} color="amber" />
          <StatCard icon={Bug}            label="Rejections"  value={stats?.rejections ?? 0} color="violet" />
          <StatCard icon={RotateCw}       label="Últimas 24h" value={stats?.ultimos24h ?? 0} color="sky" />
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'lista' | 'analise')}>
        <TabsList>
          <TabsTrigger value="lista" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Lista</TabsTrigger>
          <TabsTrigger value="analise" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Análise</TabsTrigger>
        </TabsList>

        <TabsContent value="analise" className="mt-4">
          <AnaliseTab />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{[20, 30, 50, 100].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={resolvedFilter} onValueChange={v => { setResolvedFilter(v as any); setPage(1) }}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Abertos</SelectItem>
                <SelectItem value="resolved">Resolvidos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={v => { setLevelFilter(v as any); setPage(1) }}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os níveis</SelectItem>
                <SelectItem value="ERROR">Erros</SelectItem>
                <SelectItem value="WARN">Warnings</SelectItem>
                <SelectItem value="REJECTION">Promise rejections</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Mensagem, URL, stack..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 w-full sm:w-[260px] text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Nível</TableHead>
              <TableHead>Mensagem</TableHead>
              <TableHead className="w-[80px] text-center">Ocorrências</TableHead>
              <TableHead className="w-[140px]">Última vez</TableHead>
              <TableHead className="w-[160px]">Usuário</TableHead>
              <TableHead className="w-[120px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6}><div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6}><div className="text-center py-10 text-muted-foreground"><CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum erro {resolvedFilter === 'open' ? 'aberto' : ''}.</p></div></TableCell></TableRow>
            ) : data.map(e => {
              const meta = LEVEL_META[e.level]
              const Icon = meta.icon
              const exp = expanded.has(e.id)
              return (
                <Fragment key={e.id}>
                  <TableRow className={cn('hover:bg-muted/40 cursor-pointer', e.resolvedAt && 'opacity-60')} onClick={() => toggleExpand(e.id)}>
                    <TableCell>
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', LEVEL_CHIP_CLS[meta.cor])}>
                        <Icon className="h-2.5 w-2.5" />
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <button type="button" className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
                          {exp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-1.5 flex-wrap">
                            {e.modulo && (
                              <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50 text-[10px] font-semibold uppercase tracking-wide">
                                {e.modulo}
                              </span>
                            )}
                            <p className="text-[12px] font-medium text-foreground line-clamp-2 flex-1">{e.message}</p>
                          </div>
                          {e.url && (
                            <p className="text-[10px] text-muted-foreground truncate font-mono mt-0.5" title={e.url}>{e.url}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold tabular-nums">
                        {e.count}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{fmtRelative(e.lastSeenAt)}</span>
                    </TableCell>
                    <TableCell>
                      {e.user ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                          <UserIcon className="h-3 w-3 text-muted-foreground" />
                          {e.user.name}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">Anônimo</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      {e.resolvedAt ? (
                        <Button variant="ghost" size="sm" onClick={(ev) => { ev.stopPropagation(); void handleResolved(e.id, true) }} className="gap-1 h-7 text-[11px]">
                          <RotateCw className="h-3 w-3" /> Reabrir
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={(ev) => { ev.stopPropagation(); void handleResolved(e.id, false) }} className="gap-1 h-7 text-[11px] text-emerald-700 hover:text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Resolver
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {exp && (
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={6}>
                        <div className="space-y-3 p-2">
                          {e.stack && (
                            <div>
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Stack trace</div>
                              <pre className="text-[10px] font-mono bg-card border rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                {e.stack}
                              </pre>
                            </div>
                          )}

                          {/* Anotações — KB interna por erro */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <StickyNote className="h-3 w-3" /> Notas de diagnóstico
                                {notesById[e.id]?.autor && notesById[e.id]?.atualizadoEm && (
                                  <span className="font-normal text-muted-foreground/70 normal-case">
                                    · {notesById[e.id]!.autor} {fmtRelative(notesById[e.id]!.atualizadoEm!)}
                                  </span>
                                )}
                              </div>
                              {savingNotes[e.id] && (
                                <span className="text-[10px] text-sky-600 flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                                </span>
                              )}
                            </div>
                            <textarea
                              value={notesById[e.id]?.notas ?? ''}
                              onChange={(ev) => setNotaLocal(e.id, ev.target.value)}
                              placeholder="Cole aqui o que descobriu sobre o bug, qual foi o fix, commit, contexto, etc. Salva automaticamente em 800ms."
                              className="w-full min-h-[80px] text-[11px] font-mono bg-card border border-border rounded p-2 resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                              disabled={!notesById[e.id]?.carregado}
                            />
                          </div>

                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                            <span><strong>Hash:</strong> <code>{e.hash}</code></span>
                            <span><strong>1ª vez:</strong> {fmtRelative(e.firstSeenAt)}</span>
                            <span><strong>Env:</strong> {e.environment}</span>
                            <span><strong>Módulo:</strong> {e.modulo ?? '—'}</span>
                            {e.userAgent && <span className="truncate max-w-[400px]" title={e.userAgent}><strong>UA:</strong> {e.userAgent}</span>}
                            {e.resolvedAt && e.resolvedBy && (
                              <span className="text-emerald-600"><strong>Resolvido por:</strong> {e.resolvedBy.name} · {fmtRelative(e.resolvedAt)}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20">
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {total === 0 ? '0 erros' : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total}`}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="text-[11px] mx-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="ghost" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Bug; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    rose:   'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
    amber:  'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    violet: 'text-violet-700 bg-violet-50 dark:bg-violet-950/30 dark:text-violet-300',
    sky:    'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
    slate:  'text-slate-700 bg-slate-50 dark:bg-slate-950/30 dark:text-slate-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Aba "Análise" — gráfico de tendência + top frequência + by URL
// ─────────────────────────────────────────────────────────────

interface TrendRow { dia: string; level: string; total: number }
interface TopRow { id: string; hash: string; level: 'ERROR' | 'WARN' | 'REJECTION'; message: string; url: string | null; count: number; lastSeenAt: string; resolvedAt: string | null }
interface UrlRow { rota: string; errosUnicos: number; ocorrencias: number; abertos: number }

function AnaliseTab() {
  const [dias, setDias] = useState(30)
  const [trend, setTrend] = useState<TrendRow[]>([])
  const [top, setTop] = useState<TopRow[]>([])
  const [byUrl, setByUrl] = useState<UrlRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [t, p, u] = await Promise.all([
        (trpc.clientError as any).getTrend.query({ dias }) as Promise<TrendRow[]>,
        (trpc.clientError as any).getTopByFrequency.query({ limit: 10 }) as Promise<TopRow[]>,
        (trpc.clientError as any).getByUrl.query({ limit: 20 }) as Promise<UrlRow[]>,
      ])
      setTrend(t); setTop(p); setByUrl(u)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [dias])

  useEffect(() => { void fetchAll() }, [fetchAll])

  // Pivot do trend pra formato wide do Recharts: { dia, ERROR, WARN, REJECTION }
  const trendData = useMemo(() => {
    const map = new Map<string, { dia: string; ERROR: number; WARN: number; REJECTION: number }>()
    for (const r of trend) {
      const cur = map.get(r.dia) ?? { dia: r.dia, ERROR: 0, WARN: 0, REJECTION: 0 }
      ;(cur as any)[r.level] = r.total
      map.set(r.dia, cur)
    }
    return Array.from(map.values()).sort((a, b) => a.dia.localeCompare(b.dia))
  }, [trend])

  const maxOcorrencias = useMemo(() => Math.max(1, ...byUrl.map(u => u.ocorrencias)), [byUrl])

  if (loading) {
    return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando análise...</div>
  }

  return (
    <div className="space-y-4">
      {/* Tendência temporal */}
      <Card>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Tendência — últimos {dias} dias</h2>
          </div>
          <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
            <SelectTrigger className="h-8 w-[100px] text-xs bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="p-4 h-[280px]">
          {trendData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: '11px' }}
                  labelFormatter={(d) => new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="ERROR"     stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} name="Errors" />
                <Line type="monotone" dataKey="WARN"      stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} name="Warnings" />
                <Line type="monotone" dataKey="REJECTION" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Rejections" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 10 por frequência */}
        <Card>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
            <ListTree className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Top 10 — por frequência</h2>
          </div>
          <div className="divide-y divide-border/40">
            {top.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sem dados</div>}
            {top.map((r, i) => {
              const meta = LEVEL_META[r.level]
              return (
                <div key={r.id} className="px-4 py-2.5 flex items-start gap-3 hover:bg-muted/30">
                  <span className="text-[11px] font-bold text-muted-foreground tabular-nums w-6 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] font-semibold border', LEVEL_CHIP_CLS[meta.cor])}>
                        {meta.label}
                      </span>
                      {r.resolvedAt && <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-200 text-emerald-700">Resolvido</Badge>}
                    </div>
                    <p className="text-[12px] font-medium line-clamp-2 leading-tight">{r.message}</p>
                    {r.url && <p className="text-[10px] text-muted-foreground truncate font-mono">{r.url}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold tabular-nums leading-none">{r.count.toLocaleString('pt-BR')}</p>
                    <p className="text-[10px] text-muted-foreground">{fmtRelative(r.lastSeenAt)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Agrupamento por URL */}
        <Card>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold">Por rota — onde os erros nascem</h2>
          </div>
          <div className="divide-y divide-border/40 max-h-[600px] overflow-y-auto">
            {byUrl.length === 0 && <div className="px-4 py-8 text-center text-muted-foreground text-sm">Sem dados</div>}
            {byUrl.map((r) => (
              <div key={r.rota} className="px-4 py-2 hover:bg-muted/30">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <code className="text-[11px] font-mono truncate flex-1 min-w-0" title={r.rota}>{r.rota}</code>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.abertos > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1 border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-300">{r.abertos} aberto{r.abertos === 1 ? '' : 's'}</Badge>}
                    <span className="text-[10px] text-muted-foreground tabular-nums">{r.errosUnicos} único{r.errosUnicos === 1 ? '' : 's'}</span>
                    <span className="text-[11px] font-bold tabular-nums w-12 text-right">{r.ocorrencias.toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 dark:bg-rose-600 rounded-full" style={{ width: `${(r.ocorrencias / maxOcorrencias) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
