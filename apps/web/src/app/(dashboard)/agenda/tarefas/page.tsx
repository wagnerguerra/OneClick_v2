'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ListTodo, Plus, Search, Loader2, CheckSquare, Square, Edit2, Trash2,
  Calendar, AlertCircle, ArrowLeft,
} from 'lucide-react'
import {
  Button, Input, Card, Badge, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { TarefaModal } from '../_components/tarefa-modal'

interface Tarefa {
  id: string
  titulo: string
  descricao: string | null
  prazo: string
  horaPrazo: string | null
  concluida: boolean
  concluidaEm: string | null
  prioridade: 'BAIXA' | 'NORMAL' | 'ALTA'
  criadorId: string
  criador?: { id: string; name: string; image: string | null }
  lembretes?: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }>
}

type Filtro = 'todas' | 'pendentes' | 'hoje' | 'atrasadas' | 'concluidas'

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('pendentes')
  const [escopo, setEscopo] = useState<'minhas' | 'todas'>('minhas')
  const [modalOpen, setModalOpen] = useState(false)
  const [tarefaEditando, setTarefaEditando] = useState<Tarefa | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.agenda.tarefa as any).list.query({
        todasDoTenant: escopo === 'todas',
      })
      setTarefas(r as Tarefa[])
    } catch (e) {
      console.error('[Tarefas] load:', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [escopo])

  useEffect(() => { load() }, [load])

  async function toggleConcluida(t: Tarefa) {
    try {
      await (trpc.agenda.tarefa as any).toggleConcluida.mutate({ id: t.id, concluida: !t.concluida })
      load()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDelete(t: Tarefa) {
    const ok = await alerts.confirm({
      title: 'Excluir tarefa?',
      text: `"${t.titulo}" será removida permanentemente.`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.agenda.tarefa as any).delete.mutate({ id: t.id })
      load()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const filtradas = useMemo(() => {
    const hoje = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const fimHoje = new Date(inicioHoje.getTime() + 86400000)
    const q = search.trim().toLowerCase()
    return tarefas.filter(t => {
      if (q && !t.titulo.toLowerCase().includes(q) && !(t.descricao ?? '').toLowerCase().includes(q)) return false
      const d = new Date(t.prazo)
      const prazoDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      switch (filtro) {
        case 'pendentes': return !t.concluida
        case 'concluidas': return t.concluida
        case 'hoje': return !t.concluida && prazoDate.getTime() === inicioHoje.getTime()
        case 'atrasadas': return !t.concluida && prazoDate.getTime() < inicioHoje.getTime()
        case 'todas': return true
      }
      // estritamente unreachable, mas TS pede
      void fimHoje
      return true
    })
  }, [tarefas, search, filtro])

  const contagens = useMemo(() => {
    const hoje = new Date()
    const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    const pendentes = tarefas.filter(t => !t.concluida).length
    const concluidas = tarefas.filter(t => t.concluida).length
    const hojeCount = tarefas.filter(t => {
      if (t.concluida) return false
      const d = new Date(t.prazo)
      const pd = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return pd.getTime() === inicioHoje.getTime()
    }).length
    const atrasadas = tarefas.filter(t => {
      if (t.concluida) return false
      const d = new Date(t.prazo)
      const pd = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return pd.getTime() < inicioHoje.getTime()
    }).length
    return { todas: tarefas.length, pendentes, concluidas, hoje: hojeCount, atrasadas }
  }, [tarefas])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ backgroundColor: 'var(--mod-administrativo, #38bdf8)' }}
          >
            <ListTodo className="h-6 w-6" />
          </div>
          <div>
            <h1>Tarefas</h1>
            <p className="text-sm text-muted-foreground">
              Lembretes pessoais com prazo, sem participantes nem conflito de horário.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => { setTarefaEditando(null); setModalOpen(true) }}
          >
            <Plus className="h-4 w-4" />Nova tarefa
          </Button>
          <Button variant="outline" size="icon" asChild className="h-9 w-9" title="Voltar pra Agenda">
            <Link href="/agenda"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['pendentes', 'hoje', 'atrasadas', 'concluidas', 'todas'] as const).map(f => {
            const ativo = filtro === f
            const label = { pendentes: 'Pendentes', hoje: 'Hoje', atrasadas: 'Atrasadas', concluidas: 'Concluídas', todas: 'Todas' }[f]
            const count = contagens[f]
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                  ativo
                    ? 'bg-sky-500 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {label}
                <span className={cn(
                  'text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full',
                  ativo ? 'bg-white/25' : 'bg-background/60',
                )}>{count}</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-2">
            <Select value={escopo} onValueChange={v => setEscopo(v as 'minhas' | 'todas')}>
              <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="minhas">Minhas tarefas</SelectItem>
                <SelectItem value="todas">Todas (admin)</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-7 text-xs w-[200px]"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Lista */}
      {loading && tarefas.length === 0 ? (
        <Card className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : filtradas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <ListTodo className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">Nenhuma tarefa nesse filtro.</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {filtradas.map(t => {
              const d = new Date(t.prazo)
              const hoje = new Date()
              const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
              const prazoDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
              const diffDias = Math.floor((prazoDate.getTime() - inicioHoje.getTime()) / 86400000)
              const atrasada = !t.concluida && diffDias < 0
              const hojeFlag = !t.concluida && diffDias === 0
              const dataFmt = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
              return (
                <div
                  key={t.id}
                  className={cn(
                    'group/row flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors',
                    t.concluida && 'opacity-60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleConcluida(t)}
                    className="shrink-0 mt-0.5"
                    title={t.concluida ? 'Desmarcar' : 'Concluir'}
                  >
                    {t.concluida
                      ? <CheckSquare className="h-5 w-5 text-emerald-600" />
                      : <Square className="h-5 w-5 text-muted-foreground hover:text-sky-500" />}
                  </button>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setTarefaEditando(t); setModalOpen(true) }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={cn('text-sm font-semibold leading-snug', t.concluida && 'line-through')}>{t.titulo}</p>
                      {t.prioridade === 'ALTA' && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20">
                          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Alta
                        </Badge>
                      )}
                      {t.prioridade === 'BAIXA' && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">Baixa</Badge>
                      )}
                    </div>
                    {t.descricao && (
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                        {t.descricao.replace(/<[^>]+>/g, ' ').trim()}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                      <span className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        atrasada && 'text-rose-600 dark:text-rose-400',
                        hojeFlag && 'text-amber-600 dark:text-amber-400',
                        !atrasada && !hojeFlag && 'text-muted-foreground',
                      )}>
                        <Calendar className="h-3 w-3" />
                        {dataFmt}
                        {t.horaPrazo && ` · ${t.horaPrazo}`}
                        {atrasada && ` · atrasada ${Math.abs(diffDias)}d`}
                        {hojeFlag && ' · hoje'}
                      </span>
                      {t.criador && escopo === 'todas' && (
                        <span className="text-muted-foreground">por {t.criador.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => { setTarefaEditando(t); setModalOpen(true) }}
                      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <TarefaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        tarefa={tarefaEditando}
        onSaved={load}
      />
    </div>
  )
}
