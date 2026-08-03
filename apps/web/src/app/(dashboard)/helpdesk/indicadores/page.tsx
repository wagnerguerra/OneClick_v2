'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  BarChart3, Loader2, AlertTriangle, CheckCircle2, Star, Clock,
  Inbox, RefreshCcw, TrendingUp, Tag, Users, ListChecks, Activity,
  Search, ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react'
import Link from 'next/link'
import {
  Card, CardContent, Badge, Button, Input, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Avatar, AvatarImage, AvatarFallback,
} from '@saas/ui'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fmtDateBR } from '@/lib/date'
import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_TIPO_LABELS,
  HELPDESK_PRIORIDADE_COLORS,
  type HelpdeskStatus, type HelpdeskPrioridade, type HelpdeskTipo,
} from '@saas/types'

// Cor do módulo (helpdesk = ti, slug cyan). var() preferencial + fallback.
const MOD = 'var(--mod-ti, #22d3ee)'

// ── Tipos do retorno do endpoint helpdesk.dashboard ────────────────
interface Dashboard {
  range: { inicio: string; fim: string }
  granularidade: 'dia' | 'mes'
  kpis: {
    criados: number
    resolvidos: number
    backlogAbertos: number
    backlogAtrasados: number
    slaCumprimentoPct: number | null
    csatMedio: number | null
    csatRespostas: number
    tfrHoras: number | null
    mttrHoras: number | null
    taxaReaberturaPct: number | null
    ticketsReabertos: number
  }
  porStatus: Array<{ status: HelpdeskStatus; total: number }>
  porPrioridade: Array<{ prioridade: HelpdeskPrioridade; total: number }>
  porTipo: Array<{ tipo: HelpdeskTipo; total: number }>
  csatDist: Array<{ nota: number; total: number }>
  serie: Array<{ periodo: string; criados: number; resolvidos: number }>
  porCategoria: Array<{ id: string | null; nome: string; cor: string | null; total: number; pct: number }>
  porResponsavel: Array<{ id: string; name: string; image: string | null; total: number; mttrHoras: number | null; slaPct: number | null; csatMedio: number | null; csatRespostas: number }>
  slaEstourados: Array<{
    id: string; numero: number; titulo: string; prioridade: HelpdeskPrioridade
    status: HelpdeskStatus; prazoSla: string | null; createdAt: string
    responsavel: string | null; categoria: { nome: string; cor: string | null } | null
  }>
}

// C9 — lista de avaliações (CSAT). Usada tanto no painel reduzido (só as
// próprias, do agente sem métricas completas) quanto no completo (todas ou de um
// responsável). `responsavelNome` só é relevante na visão "todos".
interface Avaliacao {
  ticketId: string; numero: number; titulo: string
  nota: number | null; comentario: string | null
  responsavelId?: string | null
  responsavelNome?: string | null
  responsavelImage?: string | null
  solicitanteNome?: string | null
  solicitanteImage?: string | null
  respondidoEm: string | null
}
interface AvaliacoesLista {
  media: number | null
  total: number
  avaliacoes: Avaliacao[]
}

function formatHoras(h: number | null): string {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Iniciais (1-2 letras) a partir do nome, para o fallback do avatar. */
function iniciais(nome?: string | null): string {
  if (!nome?.trim()) return '?'
  const partes = nome.trim().split(/\s+/)
  const primeira = partes[0]?.[0] ?? ''
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : ''
  return (primeira + ultima).toUpperCase()
}

const STATUS_COR: Record<HelpdeskStatus, string> = {
  NOVO: '#3b82f6',
  AGUARDANDO_AUDITORIA: '#06b6d4',
  EM_ANDAMENTO: '#f59e0b',
  RESOLVIDO: '#a855f7',
  CONCLUIDO: '#10b981',
  CANCELADO: '#ef4444',
}

// Cores para distribuição de CSAT (1=ruim → 5=ótimo)
const CSAT_COR: Record<number, string> = {
  1: '#ef4444', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#10b981',
}

/** Uma entrada do histórico de avaliações. O avatar/nome é de quem AVALIOU
 *  (solicitante); o responsável avaliado aparece rotulado ("Atendido por").
 *  `showAvatar` liga o avatar do solicitante; `showResp` mostra o responsável
 *  (útil na visão "todos"). Reusada no painel reduzido e no histórico completo. */
function AvaliacaoRow({ a, showResp, showAvatar }: { a: Avaliacao; showResp?: boolean; showAvatar?: boolean }) {
  const autor = a.solicitanteNome?.trim() || 'Solicitante'
  return (
    <div className="flex items-start gap-3 py-3">
      {showAvatar && (
        <Avatar className="mt-0.5 h-8 w-8 shrink-0" title={`Avaliação feita por ${autor}`}>
          {a.solicitanteImage && <AvatarImage src={a.solicitanteImage} alt={autor} />}
          <AvatarFallback className="text-[10px]">{iniciais(a.solicitanteNome)}</AvatarFallback>
        </Avatar>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-medium text-foreground/80">{autor}</span>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="flex shrink-0 items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
              <Star key={n} className={cn('h-3.5 w-3.5', n <= (a.nota ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30')} />
            ))}
          </span>
          <span className="text-xs font-semibold tabular-nums">{a.nota ?? '—'}/5</span>
        </div>
        {a.comentario?.trim() ? (
          <p className="mt-1 text-sm text-foreground">“{a.comentario.trim()}”</p>
        ) : (
          <p className="mt-1 text-sm italic text-muted-foreground/60">Sem comentário</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <Link href={`/helpdesk/${a.ticketId}`} className="inline-flex min-w-0 items-center gap-1.5 hover:underline">
            <span className="font-mono shrink-0">#HLP{String(a.numero).padStart(4, '0')}</span>
            <span className="truncate">· {a.titulo}</span>
          </Link>
          {showResp && a.responsavelNome && (
            <span className="inline-flex items-center gap-1">
              · Atendido por:
              <Avatar className="h-4 w-4">
                {a.responsavelImage && <AvatarImage src={a.responsavelImage} alt={a.responsavelNome} />}
                <AvatarFallback className="text-[8px]">{iniciais(a.responsavelNome)}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground/80">{a.responsavelNome}</span>
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {a.respondidoEm ? new Date(a.respondidoEm).toLocaleDateString('pt-BR') : ''}
      </span>
    </div>
  )
}

/**
 * C9 — visão do agente sem acesso às métricas completas: só as avaliações que
 * ele recebeu como responsável (média + total + lista).
 */
function MinhasAvaliacoesView({ minhas }: { minhas: AvaliacoesLista | null }) {
  const [q, setQ] = useState('')
  const [notaFiltro, setNotaFiltro] = useState('__all__')
  const filtradas = useMemo(
    () => aplicarFiltrosAvaliacoes(minhas?.avaliacoes ?? [], q, notaFiltro),
    [minhas, q, notaFiltro],
  )
  if (!minhas) return null
  const semAvaliacoes = minhas.avaliacoes.length === 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Star className="h-3.5 w-3.5" /> Minha média de CSAT
          </div>
          <p className="text-3xl font-bold tabular-nums">
            {minhas.media === null ? '—' : minhas.media.toFixed(1)}
            {minhas.media !== null && <span className="ml-1 text-lg text-muted-foreground">/ 5</span>}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Avaliações recebidas
          </div>
          <p className="text-3xl font-bold tabular-nums">{minhas.total}</p>
        </CardContent></Card>
      </div>
      <Card><CardContent className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4" /> Minhas avaliações
        </h3>
        {!semAvaliacoes && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BuscaAvaliacoes value={q} onChange={setQ} className="w-[320px]" />
            <FiltroNotaSelect value={notaFiltro} onChange={setNotaFiltro} />
          </div>
        )}
        {semAvaliacoes ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Você ainda não recebeu avaliações no período.</div>
        ) : filtradas.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">Nenhuma avaliação corresponde aos filtros.</div>
        ) : (
          <div className="divide-y">
            {filtradas.map(a => <AvaliacaoRow key={a.ticketId} a={a} showAvatar />)}
          </div>
        )}
      </CardContent></Card>
    </div>
  )
}

const HIST_PAGE_SIZE = 6

/** Normaliza texto para busca (minúsculo + sem acentos). */
function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Aplica filtro por nota + busca textual sobre uma lista de avaliações
 *  (client-side). Compartilhado pelas visões reduzida e completa. */
function aplicarFiltrosAvaliacoes(avaliacoes: Avaliacao[], q: string, notaFiltro: string): Avaliacao[] {
  const termo = normalizar(q.trim())
  const nota = notaFiltro === '__all__' ? null : Number(notaFiltro)
  let base = avaliacoes
  if (nota !== null) base = base.filter(a => a.nota === nota)
  if (termo) base = base.filter(a => normalizar(
    `${a.comentario ?? ''} ${a.titulo} #hlp${String(a.numero).padStart(4, '0')} ${a.responsavelNome ?? ''} ${a.solicitanteNome ?? ''}`,
  ).includes(termo))
  return base
}

/** Campo de busca das avaliações (ícone + input). */
function BuscaAvaliacoes({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={e => onChange(e.target.value)}
        placeholder="Buscar comentário, ticket, solicitante…"
        className="h-8 pl-8 text-xs" />
    </div>
  )
}

/** Select de filtro por nota (estrelas cheias/vazias). */
function FiltroNotaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">Todas as notas</SelectItem>
        {[5, 4, 3, 2, 1].map(n => (
          <SelectItem key={n} value={String(n)}>
            <span className="flex items-center">
              <span className="text-amber-400">{'★'.repeat(n)}</span>
              <span className="text-muted-foreground/40">{'★'.repeat(5 - n)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * C9a — Histórico de avaliações (painel COMPLETO): filtro por responsável +
 * busca textual + paginação. O período segue o filtro de data do topo da
 * página (props inicio/fim). O responsável + período é server-side
 * (avaliacoesCompletas); a busca e a paginação são client-side sobre o
 * conjunto retornado.
 */
function AvaliacoesCompletasCard({ responsaveis, inicio, fim }: {
  responsaveis: Array<{ id: string; name: string }>
  inicio: string
  fim: string
}) {
  const [respId, setRespId] = useState('__all__')
  const [notaFiltro, setNotaFiltro] = useState('__all__')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [lista, setLista] = useState<AvaliacoesLista | null>(null)
  const [carregando, setCarregando] = useState(false)

  // UX: ao selecionar um filtro, traz o cabeçalho da seção para logo abaixo das
  // abas fixas (scroll-mt-[110px] no wrapper). Pula o primeiro render.
  const cardRef = useRef<HTMLDivElement>(null)
  const primeiraRender = useRef(true)
  useEffect(() => {
    if (primeiraRender.current) { primeiraRender.current = false; return }
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [respId, notaFiltro])

  // Server-side: responsável + período (o período vem do filtro do topo)
  useEffect(() => {
    setCarregando(true)
    ;(trpc.helpdesk as any).avaliacoesCompletas
      .query({ responsavelId: respId === '__all__' ? undefined : respId, inicio, fim })
      .then((r: AvaliacoesLista) => setLista(r))
      .catch(() => setLista(null))
      .finally(() => setCarregando(false))
  }, [respId, inicio, fim])

  // Client-side: filtro por nota + busca textual sobre o conjunto retornado
  const filtradas = useMemo(
    () => aplicarFiltrosAvaliacoes(lista?.avaliacoes ?? [], q, notaFiltro),
    [lista, q, notaFiltro],
  )

  // Reset de página quando qualquer filtro/busca muda
  useEffect(() => { setPage(1) }, [respId, inicio, fim, q, notaFiltro])

  const media = useMemo(() => {
    const notas = filtradas.map(a => a.nota ?? 0).filter(n => n > 0)
    return notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null
  }, [filtradas])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / HIST_PAGE_SIZE))
  const pagina = Math.min(page, totalPaginas)
  const slice = filtradas.slice((pagina - 1) * HIST_PAGE_SIZE, pagina * HIST_PAGE_SIZE)

  return (
    <div ref={cardRef} className="scroll-mt-[110px]">
    <Card><CardContent className="p-4">
      {/* Cabeçalho */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Star className="h-4 w-4" /> Histórico de avaliações
          {filtradas.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              — média {media?.toFixed(1)} · {filtradas.length} avaliaç{filtradas.length === 1 ? 'ão' : 'ões'}
            </span>
          )}
        </h3>
        {/* Indica que o período segue o filtro de data do topo da página */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground" title="O período segue o filtro de data no topo da página">
          <CalendarDays className="h-3.5 w-3.5" />
          {fmtDateBR(inicio)} – {fmtDateBR(fim)}
        </span>
      </div>

      {/* Filtros: busca + responsável + nota */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BuscaAvaliacoes value={q} onChange={setQ} className="w-[320px]" />
        <Select value={respId} onValueChange={setRespId}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os responsáveis</SelectItem>
            {responsaveis.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <FiltroNotaSelect value={notaFiltro} onChange={setNotaFiltro} />
      </div>

      {/* Lista paginada. Durante um recarregamento (troca de responsável) a
          lista anterior permanece visível esmaecida, para a altura não colapsar
          e o scroll do filtro não estourar. Só o primeiro load mostra vazio. */}
      {lista === null ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Carregando…</div>
      ) : filtradas.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">
          {q.trim() || notaFiltro !== '__all__' ? 'Nenhuma avaliação corresponde aos filtros.' : 'Nenhuma avaliação no período.'}
        </div>
      ) : (
        <div className={cn('transition-opacity', carregando && 'pointer-events-none opacity-50')}>
          <div className="divide-y">
            {slice.map(a => <AvaliacaoRow key={a.ticketId} a={a} showResp={respId === '__all__'} showAvatar />)}
          </div>
          {totalPaginas > 1 && (
            <div className="mt-3 flex items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2" disabled={pagina <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Anterior
                </Button>
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2" disabled={pagina >= totalPaginas}
                  onClick={() => setPage(p => Math.min(totalPaginas, p + 1))}>
                  Próxima <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
              <span>Página {pagina} de {totalPaginas}</span>
            </div>
          )}
        </div>
      )}
    </CardContent></Card>
    </div>
  )
}

export default function HelpdeskIndicadoresPage() {
  const hoje = useMemo(() => new Date(), [])
  const [inicio, setInicio] = useState(() => toInputDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)))
  const [fim, setFim] = useState(() => toInputDate(new Date()))
  const [data, setData] = useState<Dashboard | null>(null)
  const [minhas, setMinhas] = useState<AvaliacoesLista | null>(null)
  const [loading, setLoading] = useState(true)
  // null = ainda probando; governa a bifurcação completa × só minhas avaliações.
  const [completas, setCompletas] = useState<boolean | null>(null)

  // Probe uma vez: define se o usuário vê as métricas completas ou só as próprias.
  useEffect(() => {
    ;(trpc.helpdesk as any).probeMetricasCompletas.query()
      .then((c: boolean) => setCompletas(!!c))
      .catch(() => setCompletas(false))
  }, [])

  const fetchData = useCallback(() => {
    if (completas === null) return
    setLoading(true)
    const req = completas
      ? (trpc.helpdesk as any).dashboard.query({ inicio, fim }).then((d: Dashboard) => setData(d))
      : (trpc.helpdesk as any).minhasAvaliacoes.query({ inicio, fim }).then((m: AvaliacoesLista) => setMinhas(m))
    req
      .catch((e: Error) => { alerts.error('Erro ao carregar indicadores', e.message) })
      .finally(() => setLoading(false))
  }, [inicio, fim, completas])

  useEffect(() => { fetchData() }, [fetchData])

  const aplicarPreset = (dias: number) => {
    setInicio(toInputDate(new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000)))
    setFim(toInputDate(hoje))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MOD}, color-mix(in srgb, ${MOD} 87%, transparent))` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>HelpDesk — Indicadores</h1>
            <p className="text-sm text-muted-foreground">
              {completas === false
                ? 'Suas avaliações (CSAT) recebidas como responsável no período.'
                : 'Volume, SLA, tempos de atendimento, CSAT e relatórios por categoria e responsável.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
            <Input
              type="date" value={inicio} max={fim}
              onChange={e => setInicio(e.target.value)}
              className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input
              type="date" value={fim} min={inicio} max={toInputDate(hoje)}
              onChange={e => setFim(e.target.value)}
              className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            {[7, 30, 90].map(d => (
              <Button key={d} variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => aplicarPreset(d)}>
                {d}d
              </Button>
            ))}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchData} title="Atualizar">
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <BackButton href="/helpdesk" />
        </div>
      </div>

      {completas === null || loading || (completas && !data) ? (
        <Card><CardContent className="flex items-center justify-center gap-2 p-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando indicadores...
        </CardContent></Card>
      ) : !completas ? (
        <MinhasAvaliacoesView minhas={minhas} />
      ) : data ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Criados no período" value={data.kpis.criados} icon={Inbox} tone="cyan" />
            <Kpi label="Resolvidos" value={data.kpis.resolvidos} icon={CheckCircle2} tone="emerald" />
            <Kpi
              label="Backlog em aberto"
              value={data.kpis.backlogAbertos}
              sub={data.kpis.backlogAtrasados > 0 ? `${data.kpis.backlogAtrasados} atrasado(s)` : 'no prazo'}
              icon={Activity}
              tone={data.kpis.backlogAtrasados > 0 ? 'amber' : 'slate'}
            />
            <Kpi
              label="SLA cumprido"
              value={data.kpis.slaCumprimentoPct === null ? '—' : `${data.kpis.slaCumprimentoPct}%`}
              icon={Clock}
              tone={slaTone(data.kpis.slaCumprimentoPct)}
            />
            <Kpi
              label="CSAT médio"
              value={data.kpis.csatMedio === null ? '—' : `${data.kpis.csatMedio.toFixed(1)}`}
              sub={`${data.kpis.csatRespostas} resposta(s)`}
              icon={Star}
              tone="violet"
            />
            <Kpi
              label="Taxa de reabertura"
              value={data.kpis.taxaReaberturaPct === null ? '—' : `${data.kpis.taxaReaberturaPct}%`}
              sub={`${data.kpis.ticketsReabertos} reaberto(s)`}
              icon={RefreshCcw}
              tone={data.kpis.taxaReaberturaPct !== null && data.kpis.taxaReaberturaPct > 10 ? 'rose' : 'emerald'}
            />
          </div>

          {/* Tempos */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card><CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Tempo médio de 1ª resposta (TFR)
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.tfrHoras)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Tempo médio de resolução (MTTR)
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.mttrHoras)}</p>
            </CardContent></Card>
          </div>

          {/* Série temporal: criados x resolvidos */}
          <Card><CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4" /> Tendência — criados x resolvidos ({data.granularidade === 'mes' ? 'por mês' : 'por dia'})
            </h3>
            {data.serie.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.serie} margin={{ left: -18, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCriados" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradResolvidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="criados" name="Criados" stroke="#22d3ee" fill="url(#gradCriados)" strokeWidth={2} />
                  <Area type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#10b981" fill="url(#gradResolvidos)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>

          {/* Distribuições */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Por status (backlog atual) */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4" /> Tickets por status (atual)
              </h3>
              {data.porStatus.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.porStatus.map(s => ({ name: HELPDESK_STATUS_LABELS[s.status], value: s.total, status: s.status }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                      paddingAngle={2}
                    >
                      {data.porStatus.map(s => <Cell key={s.status} fill={STATUS_COR[s.status]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>

            {/* Por prioridade */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" /> Criados por prioridade
              </h3>
              {data.porPrioridade.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.porPrioridade.map(p => ({ name: HELPDESK_PRIORIDADE_LABELS[p.prioridade], value: p.total, prioridade: p.prioridade }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]}>
                      {data.porPrioridade.map(p => <Cell key={p.prioridade} fill={HELPDESK_PRIORIDADE_COLORS[p.prioridade]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>

            {/* CSAT distribuição */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Star className="h-4 w-4" /> Distribuição de CSAT
              </h3>
              {data.kpis.csatRespostas === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Sem avaliações no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.csatDist.map(c => ({ name: `${c.nota}★`, value: c.total, nota: c.nota }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Respostas" radius={[4, 4, 0, 0]}>
                      {data.csatDist.map(c => <Cell key={c.nota} fill={CSAT_COR[c.nota] ?? '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
          </div>

          {/* Criados por tipo + SLA estourados */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4" /> Criados por tipo
              </h3>
              {data.porTipo.length === 0 ? <Empty /> : (
                <div className="space-y-2">
                  {data.porTipo.map(t => {
                    const max = Math.max(...data.porTipo.map(x => x.total), 1)
                    return (
                      <div key={t.tipo} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{HELPDESK_TIPO_LABELS[t.tipo]}</span>
                          <span className="font-medium tabular-nums">{t.total}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${(t.total / max) * 100}%`, backgroundColor: MOD }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent></Card>

            {/* SLA estourados / mais antigos abertos */}
            <Card className="lg:col-span-2"><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-rose-500" /> SLA estourado — abertos mais críticos
              </h3>
              {data.slaEstourados.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">Nenhum ticket aberto com SLA estourado. 🎉</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Prioridade</TableHead>
                      <TableHead className="text-xs">Responsável</TableHead>
                      <TableHead className="text-right text-xs">Venceu há</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slaEstourados.map(t => {
                      const atrasoMs = t.prazoSla ? Date.now() - new Date(t.prazoSla).getTime() : 0
                      const atrasoH = atrasoMs / 3600_000
                      return (
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => window.open(`/helpdesk/${t.id}`, '_blank')}>
                          <TableCell className="text-sm">
                            <span className="font-mono text-[11px] text-muted-foreground">#HLP{String(t.numero).padStart(4, '0')}</span>
                            <span className="ml-2 truncate">{t.titulo}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-medium" style={{ color: HELPDESK_PRIORIDADE_COLORS[t.prioridade] }}>
                              {HELPDESK_PRIORIDADE_LABELS[t.prioridade]}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.responsavel ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-rose-600">{formatHoras(atrasoH)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>

          {/* Relatórios — tabelas */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Por categoria */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Tag className="h-4 w-4" /> Tickets por categoria
              </h3>
              {data.porCategoria.length === 0 ? <Empty /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Categoria</TableHead>
                      <TableHead className="text-right text-xs">Volume</TableHead>
                      <TableHead className="text-right text-xs">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.porCategoria.map(c => (
                      <TableRow key={c.id ?? 'sem'}>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.cor || MOD }} />
                            <span className="truncate">{c.nome}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.total}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{c.pct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>

            {/* Por responsável */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Desempenho por responsável
              </h3>
              {data.porResponsavel.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Sem tickets resolvidos atribuídos no período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agente</TableHead>
                      <TableHead className="text-right text-xs">Resolvidos</TableHead>
                      <TableHead className="text-right text-xs">MTTR</TableHead>
                      <TableHead className="text-right text-xs">SLA</TableHead>
                      <TableHead className="text-right text-xs">CSAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.porResponsavel.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-[160px] truncate text-sm">{a.name}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{a.total}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatHoras(a.mttrHoras)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {a.slaPct === null ? '—' : (
                            <Badge
                              variant="outline"
                              className={
                                a.slaPct >= 90 ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800'
                                  : a.slaPct >= 70 ? 'border-amber-300 text-amber-600 dark:border-amber-800'
                                  : 'border-rose-300 text-rose-600 dark:border-rose-800'
                              }
                            >
                              {a.slaPct}%
                            </Badge>
                          )}
                        </TableCell>
                        {/* C9 — CSAT médio por responsável (nº de avaliações no período entre parênteses) */}
                        <TableCell className="text-right text-sm tabular-nums">
                          {a.csatMedio === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="inline-flex items-center justify-end gap-1" title={`${a.csatRespostas} avaliação${a.csatRespostas === 1 ? '' : 'ões'} no período`}>
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              <span className="font-medium">{a.csatMedio.toFixed(1)}</span>
                              <span className="text-[11px] text-muted-foreground">({a.csatRespostas})</span>
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>

          {/* Lista de avaliações — todas ou de um responsável específico */}
          <AvaliacoesCompletasCard
            responsaveis={data.porResponsavel.map(a => ({ id: a.id, name: a.name }))}
            inicio={inicio}
            fim={fim}
          />
        </>
      ) : (
        <Card><CardContent className="flex items-center justify-center gap-2 p-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando indicadores...
        </CardContent></Card>
      )}
    </div>
  )
}

function slaTone(pct: number | null): KpiTone {
  if (pct === null) return 'slate'
  if (pct >= 90) return 'emerald'
  if (pct >= 70) return 'amber'
  return 'rose'
}

type KpiTone = 'cyan' | 'rose' | 'emerald' | 'violet' | 'amber' | 'slate'

function Kpi({ label, value, sub, icon: Icon, tone }: {
  label: string
  value: number | string
  sub?: string
  icon: typeof Inbox
  tone: KpiTone
}) {
  const styles: Record<KpiTone, string> = {
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-600',
    rose: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600',
    violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600',
    slate: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 text-slate-600',
  }
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${styles[tone]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
        {sub && <p className="text-[10px] opacity-70">{sub}</p>}
      </div>
    </div>
  )
}

function Empty() {
  return <div className="py-12 text-center text-xs text-muted-foreground">Sem dados no período.</div>
}

// Tooltip custom com tokens de tema (dark-mode safe)
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: { name?: string } }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {(label !== undefined && label !== '') && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
          {p.name ?? p.payload?.name}: <span className="font-semibold text-foreground tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  )
}
