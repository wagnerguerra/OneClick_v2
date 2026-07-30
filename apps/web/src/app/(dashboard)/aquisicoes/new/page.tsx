'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Save, Plus, Trash2, Loader2, FileText, Package, StickyNote } from 'lucide-react'
import { Button, Input, Label, Card, cn } from '@saas/ui'
import { RichEditor } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { EntityCombobox } from '@/components/ui/entity-combobox'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface ItemRow { descricao: string; unidade: string; quantidade: number; valorUnitario: number }
interface FornOpc { id: string; razaoSocial: string; documento: string }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const NOVO_TABS = [
  { key: 'dados', label: 'Dados', icon: FileText },
  { key: 'itens', label: 'Itens', icon: Package },
  { key: 'observacoes', label: 'Observações', icon: StickyNote },
] as const

export default function NovoPedidoPage() {
  const router = useRouter()
  const [fornecedores, setFornecedores] = useState<FornOpc[]>([])
  const [fornecedorId, setFornecedorId] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [prazoEntrega, setPrazoEntrega] = useState('')
  const [prazoPagamento, setPrazoPagamento] = useState('')
  const [frete, setFrete] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState<ItemRow[]>([{ descricao: '', unidade: '', quantidade: 1, valorUnitario: 0 }])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('dados')

  useEffect(() => {
    ;(trpc.compra as any).fornecedoresSelect.query().then((d: FornOpc[]) => setFornecedores(d || [])).catch(() => setFornecedores([]))
  }, [])

  function setItem(i: number, patch: Partial<ItemRow>) {
    setItens((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  // Opções do combobox: documento formatado só para exibição — a busca do
  // componente casa com e sem pontuação.
  const fornecedorOpcoes = useMemo(
    () => fornecedores.map((f) => ({ id: f.id, label: f.razaoSocial, sublabel: f.documento ? masks.cpfCnpj(f.documento) : null })),
    [fornecedores],
  )
  const freteNum = Number(frete.replace(/\./g, '').replace(',', '.')) || 0
  const totalItens = itens.reduce((s, it) => s + it.quantidade * it.valorUnitario, 0)
  const total = totalItens + freteNum

  async function salvar() {
    if (!fornecedorId) return alerts.error('Informe o fornecedor')
    const itensValidos = itens.filter((it) => it.descricao.trim())
    setSaving(true)
    try {
      const res = await (trpc.compra as any).create.mutate({
        fornecedorId,
        formaPagamento: formaPagamento || undefined,
        prazoEntrega: prazoEntrega || undefined,
        prazoPagamento: prazoPagamento || undefined,
        frete: freteNum || undefined,
        observacoes: observacoes || undefined,
        itens: itensValidos.map((it) => ({ descricao: it.descricao.trim(), unidade: it.unidade || undefined, quantidade: it.quantidade, valorUnitario: it.valorUnitario })),
      })
      await alerts.success('Pedido criado', 'Rascunho salvo. Envie para aprovação quando estiver pronto.')
      router.push(`/aquisicoes/${res.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div><h1>Novo Pedido de Compra</h1><p className="text-sm text-muted-foreground">Preencha os dados e os itens do pedido</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>
          <BackButton href="/aquisicoes" label="Voltar" />
        </div>
      </div>

      {/* Card único — todas as abas do pedido nas pills laterais */}
      <Card className="overflow-hidden">
        <div className="flex min-h-[450px]">
          <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {NOVO_TABS.map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      activeTab === t.key ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
                    )}
                    style={activeTab === t.key ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div key={activeTab} className="flex-1 min-w-0 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {/* DADOS */}
            {activeTab === 'dados' && (<>
              <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Dados do pedido</h4>
              </div>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-12 md:col-span-6">
                  <Label>Fornecedor *</Label>
                  <div className="mt-1.5">
                    <EntityCombobox
                      items={fornecedorOpcoes}
                      value={fornecedorId}
                      onSelect={setFornecedorId}
                      placeholder="Selecione o fornecedor"
                      searchPlaceholder="Buscar por nome ou CNPJ/CPF..."
                      emptyText="Nenhum fornecedor encontrado"
                    />
                  </div>
                </div>
                <div className="col-span-12 md:col-span-6"><Label>Forma de Pagamento</Label><Input value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)} placeholder="Ex.: Boleto, PIX..." className="mt-1.5" /></div>
                <div className="col-span-6 md:col-span-4"><Label>Prazo de Entrega</Label><Input value={prazoEntrega} onChange={(e) => setPrazoEntrega(e.target.value)} placeholder="Ex.: 15 dias" className="mt-1.5" /></div>
                <div className="col-span-6 md:col-span-4"><Label>Prazo de Pagamento</Label><Input value={prazoPagamento} onChange={(e) => setPrazoPagamento(e.target.value)} placeholder="Ex.: 30 dias" className="mt-1.5" /></div>
                <div className="col-span-6 md:col-span-4"><Label>Frete (R$)</Label><Input value={frete} onChange={(e) => setFrete(e.target.value)} placeholder="0,00" className="mt-1.5" /></div>
              </div>
            </>)}

            {/* ITENS */}
            {activeTab === 'itens' && (<>
              <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border flex items-center justify-between gap-2">
                <h4 className="text-[13px] font-semibold text-foreground">Itens do pedido</h4>
                <Button type="button" variant="outline" size="xs" onClick={() => setItens((p) => [...p, { descricao: '', unidade: '', quantidade: 1, valorUnitario: 0 }])}><Plus className="h-3.5 w-3.5" /> Adicionar item</Button>
              </div>
              <div className="space-y-2">
                {itens.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input className="col-span-12 md:col-span-5 h-9" placeholder="Descrição do item" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} />
                    <Input className="col-span-3 md:col-span-2 h-9" placeholder="Unid." value={it.unidade} onChange={(e) => setItem(i, { unidade: e.target.value })} />
                    <Input className="col-span-3 md:col-span-1 h-9" type="number" min={1} value={it.quantidade} onChange={(e) => setItem(i, { quantidade: Number(e.target.value) || 1 })} />
                    <Input className="col-span-4 md:col-span-2 h-9" type="number" min={0} step="0.01" placeholder="Valor un." value={it.valorUnitario || ''} onChange={(e) => setItem(i, { valorUnitario: Number(e.target.value) || 0 })} />
                    <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground hidden md:inline">{brl(it.quantidade * it.valorUnitario)}</span>
                      <Button type="button" variant="soft-destructive" size="icon-sm" onClick={() => setItens((p) => p.filter((_, idx) => idx !== i))} disabled={itens.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-6 mt-4 pt-3 border-t border-border text-sm">
                <span className="text-muted-foreground">Itens: <strong className="tabular-nums text-foreground">{brl(totalItens)}</strong></span>
                <span className="text-muted-foreground">Frete: <strong className="tabular-nums text-foreground">{brl(freteNum)}</strong></span>
                <span className="text-muted-foreground">Total: <strong className="tabular-nums" style={{ color: MODULE_COLOR }}>{brl(total)}</strong></span>
              </div>
            </>)}

            {/* OBSERVAÇÕES */}
            {activeTab === 'observacoes' && (<>
              <div className="-mx-5 px-5 pb-2.5 mb-4 border-b border-border">
                <h4 className="text-[13px] font-semibold text-foreground">Observações</h4>
              </div>
              <RichEditor value={observacoes} onChange={setObservacoes} placeholder="Detalhamento do pedido..." />
            </>)}
          </div>
        </div>
      </Card>
    </div>
  )
}
