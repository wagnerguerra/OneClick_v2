'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { StickyNote, X, Plus, Loader2, Pin, PinOff, Trash2, Check, Palette } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

interface Nota {
  id: string
  titulo: string | null
  conteudo: string
  cor: string
  fixado: boolean
  arquivado: boolean
  updatedAt: string
}

// Cores estilo Keep — chave persistida em `cor`.
const CORES: Record<string, { bg: string; dot: string; label: string }> = {
  default: { bg: 'bg-card', dot: 'bg-muted-foreground/30', label: 'Padrão' },
  amarelo: { bg: 'bg-amber-100 dark:bg-amber-900/40', dot: 'bg-amber-300', label: 'Amarelo' },
  verde:   { bg: 'bg-emerald-100 dark:bg-emerald-900/40', dot: 'bg-emerald-300', label: 'Verde' },
  azul:    { bg: 'bg-sky-100 dark:bg-sky-900/40', dot: 'bg-sky-300', label: 'Azul' },
  rosa:    { bg: 'bg-pink-100 dark:bg-pink-900/40', dot: 'bg-pink-300', label: 'Rosa' },
  roxo:    { bg: 'bg-violet-100 dark:bg-violet-900/40', dot: 'bg-violet-300', label: 'Roxo' },
  laranja: { bg: 'bg-orange-100 dark:bg-orange-900/40', dot: 'bg-orange-300', label: 'Laranja' },
  cinza:   { bg: 'bg-slate-100 dark:bg-slate-800/60', dot: 'bg-slate-300', label: 'Cinza' },
}
const COR_KEYS = Object.keys(CORES)
const corBg = (c: string) => (CORES[c] ?? CORES.default).bg

const notaTRPC = () => (trpc as any).nota

/** Painel lateral direito de notas rápidas (estilo Google Keep). Botão fica
 *  abaixo do trilho de Tarefas; o TarefasRail não é alterado. */
export function NotesRail() {
  const [open, setOpen] = useState(false)
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(false)

  // Composer
  const [comporAberto, setComporAberto] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoConteudo, setNovoConteudo] = useState('')
  const [novaCor, setNovaCor] = useState('default')
  const [salvando, setSalvando] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (typeof window !== 'undefined' && localStorage.getItem('notas-rail-open') === '1') setOpen(true) }, [])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('notas-rail-open', open ? '1' : '0') }, [open])

  const load = useCallback(async () => {
    setLoading(true)
    try { setNotas(await notaTRPC().list.query({}) as Nota[]) }
    catch { setNotas([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (open) void load() }, [load, open])

  async function criar() {
    if (!novoTitulo.trim() && !novoConteudo.trim()) { setComporAberto(false); return }
    setSalvando(true)
    try {
      await notaTRPC().create.mutate({ titulo: novoTitulo.trim() || null, conteudo: novoConteudo, cor: novaCor })
      setNovoTitulo(''); setNovoConteudo(''); setNovaCor('default'); setComporAberto(false)
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSalvando(false) }
  }

  async function patch(id: string, p: Partial<Pick<Nota, 'titulo' | 'conteudo' | 'cor' | 'fixado' | 'arquivado'>>) {
    setNotas(prev => prev.map(n => (n.id === id ? { ...n, ...p } as Nota : n)))
    try { await notaTRPC().update.mutate({ id, ...p }) } catch { void load() }
  }
  async function excluir(id: string) {
    setNotas(prev => prev.filter(n => n.id !== id))
    try { await notaTRPC().remove.mutate({ id }) } catch { void load() }
  }

  const fixadas = notas.filter(n => n.fixado)
  const outras = notas.filter(n => !n.fixado)

  return (
    <>
      {/* Botão do trilho — logo abaixo do ícone de Tarefas */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Notas rápidas"
        className={cn(
          'hidden lg:flex fixed right-[4px] top-[112px] z-40 h-9 w-9 rounded-lg items-center justify-center transition-colors',
          open ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <StickyNote className="h-5 w-5" />
        {!open && notas.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{notas.length}</span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <div
          className="hidden lg:flex fixed top-14 right-0 bottom-0 z-40 w-[380px] bg-muted/30 dark:bg-background border-l border-border shadow-xl flex-col"
          style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
        >
          {/* Header */}
          <div className="h-12 px-4 flex items-center justify-between border-b border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">Notas rápidas</span>
              {notas.length > 0 && <span className="text-[11px] text-muted-foreground">({notas.length})</span>}
            </div>
            <button onClick={() => setOpen(false)} title="Fechar" className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Composer */}
          <div className="p-3 shrink-0">
            <div className={cn('rounded-lg border border-border shadow-sm transition-all', corBg(novaCor))}>
              {comporAberto && (
                <input
                  value={novoTitulo}
                  onChange={e => setNovoTitulo(e.target.value)}
                  placeholder="Título"
                  className="w-full bg-transparent px-3 pt-2.5 pb-1 text-sm font-medium focus:outline-none placeholder:text-muted-foreground/60"
                />
              )}
              <textarea
                ref={composerRef}
                value={novoConteudo}
                onChange={e => setNovoConteudo(e.target.value)}
                onFocus={() => setComporAberto(true)}
                placeholder="Criar uma nota…"
                rows={comporAberto ? 3 : 1}
                className="w-full bg-transparent px-3 py-2 text-sm resize-none focus:outline-none placeholder:text-muted-foreground/60"
              />
              {comporAberto && (
                <div className="flex items-center justify-between gap-2 px-2 pb-2">
                  <div className="flex items-center gap-1">
                    {COR_KEYS.map(c => (
                      <button
                        key={c}
                        type="button"
                        title={CORES[c].label}
                        onClick={() => setNovaCor(c)}
                        className={cn('h-5 w-5 rounded-full border border-black/10 flex items-center justify-center', CORES[c].bg, novaCor === c && 'ring-2 ring-offset-1 ring-amber-500')}
                      >
                        <span className={cn('h-2.5 w-2.5 rounded-full', CORES[c].dot)} />
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => { setComporAberto(false); setNovoTitulo(''); setNovoConteudo(''); setNovaCor('default') }}>Cancelar</Button>
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={criar} disabled={salvando || (!novoTitulo.trim() && !novoConteudo.trim())}>
                      {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lista */}
          <div className="flex-1 overflow-y-auto nice-scrollbar px-3 pb-4 space-y-2">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : notas.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10 italic">Nenhuma nota ainda. Crie a primeira acima ✍️</p>
            ) : (
              <>
                {fixadas.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">Fixadas</p>
                    {fixadas.map(n => <NotaCard key={n.id} nota={n} onPatch={patch} onExcluir={excluir} />)}
                    {outras.length > 0 && <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1 pt-1">Outras</p>}
                  </>
                )}
                {outras.map(n => <NotaCard key={n.id} nota={n} onPatch={patch} onExcluir={excluir} />)}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ── Card de nota (com edição inline + cor + fixar + excluir) ── */
function NotaCard({ nota, onPatch, onExcluir }: {
  nota: Nota
  onPatch: (id: string, p: Partial<Pick<Nota, 'titulo' | 'conteudo' | 'cor' | 'fixado' | 'arquivado'>>) => void
  onExcluir: (id: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(nota.titulo ?? '')
  const [conteudo, setConteudo] = useState(nota.conteudo)
  const [paletaAberta, setPaletaAberta] = useState(false)

  function salvar() {
    const t = titulo.trim()
    if (t !== (nota.titulo ?? '') || conteudo !== nota.conteudo) {
      onPatch(nota.id, { titulo: t || null, conteudo })
    }
    setEditando(false)
  }

  return (
    <div className={cn('group relative rounded-lg border border-border/70 shadow-sm', corBg(nota.cor))}>
      {editando ? (
        <div className="p-2.5 space-y-1.5">
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título" className="w-full bg-transparent text-sm font-medium focus:outline-none placeholder:text-muted-foreground/60" />
          <textarea value={conteudo} onChange={e => setConteudo(e.target.value)} rows={4} autoFocus className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/60" placeholder="Nota…" />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => { setTitulo(nota.titulo ?? ''); setConteudo(nota.conteudo); setEditando(false) }}>Cancelar</Button>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={salvar}><Check className="h-3.5 w-3.5" /> Salvar</Button>
          </div>
        </div>
      ) : (
        <div className="p-2.5 cursor-text" onClick={() => setEditando(true)}>
          {nota.titulo && <p className="text-sm font-semibold leading-snug mb-0.5 break-words">{nota.titulo}</p>}
          {nota.conteudo
            ? <p className="text-sm leading-snug whitespace-pre-wrap break-words text-foreground/90">{nota.conteudo}</p>
            : !nota.titulo && <p className="text-sm italic text-muted-foreground">Nota vazia</p>}
        </div>
      )}

      {/* Ações */}
      <div className="flex items-center gap-0.5 px-1.5 pb-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button title={nota.fixado ? 'Desafixar' : 'Fixar'} onClick={() => onPatch(nota.id, { fixado: !nota.fixado })} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10">
          {nota.fixado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        </button>
        <div className="relative">
          <button title="Cor" onClick={() => setPaletaAberta(o => !o)} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10">
            <Palette className="h-3.5 w-3.5" />
          </button>
          {paletaAberta && (
            <div className="absolute bottom-7 left-0 z-10 flex items-center gap-1 p-1.5 rounded-lg border border-border bg-popover shadow-lg">
              {COR_KEYS.map(c => (
                <button key={c} title={CORES[c].label} onClick={() => { onPatch(nota.id, { cor: c }); setPaletaAberta(false) }}
                  className={cn('h-5 w-5 rounded-full border border-black/10 flex items-center justify-center', CORES[c].bg, nota.cor === c && 'ring-2 ring-amber-500')}>
                  <span className={cn('h-2.5 w-2.5 rounded-full', CORES[c].dot)} />
                </button>
              ))}
            </div>
          )}
        </div>
        <button title="Excluir" onClick={() => onExcluir(nota.id)} className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 ml-auto">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {nota.fixado && <Pin className="absolute top-2 right-2 h-3 w-3 text-amber-500 opacity-70 group-hover:opacity-0 transition-opacity" />}
    </div>
  )
}
