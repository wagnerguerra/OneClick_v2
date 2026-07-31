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
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Zap, Loader2, Play, Copy, CheckCircle2, XCircle, Database,
  ChevronRight, ChevronDown, Building2, FileSearch, Link as LinkIcon,
  History, Search, RefreshCw, AlertCircle, Trash2, Save, Plus, MailWarning, GitCompareArrows,
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
import { EntityCombobox } from '@/components/ui/entity-combobox'
import { trpc } from '@/lib/trpc'
import { masks } from '@/lib/masks'
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
  progressoAtual: number | null
  progressoTotal: number | null
  progressoMsg: string | null
  detalhes: Array<{ clienteId?: string; cliente: string; entregas: number; novas: number; atualizadas: number; erro?: string }> | null
}

/** Data em pt-BR a partir do formato ISO usado pelos campos de data. */
const dataBR = (iso: string) => {
  const [a, m, d] = String(iso ?? '').split('-')
  return a && m && d ? `${d}/${m}/${a}` : String(iso ?? '')
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
          <Button variant="outline" size="sm" asChild>
            <Link href="/acessorias/painel"><MailWarning className="h-4 w-4" />Painel de entregas</Link>
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/acessorias/divergencias"><GitCompareArrows className="h-4 w-4" />Divergências</Link>
            </Button>
          )}
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
                className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-2 !text-xs !font-semibold !text-foreground/60 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-sky-800 dark:data-[state=active]:!text-sky-200 gap-1.5 leading-none !items-center"
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
  const [lastResult, setLastResult] = useState<{ novas: number; atualizadas: number; ignoradas: number; quando?: string } | null>(null)
  const [verGrupo, setVerGrupo] = useState<'casada' | 'atualizada' | 'ignorada' | null>(null)

  // O resultado vinha só da memória da tela: sair e voltar apagava os números,
  // dando a impressão de que a sincronização não tinha acontecido. Agora ele é
  // lido do histórico, que é onde o dado de fato mora.
  const carregarUltima = useCallback(async () => {
    try {
      const logs = await (trpc as any).acessorias.listSyncLogs.query({ limit: 20 }) as SyncLog[]
      const ultima = (logs || []).find(l => l.tipo === 'companies' && l.status !== 'running')
      if (ultima) {
        setLastResult({
          novas: ultima.empresasNovas,
          atualizadas: ultima.empresasAtualizadas,
          ignoradas: ultima.empresasIgnoradas,
          quando: ultima.finishedAt ?? ultima.startedAt,
        })
      }
    } catch { /* sem histórico é só não mostrar */ }
  }, [])
  useEffect(() => { void carregarUltima() }, [carregarUltima])

  async function runSync() {
    // Refazer custa dezenas de requisições e alguns minutos — confirma antes.
    if (lastResult) {
      const ok = await alerts.confirm({
        title: 'Sincronizar as empresas de novo?',
        text: 'A última sincronização já foi feita. Refazer percorre a carteira inteira no Acessórias e leva alguns minutos.',
        icon: 'question',
        confirmText: 'Sincronizar',
      })
      if (!ok) return
    }
    setRunning(true)
    try {
      const r = await (trpc as any).acessorias.syncCompanies.mutate() as { ok: boolean; novas: number; atualizadas: number; ignoradas: number }
      setLastResult({ novas: r.novas, atualizadas: r.atualizadas, ignoradas: r.ignoradas, quando: new Date().toISOString() })
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
            <button type="button" className="text-left" onClick={() => setVerGrupo('casada')}>
              <Card className="p-3 transition-colors hover:bg-muted/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Já casadas</div>
                <div className="text-xl font-semibold tabular-nums">{lastResult.novas}</div>
                <div className="text-[10px] text-muted-foreground">clique para ver a lista</div>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setVerGrupo('atualizada')}>
              <Card className="p-3 transition-colors hover:bg-muted/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Atualizadas</div>
                <div className="text-xl font-semibold tabular-nums text-emerald-600">{lastResult.atualizadas}</div>
                <div className="text-[10px] text-muted-foreground">clique para ver a lista</div>
              </Card>
            </button>
            <button type="button" className="text-left" onClick={() => setVerGrupo('ignorada')}>
              <Card className="p-3 transition-colors hover:bg-muted/40">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ignoradas</div>
                <div className="text-xl font-semibold tabular-nums text-amber-600">{lastResult.ignoradas}</div>
                <div className="text-[10px] text-muted-foreground">clique para vincular à mão</div>
              </Card>
            </button>
          </div>
        )}
        {verGrupo && (
          <EmpresasDaSyncModal
            situacao={verGrupo}
            onClose={() => setVerGrupo(null)}
            onVinculou={() => { void carregarUltima() }}
          />
        )}
      </div>
    </Card>
  )
}

interface EmpresaSync {
  situacao: 'casada' | 'atualizada' | 'ignorada'
  idAcessorias: number
  documento: string
  razaoAcessorias: string
  statusAcessorias: string
  clienteId?: string
  clienteCode?: number
  clienteNome?: string
}

const TITULO_GRUPO: Record<string, string> = {
  casada: 'Empresas já casadas',
  atualizada: 'Empresas atualizadas nesta sincronização',
  ignorada: 'Empresas sem cliente correspondente',
}

/**
 * Lista as empresas de um grupo da última sincronização.
 *
 * O número no card não levava a lugar nenhum: "46 ignoradas" não diz quais são
 * nem permite agir. Aqui elas aparecem uma a uma e, no caso das ignoradas, dá
 * para escolher o cliente do OneClick e vincular na hora — que é o único jeito
 * de resolver quando o CNPJ não casa (filial cadastrada com outro documento,
 * cliente que ainda não existe aqui, etc).
 */
function EmpresasDaSyncModal({ situacao, onClose, onVinculou }: {
  situacao: 'casada' | 'atualizada' | 'ignorada'
  onClose: () => void
  onVinculou: () => void
}) {
  const [itens, setItens] = useState<EmpresaSync[]>([])
  const [quando, setQuando] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [escolha, setEscolha] = useState<Record<number, string>>({})
  const [salvando, setSalvando] = useState<number | null>(null)
  const [resolvidos, setResolvidos] = useState<Set<number>>(new Set())

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc as any).acessorias.empresasDaUltimaSync.query({ situacao })
      .then((d: { quando: string | null; itens: EmpresaSync[] }) => {
        setItens(d.itens || [])
        setQuando(d.quando)
      })
      .catch((e: Error) => alerts.error('Erro', e.message))
      .finally(() => setLoading(false))
  }, [situacao])
  useEffect(() => { carregar() }, [carregar])

  // Só carrega a lista de clientes quando é para vincular — nas outras abas
  // seria peso sem uso.
  useEffect(() => {
    if (situacao !== 'ignorada') return
    ;(trpc as any).cliente.list.query({ page: 1, limit: 100, sortBy: 'razaoSocial', sortDir: 'asc' })
      .then((r: { data: Array<{ id: string; razaoSocial: string; documento: string }> }) => setClientes(r?.data || []))
      .catch(() => setClientes([]))
  }, [situacao])

  async function vincular(emp: EmpresaSync) {
    const clienteId = escolha[emp.idAcessorias]
    if (!clienteId) return
    setSalvando(emp.idAcessorias)
    try {
      await (trpc as any).acessorias.vincularEmpresaCliente.mutate({
        clienteId,
        idAcessorias: emp.idAcessorias,
        cnpjAcessorias: emp.documento || undefined,
      })
      setResolvidos(prev => new Set(prev).add(emp.idAcessorias))
      onVinculou()
    } catch (e) {
      alerts.error('Não foi possível vincular', (e as Error).message)
    } finally { setSalvando(null) }
  }

  const q = busca.trim().toLowerCase()
  const filtrados = q
    ? itens.filter(i =>
        i.razaoAcessorias.toLowerCase().includes(q)
        || i.documento.includes(q.replace(/\D/g, ''))
        || (i.clienteNome ?? '').toLowerCase().includes(q))
    : itens

  const opcoesClientes = clientes.map(c => ({
    id: c.id,
    label: c.razaoSocial,
    sublabel: c.documento ? masks.cpfCnpj(c.documento) : null,
  }))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[860px] max-h-[85vh] flex flex-col">
        <DialogHeaderIcon icon={Building2} color={situacao === 'ignorada' ? 'amber' : 'sky'}>
          <DialogTitle>{TITULO_GRUPO[situacao]}</DialogTitle>
          <DialogDescription>
            {situacao === 'ignorada'
              ? 'O CNPJ dessas empresas não casou com nenhum cliente. Escolha o cliente correspondente e vincule.'
              : 'Resultado da última sincronização de empresas.'}
            {quando ? ` Sincronizado em ${new Date(quando).toLocaleString('pt-BR')}.` : ''}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3 overflow-y-auto">
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por empresa, CNPJ ou cliente..." className="h-9 max-w-sm text-sm" />

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtrados.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {itens.length === 0
                ? 'Nada neste grupo na última sincronização. Se ela nunca rodou depois desta atualização, rode de novo para gravar o detalhe.'
                : 'Nenhum resultado para a busca.'}
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border">
              {filtrados.map(emp => {
                const feito = resolvidos.has(emp.idAcessorias)
                return (
                  <div key={emp.idAcessorias} className="flex flex-col gap-2 px-3 py-2.5 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{emp.razaoAcessorias || '(sem razão social)'}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {masks.cpfCnpj(emp.documento)} · Acessórias #{emp.idAcessorias}
                        {emp.statusAcessorias ? ` · ${emp.statusAcessorias}` : ''}
                      </p>
                    </div>

                    {situacao === 'ignorada' ? (
                      feito ? (
                        <Badge className="shrink-0 gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />vinculada
                        </Badge>
                      ) : (
                        <div className="flex shrink-0 items-center gap-2 lg:w-[420px]">
                          <div className="min-w-0 flex-1">
                            <EntityCombobox
                              items={opcoesClientes}
                              value={escolha[emp.idAcessorias] ?? ''}
                              onSelect={(id) => setEscolha(prev => ({ ...prev, [emp.idAcessorias]: id }))}
                              placeholder="Escolher cliente"
                              searchPlaceholder="Buscar por nome ou CNPJ/CPF..."
                              emptyText="Nenhum cliente encontrado"
                            />
                          </div>
                          <Button
                            size="xs"
                            variant="success"
                            disabled={!escolha[emp.idAcessorias] || salvando === emp.idAcessorias}
                            onClick={() => vincular(emp)}
                          >
                            {salvando === emp.idAcessorias
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <LinkIcon className="h-3.5 w-3.5" />}
                            Vincular
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="shrink-0 text-right">
                        <p className="text-sm">#{emp.clienteCode} — {emp.clienteNome}</p>
                        <p className="text-[10px] text-muted-foreground">cliente no OneClick</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  // Modal de limpeza de vínculos em lote
  const [limpezaOpen, setLimpezaOpen] = useState(false)

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
          <Button variant="outline" size="sm" onClick={() => setLimpezaOpen(true)} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
            Limpar vínculos
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
      {limpezaOpen && (
        <LimparVinculosModal
          onClose={() => setLimpezaOpen(false)}
          onDone={() => { setLimpezaOpen(false); void fetchAll() }}
        />
      )}

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

/**
 * Limpeza em lote dos vínculos obrigação → serviço.
 *
 * Existe porque a sugestão automática chegou a vincular quase toda a carteira
 * a um único serviço mensal. Desfazer um a um seria inviável.
 *
 * Os vínculos criados a partir de agora ficam marcados como automáticos, o que
 * permite desfazer só o que a máquina fez. Os antigos não têm essa marca — para
 * eles, a seleção é por serviço, que é como o exagero se concentra.
 */
function LimparVinculosModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  interface Resumo {
    servicoId: string; servicoNome: string
    total: number; auto: number; manual: number; obrigacoes: string[]
  }
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [apenasAuto, setApenasAuto] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    ;(trpc as any).acessorias.resumoVinculos.query()
      .then((d: Resumo[]) => setResumo(d || []))
      .catch((e: Error) => alerts.error('Erro', e.message))
      .finally(() => setLoading(false))
  }, [])

  const totalAuto = resumo.reduce((n, r) => n + r.auto, 0)
  const aRemover = apenasAuto
    ? resumo.filter(r => sel.has(r.servicoId)).reduce((n, r) => n + r.auto, 0)
    : resumo.filter(r => sel.has(r.servicoId)).reduce((n, r) => n + r.total, 0)

  async function remover() {
    if (sel.size === 0) return
    const ok = await alerts.confirm({
      title: `Remover ${aRemover} vínculo(s)?`,
      text: apenasAuto
        ? 'Só os vínculos criados pela sugestão automática serão removidos. Os feitos à mão permanecem.'
        : 'Todos os vínculos dos serviços marcados serão removidos, inclusive os feitos à mão. Não há como desfazer.',
      icon: 'warning',
      confirmText: 'Remover',
    })
    if (!ok) return
    setRemovendo(true)
    try {
      const r = await (trpc as any).acessorias.removerVinculosEmLote.mutate({
        servicoIds: [...sel],
        apenasAuto: apenasAuto || undefined,
      }) as { removidos: number }
      await alerts.success('Vínculos removidos', `${r.removidos} vínculo(s) removido(s).`)
      onDone()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setRemovendo(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
        <DialogHeaderIcon icon={Trash2} color="rose">
          <DialogTitle>Limpar vínculos de obrigações</DialogTitle>
          <DialogDescription>
            Marque os serviços cujos vínculos devem ser desfeitos. Nada é removido até você confirmar.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3 overflow-y-auto">
          {totalAuto > 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900 dark:bg-amber-950/20">
              <input type="checkbox" checked={apenasAuto} onChange={e => setApenasAuto(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <strong>Remover só os vínculos automáticos</strong> ({totalAuto} no total).
                Preserva o que foi vinculado à mão. Vínculos criados antes desta atualização não têm
                essa marca e contam como manuais.
              </span>
            </label>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando vínculos...
            </div>
          ) : resumo.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nenhum vínculo cadastrado.</p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border">
              {resumo.map(r => (
                <div key={r.servicoId}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
                    <input
                      type="checkbox"
                      checked={sel.has(r.servicoId)}
                      onChange={() => setSel(prev => {
                        const n = new Set(prev)
                        if (n.has(r.servicoId)) n.delete(r.servicoId); else n.add(r.servicoId)
                        return n
                      })}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.servicoNome}</span>
                    <Badge variant="outline" className="text-[10px]">{r.total} obrigações</Badge>
                    {r.auto > 0 && (
                      <Badge className="bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                        {r.auto} automáticos
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setExpandido(expandido === r.servicoId ? null : r.servicoId) }}
                      className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {expandido === r.servicoId ? 'ocultar' : 'ver'}
                    </button>
                  </label>
                  {expandido === r.servicoId && (
                    <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {r.obrigacoes.map((o, i) => (
                          <span key={o + i} className="rounded bg-card px-1.5 py-0.5 text-[10px]">{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" size="sm" disabled={sel.size === 0 || removendo} onClick={remover}>
            {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Remover {aRemover > 0 ? `(${aRemover})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    // Refazer o mesmo período reconsulta a carteira inteira e leva minutos —
    // vale confirmar, principalmente porque o botão fica sempre disponível.
    const ok = await alerts.confirm({
      title: 'Sincronizar as entregas deste período?',
      text: `Período de ${dataBR(dtInicio)} a ${dataBR(dtFinal)}. A consulta percorre cliente a cliente no Acessórias e leva alguns minutos.`,
      icon: 'question',
      confirmText: 'Sincronizar',
    })
    if (!ok) return
    setRunning(true)
    try {
      // A varredura roda em segundo plano: é cliente a cliente contra a API do
      // Acessórias e leva minutos, muito além dos 30s em que o proxy derruba a
      // requisição. A resposta aqui é só a confirmação de que começou.
      const r = await (trpc as any).acessorias.syncDeliveries.mutate({
        dtInicio,
        dtFinal,
      }) as { ok: boolean; emAndamento?: boolean; mensagem?: string; erro?: string }
      setLastResult(null)
      if (r.erro) alerts.error('Aviso', r.erro)
      else await alerts.success('Sincronização iniciada', r.mensagem ?? 'Ela roda em segundo plano — acompanhe pelo histórico logo abaixo.')
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
          <strong>Janela do sync</strong>: <code>{dataBR(firstDay)}</code> a <code>{dataBR(lastDay)}</code> (mês corrente). Filtra por <strong>data do prazo da entrega</strong>, não competência. Ajuste se quiser puxar entregas com prazo de outro período.
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
  const [detalhe, setDetalhe] = useState<SyncLog | null>(null)
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

  // Enquanto houver sincronização em andamento, recarrega sozinho a cada 3s —
  // é o que faz a barra de progresso andar sem o usuário clicar em Atualizar.
  const temRodando = logs.some(l => l.status === 'running')
  useEffect(() => {
    if (!temRodando) return
    const t = setInterval(() => { void fetchLogs() }, 3000)
    return () => clearInterval(t)
  }, [temRodando, fetchLogs])

  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-sky-600" />
          Histórico de Sincronizações
          {temRodando && (
            <span className="inline-flex items-center gap-1 text-[10px] font-normal text-sky-600">
              <Loader2 className="h-3 w-3 animate-spin" />atualizando sozinho
            </span>
          )}
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
            const total = log.progressoTotal ?? 0
            const atual = log.progressoAtual ?? 0
            const pct = total > 0 ? Math.min(100, Math.round((atual / total) * 100)) : 0
            return (
              <TableRow key={log.id} className="cursor-pointer" onClick={() => setDetalhe(log)}>
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
                <TableCell className="text-xs tabular-nums">
                  {log.status === 'running' && total > 0 ? (
                    <div className="min-w-[160px] space-y-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-sky-500 transition-all duration-500" style={{ width: pct + '%' }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground">{atual}/{total} ({pct}%)</div>
                    </div>
                  ) : counters}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[400px] truncate"
                  title={log.erroMensagem ?? log.progressoMsg ?? ''}>
                  {log.status === 'running'
                    ? (log.progressoMsg ?? 'iniciando...')
                    : (log.erroMensagem ?? 'clique para ver o detalhe')}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {detalhe && <DetalheSyncModal log={detalhe} onClose={() => setDetalhe(null)} />}
    </Card>
  )
}

interface EntregaEspelho {
  id: string
  nome: string
  competencia: string | null
  prazo: string | null
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  multa: boolean
  dpto: string | null
  respEntrega: string | null
  dtEntrega: string | null
}

/**
 * Uma linha do resumo por cliente que abre para mostrar QUAIS entregas foram
 * processadas. O "41 entrega(s)" sozinho não diz o que entrou — e é justamente
 * isso que se quer conferir depois de sincronizar.
 *
 * Busca só quando expande: carregar as entregas dos 138 clientes de uma vez
 * seria peso à toa para ver uma linha.
 */
function LinhaClienteSync({ linha, de, ate }: {
  linha: { clienteId?: string; cliente: string; entregas: number; novas: number; atualizadas: number }
  de?: string
  ate?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [entregas, setEntregas] = useState<EntregaEspelho[] | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function alternar() {
    if (aberto) { setAberto(false); return }
    setAberto(true)
    if (entregas || !linha.clienteId) return
    setCarregando(true)
    try {
      const r = await (trpc as any).acessorias.entregasDoCliente.query({
        clienteId: linha.clienteId, de, ate,
      }) as EntregaEspelho[]
      setEntregas(r || [])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setEntregas([])
    } finally { setCarregando(false) }
  }

  const fmt = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

  return (
    <div>
      <button
        type="button"
        onClick={alternar}
        disabled={!linha.clienteId}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left text-xs',
          linha.clienteId ? 'hover:bg-muted/30' : 'cursor-default',
        )}
      >
        {linha.clienteId && (
          <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
        )}
        <span className="min-w-0 flex-1 truncate">{linha.cliente}</span>
        <span className="tabular-nums text-muted-foreground">{linha.entregas} entrega(s)</span>
        {linha.novas > 0 && <Badge variant="outline" className="text-[10px] text-emerald-700">+{linha.novas}</Badge>}
        {linha.atualizadas > 0 && <Badge variant="outline" className="text-[10px] text-sky-700">~{linha.atualizadas}</Badge>}
      </button>

      {aberto && (
        <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
          {carregando ? (
            <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Carregando entregas...
            </div>
          ) : !entregas || entregas.length === 0 ? (
            <p className="py-2 text-[11px] text-muted-foreground">
              Nenhuma entrega espelhada para este cliente no período.
            </p>
          ) : (
            <div className="space-y-1">
              {entregas.map(e => (
                <div key={e.id} className="flex flex-wrap items-center gap-2 rounded bg-card px-2 py-1.5 text-[11px]">
                  <span className="min-w-0 flex-1 truncate font-medium">{e.nome}</span>
                  {e.competencia && (
                    <span className="text-muted-foreground">comp. {fmt(e.competencia)}</span>
                  )}
                  <span className="tabular-nums text-muted-foreground">prazo {fmt(e.prazo)}</span>
                  {e.status && <Badge variant="outline" className="text-[9px]">{e.status}</Badge>}
                  {e.lida === true && (
                    <Badge className="bg-emerald-100 text-[9px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">abriu</Badge>
                  )}
                  {e.lida === false && (
                    <Badge className="bg-amber-100 text-[9px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">não abriu</Badge>
                  )}
                  {e.multa && <Badge variant="outline" className="text-[9px] text-rose-700">multa</Badge>}
                  {e.dpto && <span className="text-muted-foreground">{e.dpto}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Detalhe de uma sincronização — o que aconteceu, cliente a cliente. */
function DetalheSyncModal({ log, onClose }: { log: SyncLog; onClose: () => void }) {
  const params = (log.parametros ?? {}) as { dtInicio?: string; dtFinal?: string }
  const linhas = log.detalhes ?? []
  const duracao = log.finishedAt
    ? Math.max(1, Math.round((new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime()) / 1000))
    : null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={History} color="sky">
          <DialogTitle>Sincronização de {log.tipo === 'companies' ? 'empresas' : 'entregas'}</DialogTitle>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Início</p>
              <p className="tabular-nums">{new Date(log.startedAt).toLocaleString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duração</p>
              <p className="tabular-nums">{duracao != null ? duracao + 's' : 'em andamento'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Situação</p>
              <p>{log.status}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Período</p>
              <p className="tabular-nums">
                {params.dtInicio ? dataBR(params.dtInicio) + ' a ' + dataBR(params.dtFinal ?? '') : '—'}
              </p>
            </div>
          </div>

          {log.erroMensagem && (
            <p className="rounded border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {log.erroMensagem}
            </p>
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold">
              Clientes com movimento {linhas.length > 0 && <span className="text-muted-foreground">({linhas.length})</span>}
            </p>
            {linhas.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {log.status === 'running'
                  ? 'A sincronização ainda está rodando — o detalhe aparece ao terminar.'
                  : 'Nenhum cliente teve entregas no período. Clientes sem movimento não são listados.'}
              </p>
            ) : (
              <div className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
                {linhas.map((l, i) => (
                  <LinhaClienteSync
                    key={l.cliente + '-' + i}
                    linha={l}
                    de={params.dtInicio}
                    ate={params.dtFinal}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
