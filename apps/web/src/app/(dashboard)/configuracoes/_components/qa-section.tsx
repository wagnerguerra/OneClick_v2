'use client'

/**
 * Relatório de QA — /configuracoes → "Relatório de QA".
 * Registro de achados de auditoria/QA para tratamento: severidade, status,
 * notas e referência de arquivo. Semeado por auditorias (ex.: /agenda 06/07/2026)
 * e aceita itens manuais. Master-only (a página já gateia).
 */

import { useCallback, useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  Button, Input, Label, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ClipboardCheck, Plus, Trash2, Loader2, FileCode2, StickyNote, ChevronDown, ChevronRight } from 'lucide-react'

type QaItem = {
  id: string
  modulo: string
  severidade: 'ALTA' | 'MEDIA' | 'BAIXA'
  titulo: string
  descricao: string | null
  arquivo: string | null
  fixProposto: string | null
  status: 'PENDENTE' | 'EM_ANDAMENTO' | 'CORRIGIDO' | 'DESCARTADO'
  notas: string | null
  origem: string | null
  resolvidoEm: string | null
}

const SEV_STYLE: Record<QaItem['severidade'], string> = {
  ALTA: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  MEDIA: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  BAIXA: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
}
const SEV_LABEL: Record<QaItem['severidade'], string> = { ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }

const STATUS_STYLE: Record<QaItem['status'], string> = {
  PENDENTE: 'text-rose-600',
  EM_ANDAMENTO: 'text-sky-600',
  CORRIGIDO: 'text-emerald-600',
  DESCARTADO: 'text-muted-foreground',
}
const STATUS_LABEL: Record<QaItem['status'], string> = {
  PENDENTE: 'Pendente', EM_ANDAMENTO: 'Em andamento', CORRIGIDO: 'Corrigido', DESCARTADO: 'Descartado',
}

export function QaSection() {
  const [itens, setItens] = useState<QaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('__abertos__')
  const [filtroSev, setFiltroSev] = useState<string>('__all__')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [notasDraft, setNotasDraft] = useState<Record<string, string>>({})

  // Modal de item manual
  const [novoOpen, setNovoOpen] = useState(false)
  const [novo, setNovo] = useState({ modulo: '', severidade: 'MEDIA', titulo: '', descricao: '', arquivo: '', fixProposto: '' })
  const [salvandoNovo, setSalvandoNovo] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc as any).qa.list.query({}) as QaItem[]
      setItens(data)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function setStatus(id: string, status: QaItem['status']) {
    // Optimistic — reverte no erro.
    const antes = itens
    setItens(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    try { await (trpc as any).qa.update.mutate({ id, status }) }
    catch (e) { setItens(antes); alerts.error('Erro', (e as Error).message) }
  }

  async function salvarNotas(id: string) {
    const notas = notasDraft[id]
    if (notas === undefined) return
    try {
      await (trpc as any).qa.update.mutate({ id, notas })
      setItens(prev => prev.map(i => i.id === id ? { ...i, notas: notas || null } : i))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluir(item: QaItem) {
    const ok = await alerts.confirmDelete(item.titulo)
    if (!ok) return
    try {
      await (trpc as any).qa.remove.mutate({ id: item.id })
      setItens(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function criarNovo() {
    if (!novo.titulo.trim() || !novo.modulo.trim()) { alerts.error('Campos obrigatórios', 'Informe módulo e título.'); return }
    setSalvandoNovo(true)
    try {
      await (trpc as any).qa.create.mutate({
        modulo: novo.modulo.trim(), severidade: novo.severidade, titulo: novo.titulo.trim(),
        descricao: novo.descricao.trim() || null, arquivo: novo.arquivo.trim() || null,
        fixProposto: novo.fixProposto.trim() || null,
      })
      setNovoOpen(false)
      setNovo({ modulo: '', severidade: 'MEDIA', titulo: '', descricao: '', arquivo: '', fixProposto: '' })
      void load()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoNovo(false) }
  }

  const filtrados = itens.filter(i => {
    if (filtroStatus === '__abertos__' && (i.status === 'CORRIGIDO' || i.status === 'DESCARTADO')) return false
    if (filtroStatus !== '__all__' && filtroStatus !== '__abertos__' && i.status !== filtroStatus) return false
    if (filtroSev !== '__all__' && i.severidade !== filtroSev) return false
    if (busca && !`${i.titulo} ${i.descricao} ${i.modulo} ${i.arquivo}`.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  })

  const contagem = {
    abertos: itens.filter(i => i.status === 'PENDENTE' || i.status === 'EM_ANDAMENTO').length,
    altas: itens.filter(i => i.severidade === 'ALTA' && (i.status === 'PENDENTE' || i.status === 'EM_ANDAMENTO')).length,
    corrigidos: itens.filter(i => i.status === 'CORRIGIDO').length,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header interno */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4" /> Relatório de QA
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {contagem.abertos} aberto(s) · {contagem.altas} de severidade alta · {contagem.corrigidos} corrigido(s)
          </p>
        </div>
        <Button variant="success" size="sm" onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4" /> Novo item
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border bg-muted/20">
        <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 text-xs w-[220px]" />
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__abertos__">Abertos</SelectItem>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="PENDENTE">Pendente</SelectItem>
            <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
            <SelectItem value="CORRIGIDO">Corrigido</SelectItem>
            <SelectItem value="DESCARTADO">Descartado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroSev} onValueChange={setFiltroSev}>
          <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Severidade</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="MEDIA">Média</SelectItem>
            <SelectItem value="BAIXA">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">{filtrados.length} item(ns)</span>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtrados.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Nenhum item {filtroStatus === '__abertos__' ? 'aberto' : 'encontrado'}. 🎉</p>
        ) : filtrados.map(item => {
          const aberto = expandido === item.id
          return (
            <div key={item.id} className={cn('rounded-lg border border-border bg-card transition-colors', aberto && 'ring-1 ring-border')}>
              {/* Linha principal */}
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onClick={() => { setExpandido(aberto ? null : item.id); if (!aberto) setNotasDraft(d => ({ ...d, [item.id]: item.notas ?? '' })) }}>
                {aberto ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', SEV_STYLE[item.severidade])}>{SEV_LABEL[item.severidade]}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">{item.modulo}</Badge>
                <span className={cn('text-[13px] font-medium flex-1 min-w-0 truncate', (item.status === 'CORRIGIDO' || item.status === 'DESCARTADO') && 'line-through text-muted-foreground')}>{item.titulo}</span>
                {item.notas && <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <div onClick={e => e.stopPropagation()}>
                  <Select value={item.status} onValueChange={v => setStatus(item.id, v as QaItem['status'])}>
                    <SelectTrigger className={cn('h-7 text-[11px] w-[130px] font-medium', STATUS_STYLE[item.status])}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as QaItem['status'][]).map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Detalhe expandido */}
              {aberto && (
                <div className="px-9 pb-3 space-y-2 text-[12px]">
                  {item.descricao && <p className="text-muted-foreground whitespace-pre-wrap">{item.descricao}</p>}
                  {item.arquivo && (
                    <p className="flex items-start gap-1.5 text-[11px] font-mono text-muted-foreground">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 mt-px" /> {item.arquivo}
                    </p>
                  )}
                  {item.fixProposto && (
                    <p className="text-[11px]"><span className="font-semibold text-foreground">Fix proposto:</span> <span className="text-muted-foreground">{item.fixProposto}</span></p>
                  )}
                  {item.origem && <p className="text-[10px] text-muted-foreground/70">Origem: {item.origem}</p>}
                  <div className="space-y-1 pt-1">
                    <Label className="text-[11px] font-semibold">Notas de tratamento</Label>
                    <textarea
                      className="w-full min-h-[56px] rounded-md border border-input bg-transparent px-2.5 py-1.5 text-xs"
                      value={notasDraft[item.id] ?? item.notas ?? ''}
                      onChange={e => setNotasDraft(d => ({ ...d, [item.id]: e.target.value }))}
                      onBlur={() => void salvarNotas(item.id)}
                      placeholder="Anote decisões, PRs, contexto... (salva ao sair do campo)"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button variant="ghost" size="xs" className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => void excluir(item)}>
                      <Trash2 className="h-3 w-3" /> Excluir item
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal: novo item manual */}
      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={ClipboardCheck} color="emerald">
            <DialogTitle>Novo item de QA</DialogTitle>
            <DialogDescription>Registre um achado/pendência para tratamento.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-7 space-y-1.5">
                <Label className="text-[13px] font-semibold">Módulo *</Label>
                <Input className="h-9 text-sm" value={novo.modulo} onChange={e => setNovo(n => ({ ...n, modulo: e.target.value }))} placeholder="ex.: agenda, orcamentos" />
              </div>
              <div className="col-span-5 space-y-1.5">
                <Label className="text-[13px] font-semibold">Severidade</Label>
                <Select value={novo.severidade} onValueChange={v => setNovo(n => ({ ...n, severidade: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="MEDIA">Média</SelectItem>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Título *</Label>
              <Input className="h-9 text-sm" value={novo.titulo} onChange={e => setNovo(n => ({ ...n, titulo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <textarea className="w-full min-h-[70px] rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Arquivo (referência)</Label>
              <Input className="h-9 text-sm font-mono" value={novo.arquivo} onChange={e => setNovo(n => ({ ...n, arquivo: e.target.value }))} placeholder="caminho/arquivo.ts:linha" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Fix proposto</Label>
              <Input className="h-9 text-sm" value={novo.fixProposto} onChange={e => setNovo(n => ({ ...n, fixProposto: e.target.value }))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovoOpen(false)} disabled={salvandoNovo}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={() => void criarNovo()} disabled={salvandoNovo}>
              {salvandoNovo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
