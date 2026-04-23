'use client'

import { useState, useEffect, useCallback } from 'react'
import { ListChecks, Plus, Loader2, Trash2, Power, Clock } from 'lucide-react'
import { Button, Card, Badge, Input, Label, Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Obrigacao {
  id: string; nome: string; tipo: string; periodicidade: string
  area_id: string | null; responsavel_id: string | null
  dia_vencimento: number | null; competencia_atual: string | null
  status: string; observacoes: string | null; ativo: boolean
  area_nome: string | null; resp_nome: string | null
}

const TIPO_LABELS: Record<string, string> = { fixa: 'Fixa', sob_demanda: 'Sob Demanda' }
const PERIOD_LABELS: Record<string, string> = { mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', pontual: 'Pontual' }
const STATUS_COLORS: Record<string, string> = { pendente: 'bg-amber-100 text-amber-700', em_andamento: 'bg-sky-100 text-sky-700', concluida: 'bg-emerald-100 text-emerald-700', atrasada: 'bg-red-100 text-red-700' }

export function ObrigacoesCard({ clienteId }: { clienteId: string }) {
  const [items, setItems] = useState<Obrigacao[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ nome: '', tipo: 'fixa', periodicidade: 'mensal', diaVencimento: '' })

  const fetch = useCallback(async () => {
    setLoading(true)
    try { setItems(await (trpc.cliente as any).listObrigacoes.query({ clienteId })) }
    catch { /* silent */ } finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetch() }, [fetch])

  async function handleAdd() {
    if (!form.nome.trim()) return
    try {
      await (trpc.cliente as any).addObrigacao.mutate({
        clienteId, nome: form.nome, tipo: form.tipo, periodicidade: form.periodicidade,
        diaVencimento: form.diaVencimento ? Number(form.diaVencimento) : undefined,
      })
      setForm({ nome: '', tipo: 'fixa', periodicidade: 'mensal', diaVencimento: '' })
      setAdding(false)
      fetch()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleStatusChange(id: string, status: string) {
    try { await (trpc.cliente as any).updateObrigacaoStatus.mutate({ id, status }); fetch() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleToggle(id: string) {
    try { await (trpc.cliente as any).toggleObrigacaoAtivo.mutate({ id }); fetch() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRemove(id: string) {
    if (!(await alerts.confirmDelete('esta obrigacao'))) return
    try { await (trpc.cliente as any).removeObrigacao.mutate({ id }); fetch() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</Card>

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
        <div>
          <h4 className="text-sm font-semibold flex items-center gap-2"><ListChecks className="h-4 w-4 text-emerald-600" /> Obrigacoes</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">{items.filter(i => i.ativo).length} obrigacoes ativas</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
      </div>

      {adding && (
        <div className="px-5 py-3 border-b border-border/40 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2"><Input placeholder="Nome da obrigacao" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))} className="h-8 text-xs" /></div>
            <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIPO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
            <Select value={form.periodicidade} onValueChange={v => setForm(p => ({ ...p, periodicidade: v }))}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PERIOD_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button type="button" variant="success" size="sm" onClick={handleAdd}>Salvar</Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/30">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma obrigacao cadastrada.</p>
          </div>
        ) : items.map(item => (
          <div key={item.id} className={cn('flex items-center gap-3 px-5 py-3 group', !item.ativo && 'opacity-40')}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{item.nome}</span>
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium', STATUS_COLORS[item.status] || 'bg-muted')}>{item.status}</span>
                <span className="text-[10px] text-muted-foreground">{PERIOD_LABELS[item.periodicidade] || item.periodicidade}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                {item.area_nome && <span>{item.area_nome}</span>}
                {item.resp_nome && <span>Resp: {item.resp_nome}</span>}
                {item.dia_vencimento && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />Dia {item.dia_vencimento}</span>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {item.ativo && item.status === 'pendente' && <Button type="button" variant="soft" size="sm" className="h-7 text-[10px]" onClick={() => handleStatusChange(item.id, 'em_andamento')}>Iniciar</Button>}
              {item.ativo && item.status === 'em_andamento' && <Button type="button" variant="success" size="sm" className="h-7 text-[10px]" onClick={() => handleStatusChange(item.id, 'concluida')}>Concluir</Button>}
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleToggle(item.id)} title={item.ativo ? 'Desativar' : 'Ativar'} className="opacity-0 group-hover:opacity-100"><Power className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleRemove(item.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
