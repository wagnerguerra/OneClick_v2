import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Button, Input, Checkbox,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { Trash2, Plus, Search, Wand2, ChevronLeft, ChevronRight } from 'lucide-react'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import type { SetDef, CpItemComum } from '../types'
import { HISTORICO_FIXO_HINT, PULAR_LINHA_HINT } from '../types'
import { HelpTip } from '../ui'
import { soDigitos, semSeparador, invalidCls } from '../utils'

const DEFAULT_PAGE_SIZE = 15
const PAGE_SIZE_OPTIONS = [15, 25, 50, 100] as const
// A busca e a paginação só aparecem quando a lista é grande o bastante para valer.
const SEARCH_THRESHOLD = 10

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
function BatchInput({ placeholder, numeric, onApply }: { placeholder: string; numeric?: boolean; onApply: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="flex gap-1">
      <Input
        className="h-7 text-xs bg-card"
        placeholder={placeholder}
        inputMode={numeric ? 'numeric' : undefined}
        value={v}
        onChange={(e) => setV(numeric ? soDigitos(e.target.value) : semSeparador(e.target.value))}
      />
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
  itens, onUpdate, onBatchUpdate, onRemove, onAdd, addLabel, dcByDescricao, primeiraColuna, searchText, searchPlaceholder, revisar,
}: {
  itens: T[]
  onUpdate: (i: number, patch: Partial<T>) => void
  onBatchUpdate?: (indices: number[], patch: Partial<T>) => void
  onRemove?: (i: number) => void
  onAdd?: () => void
  addLabel?: string
  dcByDescricao: boolean
  primeiraColuna: { header: string; className?: string; cellClassName?: string; render: (it: T, i: number) => ReactNode }
  searchText: (it: T) => string
  searchPlaceholder?: string
  revisar?: boolean
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
              <TableHead className="w-[130px]">
                <span className="inline-flex items-center gap-1">
                  Conta
                  {batchable && (
                    <BatchFill scopeLabel={scopeLabel}>
                      {(close) => <BatchInput placeholder="Conta" numeric onApply={(v) => { batchApply({ conta: v } as Partial<T>); close() }} />}
                    </BatchFill>
                  )}
                </span>
              </TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Histórico fixo (opcional)
                  <HelpTip text={HISTORICO_FIXO_HINT} />
                  {batchable && (
                    <BatchFill scopeLabel={scopeLabel}>
                      {(close) => <BatchInput placeholder="Histórico fixo" onApply={(v) => { batchApply({ historicoFixo: v } as Partial<T>); close() }} />}
                    </BatchFill>
                  )}
                </span>
              </TableHead>
              {dcByDescricao && (
                <TableHead className="w-[120px]">
                  <span className="inline-flex items-center gap-1">
                    Direção
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
              <TableHead className="w-[90px]">
                <span className="inline-flex items-center gap-1">
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
              <TableRow key={i}>
                <TableCell className={primeiraColuna.cellClassName}>{primeiraColuna.render(it, i)}</TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', !pular && !it.conta.trim() && invalidCls(revisar), pular && 'line-through placeholder:line-through')} placeholder="Conta" inputMode="numeric" value={it.conta} onChange={(e) => handleUpdate(i, { conta: soDigitos(e.target.value) } as Partial<T>)} /></TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', pular && 'line-through placeholder:line-through')} placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(e) => handleUpdate(i, { historicoFixo: semSeparador(e.target.value) } as Partial<T>)} /></TableCell>
                {dcByDescricao && (
                  <TableCell>
                    <Select value={it.direcao ?? ''} onValueChange={(v) => handleUpdate(i, { direcao: v as Direcao } as Partial<T>)} disabled={pular}>
                      <SelectTrigger className={cn('h-8 text-xs bg-card', !pular && !it.direcao && invalidCls(revisar), pular && 'line-through')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="DEBITO">Débito</SelectItem><SelectItem value="CREDITO">Crédito</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell><div className="flex justify-center"><Checkbox checked={pular} onCheckedChange={(v) => handleUpdate(i, { pular: !!v } as Partial<T>)} /></div></TableCell>
                {onRemove && <TableCell><Button variant="soft-destructive" size="icon-sm" onClick={() => onRemove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>}
              </TableRow>
              )
            })}
            {!visible.length && (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-6 text-center text-xs text-muted-foreground">
                  {query.trim() ? `Nenhum resultado para "${query.trim()}".` : 'Nenhuma linha.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPager && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" disabled={pageSafe <= 0} onClick={() => setPage(pageSafe - 1)} aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></Button>
            {pageItems(pageSafe, pageCount).map((it, idx) =>
              it === 'gap'
                ? <span key={`gap-${idx}`} className="px-1 text-muted-foreground">…</span>
                : (
                  <Button
                    key={it}
                    size="sm"
                    variant={it === pageSafe ? 'soft' : 'ghost'}
                    className={cn('h-8 min-w-8 px-1.5', it === pageSafe && 'font-semibold')}
                    onClick={() => setPage(it)}
                  >
                    {it + 1}
                  </Button>
                ),
            )}
            <Button size="icon-sm" variant="outline" disabled={pageSafe >= pageCount - 1} onClick={() => setPage(pageSafe + 1)} aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <span className="text-muted-foreground">{filtered.length} {filtered.length === 1 ? 'linha' : 'linhas'}{query.trim() ? ' no filtro' : ''}</span>
        </div>
      )}

      {onAdd && (
        <Button variant="soft" size="sm" onClick={handleAdd}><Plus className="h-4 w-4" /> {addLabel ?? 'Adicionar'}</Button>
      )}
    </div>
  )
}

export function ContrapartidaPalavraChave({ def, setDef, dcByDescricao, revisar }: { def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; revisar?: boolean }) {
  const itens = def.contrapartida.palavraChave

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

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Adicione palavras-chave abaixo, a serem detectadas nas descrições dos lançamentos.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onBatchUpdate={batchUpdate} onRemove={remove} onAdd={add} addLabel="Adicionar palavra-chave"
        dcByDescricao={dcByDescricao} revisar={revisar}
        searchText={(it) => it.palavraChave} searchPlaceholder="Buscar palavra-chave..."
        primeiraColuna={{
          header: 'Palavra-chave', className: 'min-w-[160px]',
          render: (it, i) => (
            <Input className="h-8 text-xs bg-card" placeholder="Palavra-chave" value={it.palavraChave} onChange={(e) => update(i, { palavraChave: e.target.value })} />
          ),
        }}
      />
    </div>
  )
}

export function ContrapartidaDescricao({ def, setDef, dcByDescricao, descricaoColuna, getDistinct, revisar }: {
  def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; descricaoColuna: string; getDistinct: (c: string) => string[]; revisar?: boolean
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

  if (!itens.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Cada descrição distinta recebe uma conta de contrapartida.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onBatchUpdate={batchUpdate} dcByDescricao={dcByDescricao} revisar={revisar}
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
