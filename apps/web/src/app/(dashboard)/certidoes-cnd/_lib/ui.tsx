'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, Clock, Loader2, MinusCircle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDown, ArrowUp, ArrowUpDown,
  type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, cn,
} from '@saas/ui'
import { BADGE, TEXT, type ColorName } from '@/lib/color-styles'
import { masks, limparCnpj } from '@/lib/masks'

/**
 * Peças comuns às abas de /certidoes-cnd (05/10/2026).
 *
 * A tela era um componente único de quase 4 mil linhas, com a mesma tabela,
 * o mesmo modal de lote e a mesma paginação reescritos em cada aba — cada um
 * com uma cor e um detalhe diferente. Aqui fica uma versão de cada.
 */

/**
 * Primária do tema — destaque da tela (seleção, pílula ativa). A cor do módulo
 * Legalização NÃO entra no conteúdo (ver /admin/design-system → Tokens & cores).
 */
export const PRIMARY = 'var(--color-primary)'

export const MUNICIPIOS = [
  { value: 'VITÓRIA', label: 'Vitória' },
  { value: 'VILA VELHA', label: 'Vila Velha' },
  { value: 'SERRA', label: 'Serra' },
  { value: 'CARIACICA', label: 'Cariacica' },
] as const

// ── Formatação ──────────────────────────────────────────

export function formatDoc(d: string | null | undefined) {
  if (!d) return '—'
  const clean = limparCnpj(d) // preserva letras do CNPJ alfanumérico
  if (clean.length === 11) return masks.cpf(clean)
  if (clean.length === 14) return masks.cnpj(clean)
  return d
}

export function formatDate(d: string | null | undefined) {
  if (!d) return '—'
  // Data pura "YYYY-MM-DD" sem fuso: `new Date()` a leria como UTC e mostraria o dia anterior.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR')
}

export function formatDateTime(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function documentoValido(d: string) {
  return limparCnpj(d).length >= 11
}

// ── Badges ──────────────────────────────────────────────

export function StatusBadge({ tone, icon: Icon, children, title }: { tone: ColorName; icon: LucideIcon; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium', BADGE[tone])}>
      <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{children}</span>
    </span>
  )
}

/**
 * Situação de uma certidão pelo texto que o backend grava em `tipo_certidao`
 * ("Negativa", "Positiva com efeito de negativa", "Positiva", "Nada Consta",
 * "Regular"...). Positiva é certidão emitida, mas com débito — por isso âmbar,
 * não verde.
 */
export function SituacaoBadge({ sucesso, tipo, falha = 'Não emitida', title }: { sucesso: boolean; tipo: string | null; falha?: string; title?: string }) {
  const t = (tipo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!sucesso && !t) return <StatusBadge tone="red" icon={XCircle} title={title}>{falha}</StatusBadge>
  if (/positiva.*efeito/.test(t)) return <StatusBadge tone="amber" icon={AlertTriangle} title={title}>{tipo}</StatusBadge>
  if (/positiva|irregular|^consta$/.test(t)) return <StatusBadge tone="red" icon={XCircle} title={title}>{tipo}</StatusBadge>
  if (/negativa|nada consta|regular|emitid/.test(t)) return <StatusBadge tone="emerald" icon={CheckCircle2} title={title}>{tipo}</StatusBadge>
  if (!sucesso) return <StatusBadge tone="red" icon={XCircle} title={title}>{tipo || falha}</StatusBadge>
  return <StatusBadge tone="slate" icon={Clock} title={title}>{tipo || 'Pendente'}</StatusBadge>
}

/** Validade com contagem de dias (renderiza só no cliente: depende de "hoje"). */
export function ValidadeBadge({ data }: { data: string | null | undefined }) {
  const [dias, setDias] = useState<number | null>(null)
  useEffect(() => {
    if (!data) return
    const v = new Date(`${data.slice(0, 10)}T00:00:00`)
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    setDias(Math.round((v.getTime() - hoje.getTime()) / 86_400_000))
  }, [data])
  if (!data) return <span className="text-xs text-muted-foreground">—</span>
  const txt = formatDate(data.slice(0, 10))
  if (dias === null) return <span className="text-xs text-muted-foreground">{txt}</span>
  if (dias < 0) return <StatusBadge tone="red" icon={XCircle}>{txt}</StatusBadge>
  if (dias <= 15) return <StatusBadge tone="amber" icon={Clock}>{txt} ({dias}d)</StatusBadge>
  return <StatusBadge tone="emerald" icon={CheckCircle2}>{txt}</StatusBadge>
}

/** Ícone do item no log de um lote — inclusive o "pulado" (certidão ainda válida). */
export function LoteItemIcon({ status }: { status: string }) {
  if (status === 'emitida' || status === 'encontrado' || status === 'ok' || status === 'sucesso') return <CheckCircle2 className={cn('h-3 w-3 shrink-0', TEXT.emerald)} />
  if (status === 'nao_emitida' || status === 'nao_encontrado' || status === 'sem_pdf') return <AlertTriangle className={cn('h-3 w-3 shrink-0', TEXT.amber)} />
  if (status === 'erro' || status === 'falha') return <XCircle className={cn('h-3 w-3 shrink-0', TEXT.red)} />
  if (status === 'processando') return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
  if (status === 'pulada' || status === 'pulado') return <span title="Já válida — não reemitida"><MinusCircle className={cn('h-3 w-3 shrink-0', TEXT.sky)} /></span>
  return <Clock className="h-3 w-3 shrink-0 text-muted-foreground/50" />
}

// ── Indicadores (filtros) ───────────────────────────────

/** Hex de status para o anel/ícone dos indicadores (estilo inline — `*_COR`). */
export const STATUS_COR = {
  // Indicador "Total"/"Todas": primária legível sobre a superfície (anel, ícone e tint).
  primaria: 'var(--color-primary-on-surface)',
  emerald: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
  slate: '#64748b',
} as const

export interface Indicador {
  key: string
  label: string
  count: number
  cor: string
  icon: LucideIcon
  /** Some quando zerado (filtros secundários). */
  ocultarSeZero?: boolean
}

// Literais: o JIT do Tailwind não enxerga classe interpolada.
const XL_COLS: Record<number, string> = { 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-6', 7: 'xl:grid-cols-7' }

/** Mesma anatomia dos indicadores de /clientes e /gestao-certificados. */
export function Indicadores({ itens, ativo, onChange }: { itens: Indicador[]; ativo: string; onChange?: (key: string) => void }) {
  const visiveis = itens.filter(i => !i.ocultarSeZero || i.count > 0 || ativo === i.key)
  return (
    <div className={cn('grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4', XL_COLS[visiveis.length] ?? 'xl:grid-cols-7')}>
      {visiveis.map(f => {
        const Icone = f.icon
        const ligado = ativo === f.key
        return (
          <button key={f.key} type="button" onClick={() => onChange?.(f.key)} aria-pressed={ligado} disabled={!onChange}
            title={onChange ? `Filtrar por ${f.label.toLowerCase()}` : undefined}
            className={cn('flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all',
              onChange ? 'hover:-translate-y-0.5 hover:shadow-sm' : 'cursor-default',
              ligado ? 'border-transparent ring-2' : 'border-border')}
            style={ligado ? { boxShadow: `0 0 0 2px ${f.cor}` } : undefined}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `color-mix(in srgb, ${f.cor} 12%, transparent)`, color: f.cor }}>
              <Icone className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-none tabular-nums text-foreground">{f.count.toLocaleString('pt-BR')}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{f.label}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Toolbar e paginação (PADRAO_PAGINAS §1.3/§1.4) ──────

export const LIMITES = [10, 20, 50, 100] as const

export function useDebounced<T>(valor: T, ms = 400) {
  const [v, setV] = useState(valor)
  useEffect(() => { const t = setTimeout(() => setV(valor), ms); return () => clearTimeout(t) }, [valor, ms])
  return v
}

export function ListToolbar({ limit, setLimit, search, setSearch, placeholder = 'Buscar por cliente ou documento...', filtros, acoes }: {
  limit: number
  setLimit: (n: number) => void
  search: string
  setSearch: (s: string) => void
  placeholder?: string
  /** Selects extras ao lado de "Exibir" (município, tipo). */
  filtros?: ReactNode
  /** Botões da aba (Consultar, Lote...). */
  acoes?: ReactNode
}) {
  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="hidden sm:inline">Exibir</span>
        <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
          <SelectTrigger className="h-8 w-[68px] bg-card text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{LIMITES.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
        </Select>
        <span className="hidden sm:inline">registros</span>
        {filtros}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="search" placeholder={placeholder} value={search} onChange={e => setSearch(e.target.value)}
          className="h-8 w-full text-xs sm:w-[260px]" />
        {acoes}
      </div>
    </div>
  )
}

function pageWindow(page: number, totalPages: number) {
  let start = Math.max(1, page - 2)
  const end = Math.min(totalPages, start + 4)
  start = Math.max(1, end - 4)
  const out: number[] = []
  for (let i = start; i <= end; i++) out.push(i)
  return out
}

export function Pagination({ page, total, limit, setPage }: { page: number; total: number; limit: number; setPage: (v: number | ((p: number) => number)) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const start = total > 0 ? (page - 1) * limit + 1 : 0
  const end = Math.min(page * limit, total)
  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Mostrando <span className="font-medium">{start}</span> a <span className="font-medium">{end}</span> de <span className="font-medium">{total}</span> registros
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          {pageWindow(page, totalPages).map(p => (
            <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
          ))}
          <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  )
}

/** Cabeçalho de coluna ordenável (server-side). */
export function SortHead({ col, label, sortBy, sortDir, onSort }: { col: string; label: string; sortBy: string; sortDir: 'asc' | 'desc'; onSort: (col: string) => void }) {
  const Icone = sortBy !== col ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button type="button" onClick={() => onSort(col)} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}<Icone className={cn('h-3 w-3', sortBy !== col && 'opacity-40')} />
    </button>
  )
}

/** Estados de carregando/vazio dentro da tabela. */
export function LinhaEstado({ colSpan, loading, vazio, icon: Icone }: { colSpan: number; loading: boolean; vazio: string; icon: LucideIcon }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-muted-foreground">
        {loading
          ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</span>
          : <span className="flex flex-col items-center gap-2"><Icone className="h-8 w-8 opacity-30" />{vazio}</span>}
      </td>
    </tr>
  )
}

/** Alterna um id num Set (seleção de linhas). */
export function toggleSet(prev: Set<string>, id: string, marcar?: boolean) {
  const n = new Set(prev)
  const on = marcar ?? !n.has(id)
  if (on) n.add(id); else n.delete(id)
  return n
}
