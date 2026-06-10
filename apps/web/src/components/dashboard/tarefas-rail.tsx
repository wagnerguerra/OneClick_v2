'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ListTodo, Plus, X, ExternalLink, Loader2, Check, Clock } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { TarefaModal } from '@/app/(dashboard)/agenda/_components/tarefa-modal'

interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  prazo: string
  horaPrazo: string | null
  concluida: boolean
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA'
  lembretes?: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
}

const PRIO_DOT: Record<string, string> = { ALTA: 'bg-rose-500', NORMAL: 'bg-sky-500', BAIXA: 'bg-slate-400' }

function hojeStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Painel lateral direito retrátil de tarefas (estilo Gmail). Global no dashboard. */
export function TarefasRail() {
  const [open, setOpen] = useState(false)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(false)
  const [novo, setNovo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Tarefa | null>(null)

  useEffect(() => { if (typeof window !== 'undefined' && localStorage.getItem('tarefas-rail-open') === '1') setOpen(true) }, [])
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('tarefas-rail-open', open ? '1' : '0') }, [open])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.agenda.tarefa as any).list.query({ apenasAbertas: true })
      setTarefas(r as Tarefa[])
    } catch { setTarefas([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load, open])

  async function quickAdd() {
    const t = novo.trim()
    if (!t) return
    setSalvando(true)
    try {
      await (trpc.agenda.tarefa as any).create.mutate({ titulo: t, prazo: hojeStr() })
      setNovo('')
      await load()
    } catch (e) { alert((e as Error).message) }
    finally { setSalvando(false) }
  }
  async function concluir(t: Tarefa) {
    setTarefas(prev => prev.filter(x => x.id !== t.id)) // otimista (some da lista de abertas)
    await (trpc.agenda.tarefa as any).toggleConcluida.mutate({ id: t.id, concluida: true }).catch(() => load())
  }

  const hoje = hojeStr()
  function prazoInfo(t: Tarefa) {
    const d = new Date(t.prazo)
    const dia = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    const label = `${dia}${t.horaPrazo ? ` ${t.horaPrazo}` : ''}`
    const atrasada = t.prazo.slice(0, 10) < hoje
    const hojeMesmo = t.prazo.slice(0, 10) === hoje
    return { label, atrasada, hojeMesmo }
  }

  return (
    <>
      <div className="hidden lg:flex fixed top-14 right-0 bottom-0 z-30">
        {/* Painel */}
        {open && (
          <div className="w-[330px] bg-card border-l border-border shadow-xl flex flex-col" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
            <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-sky-500" />
                <span className="text-sm font-semibold">Tarefas</span>
                {tarefas.length > 0 && <span className="text-[11px] text-muted-foreground">({tarefas.length})</span>}
              </div>
              <div className="flex items-center gap-0.5">
                <Link href="/agenda/tarefas" title="Abrir página de tarefas" className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ExternalLink className="h-4 w-4" />
                </Link>
                <button onClick={() => setOpen(false)} title="Fechar" className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Adicionar */}
            <div className="p-3 border-b border-border shrink-0 space-y-2">
              <button
                onClick={() => { setEditando(null); setModalOpen(true) }}
                className="w-full flex items-center gap-2 text-sm font-medium text-sky-600 dark:text-sky-400 hover:bg-muted/50 rounded-md px-2 py-1.5 transition-colors"
              >
                <Plus className="h-4 w-4" /> Adicionar uma tarefa
              </button>
              <div className="flex gap-2">
                <input
                  value={novo}
                  onChange={e => setNovo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); quickAdd() } }}
                  placeholder="Tarefa rápida (vence hoje)…"
                  className="h-9 flex-1 rounded-md border border-border bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400"
                />
                <Button size="sm" className="bg-sky-500 hover:bg-sky-600 text-white px-2.5" onClick={quickAdd} disabled={!novo.trim() || salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto nice-scrollbar p-2 space-y-0.5">
              {loading ? (
                <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : tarefas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10 italic">Nenhuma tarefa pendente 🎉</p>
              ) : tarefas.map(t => {
                const p = prazoInfo(t)
                return (
                  <div
                    key={t.id}
                    className="group flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-muted/40 cursor-pointer"
                    onClick={() => { setEditando(t); setModalOpen(true) }}
                  >
                    <button
                      onClick={e => { e.stopPropagation(); concluir(t) }}
                      title="Concluir"
                      className="mt-0.5 h-[18px] w-[18px] rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-500/10 flex items-center justify-center shrink-0 transition-colors"
                    >
                      <Check className="h-3 w-3 text-transparent group-hover:text-emerald-500/60" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIO_DOT[t.prioridade] ?? 'bg-slate-400')} />
                        <p className="text-sm leading-snug break-words">{t.titulo}</p>
                      </div>
                      <span className={cn(
                        'inline-flex items-center gap-1 mt-1 text-[11px]',
                        p.atrasada ? 'text-rose-600 dark:text-rose-400 font-medium' : p.hojeMesmo ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                      )}>
                        <Clock className="h-3 w-3" />{p.atrasada ? `Atrasada · ${p.label}` : p.hojeMesmo ? `Hoje · ${p.label}` : p.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Rail fino (sempre visível) */}
        <div className="w-11 bg-card border-l border-border flex flex-col items-center py-3 gap-2 shrink-0">
          <button
            onClick={() => setOpen(o => !o)}
            title="Tarefas"
            className={cn(
              'relative h-9 w-9 rounded-lg flex items-center justify-center transition-colors',
              open ? 'bg-sky-500 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <ListTodo className="h-5 w-5" />
            {!open && tarefas.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">{tarefas.length}</span>
            )}
          </button>
        </div>
      </div>

      <TarefaModal open={modalOpen} onOpenChange={setModalOpen} tarefa={editando as never} onSaved={() => { setModalOpen(false); void load() }} />
    </>
  )
}
