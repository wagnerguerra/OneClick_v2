'use client'

/**
 * Acessórias — Sincronização e mapeamento de entregas.
 *
 * Painel principal de operação:
 *  1. **Empresas** — botão pra sincronizar IDs (resolve Cliente.idAcessorias)
 *  2. **Mapeamento** — tabela "Obrigação Acessórias → Serviço OneClick"
 *  3. **Entregas** — sincronização de deliveries (manual; cron virá depois)
 *  4. **Histórico** — logs das execuções de sync
 *  5. **Explorer** — ferramenta de debug pra inspeção bruta da API (mantida pra futuro)
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap, Loader2, Play, Copy, CheckCircle2, XCircle, Database,
  ChevronRight, ChevronDown, Building2, FileSearch, Link as LinkIcon,
  History, Search, RefreshCw, AlertCircle, Trash2, Save, Plus,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)' // Sky — Administrativo

type Tab = 'companies' | 'mapping' | 'deliveries' | 'logs' | 'explorer'

interface ExploreResult {
  ok: boolean
  status: number
  error?: string
  path: string
  rateLimitRemaining?: number
  data?: unknown
}

/** Estrutura agrupada por nome de obrigação (M:N). */
interface ObligationGroup {
  nome: string
  ignorada: boolean
  observacoes: string | null
  empresaId: string | null
  servicos: Array<{
    id: string        // mapId — usado pra remover
    mapId: string
    servicoId: string
    servicoNome: string
    ativo: boolean
  }>
}

interface Suggestion {
  nome: string
  ocorrencias: number
  area: 'fiscal' | 'contabil' | 'trabalhista' | 'desconhecida'
  regime?: 'simples' | 'presumido' | 'real'
  confidence: 'alta' | 'media' | 'baixa'
  suggestedServicoId: string | null
  suggestedServicoNome: string | null
  razao: string | null
  alreadyMapped: boolean
  currentServicoIds: string[]
}

interface ServicoLite { id: string; nome: string; categoriaServico?: string | null }

interface SyncLog {
  id: string
  tipo: string
  startedAt: string
  finishedAt: string | null
  status: string
  empresasNovas: number
  empresasAtualizadas: number
  empresasIgnoradas: number
  deliveriesNovas: number
  deliveriesAtualizadas: number
  deliveriesIgnoradas: number
  erroMensagem: string | null
  parametros: unknown
  triggeredBy: string | null
}

function fmtDate(d: Date) { return d.toISOString().slice(0, 10) }
const today = new Date()
const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)

export default function AcessoriasPage() {
  const router = useRouter()
  const { profile, loading: profileLoading } = useCurrentUserProfile()
  const isAdmin = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const [tab, setTab] = useState<Tab>('companies')

  useEffect(() => {
    if (!profileLoading && !isAdmin) router.replace('/')
  }, [profileLoading, isAdmin, router])

  if (profileLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  if (!isAdmin) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h1>Acessórias — Sincronização</h1>
            <p className="text-sm text-muted-foreground">
              Integração com app.acessorias.com — sincroniza empresas, obrigações e entregas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/" />
        </div>
      </div>

      {/* Tabs (pills) */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <div className="flex justify-start">
          <SlidingTabsList
            activeValue={tab}
            indicatorInsetY={4}
            className="!shadow-sm !border !border-sky-200 dark:!border-sky-900/50 gap-1 !p-1 !bg-sky-50/70 dark:!bg-sky-950/20 !rounded-full w-fit items-center"
            indicatorClassName="!bg-white dark:!bg-sky-900/60 !shadow-md"
          >
            {([
              { v: 'companies',  Icon: Building2,  label: 'Empresas' },
              { v: 'mapping',    Icon: LinkIcon,   label: 'Mapeamento' },
              { v: 'deliveries', Icon: RefreshCw,  label: 'Entregas' },
              { v: 'logs',       Icon: History,    label: 'Histórico' },
              { v: 'explorer',   Icon: FileSearch, label: 'Explorer' },
            ] as const).map(({ v, Icon, label }) => (
              <TabsTrigger
                key={v}
                value={v}
                className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-800 dark:data-[state=active]:!text-sky-200 gap-1.5 leading-none"
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </TabsTrigger>
            ))}
          </SlidingTabsList>
        </div>

        <TabsContent value="companies" className="mt-4"><CompaniesPanel /></TabsContent>
        <TabsContent value="mapping" className="mt-4"><MappingPanel /></TabsContent>
        <TabsContent value="deliveries" className="mt-4">
          <DeliveriesPanel firstDay={fmtDate(firstDayOfMonth)} lastDay={fmtDate(lastDayOfMonth)} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4"><LogsPanel /></TabsContent>
        <TabsContent value="explorer" className="mt-4"><ExplorerPanel /></TabsContent>
      </Tabs>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// 1. EMPRESAS
// ════════════════════════════════════════════════════════════════════
function CompaniesPanel() {
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<{ novas: number; atualizadas: number; ignoradas: number } | null>(null)

  async function runSync() {
    setRunning(true)
    try {
      const r = await (trpc as any).acessorias.syncCompanies.mutate() as { ok: boolean; novas: number; atualizadas: number; ignoradas: number }
      setLastResult({ novas: r.novas, atualizadas: r.atualizadas, ignoradas: r.ignoradas })
      await alerts.success('Sync concluída', `${r.novas} já casadas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas (não encontradas no OneClick).`)
    } catch (e) {
      alerts.error('Falhou', (e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-600" />
            Sincronização de Empresas
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Faz match Cliente OneClick ↔ Company Acessórias pelo CNPJ. Resolve <code>idAcessorias</code> em cada cliente.
          </p>
        </div>
        <Button variant="success" size="sm" disabled={running} onClick={runSync} className="gap-1.5">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? 'Sincronizando...' : 'Sincronizar Empresas'}
        </Button>
      </div>
      <div className="p-5 space-y-3">
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/50 px-4 py-3 text-[12px] text-sky-900 dark:text-sky-200">
          <strong>O que faz:</strong> percorre todas as empresas do Acessórias (paginado, 20 por página)
          e tenta casar com clientes do OneClick. Quando casa, grava o <code>idAcessorias</code> e o CNPJ
          do Acessórias se for diferente. <strong>Não cria clientes novos</strong> — clientes ausentes ficam como "ignoradas".
        </div>
        {lastResult && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Já casadas</div>
              <div className="text-xl font-semibold tabular-nums">{lastResult.novas}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Atualizadas</div>
              <div className="text-xl font-semibold tabular-nums text-emerald-600">{lastResult.atualizadas}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ignoradas</div>
              <div className="text-xl font-semibold tabular-nums text-amber-600">{lastResult.ignoradas}</div>
              <div className="text-[10px] text-muted-foreground">não encontradas no OneClick</div>
            </Card>
          </div>
        )}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// 2. MAPEAMENTO Obrigação → Serviço
// ════════════════════════════════════════════════════════════════════
function MappingPanel() {
  const [grupos, setGrupos] = useState<ObligationGroup[]>([])
  const [observed, setObserved] = useState<Array<{ nome: string; ocorrencias: number }>>([])
  const [servicos, setServicos] = useState<ServicoLite[]>([])
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [loadingObs, setLoadingObs] = useState(false)
  const [filter, setFilter] = useState('')

  // Modal de criar serviço a partir de uma obrigação
  const [createOpen, setCreateOpen] = useState(false)
  const [createForObrigation, setCreateForObrigation] = useState<string>('')
  const [createNome, setCreateNome] = useState('')
  const [createArea, setCreateArea] = useState('')
  const [createSaving, setCreateSaving] = useState(false)

  // Modal de sugestões automáticas
  const [sugOpen, setSugOpen] = useState(false)
  const [sugLoading, setSugLoading] = useState(false)
  const [sugApplying, setSugApplying] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [sugSelected, setSugSelected] = useState<Set<string>>(new Set()) // chave: nome

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [mapsRes, servRes, areasRes] = await Promise.all([
        (trpc as any).acessorias.listObligationMaps.query(),
        (trpc as any).servico.listServicos.query({ categoria: 'MENSAL' as const }).catch(() => []),
        (trpc as any).area.listForSelect.query().catch(() => []),
      ])
      setGrupos((mapsRes as ObligationGroup[]) || [])
      setServicos((servRes as ServicoLite[]) || [])
      setAreas((areasRes as Array<{ id: string; name: string }>) || [])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  /** Title-case do nome da obrigação pra usar como sugestão de nome de serviço.
   *  Ex: "DARF - DCTFWEB INSS-IRRF" → "Darf - Dctfweb Inss-Irrf" (usuário ajusta). */
  function sugestaoNomeServico(obrigacao: string): string {
    return obrigacao
      .toLowerCase()
      .split(/(\s+|[-/])/)
      .map(w => /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)
      .join('')
  }

  function abrirCriacao(obrigacao: string) {
    setCreateForObrigation(obrigacao)
    setCreateNome(sugestaoNomeServico(obrigacao))
    setCreateArea('')
    setCreateOpen(true)
  }

  async function salvarCriacao() {
    if (!createNome.trim()) { alerts.error('Validação', 'Informe o nome do serviço.'); return }
    setCreateSaving(true)
    try {
      // 1. Cria o Servico MENSAL com defaults sensatos
      const created = await (trpc as any).servico.createServico.mutate({
        nome: createNome.trim(),
        categoria: createArea || undefined,
        categoriaServico: 'MENSAL',
        tipo: 'ATIVIDADE',
        prioridadePadrao: 'MEDIA',
        disponivelOrcamento: true,
        recorrenteMensal: true,
      }) as { id: string; nome: string }
      // 2. Vincula a obrigação ao serviço recém-criado
      await (trpc as any).acessorias.upsertObligationMap.mutate({
        nome: createForObrigation,
        servicoId: created.id,
        ativo: true,
      })
      await alerts.success('Criado e vinculado', `"${created.nome}" criado e vinculado à obrigação "${createForObrigation}".`)
      setCreateOpen(false)
      void fetchAll()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCreateSaving(false)
    }
  }

  async function carregarObservadas() {
    setLoadingObs(true)
    try {
      const r = await (trpc as any).acessorias.listObligationsObserved.query() as Array<{ nome: string; ocorrencias: number }>
      setObserved(r)
      await alerts.success('Carregadas', `${r.length} obrigações distintas observadas.`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoadingObs(false)
    }
  }

  async function addServicoToObligation(nome: string, servicoId: string) {
    try {
      await (trpc as any).acessorias.addObligationServico.mutate({ nome, servicoId })
      void fetchAll()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function removeMapping(mapId: string) {
    try {
      await (trpc as any).acessorias.removeObligationServico.mutate({ mapId })
      void fetchAll()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function toggleIgnored(nome: string, ignored: boolean) {
    try {
      await (trpc as any).acessorias.setObligationIgnored.mutate({ nome, ignored })
      void fetchAll()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ── Sugestões automáticas ──
  async function carregarSugestoes() {
    setSugLoading(true)
    setSugOpen(true)
    try {
      const r = await (trpc as any).acessorias.suggestMappings.query() as Suggestion[]
      setSuggestions(r)
      // Pré-seleciona as confidence=alta que não estão já mapeadas
      const sel = new Set<string>()
      for (const s of r) {
        if (s.suggestedServicoId && !s.alreadyMapped && s.confidence === 'alta') sel.add(s.nome)
      }
      setSugSelected(sel)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setSugOpen(false)
    } finally {
      setSugLoading(false)
    }
  }

  async function aplicarSugestoes() {
    const items = suggestions
      .filter(s => sugSelected.has(s.nome) && s.suggestedServicoId)
      .map(s => ({ nome: s.nome, servicoId: s.suggestedServicoId as string }))
    if (items.length === 0) {
      alerts.error('Nada selecionado', 'Marque pelo menos uma sugestão pra aplicar.')
      return
    }
    setSugApplying(true)
    try {
      const r = await (trpc as any).acessorias.applySuggestions.mutate({ items }) as { ok: boolean; aplicados: number; erros: string[] }
      await alerts.success('Aplicado', `${r.aplicados} vínculo(s) criados.`)
      setSugOpen(false)
      void fetchAll()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSugApplying(false)
    }
  }

  // Junta grupos existentes + observadas sem grupo ainda
  const linhas = useMemo(() => {
    const byNome = new Map<string, { nome: string; grupo?: ObligationGroup; ocorrencias?: number }>()
    for (const g of grupos) byNome.set(g.nome.toLowerCase(), { nome: g.nome, grupo: g })
    for (const o of observed) {
      const key = o.nome.toLowerCase()
      const ex = byNome.get(key)
      if (ex) ex.ocorrencias = o.ocorrencias
      else byNome.set(key, { nome: o.nome, ocorrencias: o.ocorrencias })
    }
    return [...byNome.values()]
      .filter(r => !filter || r.nome.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => (b.ocorrencias ?? 0) - (a.ocorrencias ?? 0) || a.nome.localeCompare(b.nome))
  }, [grupos, observed, filter])

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-sky-600" />
            Mapeamento de Obrigações
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Casa o nome da obrigação no Acessórias com um Serviço Mensal do OneClick. Sem map ou map desativado → ignorado no sync.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={carregarSugestoes} disabled={sugLoading} className="gap-1.5">
            {sugLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Sugerir mapeamentos
          </Button>
          <Button variant="outline" size="sm" onClick={carregarObservadas} disabled={loadingObs} className="gap-1.5">
            {loadingObs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            {loadingObs ? 'Carregando...' : 'Importar obrigações'}
          </Button>
        </div>
      </div>
      <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filtrar por nome da obrigação"
            className="h-9 text-sm pl-9 bg-card"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {linhas.length} obrigação{linhas.length === 1 ? '' : 'ões'}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">Nome no Acessórias</TableHead>
            <TableHead className="w-[90px] text-center whitespace-nowrap" title="Empresas com esta obrigação">Ocorr.</TableHead>
            <TableHead className="whitespace-nowrap">→ Serviços OneClick vinculados</TableHead>
            <TableHead className="w-[120px] text-center whitespace-nowrap">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={4} className="text-center py-10">
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
            </TableCell></TableRow>
          ) : linhas.length === 0 ? (
            <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
              Clique em <strong>Importar obrigações</strong> pra puxar a lista do Acessórias.<br />
              Depois use <strong>Sugerir mapeamentos</strong> pra auto-classificar tudo.
            </TableCell></TableRow>
          ) : linhas.map(({ nome, grupo, ocorrencias }) => {
            const vinculados = grupo?.servicos ?? []
            const ignorada = grupo?.ignorada ?? false
            const semVinculo = vinculados.length === 0 && !ignorada
            const idsVinculados = new Set(vinculados.map(v => v.servicoId))
            const servicosDisponiveis = servicos.filter(s => !idsVinculados.has(s.id))
            return (
              <TableRow key={nome}>
                <TableCell className="text-xs font-medium font-mono align-top py-3">{nome}</TableCell>
                <TableCell className="text-center text-xs tabular-nums align-top py-3">{ocorrencias ?? '—'}</TableCell>
                <TableCell className="align-top py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {vinculados.map(v => (
                      <div
                        key={v.mapId}
                        className={cn(
                          'group inline-flex items-center gap-1.5 px-2 h-6 rounded-full border text-[11px] font-medium transition-colors',
                          v.ativo
                            ? 'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-200'
                            : 'bg-muted/30 border-muted-foreground/30 text-muted-foreground line-through',
                        )}
                      >
                        <span className="truncate max-w-[200px]" title={v.servicoNome}>{v.servicoNome}</span>
                        <button
                          type="button"
                          onClick={() => removeMapping(v.mapId)}
                          className="h-4 w-4 inline-flex items-center justify-center rounded-full hover:bg-rose-500 hover:text-white transition-colors opacity-50 group-hover:opacity-100"
                          title="Remover vínculo"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                    {/* Picker pra adicionar mais — só mostra serviços não vinculados */}
                    {!ignorada && (
                      <Select
                        value="__none__"
                        onValueChange={(v) => {
                          if (v === '__create__') { abrirCriacao(nome); return }
                          if (v !== '__none__') addServicoToObligation(nome, v)
                        }}
                      >
                        <SelectTrigger className="h-6 text-[11px] w-auto min-w-[150px] gap-1 px-2 border-dashed">
                          <SelectValue placeholder={vinculados.length > 0 ? '+ Adicionar' : 'Selecionar serviço'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__create__" className="text-emerald-700 font-medium">+ Criar novo Serviço Mensal…</SelectItem>
                          {servicosDisponiveis.length > 0 && (
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-t mt-1 pt-2">
                              Serviços existentes
                            </div>
                          )}
                          {servicosDisponiveis.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                          ))}
                          {servicosDisponiveis.length === 0 && (
                            <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                              Todos os serviços já estão vinculados.
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center align-top py-3">
                  {ignorada ? (
                    <button
                      type="button"
                      onClick={() => toggleIgnored(nome, false)}
                      className="text-[10px] px-2 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                      title="Desmarcar 'ignorada' (volta a permitir mapeamento)"
                    >
                      ⊘ Ignorada
                    </button>
                  ) : semVinculo ? (
                    <button
                      type="button"
                      onClick={() => toggleIgnored(nome, true)}
                      className="text-[10px] px-2 py-1 rounded-full border border-muted-foreground/30 text-muted-foreground hover:border-amber-300 hover:text-amber-700"
                      title="Marcar como 'explicitamente ignorada'"
                    >
                      sem vínculo
                    </button>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 border-emerald-300 text-emerald-700 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> {vinculados.length} vínculo{vinculados.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Modal: sugestões automáticas */}
      <Dialog open={sugOpen} onOpenChange={(o) => !o && setSugOpen(false)}>
        <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
          <DialogHeaderIcon icon={Zap} color="sky">
            <DialogTitle>Sugestões automáticas de mapeamento</DialogTitle>
            <DialogDescription>
              Classificamos cada obrigação por área (fiscal/contábil/trabalhista) e regime (quando o
              nome denuncia). <strong>Marque as sugestões que quer aplicar</strong> — pode adicionar
              vínculos extras manualmente depois.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="flex-1 overflow-y-auto">
            {sugLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : suggestions.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-10 italic">
                Nenhuma sugestão. Clique em "Importar obrigações" primeiro.
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] text-center">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer"
                        checked={suggestions.filter(s => s.suggestedServicoId && !s.alreadyMapped).every(s => sugSelected.has(s.nome))}
                        onChange={e => {
                          const ck = e.target.checked
                          setSugSelected(prev => {
                            const next = new Set(prev)
                            for (const s of suggestions) {
                              if (s.suggestedServicoId && !s.alreadyMapped) {
                                if (ck) next.add(s.nome); else next.delete(s.nome)
                              }
                            }
                            return next
                          })
                        }}
                      />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Obrigação</TableHead>
                    <TableHead className="w-[90px] whitespace-nowrap">Classificação</TableHead>
                    <TableHead className="whitespace-nowrap">Serviço sugerido</TableHead>
                    <TableHead className="w-[80px] text-center whitespace-nowrap">Confiança</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map(s => {
                    const checked = sugSelected.has(s.nome)
                    const canCheck = !!s.suggestedServicoId && !s.alreadyMapped
                    return (
                      <TableRow key={s.nome} className={cn(s.alreadyMapped && 'opacity-50')}>
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            disabled={!canCheck}
                            checked={checked}
                            onChange={e => {
                              setSugSelected(prev => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(s.nome); else next.delete(s.nome)
                                return next
                              })
                            }}
                            className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                          />
                        </TableCell>
                        <TableCell className="text-xs font-mono">{s.nome}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn(
                            'text-[10px]',
                            s.area === 'fiscal' && 'bg-indigo-50 border-indigo-200 text-indigo-700',
                            s.area === 'contabil' && 'bg-violet-50 border-violet-200 text-violet-700',
                            s.area === 'trabalhista' && 'bg-lime-50 border-lime-200 text-lime-700',
                            s.area === 'desconhecida' && 'bg-muted text-muted-foreground',
                          )}>
                            {s.area}{s.regime ? ` · ${s.regime}` : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          {s.alreadyMapped ? (
                            <span className="text-emerald-700 italic">já vinculado</span>
                          ) : s.suggestedServicoNome ? (
                            <div>
                              <div className="font-medium">{s.suggestedServicoNome}</div>
                              {s.razao && <div className="text-[10px] text-muted-foreground mt-0.5">{s.razao}</div>}
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">sem sugestão</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={cn(
                            'text-[10px]',
                            s.confidence === 'alta' && 'bg-emerald-50 border-emerald-300 text-emerald-700',
                            s.confidence === 'media' && 'bg-amber-50 border-amber-300 text-amber-700',
                            s.confidence === 'baixa' && 'bg-rose-50 border-rose-300 text-rose-700',
                          )}>
                            {s.confidence}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <div className="text-xs text-muted-foreground mr-auto">
              {sugSelected.size} selecionada(s) · {suggestions.filter(s => s.suggestedServicoId && !s.alreadyMapped).length} sugestões aplicáveis
            </div>
            <Button variant="outline" onClick={() => setSugOpen(false)} disabled={sugApplying}>Cancelar</Button>
            <Button onClick={aplicarSugestoes} disabled={sugApplying || sugSelected.size === 0} className="gap-1.5" style={{ backgroundColor: '#0ea5e9' }}>
              {sugApplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aplicar selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: criar novo Servico MENSAL a partir de uma obrigação */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Criar Serviço Mensal a partir da obrigação</DialogTitle>
            <DialogDescription>
              Cria um <strong>Serviço Mensal</strong> novo no OneClick com defaults sensatos
              (categoria MENSAL · tipo Atividade · disponível em orçamento) e já
              vincula automaticamente à obrigação <code className="px-1 py-0.5 bg-muted rounded text-[10px]">{createForObrigation}</code>.
              Você pode editar etapas e passos depois em <code>/servicos/{'<id>'}</code>.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome do Serviço *</Label>
              <Input
                value={createNome}
                onChange={e => setCreateNome(e.target.value)}
                placeholder="Ex: DARF DCTFWeb INSS/IRRF"
                className="h-9 text-sm"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Sugestão derivada do nome da obrigação — ajuste pra um nome mais legível se quiser.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Área (opcional)</Label>
              <Select value={createArea || '__none__'} onValueChange={v => setCreateArea(v === '__none__' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione uma área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem área —</SelectItem>
                  {areas.map(a => <SelectItem key={a.id} value={a.name}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Pra obrigações fiscais: <em>Fiscal</em>; pra folha: <em>Trabalhista</em>; contábeis: <em>Contábil</em>.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>Cancelar</Button>
            <Button onClick={salvarCriacao} disabled={createSaving} className="gap-1.5" style={{ backgroundColor: '#0ea5e9' }}>
              {createSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar e vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// 3. ENTREGAS
// ════════════════════════════════════════════════════════════════════
function DeliveriesPanel({ firstDay, lastDay }: { firstDay: string; lastDay: string }) {
  const [dtInicio, setDtInicio] = useState(firstDay)
  const [dtFinal, setDtFinal] = useState(lastDay)
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<{ novas: number; atualizadas: number; ignoradas: number } | null>(null)

  async function runSync() {
    setRunning(true)
    try {
      const r = await (trpc as any).acessorias.syncDeliveries.mutate({
        dtInicio,
        dtFinal,
      }) as { ok: boolean; novas: number; atualizadas: number; ignoradas: number; erro?: string }
      setLastResult({ novas: r.novas, atualizadas: r.atualizadas, ignoradas: r.ignoradas })
      if (r.erro) alerts.error('Aviso', r.erro)
      else await alerts.success('Sync concluída', `${r.novas} criadas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas (sem mapeamento).`)
    } catch (e) {
      alerts.error('Falhou', (e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-sky-600" />
          Sincronização de Entregas
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Puxa todas as entregas do período e cria/atualiza as <strong>ServicoExecucao</strong> no OneClick.
          Pré-requisito: empresas sincronizadas + mapeamento de obrigações configurado.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/50 px-4 py-3 text-[12px] text-sky-900 dark:text-sky-200">
          <strong>Janela do sync</strong>: <code>{firstDay}</code> a <code>{lastDay}</code> (mês corrente). Filtra por <strong>data do prazo da entrega</strong>, não competência. Ajuste se quiser puxar entregas com prazo de outro período.
        </div>
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">Data inicial (prazo)</Label>
            <Input type="date" value={dtInicio} onChange={e => setDtInicio(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="col-span-12 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">Data final (prazo)</Label>
            <Input type="date" value={dtFinal} onChange={e => setDtFinal(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="col-span-12 sm:col-span-4 flex items-end">
            <Button variant="success" disabled={running} onClick={runSync} className="gap-1.5 w-full">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {running ? 'Sincronizando...' : 'Sincronizar agora'}
            </Button>
          </div>
        </div>
        {lastResult && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Criadas</div>
              <div className="text-xl font-semibold tabular-nums text-emerald-600">{lastResult.novas}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Atualizadas</div>
              <div className="text-xl font-semibold tabular-nums text-sky-600">{lastResult.atualizadas}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ignoradas</div>
              <div className="text-xl font-semibold tabular-nums text-amber-600">{lastResult.ignoradas}</div>
              <div className="text-[10px] text-muted-foreground">sem mapping ou mudança</div>
            </Card>
          </div>
        )}
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// 4. HISTÓRICO de SYNC
// ════════════════════════════════════════════════════════════════════
function LogsPanel() {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(false)
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc as any).acessorias.listSyncLogs.query() as SyncLog[]
      setLogs(r || [])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { void fetchLogs() }, [fetchLogs])

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-sky-600" />
          Histórico de Sincronizações
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchLogs} disabled={loading} className="gap-1.5">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[150px]">Data</TableHead>
            <TableHead className="w-[100px]">Tipo</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="whitespace-nowrap">Contadores</TableHead>
            <TableHead>Erro / Detalhe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center py-10">
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
            </TableCell></TableRow>
          ) : logs.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">
              Sem sincronizações registradas ainda.
            </TableCell></TableRow>
          ) : logs.map(log => {
            const counters = log.tipo === 'companies'
              ? `${log.empresasNovas + log.empresasAtualizadas} resolvidas · ${log.empresasIgnoradas} ignoradas`
              : `${log.deliveriesNovas} novas · ${log.deliveriesAtualizadas} atualizadas · ${log.deliveriesIgnoradas} ignoradas`
            const statusCls = log.status === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
              : log.status === 'partial' ? 'bg-amber-50 border-amber-300 text-amber-700'
              : log.status === 'error' ? 'bg-rose-50 border-rose-300 text-rose-700'
              : 'bg-sky-50 border-sky-300 text-sky-700'
            return (
              <TableRow key={log.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  <div>{new Date(log.startedAt).toLocaleDateString('pt-BR')}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(log.startedAt).toLocaleTimeString('pt-BR')}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{log.tipo}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px]', statusCls)}>{log.status}</Badge>
                </TableCell>
                <TableCell className="text-xs tabular-nums">{counters}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[400px] truncate" title={log.erroMensagem ?? ''}>
                  {log.erroMensagem ?? '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════
// 5. EXPLORER (debug)
// ════════════════════════════════════════════════════════════════════
const PRESETS: Array<{ label: string; path: string; query?: Record<string, string> }> = [
  { label: 'Empresas (ListAll)',  path: '/companies/ListAll', query: { Pagina: '1' } },
  { label: 'Departamentos',       path: '/departments/ListAll' },
  { label: 'Solicitações',        path: '/requests/ListAll' },
  { label: 'Processos',           path: '/processes/ListAll' },
  { label: 'Tags',                path: '/tags/ListAll' },
]

function ExplorerPanel() {
  const [path, setPath] = useState('/companies/ListAll')
  const [queryRaw, setQueryRaw] = useState('Pagina=1')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExploreResult | null>(null)

  function parseQuery(raw: string): Record<string, string> | undefined {
    const t = raw.trim()
    if (!t) return undefined
    const params = new URLSearchParams(t.startsWith('?') ? t.slice(1) : t)
    const obj: Record<string, string> = {}
    params.forEach((v, k) => { obj[k] = v })
    return Object.keys(obj).length > 0 ? obj : undefined
  }

  async function executar() {
    if (!path.trim()) { alerts.error('Validação', 'Informe o path.'); return }
    setLoading(true); setResult(null)
    try {
      const r = await (trpc as any).acessorias.explore.query({
        path: path.trim(),
        query: parseQuery(queryRaw),
      }) as ExploreResult
      setResult(r)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function copiar() {
    if (!result?.data) return
    try { await navigator.clipboard.writeText(JSON.stringify(result.data, null, 2)); alerts.success('Copiado', '') } catch {}
  }

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileSearch className="h-4 w-4 text-sky-600" />
          Explorer da API
        </h3>
        <Button variant="success" size="sm" onClick={executar} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {loading ? 'Buscando...' : 'Executar'}
        </Button>
      </div>
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-5 space-y-1.5">
            <Label className="text-[13px] font-semibold">Path</Label>
            <Input value={path} onChange={e => setPath(e.target.value)} className="h-9 text-sm font-mono" />
          </div>
          <div className="col-span-12 md:col-span-7 space-y-1.5">
            <Label className="text-[13px] font-semibold">Query string</Label>
            <Input value={queryRaw} onChange={e => setQueryRaw(e.target.value)} placeholder="chave=valor&..." className="h-9 text-sm font-mono" />
          </div>
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2 block">Presets</Label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => { setPath(p.path); setQueryRaw(p.query ? new URLSearchParams(p.query).toString() : '') }}
                className="h-7 px-2.5 rounded-md border border-sky-200 bg-sky-50 hover:bg-sky-100 text-[11px] font-medium text-sky-800 transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {result && (
        <>
          <div className="px-5 py-2 border-t border-border/60 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {result.ok ? (
                <Badge variant="outline" className="text-[10px] bg-emerald-50 border-emerald-300 text-emerald-700 gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {result.status}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] bg-rose-50 border-rose-300 text-rose-700 gap-1">
                  <XCircle className="h-3 w-3" /> {result.status || '—'}
                </Badge>
              )}
              <code className="text-[11px] text-muted-foreground truncate">{result.path}</code>
            </div>
            <Button variant="outline" size="sm" onClick={copiar} className="gap-1.5 h-7" disabled={!result.data}>
              <Copy className="h-3 w-3" /> Copiar JSON
            </Button>
          </div>
          {!result.ok && (
            <div className="px-5 py-3 bg-rose-50/60 border-t border-rose-200/70 text-[12px] text-rose-900">
              <strong>Erro:</strong> {result.error}
            </div>
          )}
          <pre className="p-4 bg-muted/20 overflow-x-auto text-[11px] leading-relaxed font-mono max-h-[500px] overflow-y-auto border-t">
{result.data ? JSON.stringify(result.data, null, 2) : '(sem dados)'}
          </pre>
        </>
      )}
    </Card>
  )
}
