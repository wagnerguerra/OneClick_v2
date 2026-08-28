'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileInput, Plus, Loader2, Trash2, CheckCircle, Clock, ChevronDown } from 'lucide-react'
import { Button, Card, Input } from '@saas/ui'
import { cn } from '@saas/ui'
import { MioloColapsavel } from './card-colapsavel'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'
import { STRONG, BADGE, TEXT } from '@/lib/color-styles'

interface Protocolo {
  id: string; orgao: string; tipo: string; protocolo: string
  descricao: string | null; status: string; data_solicitacao: string
  data_retorno: string | null; resultado: string | null; user_nome: string | null
}

const STATUS_COLORS: Record<string, string> = { aberto: STRONG.amber, em_andamento: STRONG.sky, concluido: BADGE.emerald, erro: STRONG.red }
const ORGAOS = ['Receita Federal', 'SEFAZ', 'Prefeitura', 'SERPRO', 'INSS', 'FGTS', 'Junta Comercial', 'Cartorio', 'Outro']

export function ProtocolosCard({ clienteId }: { clienteId: string }) {
  // Contrai o card pelo cabecalho; abre expandido a cada visita.
  const [cardAberto, setCardAberto] = useState(true)
  const { canManageRegistration } = useClientesPerms()
  const [items, setItems] = useState<Protocolo[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ orgao: 'Receita Federal', protocolo: '', descricao: '' })

  const fetch = useCallback(async () => {
    setLoading(true)
    try { setItems(await (trpc.cliente as any).listProtocolos.query({ clienteId })) }
    catch { /* silent */ } finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetch() }, [fetch])

  async function handleAdd() {
    if (!form.protocolo.trim()) return
    try {
      await (trpc.cliente as any).addProtocolo.mutate({ clienteId, orgao: form.orgao, protocolo: form.protocolo, descricao: form.descricao || undefined })
      setForm({ orgao: 'Receita Federal', protocolo: '', descricao: '' })
      setAdding(false)
      fetch()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleConcluir(id: string) {
    const resultado = prompt('Resultado do protocolo (opcional):') || ''
    try { await (trpc.cliente as any).updateProtocoloStatus.mutate({ id, status: 'concluido', resultado }); fetch() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRemove(id: string) {
    if (!(await alerts.confirmDelete('este protocolo'))) return
    try { await (trpc.cliente as any).removeProtocolo.mutate({ id }); fetch() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Carregando...</Card>

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-2"><FileInput className={cn('h-4 w-4', TEXT.emerald)} /> Protocolos</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">{items.length} protocolo(s) registrado(s)</p>
          </div>
        </div>
        {canManageRegistration && <Button type="button" variant="outline" size="sm" onClick={() => setAdding(!adding)} className="gap-1.5"><Plus className="h-3.5 w-3.5" /> Registrar</Button>}
        <button
          type="button"
          onClick={() => setCardAberto(a => !a)}
          aria-expanded={cardAberto}
          title={cardAberto ? 'Recolher' : 'Expandir'}
          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform duration-200', !cardAberto && '-rotate-90')} />
        </button>
      </div>

      <MioloColapsavel aberto={cardAberto}>
      {adding && (
        <div className="px-5 py-3 border-b border-border/40 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <select value={form.orgao} onChange={e => setForm(p => ({ ...p, orgao: e.target.value }))} className="w-full h-8 rounded-md border bg-card px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                {ORGAOS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <Input placeholder="N° do protocolo" value={form.protocolo} onChange={e => setForm(p => ({ ...p, protocolo: e.target.value }))} className="h-8 text-xs font-mono" />
            <Input placeholder="Descricao (opcional)" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className="h-8 text-xs" />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>Cancelar</Button>
            <Button type="button" variant="success" size="sm" onClick={handleAdd}>Registrar</Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border/30">
        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <FileInput className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum protocolo registrado.</p>
          </div>
        ) : items.map(item => (
          <div key={item.id} className={cn('flex items-start gap-3 px-5 py-3 group', item.status === 'concluido' && 'opacity-50')}>
            <div className={cn('shrink-0 mt-1 h-2 w-2 rounded-full', item.status === 'aberto' ? 'bg-amber-400' : item.status === 'concluido' ? 'bg-emerald-400' : 'bg-sky-400')} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground">{item.orgao}</span>
                <span className="font-mono text-xs bg-muted/50 px-1.5 py-0.5 rounded">{item.protocolo}</span>
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-medium', STATUS_COLORS[item.status] || 'bg-muted')}>{item.status}</span>
              </div>
              {item.descricao && <p className="text-[11px] text-muted-foreground mt-0.5">{item.descricao}</p>}
              <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{new Date(item.data_solicitacao).toLocaleDateString('pt-BR')}</span>
                {item.user_nome && <span>{item.user_nome}</span>}
                {item.resultado && <span className={TEXT.emerald}>Resultado: {item.resultado}</span>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              {item.status !== 'concluido' && <Button type="button" variant="soft" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleConcluir(item.id)}><CheckCircle className="h-3 w-3" /> Concluir</Button>}
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleRemove(item.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
      </MioloColapsavel>
    </Card>
  )
}
