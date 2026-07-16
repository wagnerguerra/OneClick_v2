import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, Input, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { Trash2, Plus, Search, Wand2, ChevronLeft, ChevronRight, ListChecks, ExternalLink, AlertTriangle, CheckCircle2, MoreVertical, Braces } from 'lucide-react'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import { matchPalavraChaveIndex, HISTORICO_DATA_VARS, historicoToken } from '@saas/types'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { alerts } from '@/lib/alerts'
import type { SetDef, CpItemComum } from '../types'
import { HISTORICO_FIXO_HINT, PULAR_LINHA_HINT } from '../types'
import { HelpTip } from '../ui'
import { soDigitos, semSeparador, invalidCls, esc } from '../utils'

const DEFAULT_PAGE_SIZE = 15
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const
// A busca e a paginação só aparecem quando a lista é grande o bastante para valer.
const SEARCH_THRESHOLD = 10

/** Valor "atrasado": só ecoa `value` após `delay` ms sem mudança. Usado para adiar
 *  as recomputações caras de correspondência (2.5k+ descrições × N regras) sem
 *  travar a digitação — o input lê o valor VIVO, as contagens leem este atrasado. */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Janela de páginas para o paginador: primeira, vizinhas da atual, última, com "…". */
function pageItems(current: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i)
  const items: Array<number | 'gap'> = [0]
  const start = Math.max(1, current - 1)
  const end = Math.min(count - 2, current + 1)
  if (start > 1) items.push('gap')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < count - 2) items.push('gap')
  items.push(count - 1)
  return items
}

/** Controles de paginação (0-indexed) compartilhados — tabela de contrapartida e
 *  painel de correspondência. Não renderiza nada com uma página só. */
function Paginador({ page, pageCount, onGo }: { page: number; pageCount: number; onGo: (p: number) => void }) {
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center gap-1">
      <Button size="icon-sm" variant="outline" disabled={page <= 0} onClick={() => onGo(page - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
      {pageItems(page, pageCount).map((it, idx) =>
        it === 'gap'
          ? <span key={`gap-${idx}`} className="px-1 text-muted-foreground">…</span>
          : (
            <Button key={it} size="sm" variant={it === page ? 'soft' : 'ghost'} className={cn('h-8 min-w-8 px-1.5', it === page && 'font-semibold')} onClick={() => onGo(it)}>
              {it + 1}
            </Button>
          ),
      )}
      <Button size="icon-sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => onGo(page + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
    </div>
  )
}

/**
 * Popover leve (sem dependência do @saas/ui) para o preenchimento em lote de uma
 * coluna: um ícone no cabeçalho abre um painel ancorado logo abaixo. Fecha ao
 * clicar fora ou com Esc. O corpo é um render-prop que recebe `close`.
 */
const BATCH_PANEL_W = 240

function BatchFill({ scopeLabel, children }: { scopeLabel: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function toggle() {
    if (open) { setOpen(false); return }
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) {
      // Ancora abaixo do gatilho; empurra pra dentro da viewport se estourar a direita.
      let left = r.left
      if (left + BATCH_PANEL_W > window.innerWidth - 8) left = window.innerWidth - BATCH_PANEL_W - 8
      if (left < 8) left = 8
      setCoords({ top: r.bottom + 4, left })
    }
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // Fecha em scroll/resize — o painel é fixed e descolaria do gatilho.
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        title="Preencher em lote"
        aria-label="Preencher em lote"
        onClick={toggle}
        className={cn('text-muted-foreground/50 hover:text-foreground transition-colors', open && 'text-foreground')}
      >
        <Wand2 className="h-3.5 w-3.5" />
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: BATCH_PANEL_W }}
          className="z-50 rounded-[4px] border border-border bg-card p-2 text-left font-normal normal-case shadow-2xl shadow-black/40 ring-1 ring-black/5"
        >
          <p className="mb-1.5 text-[11px] font-normal text-muted-foreground">Aplicar a {scopeLabel}:</p>
          {children(() => setOpen(false))}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Input + botão "Aplicar" usado no lote das colunas de texto/número. */
/** Botão flutuante "{ }" (à direita, dentro do input) que abre o menu de variáveis. */
function VariavelPicker({ headers, onInsert }: { headers: string[]; onInsert: (token: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button" variant="ghost" size="icon-sm" tabIndex={-1} aria-label="Inserir variável"
          className="absolute right-0.5 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <Braces className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={(e) => e.preventDefault()} className="max-h-72 w-56 overflow-y-auto">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data</div>
        {HISTORICO_DATA_VARS.map((v) => (
          <DropdownMenuItem key={v.token} onSelect={() => onInsert(historicoToken(v.token))}>{v.label}</DropdownMenuItem>
        ))}
        <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colunas do arquivo</div>
        {headers.length === 0 ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">Envie um arquivo para listar as colunas.</div>
        ) : (
          headers.map((h) => (
            <DropdownMenuItem key={h} onSelect={() => onInsert(historicoToken(h))} className="truncate">{h}</DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Input de histórico fixo com o picker de variáveis {{...}} embutido à direita.
 *  Insere o token na posição do cursor; remove separadores (vírgula) ao digitar. */
function HistoricoFixoInput({ value, onChange, headers, disabled, className, placeholder }: {
  value: string; onChange: (v: string) => void; headers: string[]
  disabled?: boolean; className?: string; placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const inserir = (token: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const next = value.slice(0, start) + token + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = start + token.length
      el.setSelectionRange(pos, pos)
    })
  }
  return (
    <div className="relative w-full min-w-0">
      <Input
        ref={ref} className={cn('pr-7', className)} placeholder={placeholder} disabled={disabled}
        value={value} onChange={(e) => onChange(semSeparador(e.target.value))}
      />
      {!disabled && <VariavelPicker headers={headers} onInsert={inserir} />}
    </div>
  )
}

function BatchInput({ placeholder, numeric, variaveis, onApply }: { placeholder: string; numeric?: boolean; variaveis?: string[]; onApply: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-1">
      {variaveis ? (
        <HistoricoFixoInput headers={variaveis} className="h-7 text-xs bg-card" placeholder={placeholder} value={v} onChange={setV} />
      ) : (
        <Input
          className="h-7 text-xs bg-card"
          placeholder={placeholder}
          inputMode={numeric ? 'numeric' : undefined}
          value={v}
          onChange={(e) => setV(numeric ? soDigitos(e.target.value) : semSeparador(e.target.value))}
        />
      )}
      <Button size="sm" variant="soft" className="h-7 shrink-0" onClick={() => onApply(v)}>Aplicar</Button>
    </div>
  )
}

/**
 * Tabela compartilhada pelas duas modalidades de contrapartida (por descrição e
 * por palavra-chave). As colunas Conta / Histórico fixo / Direção / Pular — e
 * toda a lógica de validação (borda vermelha), disabled e line-through quando
 * "pular" está marcado — vivem SÓ aqui. O que muda entre os modos é a 1ª coluna
 * (`primeiraColuna`) e a existência de Adicionar/Remover (`onAdd`/`onRemove`).
 *
 * Busca, paginação e preenchimento em lote por coluna também moram aqui, então
 * as duas modalidades ganham tudo isso de graça. O lote respeita o filtro: sem
 * busca aplica a todas as linhas; com busca, só aos resultados.
 */
function ContrapartidaTabela<T extends CpItemComum>({
  itens, onUpdate, onBatchUpdate, onRemove, onAdd, addLabel, dcByDescricao, headers, primeiraColuna, searchText, searchPlaceholder, revisar, emptyText, rowClassName, removeMode = 'inline',
}: {
  itens: T[]
  onUpdate: (i: number, patch: Partial<T>) => void
  onBatchUpdate?: (indices: number[], patch: Partial<T>) => void
  onRemove?: (i: number) => void
  onAdd?: () => void
  addLabel?: string
  dcByDescricao: boolean
  headers: string[]
  primeiraColuna: { header: string; className?: string; cellClassName?: string; render: (it: T, i: number) => ReactNode }
  searchText: (it: T) => string
  searchPlaceholder?: string
  revisar?: boolean
  emptyText?: ReactNode
  rowClassName?: string
  // 'inline' = botão de lixeira direto (palavra-chave); 'kebab' = ação escondida
  // num menu ⋮ (por descrição, onde excluir é raro e pede confirmação).
  removeMode?: 'inline' | 'kebab'
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number | 'all'>(DEFAULT_PAGE_SIZE)

  // Linhas visíveis carregam o índice ORIGINAL — updates/lote/remoção operam nele.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const withIdx = itens.map((it, i) => ({ it, i }))
    return q ? withIdx.filter(({ it }) => searchText(it).toLowerCase().includes(q)) : withIdx
  }, [itens, query, searchText])

  // Reseta a página ao mudar a busca (evita ficar numa página que sumiu).
  useEffect(() => { setPage(0) }, [query])

  const effSize = pageSize === 'all' ? Math.max(1, filtered.length) : pageSize

  // Modo revisão (#2): posiciona na 1ª página com linha pendente (conta vazia, ou
  // direção vazia quando o D/C é pela descrição) para o campo destacado ficar
  // visível mesmo numa página posterior. Reavalia enquanto a lista muda (as
  // descrições chegam em 2 fases: modelo salvo → reconstruídas do arquivo), mas
  // PARA de reposicionar assim que o usuário mexe (edição/lote/tamanho de página)
  // — senão puxaria a página no meio de uma correção. Usa `itens` (estável entre
  // renders) e não `filtered` (recriado a cada render pela `searchText`).
  const isProblema = (it: T) => !it.pular && (!it.conta.trim() || (dcByDescricao && !it.direcao))
  const userMexeuRef = useRef(false)
  useEffect(() => {
    if (!revisar || userMexeuRef.current) return
    const idx = itens.findIndex((it) => isProblema(it))
    if (idx < 0) return
    setPage(Math.floor(idx / effSize))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisar, itens, effSize])
  const marcaMexeu = () => { userMexeuRef.current = true }
  const handleUpdate = (i: number, patch: Partial<T>) => { marcaMexeu(); onUpdate(i, patch) }

  const pageCount = Math.max(1, Math.ceil(filtered.length / effSize))
  const pageSafe = Math.min(page, pageCount - 1)
  const visible = filtered.slice(pageSafe * effSize, pageSafe * effSize + effSize)

  const showSearch = itens.length > SEARCH_THRESHOLD
  const showPageSize = itens.length > DEFAULT_PAGE_SIZE
  const showPager = pageCount > 1
  const scopeLabel = query.trim()
    ? `${filtered.length} ${filtered.length === 1 ? 'linha do filtro' : 'linhas do filtro'}`
    : (filtered.length === 1 ? 'a única linha' : `todas as ${filtered.length} linhas`)

  function batchApply(patch: Partial<T>) {
    marcaMexeu()
    onBatchUpdate?.(filtered.map((f) => f.i), patch)
  }

  function handleAdd() {
    // Ao adicionar, limpa o filtro e vai pra última página, pra a nova linha aparecer.
    marcaMexeu()
    setQuery('')
    setPage(Math.floor(itens.length / effSize))
    onAdd?.()
  }

  const batchable = !!onBatchUpdate && filtered.length > 0
  const colSpan = 3 + (dcByDescricao ? 1 : 0) + (onRemove ? 1 : 0)

  return (
    <div className="space-y-2">
      {(showSearch || showPageSize) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showSearch ? (
            <div className="relative w-full max-w-xs sm:flex-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs bg-card"
                placeholder={searchPlaceholder ?? 'Buscar...'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          ) : <span />}
          {showPageSize && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Exibir</span>
              <Select value={pageSize === 'all' ? 'all' : String(pageSize)} onValueChange={(v) => { marcaMexeu(); setPageSize(v === 'all' ? 'all' : Number(v)); setPage(0) }}>
                <SelectTrigger className="h-8 w-[92px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
              <span>por página</span>
            </div>
          )}
        </div>
      )}

      <div className="rounded-[2px] border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={primeiraColuna.className}>{primeiraColuna.header}</TableHead>
              {dcByDescricao && (
                <TableHead className="w-[180px]">
                  <span className="inline-flex items-center gap-2">
                    Direção na conta corrente
                    {batchable && (
                      <BatchFill scopeLabel={scopeLabel}>
                        {(close) => (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => { batchApply({ direcao: 'DEBITO' } as Partial<T>); close() }}>Débito</Button>
                            <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => { batchApply({ direcao: 'CREDITO' } as Partial<T>); close() }}>Crédito</Button>
                          </div>
                        )}
                      </BatchFill>
                    )}
                  </span>
                </TableHead>
              )}
              <TableHead className="w-[160px]">
                <span className="inline-flex items-center gap-2">
                  Contrapartida
                  {batchable && (
                    <BatchFill scopeLabel={scopeLabel}>
                      {(close) => <BatchInput placeholder="Contrapartida" numeric onApply={(v) => { batchApply({ conta: v } as Partial<T>); close() }} />}
                    </BatchFill>
                  )}
                </span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-2">
                  Histórico fixo (opcional)
                  <HelpTip text={HISTORICO_FIXO_HINT} />
                  {batchable && (
                    <BatchFill scopeLabel={scopeLabel}>
                      {(close) => <BatchInput placeholder="Histórico fixo" variaveis={headers} onApply={(v) => { batchApply({ historicoFixo: v } as Partial<T>); close() }} />}
                    </BatchFill>
                  )}
                </span>
              </TableHead>
              <TableHead className="w-[90px]">
                <span className="inline-flex items-center gap-2">
                  Pular <HelpTip text={PULAR_LINHA_HINT} />
                  {batchable && (
                    <BatchFill scopeLabel={scopeLabel}>
                      {(close) => (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => { batchApply({ pular: true } as Partial<T>); close() }}>Marcar</Button>
                          <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => { batchApply({ pular: false } as Partial<T>); close() }}>Desmarcar</Button>
                        </div>
                      )}
                    </BatchFill>
                  )}
                </span>
              </TableHead>
              {onRemove && <TableHead className="w-[52px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(({ it, i }) => {
              const pular = !!it.pular
              return (
              <TableRow key={i} className={rowClassName}>
                <TableCell className={primeiraColuna.cellClassName}>{primeiraColuna.render(it, i)}</TableCell>
                {dcByDescricao && (
                  <TableCell>
                    <Select value={it.direcao ?? ''} onValueChange={(v) => handleUpdate(i, { direcao: v as Direcao } as Partial<T>)} disabled={pular}>
                      <SelectTrigger className={cn('h-8 text-xs bg-card', !pular && !it.direcao && invalidCls(revisar), pular && 'line-through')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="DEBITO">Débito</SelectItem><SelectItem value="CREDITO">Crédito</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', !pular && !it.conta.trim() && invalidCls(revisar), pular && 'line-through placeholder:line-through')} placeholder="Contrapartida" inputMode="numeric" value={it.conta} onChange={(e) => handleUpdate(i, { conta: soDigitos(e.target.value) } as Partial<T>)} /></TableCell>
                <TableCell><HistoricoFixoInput headers={headers} disabled={pular} className={cn('h-8 text-xs bg-card', pular && 'line-through placeholder:line-through')} placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(v) => handleUpdate(i, { historicoFixo: v } as Partial<T>)} /></TableCell>
                <TableCell><div className="flex justify-center"><Checkbox checked={pular} onCheckedChange={(v) => handleUpdate(i, { pular: !!v } as Partial<T>)} /></div></TableCell>
                {onRemove && (
                  <TableCell>
                    {removeMode === 'kebab' ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Ações"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onRemove(i)}>
                            <Trash2 className="h-3.5 w-3.5" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => onRemove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
              )
            })}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-6 text-center text-xs text-muted-foreground">
                  {query.trim() ? `Nenhum resultado para "${query.trim()}".` : (emptyText ?? 'Nenhuma linha.')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPager && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <Paginador page={pageSafe} pageCount={pageCount} onGo={setPage} />
          <span className="text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'linha' : 'linhas'}{query.trim() ? ' no filtro' : ''}</span>
        </div>
      )}

      {onAdd && (
        <Button variant="soft" size="sm" onClick={handleAdd}><Plus className="h-4 w-4" /> {addLabel ?? 'Adicionar'}</Button>
      )}
    </div>
  )
}

/** Descrição distinta do arquivo + quantas linhas ela ocupa. */
export interface DescricaoContagem { descricao: string; count: number }

const LIST_PAGE_SIZE = 20

/** Selo de status de correspondência de uma descrição (2 estados). */
function BadgeCorresp({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">Correspondida</span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">Sem correspondência</span>
  )
}

/** Visão reversa: quantas linhas a palavra-chave EFETIVAMENTE corresponde (a que
 *  vence pela regra de posição). Zero (âmbar) = regra morta: texto redundante ou
 *  que sempre perde para outra que casa mais cedo — vale revisar. */
function BadgeRegra({ n }: { n: number }) {
  // Mesmo box (flex items-center) nas duas variantes — assim a de ícone fica exatamente
  // à mesma distância vertical do input que a de texto puro (o inline-flex ganhava um
  // leadinho na baseline e caía uns pixels mais pra baixo).
  return (
    <p className={cn('flex items-center gap-1 text-[10px] tabular-nums', n > 0 ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400')}>
      {n > 0
        ? <>corresponde a {n.toLocaleString('pt-BR')} {n === 1 ? 'lançamento' : 'lançamentos'}</>
        : <><AlertTriangle className="h-2.5 w-2.5 shrink-0" /> não corresponde a nenhum lançamento</>}
    </p>
  )
}

/**
 * Painel de CORRESPONDÊNCIA (modo palavra-chave). Cabeçalho sempre visível com o
 * medidor por LINHA + contagem sem correspondência; expande numa lista das descrições
 * distintas (ocorrências, status e a palavra-chave que corresponde), com busca, filtro
 * "só sem correspondência", ordenação por frequência e paginação. Usa a MESMA regra da
 * conversão (`matchPalavraChaveIndex`) sobre o conjunto DISTINTO (ponderado pela
 * contagem) — nunca sobre as linhas cruas.
 */
function PainelCorrespondencia({ descricoes, itens, totalLinhas, truncated, onCriar }: {
  descricoes: DescricaoContagem[]
  itens: ReadonlyArray<{ palavraChave: string }>
  totalLinhas: number
  truncated?: boolean
  onCriar?: (texto: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [query, setQuery] = useState('')
  const [soSem, setSoSem] = useState(true) // foco no que falta: abre em "Sem correspondência"
  const [page, setPage] = useState(0)

  // Cada descrição distinta → índice da palavra-chave que corresponde (ou -1).
  const enriquecidas = useMemo(
    () => descricoes.map((d) => ({ ...d, idx: matchPalavraChaveIndex(d.descricao, itens) })),
    [descricoes, itens],
  )
  const correspondidas = useMemo(() => enriquecidas.reduce((s, d) => s + (d.idx >= 0 ? d.count : 0), 0), [enriquecidas])
  const distintasSem = useMemo(() => enriquecidas.reduce((s, d) => s + (d.idx < 0 ? 1 : 0), 0), [enriquecidas])
  const linhasSem = totalLinhas - correspondidas
  // `floor` para o % só bater 100 quando for EXATAMENTE tudo (99,98% mostra "99%",
  // não arredonda pra 100). E o estado "completo" (check + colapso da barra) depende
  // de `linhasSem === 0` de fato — nunca do % — pra não sumir a barra com sobra.
  const pct = totalLinhas ? Math.floor((correspondidas / totalLinhas) * 100) : 0
  const completo = totalLinhas > 0 && linhasSem === 0

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase()
    let arr = soSem ? enriquecidas.filter((d) => d.idx < 0) : enriquecidas
    if (q) arr = arr.filter((d) => d.descricao.toLowerCase().includes(q))
    return [...arr].sort((a, b) => b.count - a.count) // mais frequentes primeiro
  }, [enriquecidas, soSem, query])

  useEffect(() => { setPage(0) }, [query, soSem, aberto])

  const pageCount = Math.max(1, Math.ceil(filtradas.length / LIST_PAGE_SIZE))
  const pageSafe = Math.min(page, pageCount - 1)
  const visible = filtradas.slice(pageSafe * LIST_PAGE_SIZE, pageSafe * LIST_PAGE_SIZE + LIST_PAGE_SIZE)

  return (
    <>
      {/* Medidor inline = resumo sempre visível + GATILHO do modal (a lista mora lá).
          Cara de "linha clicável" já em repouso: card elevado + chevron à direita. */}
      <button
        type="button"
        onClick={() => { setSoSem(distintasSem > 0); setAberto(true) }}
        className="group sticky top-[106px] z-10 flex w-full cursor-pointer items-center gap-5 rounded-[4px] border border-border bg-card px-4 py-2.5 text-left shadow-sm ring-1 ring-transparent transition-all hover:border-fuchsia-400/60 hover:ring-fuchsia-400/20"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            Correspondência de lançamentos no arquivo enviado
            {completo && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500 duration-300 animate-in fade-in zoom-in" />}
          </p>
          {/* Ao chegar a 100% a barra COLAPSA (altura + gap animando pra zero) e some,
              "transicionando" pro check que surge no título — a linha cheia é redundante. */}
          <div className={cn('grid transition-all duration-500 ease-out', completo ? 'mt-0 grid-rows-[0fr] opacity-0' : 'mt-1.5 grid-rows-[1fr] opacity-100')}>
            <div className="overflow-hidden">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/25 ring-1 ring-inset ring-border/50">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            <b className="text-foreground tabular-nums">{pct}%</b> correspondidos
            <span className="mx-1.5 font-bold text-muted-foreground">·</span>
            {linhasSem > 0 ? (
              <><b className="font-medium text-foreground tabular-nums">{linhasSem.toLocaleString('pt-BR')}</b> {linhasSem === 1 ? 'lançamento sem correspondência' : 'lançamentos sem correspondência'}</>
            ) : (
              'todos os lançamentos têm correspondência'
            )}
            {truncated && <> · sobre os lançamentos lidos</>}
          </p>
        </div>
        {/* Marcador de ação em repouso: "abrir externamente" num end-cap com cara de botão. */}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] border border-border bg-muted/40 text-muted-foreground transition-colors group-hover:border-fuchsia-400/60 group-hover:bg-fuchsia-500/10 group-hover:text-fuchsia-600 dark:group-hover:text-fuchsia-400">
          <ExternalLink className="h-4 w-4" />
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-4xl">
          <DialogHeaderIcon icon={ListChecks} color="fuchsia">
            <DialogTitle>Correspondência de descrições</DialogTitle>
            <DialogDescription>
              {pct}% dos lançamentos correspondidos · {distintasSem} {distintasSem === 1 ? 'descrição sem correspondência' : 'descrições sem correspondência'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs sm:flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 pl-7 text-xs bg-card" placeholder="Buscar descrição..." value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div className="flex items-center gap-0.5 rounded-[3px] border border-border bg-card p-0.5 text-xs">
                <button type="button" onClick={() => setSoSem(true)} className={cn('rounded-[2px] px-2 py-1 whitespace-nowrap', soSem ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}>
                  Sem correspondência{distintasSem > 0 && <span className="tabular-nums"> ({distintasSem})</span>}
                </button>
                <button type="button" onClick={() => setSoSem(false)} className={cn('rounded-[2px] px-2 py-1', !soSem ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}>Todas</button>
              </div>
            </div>

            <div className="rounded-[2px] border border-border/60 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[96px] text-right">Ocorrências</TableHead>
                    <TableHead className="w-[168px]">Status</TableHead>
                    <TableHead className="w-[180px]">Palavra-chave</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((d) => {
                    // Descrição sem correspondência é clicável → cria a palavra-chave
                    // (texto inteiro) e fecha o modal, pra refinar na tabela.
                    const clicavel = d.idx < 0 && !!onCriar
                    return (
                    <TableRow
                      key={d.descricao}
                      className={cn('group', clicavel && 'cursor-pointer transition-colors hover:bg-fuchsia-500/5')}
                      onClick={clicavel ? () => { onCriar!(d.descricao); setAberto(false) } : undefined}
                      title={clicavel ? 'Criar palavra-chave a partir desta descrição' : undefined}
                    >
                      <TableCell className="max-w-[320px] truncate text-sm" title={d.descricao}>{d.descricao}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{d.count.toLocaleString('pt-BR')}</TableCell>
                      <TableCell><BadgeCorresp ok={d.idx >= 0} /></TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs" title={d.idx >= 0 ? itens[d.idx]!.palavraChave : ''}>
                        {d.idx >= 0 ? (
                          <span className="text-muted-foreground">{itens[d.idx]!.palavraChave}</span>
                        ) : clicavel ? (
                          <span className="inline-flex items-center gap-1 font-medium text-fuchsia-600 dark:text-fuchsia-400"><Plus className="h-3 w-3 shrink-0" /> criar palavra-chave</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                    )
                  })}
                  {!visible.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        {query.trim() ? (
                          `Nenhuma descrição para "${query.trim()}".`
                        ) : soSem ? (
                          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Todas as descrições têm correspondência.</span>
                        ) : (
                          'Nenhuma descrição no arquivo.'
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {pageCount > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <Paginador page={pageSafe} pageCount={pageCount} onGo={setPage} />
                <span className="tabular-nums text-muted-foreground">{filtradas.length} {filtradas.length === 1 ? 'descrição' : 'descrições'}</span>
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ContrapartidaPalavraChave({ def, setDef, dcByDescricao, headers = [], revisar, descricoes = [], totalLinhas = 0, truncated }: {
  def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; headers?: string[]; revisar?: boolean
  descricoes?: DescricaoContagem[]; totalLinhas?: number; truncated?: boolean
}) {
  const itens = def.contrapartida.palavraChave
  // Cópia ATRASADA das regras só para as contagens: a digitação (que lê `itens`
  // vivo) fica instantânea; medidor e visão reversa recomputam ~300ms após parar.
  const itensContagem = useDebouncedValue(itens, 300)

  // Visão reversa: nº de linhas que cada palavra-chave (por índice) pega de fato.
  const linhasPorRegra = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of descricoes) {
      const idx = matchPalavraChaveIndex(d.descricao, itensContagem)
      if (idx >= 0) m.set(idx, (m.get(idx) ?? 0) + d.count)
    }
    return m
  }, [descricoes, itensContagem])

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.palavraChave.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, palavraChave: next } }
    })
  }, [setDef])
  const batchUpdate = useCallback((indices: number[], patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const set = new Set(indices)
      const next = d.contrapartida.palavraChave.map((it, idx) => (set.has(idx) ? { ...it, ...patch } : it))
      return { ...d, contrapartida: { ...d.contrapartida, palavraChave: next } }
    })
  }, [setDef])
  const add = useCallback(() => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: [...d.contrapartida.palavraChave, { palavraChave: '', conta: '', historicoFixo: '' }] } }))
  }, [setDef])
  const remove = useCallback((i: number) => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: d.contrapartida.palavraChave.filter((_, idx) => idx !== i) } }))
  }, [setDef])
  // Cria uma palavra-chave já pré-preenchida com a descrição (clique numa descoberta
  // no modal). O texto inteiro nasce correspondendo àquela linha; o usuário generaliza
  // apagando palavras na tabela e vê a correspondência subir.
  const criarDaDescricao = useCallback((texto: string) => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: [...d.contrapartida.palavraChave, { palavraChave: texto, conta: '', historicoFixo: '' }] } }))
  }, [setDef])

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Adicione palavras-chave abaixo, a serem detectadas nas descrições dos lançamentos.</p>
      {totalLinhas > 0 && <PainelCorrespondencia descricoes={descricoes} itens={itensContagem} totalLinhas={totalLinhas} truncated={truncated} onCriar={criarDaDescricao} />}
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onBatchUpdate={batchUpdate} onRemove={remove} onAdd={add} addLabel="Adicionar palavra-chave"
        dcByDescricao={dcByDescricao} headers={headers} revisar={revisar} rowClassName={totalLinhas > 0 ? '[&>td]:py-5' : undefined}
        emptyText="Nenhuma palavra-chave adicionada ainda — comece adicionando uma no botão abaixo."
        searchText={(it) => it.palavraChave} searchPlaceholder="Buscar palavra-chave..."
        primeiraColuna={{
          header: 'Palavra-chave', className: 'min-w-[160px]',
          render: (it, i) => (
            <div className="relative">
              <Input className="h-8 text-xs bg-card" placeholder="Palavra-chave" value={it.palavraChave} onChange={(e) => update(i, { palavraChave: e.target.value })} />
              {totalLinhas > 0 && it.palavraChave.trim() !== '' && (
                // Flutua logo abaixo do input, FORA do fluxo (absolute): não muda a
                // altura da célula nem o padding; pointer-events-none p/ não bloquear.
                <div className="pointer-events-none absolute left-0 top-full whitespace-nowrap pt-0.5">
                  <BadgeRegra n={linhasPorRegra.get(i) ?? 0} />
                </div>
              )}
            </div>
          ),
        }}
      />
    </div>
  )
}

export function ContrapartidaDescricao({ def, setDef, dcByDescricao, headers = [], descricaoColuna, getDistinct, revisar }: {
  def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; headers?: string[]; descricaoColuna: string; getDistinct: (c: string) => string[]; revisar?: boolean
}) {
  const itens = def.contrapartida.descricao

  // Reconstrói a lista a partir das descrições distintas da COLUNA atual,
  // reaproveitando conta/histórico/direção já preenchidos para descrições iguais.
  // Trocar a coluna de descrição SUBSTITUI os itens (não acumula com a anterior).
  useEffect(() => {
    const distinct = getDistinct(descricaoColuna)
    if (!distinct.length) return
    setDef((d) => {
      const existing = new Map(d.contrapartida.descricao.map((it) => [it.descricao, it]))
      const novos = distinct.map((desc) => existing.get(desc) ?? { descricao: desc, conta: '', historicoFixo: '' })
      return { ...d, contrapartida: { ...d.contrapartida, descricao: novos } }
    })
  }, [descricaoColuna, getDistinct, setDef])

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.descricao.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, descricao: next } }
    })
  }, [setDef])
  const batchUpdate = useCallback((indices: number[], patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const set = new Set(indices)
      const next = d.contrapartida.descricao.map((it, idx) => (set.has(idx) ? { ...it, ...patch } : it))
      return { ...d, contrapartida: { ...d.contrapartida, descricao: next } }
    })
  }, [setDef])
  // Exclusão (rara) via kebab: as descrições vêm do arquivo, então confirma e avisa
  // que ela pode voltar se for detectada de novo num arquivo futuro.
  const removeComConfirmacao = useCallback(async (i: number) => {
    const alvo = itens[i]?.descricao ?? ''
    const res = await alerts.custom({
      title: 'Excluir esta descrição?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Excluir',
      cancelButtonText: 'Cancelar',
      html: `<div style="text-align:center"><p style="margin:0 0 8px">"<b>${esc(alvo)}</b>" está aqui porque foi detectada num arquivo lido anteriormente.</p><p style="margin:0">Se ela aparecer de novo num próximo arquivo, será necessário mapeá-la outra vez.</p></div>`,
    })
    if (!res.isConfirmed) return
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, descricao: d.contrapartida.descricao.filter((_, idx) => idx !== i) } }))
  }, [itens, setDef])

  if (!itens.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Cada descrição distinta recebe uma conta de contrapartida.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onBatchUpdate={batchUpdate} onRemove={removeComConfirmacao} removeMode="kebab"
        dcByDescricao={dcByDescricao} headers={headers} revisar={revisar}
        searchText={(it) => it.descricao} searchPlaceholder="Buscar descrição..."
        primeiraColuna={{
          header: 'Descrição', cellClassName: 'text-sm max-w-[280px] truncate',
          render: (it) => (
            <span className={cn(it.pular && 'line-through text-muted-foreground')} title={it.descricao}>{it.descricao}</span>
          ),
        }}
      />
    </div>
  )
}
