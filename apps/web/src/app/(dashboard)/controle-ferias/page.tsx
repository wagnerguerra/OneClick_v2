'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Loader2, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search as SearchIcon,
  ChevronUp, ChevronDown, ChevronsUpDown, UserX, BarChart3,
  CalendarDays, CircleAlert, TriangleAlert, Clock, Wallet, X,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import Link from 'next/link'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { UserCombobox } from '../orcamentos/_components/user-combobox'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { resolveAssetUrl } from '@/lib/api-url'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { corSaldo, tituloSaldo } from './_lib/cores'

const PAGE_SIZES = [10, 20, 50]

const MODULE_COLOR = 'var(--mod-trabalhista, #a3e635)'

/** Indicadores do topo — os mesmos números do painel de relatórios. */
interface Indicadores {
  diasEmAberto: number
  comSaldo: number
  vencidos: number
  vencendo90: number
  gozosNoMes: number
  gozandoNoMes: number
  aPagar: number
}

/** Recortes que os cartões do topo aplicam à tabela. */
type IndicadorKey = 'SALDO' | 'VENCIDOS' | 'VENCENDO' | 'GOZO_MES' | 'A_PAGAR'

/**
 * Cartão compacto do topo. Clicar filtra a tabela pelas linhas que formam
 * aquele número; clicar de novo desfaz. Ver "13 vencidas" sem poder abrir as
 * treze seria só um susto sem saída.
 */
function Indicador({ label, valor, hint, cor, icone: Icone, ativo, onClick, destaque }: {
  label: string
  valor: number
  hint?: string
  cor?: string
  icone: typeof CalendarDays
  ativo?: boolean
  onClick?: () => void
  destaque?: boolean
}) {
  const corFinal = cor ?? MODULE_COLOR
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors',
        'hover:border-foreground/20 hover:bg-muted/30',
        ativo ? 'border-transparent ring-2' : destaque ? 'border-rose-300 dark:border-rose-800' : 'border-border',
      )}
      style={ativo ? { boxShadow: `0 0 0 2px ${corFinal}`, background: `color-mix(in srgb, ${corFinal} 7%, transparent)` } : undefined}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
        style={{ background: `color-mix(in srgb, ${corFinal} 15%, transparent)` }}>
        <Icone className="h-4 w-4" style={{ color: corFinal }} />
      </span>
      <div className="min-w-0">
        <p className="text-lg font-semibold leading-none tabular-nums" style={cor ? { color: cor } : undefined}>{valor}</p>
        <p className="mt-1 truncate text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {hint && <p className="truncate text-[10px] text-muted-foreground/80">{hint}</p>}
      </div>
    </button>
  )
}

const INDICADOR_LABEL: Record<IndicadorKey, string> = {
  SALDO: 'com dias em aberto',
  VENCIDOS: 'com férias vencidas',
  VENCENDO: 'vencendo em 90 dias',
  GOZO_MES: 'em gozo neste mês',
  A_PAGAR: 'a pagar',
}

/** Iniciais para a bolinha quando o colaborador não tem foto. */
const iniciais = (nome: string | null | undefined) =>
  (nome || '?').split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase()

interface Row {
  id: string
  legacyId: number | null
  colaboradorNomeResolvido: string | null
  /** false = desligado no cadastro; null = sem vínculo (só resíduo do v1). */
  colaboradorAtivo: boolean | null
  /** Períodos anteriores do mesmo colaborador (ficam no histórico do registro). */
  periodosAnteriores: number
  numero: number
  /** Data de admissão vinda do cadastro (coluna "Dt Admissão" do v1). */
  colaboradorAdmissao: string | null
  colaboradorImagem: string | null
  pagamento1: string | null
  periodoInicial: number
  periodoFinal: number
  descricao: string | null
  dias: number
  saldoAnterior: number
  gozados: number
  saldo: number
  previsao: string | null
  pago: boolean
  historico: boolean
  eventosTotal: number
  arquivosTotal: number
}
interface Usuario { id: string; name: string; email: string | null; image: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** ISO completo → yyyy-mm-dd, formato que o <input type="date"> entende. */
const isoDe = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

/**
 * Controle de Férias — port do crp_ferias do v1. Um registro por período
 * aquisitivo; o saldo chega derivado do backend (dias + anterior − gozados).
 */
export default function ControleFeriasPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'controle-ferias')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fColaborador, setFColaborador] = useState('')
  const [sortBy, setSortBy] = useState('colaborador')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [fColaboradores, setFColaboradores] = useState<'ATIVOS' | 'TODOS'>('ATIVOS')
  const [fSituacao, setFSituacao] = useState('ABERTOS')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean; ocultosPorInatividade?: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Modal novo período
  const [aberta, setAberta] = useState(false)
  const [mColaborador, setMColaborador] = useState('')
  const [mAnoIni, setMAnoIni] = useState(String(new Date().getFullYear() - 1))
  const [mAnoFim, setMAnoFim] = useState(String(new Date().getFullYear()))
  const [mDias, setMDias] = useState('30')
  const [mSaldoAnt, setMSaldoAnt] = useState('0')
  /** De onde veio o saldo sugerido (período anterior do colaborador). */
  const [mSaldoOrigem, setMSaldoOrigem] = useState<{ periodo: string; saldo: number } | null>(null)
  const [mSaldoCarregando, setMSaldoCarregando] = useState(false)
  const [mDescricao, setMDescricao] = useState('PERÍODO AQUISITIVO')
  const [mPrevisao, setMPrevisao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null)
  const [fIndicador, setFIndicador] = useState<IndicadorKey | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.controleFerias as any).listarColaboradores.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.controleFerias as any).listar.query({
        page, limit,
        search: debounced || undefined,
        colaboradorId: fColaborador || undefined,
        situacao: fSituacao || undefined,
        colaboradores: fColaboradores,
        indicador: fIndicador ?? undefined,
        sortBy, sortDir,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, fColaborador, fSituacao, fColaboradores, fIndicador, sortBy, sortDir])

  /**
   * Indicadores do topo: vêm do mesmo relatório de painel, para o número da
   * lista e o do relatório nunca discordarem. Acompanham o filtro de ativos /
   * desligados, e não a paginação — são do conjunto todo.
   */
  const carregarIndicadores = useCallback(async () => {
    try {
      const r = await (trpc.controleFerias as any).reportPainel.query({ incluirInativos: fColaboradores === 'TODOS' })
      setIndicadores(r.resumo)
    } catch { setIndicadores(null) }
  }, [fColaboradores])
  useEffect(() => { carregarIndicadores() }, [carregarIndicadores])
  useEffect(() => { fetchData() }, [fetchData])

  /**
   * Ao escolher o colaborador, o saldo anterior já vem preenchido com os dias
   * disponíveis do último período dele — é esse saldo que se arrasta para o
   * período novo. O usuário ainda pode sobrescrever.
   */
  async function escolherColaborador(id: string) {
    setMColaborador(id)
    setMSaldoOrigem(null)
    if (!id) { setMSaldoAnt('0'); return }
    setMSaldoCarregando(true)
    try {
      const r = await (trpc.controleFerias as any).saldoAnterior.query({ colaboradorId: id })
      setMSaldoAnt(String(r.saldo ?? 0))
      if (r.periodoInicial) setMSaldoOrigem({ periodo: `${r.periodoInicial}/${r.periodoFinal}`, saldo: r.saldo })
      // O período novo começa onde o anterior terminou.
      if (r.periodoFinal) { setMAnoIni(String(r.periodoFinal)); setMAnoFim(String(r.periodoFinal + 1)) }
    } catch { setMSaldoAnt('0') }
    finally { setMSaldoCarregando(false) }
  }

  async function salvar() {
    if (!mColaborador) { alerts.error('Falta o colaborador', ''); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.controleFerias as any).criar.mutate({
        colaboradorId: mColaborador,
        periodoInicial: Number(mAnoIni),
        periodoFinal: Number(mAnoFim),
        dias: Number(mDias) || 30,
        saldoAnterior: Number(mSaldoAnt) || 0,
        descricao: mDescricao || null,
        previsao: mPrevisao || null,
      })
      alerts.success('Criado', 'Período aquisitivo registrado.')
      carregarIndicadores()
      setAberta(false)
      router.push(`/controle-ferias/${id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function handleDelete(r: Row) {
    const ok = await alerts.confirm({
      title: `Excluir o período ${r.periodoInicial}/${r.periodoFinal}?`,
      text: 'Os gozos e recibos do período vão junto.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluir.mutate({ id: r.id })
      alerts.success('Excluído', '')
      fetchData()
      carregarIndicadores()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  /**
   * Ajuste inline de um campo do período — atualização otimista com rollback,
   * igual ao cadastro de usuários. Campos derivados (gozados, saldo) são
   * recalculados aqui para a linha refletir na hora, sem refetch.
   */
  async function inlineUpdate(id: string, patch: Record<string, unknown>) {
    const original = data?.data.find(r => r.id === id)
    if (!original) return
    const aplicar = (r: Row): Row => {
      const novo = { ...r, ...patch } as Row
      // Saldo = dias + saldo anterior − gozados (o backend usa a mesma conta)
      novo.saldo = Number(novo.dias) + Number(novo.saldoAnterior) - Number(novo.gozados)
      // "Pago" acompanha a data de pagamento, como no v1
      if ('pagamento1' in patch) novo.pago = !!patch.pagamento1
      return novo
    }
    setData(prev => prev ? { ...prev, data: prev.data.map(r => r.id === id ? aplicar(r) : r) } : prev)
    try {
      await (trpc as any).controleFerias.atualizar.mutate({ id, ...patch })
      // Dias e pagamento mexem no passivo — o topo acompanha.
      if ('dias' in patch || 'pagamento1' in patch) carregarIndicadores()
    } catch (e) {
      setData(prev => prev ? { ...prev, data: prev.data.map(r => r.id === id ? original : r) } : prev)
      throw e
    }
  }

  /**
   * Clicar no cartão recorta a tabela; clicar de novo desfaz. Os recortes de
   * saldo, vencimento e pagamento só fazem sentido sobre períodos vigentes,
   * então a situação vai junto — senão o clique traria zero linhas quando o
   * filtro estivesse em "Histórico".
   */
  function alternarIndicador(key: IndicadorKey) {
    setPage(1)
    if (fIndicador === key) { setFIndicador(null); return }
    setFIndicador(key)
    if (key !== 'GOZO_MES') setFSituacao('ABERTOS')
  }

  // Clique no cabeçalho ordena; segundo clique inverte (padrão das listagens).
  function ordenarPor(campo: string) {
    if (sortBy === campo) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(campo); setSortDir(campo === 'colaborador' ? 'asc' : 'desc') }
    setPage(1)
  }
  const ordenacao = { sortBy, sortDir, onSort: ordenarPor }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      {/* Header padrão (como o /clientes): barra full-bleed, título + trilha, ações à direita */}
      <PageHeaderBar
        actions={<>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/controle-ferias/relatorios')}>
            <BarChart3 className="h-4 w-4" />Relatórios
          </Button>
          {podeEscrever && (
            <Button size="sm" className="gap-1.5" onClick={() => setAberta(true)}>
              <Plus className="h-4 w-4" />Novo Período
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Controle de Férias</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Trabalhista</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Controle de Férias</span>
        </p>
      </PageHeaderBar>

      {indicadores && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Indicador
            label="Dias em aberto"
            valor={indicadores.diasEmAberto}
            hint={`${indicadores.comSaldo} colaborador(es) com saldo`}
            icone={CalendarDays}
            ativo={fIndicador === 'SALDO'}
            onClick={() => alternarIndicador('SALDO')}
          />
          <Indicador
            label="Férias vencidas"
            valor={indicadores.vencidos}
            hint="Devidas em dobro (art. 137)"
            cor="#e11d48"
            icone={CircleAlert}
            destaque={indicadores.vencidos > 0}
            ativo={fIndicador === 'VENCIDOS'}
            onClick={() => alternarIndicador('VENCIDOS')}
          />
          <Indicador
            label="Vencem em 90 dias"
            valor={indicadores.vencendo90}
            hint="Programe o gozo"
            cor="#f59e0b"
            icone={TriangleAlert}
            ativo={fIndicador === 'VENCENDO'}
            onClick={() => alternarIndicador('VENCENDO')}
          />
          <Indicador
            label="Gozo neste mês"
            valor={indicadores.gozosNoMes}
            hint={`${indicadores.gozandoNoMes} colaborador(es) de férias no mês`}
            cor="#0ea5e9"
            icone={Clock}
            ativo={fIndicador === 'GOZO_MES'}
            onClick={() => alternarIndicador('GOZO_MES')}
          />
          <Indicador
            label="A pagar"
            valor={indicadores.aPagar}
            hint="Períodos vigentes sem pagamento"
            cor="#8b5cf6"
            icone={Wallet}
            ativo={fIndicador === 'A_PAGAR'}
            onClick={() => alternarIndicador('A_PAGAR')}
          />
        </div>
      )}

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fSituacao || '__all__'} onValueChange={(v) => { setFSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="ABERTOS">Em aberto</SelectItem>
                <SelectItem value="HISTORICO">Histórico</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fColaborador || '__all__'} onValueChange={(v) => { setFColaborador(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[210px] text-xs bg-card"><SelectValue placeholder="Colaborador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os colaboradores</SelectItem>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fColaboradores} onValueChange={(v) => { setFColaboradores(v as 'ATIVOS' | 'TODOS'); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ATIVOS">Colaboradores ativos</SelectItem>
                <SelectItem value="TODOS">Incluir desligados</SelectItem>
              </SelectContent>
            </Select>
            {fIndicador && (
              <button
                type="button"
                onClick={() => { setFIndicador(null); setPage(1) }}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:bg-muted/50"
                title="Remover o recorte do indicador"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: MODULE_COLOR }} />
                Somente {INDICADOR_LABEL[fIndicador]}
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            {(data?.ocultosPorInatividade ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => { setFColaboradores('TODOS'); setPage(1) }}
                title="Registros de colaboradores desligados no cadastro — clique para incluí-los"
                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
              >
                +{data!.ocultosPorInatividade} desligado{data!.ocultosPorInatividade === 1 ? '' : 's'}
              </button>
            )}
            {(fColaborador || fSituacao !== 'ABERTOS' || fColaboradores !== 'ATIVOS') && (
              <Button variant="outline" size="xs" onClick={() => { setFColaborador(''); setFSituacao('ABERTOS'); setFColaboradores('ATIVOS'); setPage(1) }}>
                Limpar
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar em todas as colunas..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&_th]:whitespace-nowrap">
              <Th campo="numero" className="w-[64px]" {...ordenacao}>Nº</Th>
              <TableHead className="w-[48px]"><span className="sr-only">Foto</span></TableHead>
              <Th campo="colaborador" {...ordenacao}>Colaborador</Th>
              <Th campo="admissao" className="hidden lg:table-cell w-[110px]" align="center" {...ordenacao}>Dt Admissão</Th>
              <Th campo="periodo" className="w-[105px]" align="center" {...ordenacao}>Período</Th>
              <Th campo="descricao" className="hidden xl:table-cell w-[170px]" {...ordenacao}>Descrição</Th>
              <Th campo="dias" className="hidden md:table-cell w-[64px]" align="center" {...ordenacao}>Dias</Th>
              <Th campo="gozados" className="hidden md:table-cell w-[76px]" align="center" {...ordenacao}>Gozados</Th>
              <Th campo="saldo" className="w-[110px]" align="center" {...ordenacao}>Dias disp.</Th>
              <Th campo="previsao" className="hidden sm:table-cell w-[120px]" align="center" {...ordenacao}>Previsão pagto</Th>
              <Th campo="pagamento" className="w-[120px]" align="center" {...ordenacao}>Data pagto</Th>
              <TableHead className="w-[100px] pr-5 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={12} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum período encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer [&_td]:whitespace-nowrap [&_td]:py-2" onClick={() => router.push(`/controle-ferias/${r.id}`)}>
                  <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">{r.numero}</TableCell>
                  <TableCell>
                    <Avatar className="h-7 w-7">
                      {r.colaboradorImagem && <AvatarImage src={resolveAssetUrl(r.colaboradorImagem)} alt={r.colaboradorNomeResolvido ?? ''} />}
                      <AvatarFallback className="bg-muted text-[10px] font-semibold text-muted-foreground">
                        {iniciais(r.colaboradorNomeResolvido)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate font-medium">{r.colaboradorNomeResolvido ?? '—'}</span>
                      {r.colaboradorAtivo === false && (
                        <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-muted-foreground" title="Colaborador desligado no cadastro">
                          <UserX className="h-3 w-3" />desligado
                        </Badge>
                      )}
                      {r.colaboradorAtivo === null && (
                        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground" title="Registro do v1 sem vínculo com o cadastro atual">
                          fora do cadastro
                        </Badge>
                      )}
                      {r.periodosAnteriores > 0 && (
                        <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground" title={`Este colaborador tem mais ${r.periodosAnteriores} período(s) anterior(es) — abra o registro para consultar`}>
                          +{r.periodosAnteriores} {r.periodosAnteriores === 1 ? 'período' : 'períodos'}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center text-xs text-muted-foreground tabular-nums">{dataBR(r.colaboradorAdmissao)}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{r.periodoInicial}/{r.periodoFinal}</TableCell>
                  <TableCell className="hidden xl:table-cell text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="text"
                      value={r.descricao}
                      emptyLabel="Período aquisitivo"
                      disabled={!podeEscrever}
                      onSave={(v) => inlineUpdate(r.id, { descricao: v || null })}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center text-sm tabular-nums" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="number"
                      min={0}
                      max={60}
                      className="justify-center"
                      value={String(r.dias)}
                      display={() => <span className="tabular-nums">{r.dias + r.saldoAnterior}</span>}
                      disabled={!podeEscrever}
                      validate={(v) => (v.trim() === '' || Number.isNaN(Number(v)) ? 'Informe um número' : null)}
                      onSave={(v) => inlineUpdate(r.id, { dias: Number(v) })}
                    />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center text-sm tabular-nums">{r.gozados}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={cn('inline-flex h-6 min-w-[28px] items-center justify-center rounded px-1.5 text-xs font-bold tabular-nums', corSaldo(r.saldo))}
                      title={tituloSaldo(r.saldo)}
                    >
                      {r.saldo}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-xs tabular-nums" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="date"
                      className="justify-center"
                      value={isoDe(r.previsao)}
                      disabled={!podeEscrever}
                      display={() => (r.previsao
                        ? <span className="text-muted-foreground">{dataBR(r.previsao)}</span>
                        : <span className="text-amber-600 dark:text-amber-400">Incluir previsão</span>)}
                      onSave={(v) => inlineUpdate(r.id, { previsao: v || null })}
                    />
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {/* Como no v1: a data quando pago, senão o aviso "A pagar" */}
                    <InlineEditCell
                      type="date"
                      className="justify-center"
                      value={isoDe(r.pagamento1)}
                      disabled={!podeEscrever}
                      display={() => (r.pagamento1 ? (
                        <Badge variant="outline" className="justify-center text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                          <Check className="h-3 w-3 mr-0.5" />{dataBR(r.pagamento1)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="justify-center text-[10px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                          A pagar
                        </Badge>
                      ))}
                      onSave={(v) => inlineUpdate(r.id, { pagamento1: v || null })}
                    />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/controle-ferias/${r.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(r)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>)}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Modal: novo período ── */}
      <Dialog open={aberta} onOpenChange={(o) => { if (salvando) return; setAberta(o); if (!o) setMSaldoOrigem(null) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo período aquisitivo</DialogTitle>
            <DialogDescription>Os gozos, pagamentos e recibos entram no detalhe do período.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Colaborador <span className="text-rose-500">*</span></Label>
                <div className="mt-1.5">
                  <UserCombobox users={usuarios} value={mColaborador} onSelect={escolherColaborador} placeholder="Selecione o colaborador" />
                </div>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Ano inicial</Label>
                <Input type="number" value={mAnoIni} onChange={(e) => setMAnoIni(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Ano final</Label>
                <Input type="number" value={mAnoFim} onChange={(e) => setMAnoFim(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Dias</Label>
                <Input type="number" value={mDias} onChange={(e) => setMDias(e.target.value)} className="h-9 text-sm mt-1.5" min="0" max="60" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Saldo anterior</Label>
                <div className="relative mt-1.5">
                  <Input type="number" value={mSaldoAnt} onChange={(e) => { setMSaldoAnt(e.target.value); setMSaldoOrigem(null) }} className="h-9 text-sm" />
                  {mSaldoCarregando && <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                </div>
              </div>
              {mSaldoOrigem && (
                <p className="col-span-12 -mt-1.5 text-[11px] text-muted-foreground">
                  Saldo anterior sugerido: <b className="text-foreground">{mSaldoOrigem.saldo}</b> dia(s) disponíveis do período {mSaldoOrigem.periodo}.
                </p>
              )}
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={mDescricao} onChange={(e) => setMDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={200} />
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Previsão de gozo</Label>
                <Input type="date" value={mPrevisao} onChange={(e) => setMPrevisao(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Cabeçalho ordenável — clique alterna asc/desc na coluna. */
function Th({ campo, children, className, align, sortBy, sortDir, onSort }: {
  campo: string
  children: React.ReactNode
  className?: string
  align?: 'center'
  sortBy: string
  sortDir: 'asc' | 'desc'
  onSort: (campo: string) => void
}) {
  const ativo = sortBy === campo
  const Icone = !ativo ? ChevronsUpDown : sortDir === 'asc' ? ChevronUp : ChevronDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(campo)}
        className={cn('group inline-flex items-center gap-1 transition-colors hover:text-foreground', align === 'center' && 'w-full justify-center', ativo && 'text-foreground')}
        title={`Ordenar por ${String(children)}`}
      >
        {children}
        <Icone className={cn('h-3 w-3 shrink-0 transition-opacity', ativo ? 'opacity-100' : 'opacity-0 group-hover:opacity-50')} />
      </button>
    </TableHead>
  )
}
