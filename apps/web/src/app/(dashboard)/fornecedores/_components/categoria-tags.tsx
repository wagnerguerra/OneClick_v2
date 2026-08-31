'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Plus, Tag, Settings2, Loader2, Pencil, Trash2, Check } from 'lucide-react'
import {
  Button, Input,
  Dialog, DialogContent, DialogFooter,
  cn,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface Categoria { id: string; nome: string; _count?: { vinculos: number } }

/** Campo de categorias no estilo "tags": seleciona existentes, cria na hora, e
 *  abre uma tela de gestão (renomear/excluir). value/onChange operam sobre IDs. */
export function CategoriaTagsInput({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const [cats, setCats] = useState<Categoria[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [creating, setCreating] = useState(false)
  const [managerOpen, setManagerOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    ;(trpc.fornecedor as any).listCategorias.query()
      .then((d: Categoria[]) => setCats(d || []))
      .catch(() => setCats([]))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  // fecha o dropdown ao clicar fora
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = value.map((id) => cats.find((c) => c.id === id)).filter(Boolean) as Categoria[]
  const q = query.trim().toLowerCase()
  const suggestions = cats.filter((c) => !value.includes(c.id) && c.nome.toLowerCase().includes(q)).slice(0, 8)
  const exactExists = cats.some((c) => c.nome.toLowerCase() === q)

  function add(id: string) { if (!value.includes(id)) onChange([...value, id]); setQuery('') }
  function remove(id: string) { onChange(value.filter((v) => v !== id)) }

  async function createAndAdd() {
    const nome = query.trim()
    if (!nome || creating) return
    setCreating(true)
    try {
      const cat = await (trpc.fornecedor as any).createCategoria.mutate({ nome }) as Categoria
      setCats((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, cat]))
      add(cat.id)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setCreating(false) }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const first = suggestions[0]
      if (first) add(first.id)
      else if (q && !exactExists) createAndAdd()
    } else if (e.key === 'Backspace' && !query && selected.length) {
      const last = selected[selected.length - 1]
      if (last) remove(last.id)
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <div
        className="mt-1.5 flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/20"
        onClick={() => setFocused(true)}
      >
        {selected.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: MODULE_COLOR }}>
            {c.nome}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(c.id) }} className="hover:opacity-70"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setFocused(true) }}
          onFocus={() => setFocused(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length ? '' : 'Selecione ou digite para criar...'}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button type="button" onClick={(e) => { e.stopPropagation(); setManagerOpen(true) }} title="Gerenciar categorias" className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {focused && (query || suggestions.length > 0) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</div>
          ) : (
            <>
              {suggestions.map((c) => (
                <button key={c.id} type="button" onClick={() => add(c.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" /> {c.nome}
                </button>
              ))}
              {q && !exactExists && (
                <button type="button" onClick={createAndAdd} disabled={creating} className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-1.5 text-left text-sm hover:bg-muted">
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className={cn('h-3.5 w-3.5', TEXT.emerald)} />}
                  Criar categoria "<strong>{query.trim()}</strong>"
                </button>
              )}
              {!suggestions.length && (!q || exactExists) && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Nenhuma categoria. Digite para criar.</div>
              )}
            </>
          )}
        </div>
      )}

      <CategoriasManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        cats={cats}
        onChanged={(removedId) => {
          if (removedId) onChange(value.filter((v) => v !== removedId))
          load()
        }}
      />
    </div>
  )
}

// ── Modal de gestão (renomear / excluir) ─────────────────────
function CategoriasManagerModal({
  open, onClose, cats, onChanged,
}: { open: boolean; onClose: () => void; cats: Categoria[]; onChanged: (removedId?: string) => void }) {
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [busy, setBusy] = useState(false)

  async function salvar(id: string) {
    if (!editNome.trim()) return
    setBusy(true)
    try { await (trpc.fornecedor as any).updateCategoria.mutate({ id, nome: editNome.trim() }); setEditId(null); onChanged() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setBusy(false) }
  }

  async function excluir(c: Categoria) {
    const emUso = c._count?.vinculos ?? 0
    const ok = await alerts.confirm({
      title: 'Excluir categoria?',
      text: emUso > 0 ? `"${c.nome}" está em ${emUso} fornecedor(es); será removida deles.` : `"${c.nome}"`,
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try { await (trpc.fornecedor as any).deleteCategoria.mutate({ id: c.id }); onChanged(c.id) }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeaderIcon icon={Settings2} color="slate">Gerenciar categorias</DialogHeaderIcon>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto nice-scrollbar py-1">
          {!cats.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
          ) : cats.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40">
              {editId === c.id ? (
                <>
                  <Input value={editNome} onChange={(e) => setEditNome(e.target.value)} className="h-8 text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && salvar(c.id)} />
                  <Button type="button" size="xs" variant="success" disabled={busy} onClick={() => salvar(c.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button type="button" size="xs" variant="outline" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5" /></Button>
                </>
              ) : (
                <>
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm">{c.nome}</span>
                  {(c._count?.vinculos ?? 0) > 0 && <span className="text-[11px] text-muted-foreground">{c._count?.vinculos} uso(s)</span>}
                  <button type="button" onClick={() => { setEditId(c.id); setEditNome(c.nome) }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => excluir(c)} className="rounded p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
