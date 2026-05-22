'use client'

import { useState, useEffect } from 'react'
import { DollarSign, Receipt, Wallet, BarChart3, Info, X, Loader2, Search, Save } from 'lucide-react'
import { Card, CardContent, Button, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-contabil, #8b5cf6)'

interface FonteItem { contaLonga: string; nomeConta: string; valor: number; isDeducao?: boolean }
interface MesCustoDespesa { mes: number; custosFixos: number; despesas: number }

export interface KpiData {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  custosFixos: number
  custoDasVendas: number
  lucroBruto: number
  margemBruta: number
  despesasOperacionais: number
  receitasFinanceiras: number
  despesasFinanceiras: number
  resultadoFinanceiro: number
  ebitda: number
  margemEbitda: number
  irCs: number
  lucroLiquido: number
  margemLiquida: number
  fontesReceita?: FonteItem[]
  fontesDespesas?: FonteItem[]
  mesesCustosDespesas?: MesCustoDespesa[]
}

interface BiKpiCardsProps {
  data: KpiData | null
  loading: boolean
  clienteId?: string
  ano?: number
  onKpisChanged?: () => void
}

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)

const fmtCurrencyFull = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const fmtPercent = (value: number) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`

type KpiType = 'receita' | 'custos_fixos' | 'despesas' | 'lucro_liquido'

interface KpiCardDef {
  type: KpiType
  label: string
  value: number
  icon: React.ElementType
  color: string
  bgColor: string
  borderColor: string
  subtitle?: string
  negative?: boolean
}

function KpiCard({ def, onOpenDetail }: { def: KpiCardDef; onOpenDetail: (type: KpiType) => void }) {
  const isNeg = def.value < 0
  return (
    <Card className="border border-border/50 border-l-4" style={{ borderLeftColor: def.borderColor }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{def.label}</p>
            <p className={cn('text-xl font-bold tabular-nums', def.negative && isNeg ? 'text-red-600' : 'text-foreground')}>
              {fmtCurrency(def.value)}
            </p>
            {def.subtitle && <p className="text-[10px] text-muted-foreground">{def.subtitle}</p>}
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: def.bgColor }}>
              <def.icon className="h-5 w-5" style={{ color: def.color }} />
            </div>
            <button type="button" onClick={() => onOpenDetail(def.type)} className="text-muted-foreground hover:text-foreground transition-colors" title="Ver detalhes">
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== DETAIL MODAL ============================== */

function KpiDetailModal({ type, data, clienteId, ano, onClose, onKpisChanged }: {
  type: KpiType; data: KpiData; clienteId: string; ano: number
  onClose: () => void; onKpisChanged: () => void
}) {
  const [tab, setTab] = useState<'resumo' | 'contas'>('resumo')
  const [contasDisponiveis, setContasDisponiveis] = useState<Array<{ conta: string; nomeConta: string; valor: number }>>([])
  const [contasSelecionadas, setContasSelecionadas] = useState<Set<string>>(new Set())
  const [loadingContas, setLoadingContas] = useState(false)
  const [savingContas, setSavingContas] = useState(false)
  const [contasSearch, setContasSearch] = useState('')
  const [contasLoaded, setContasLoaded] = useState(false)

  const loadContas = async () => {
    if (contasLoaded) return
    setLoadingContas(true)
    try {
      const [disponiveis, incluidas] = await Promise.all([
        (trpc.bi as any).kpiListarContasDisponiveis.query({ clienteId, tipoKpi: type, ano }),
        (trpc.bi as any).kpiContasIncluidasGet.query({ clienteId, tipoKpi: type }),
      ])
      setContasDisponiveis(disponiveis ?? [])
      setContasSelecionadas(new Set(incluidas ?? []))
      setContasLoaded(true)
    } catch { /* silent */ }
    finally { setLoadingContas(false) }
  }

  const handleSaveContas = async () => {
    setSavingContas(true)
    try {
      await (trpc.bi as any).kpiContasIncluidasSave.mutate({
        clienteId, tipoKpi: type, contas: Array.from(contasSelecionadas),
      })
      onKpisChanged() // Recarregar KPIs na página pai
    } catch { /* silent */ }
    finally { setSavingContas(false) }
  }

  const toggleConta = (conta: string) => {
    setContasSelecionadas(prev => {
      const n = new Set(prev)
      if (n.has(conta)) n.delete(conta); else n.add(conta)
      return n
    })
  }

  const toggleAll = () => {
    const filtered = contasFiltradas
    if (filtered.every(c => contasSelecionadas.has(c.conta))) {
      setContasSelecionadas(prev => { const n = new Set(prev); filtered.forEach(c => n.delete(c.conta)); return n })
    } else {
      setContasSelecionadas(prev => { const n = new Set(prev); filtered.forEach(c => n.add(c.conta)); return n })
    }
  }

  const clearAll = () => setContasSelecionadas(new Set())

  // Carregar contas ao abrir o modal
  useEffect(() => { loadContas() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const contasFiltradas = contasSearch
    ? contasDisponiveis.filter(c => c.conta.toLowerCase().includes(contasSearch.toLowerCase()) || c.nomeConta.toLowerCase().includes(contasSearch.toLowerCase()))
    : contasDisponiveis

  const titles: Record<KpiType, string> = {
    receita: 'Detalhes da Receita',
    custos_fixos: 'Detalhes dos Custos Fixos',
    despesas: 'Detalhes das Despesas',
    lucro_liquido: 'Detalhes do Lucro Líquido',
  }
  const subtitles: Record<KpiType, string> = {
    receita: 'Resumo, contas e fórmula',
    custos_fixos: 'Resumo, contas e fórmula',
    despesas: 'Resumo, contas e fórmula',
    lucro_liquido: 'Resumo do cálculo (Receita − Custos − Despesas)',
  }

  // Build detail info per type
  const detail = buildDetail(type, data)

  const [closing, setClosing] = useState(false)
  const handleClose = () => { setClosing(true); setTimeout(onClose, 200) }

  return (
    <div className={cn('fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200', closing ? 'bg-black/0' : 'bg-black/50')} style={{ animation: closing ? undefined : 'fadeIn 0.2s ease-out' }} onClick={handleClose}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes zoomOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
      `}</style>
      <div
        className="w-full max-w-2xl rounded-lg border bg-background shadow-xl max-h-[85vh] flex flex-col"
        style={{ animation: closing ? 'zoomOut 0.2s ease-in forwards' : 'zoomIn 0.2s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="text-sm font-semibold">{titles[type]}</h3>
            <p className="text-xs text-muted-foreground">{subtitles[type]}</p>
          </div>
          <button type="button" onClick={handleClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5">
          <button type="button" onClick={() => setTab('resumo')} className={cn('px-4 py-2.5 text-xs font-medium border-b-2 transition-colors', tab === 'resumo' ? 'border-violet-500 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            Resumo
          </button>
          <button type="button" onClick={() => { setTab('contas'); loadContas() }} className={cn('px-4 py-2.5 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5', tab === 'contas' ? 'border-violet-500 text-violet-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            Contas {contasSelecionadas.size > 0 && <span className="rounded bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-bold">{contasSelecionadas.size}</span>}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'resumo' && (
            <div className="space-y-4">
              {/* Total */}
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Total</p>
                <div className={cn('rounded border bg-muted/30 px-3 py-2 text-lg font-bold tabular-nums', detail.total < 0 && 'text-red-600')}>
                  {fmtCurrencyFull(detail.total)}
                </div>
              </div>

              {/* Contas selecionadas */}
              {(() => {
                // Mostrar contas marcadas na aba Contas
                const contasMarcadas = contasDisponiveis.filter(c => contasSelecionadas.has(c.conta))
                if (!contasLoaded) {
                  return (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <p className="text-xs text-muted-foreground">Acesse a aba "Contas" para selecionar as contas que compõem este cálculo.</p>
                    </div>
                  )
                }
                if (contasMarcadas.length === 0) {
                  return (
                    <div className="rounded border bg-muted/20 p-4 text-center">
                      <p className="text-xs text-muted-foreground">Nenhuma conta selecionada — usando cálculo padrão do sistema.</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{detail.descricao}</p>
                    </div>
                  )
                }
                const totalMarcado = contasMarcadas.reduce((s, c) => s + c.valor, 0)
                return (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">
                      Contas selecionadas ({contasMarcadas.length})
                    </p>
                    <div className="rounded border overflow-hidden">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/30 border-b">
                            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Conta</th>
                            <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Nome</th>
                            <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contasMarcadas.map(c => (
                            <tr key={c.conta} className="border-b hover:bg-muted/10">
                              <td className="px-3 py-1.5 font-mono">{c.conta}</td>
                              <td className="px-3 py-1.5">{c.nomeConta}</td>
                              <td className={cn('px-3 py-1.5 text-right tabular-nums font-medium', c.valor < 0 && 'text-red-600')}>
                                {fmtCurrencyFull(c.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 bg-muted/30">
                            <td colSpan={2} className="px-3 py-2 font-semibold">Total</td>
                            <td className={cn('px-3 py-2 text-right tabular-nums font-bold', totalMarcado < 0 && 'text-red-600')}>
                              {fmtCurrencyFull(totalMarcado)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Fórmula resumida */}
              {detail.formula && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-1">Fórmula</p>
                  <div className="rounded border bg-muted/30 px-3 py-2 text-xs font-mono">{detail.formula}</div>
                </div>
              )}
            </div>
          )}

          {tab === 'contas' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Selecione as contas que devem compor este cálculo. Quando nenhuma conta estiver selecionada, o sistema usa o cálculo padrão.</p>

              {loadingContas ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {/* Toolbar */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input placeholder="Buscar conta ou nome..." value={contasSearch} onChange={e => setContasSearch(e.target.value)} className="h-7 text-xs" style={{ paddingLeft: '2rem' }} />
                    </div>
                    <button type="button" onClick={toggleAll} className="text-[11px] text-violet-600 hover:underline shrink-0">
                      {contasFiltradas.every(c => contasSelecionadas.has(c.conta)) ? 'Desmarcar todas' : 'Selecionar todas'}
                    </button>
                    {contasSelecionadas.size > 0 && (
                      <button type="button" onClick={clearAll} className="text-[11px] text-red-500 hover:underline shrink-0">Limpar</button>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{contasDisponiveis.length} conta(s) disponíveis · {contasSelecionadas.size} selecionada(s)</span>
                    {contasSelecionadas.size > 0 && (
                      <span className="font-semibold text-violet-600">
                        Total selecionado: {fmtCurrencyFull(contasDisponiveis.filter(c => contasSelecionadas.has(c.conta)).reduce((s, c) => s + c.valor, 0))}
                      </span>
                    )}
                  </div>

                  {/* Table */}
                  <div className="max-h-[350px] overflow-y-auto rounded border">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b bg-muted/50">
                          <th className="w-8 px-2 py-2 text-center">
                            <input type="checkbox" checked={contasFiltradas.length > 0 && contasFiltradas.every(c => contasSelecionadas.has(c.conta))} onChange={toggleAll} className="h-3.5 w-3.5 accent-sky-500" />
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Conta</th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Nome</th>
                          <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contasFiltradas.map(c => {
                          const checked = contasSelecionadas.has(c.conta)
                          return (
                            <tr key={c.conta} className={cn('border-b hover:bg-muted/20 cursor-pointer', checked && 'bg-violet-50/50 dark:bg-violet-900/10')} onClick={() => toggleConta(c.conta)}>
                              <td className="px-2 py-1 text-center" onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={checked} onChange={() => toggleConta(c.conta)} className="h-3.5 w-3.5 accent-sky-500" />
                              </td>
                              <td className="px-2 py-1 font-mono">{c.conta}</td>
                              <td className="px-2 py-1">{c.nomeConta}</td>
                              <td className="px-2 py-1 text-right tabular-nums font-medium">{fmtCurrencyFull(c.valor)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Save button */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[11px] text-muted-foreground">
                      {contasSelecionadas.size === 0 ? 'Nenhuma seleção = cálculo padrão do sistema' : `${contasSelecionadas.size} conta(s) selecionada(s) serão usadas no cálculo`}
                    </p>
                    <Button size="sm" onClick={handleSaveContas} disabled={savingContas} style={{ backgroundColor: MODULE_COLOR }} className="gap-1.5 text-white hover:opacity-90">
                      {savingContas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Salvar seleção
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex justify-end border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    </div>
  )
}

interface DetailInfo {
  total: number
  fonte: string
  descricao: string
  formula?: string
  contas: Array<{ contaLonga: string; nomeConta: string; valor: number; isDeducao?: boolean }>
}

function buildDetail(type: KpiType, data: KpiData): DetailInfo {
  switch (type) {
    case 'receita':
      return {
        total: data.receitaBruta,
        fonte: 'bi_balancete_linhas (conta 03.1.1)',
        descricao: 'Receita Bruta de Vendas e Serviços. Valor da conta sintética 03.1.1 (SCI).',
        contas: (data.fontesReceita ?? []).map(f => ({
          contaLonga: f.contaLonga, nomeConta: f.nomeConta, valor: f.valor, isDeducao: f.isDeducao,
        })),
      }
    case 'custos_fixos':
      return {
        total: data.custosFixos,
        fonte: 'bi_balancete_linhas (grupo 04.1)',
        descricao: 'Custos Fixos. Soma das 5 contas do grupo 04.1.1.01 (CMV, estornos, COFINS, PIS).',
        contas: [{ contaLonga: '04.1', nomeConta: 'CUSTOS FIXOS', valor: data.custosFixos }],
      }
    case 'despesas':
      return {
        total: data.despesasOperacionais,
        fonte: 'bi_balancete_linhas (04.2.1 + 04.2.2)',
        descricao: 'Despesas Operacionais (04.2.1) + Tributárias (04.2.2). Não inclui Despesas Financeiras (04.2.3). Apenas contas analíticas (leaf nodes).',
        contas: (data.fontesDespesas ?? []).map(f => ({
          contaLonga: f.contaLonga, nomeConta: f.nomeConta, valor: f.valor,
        })),
      }
    case 'lucro_liquido':
      return {
        total: data.lucroLiquido,
        fonte: 'Cálculo: Contas 03 (receita) − 04.1 (custos) − 04.2 (despesas)',
        descricao: 'Lucro Líquido = Contas 03 (receita) − 04.1 (custos) − 04.2 (despesas). Soma dos movimentos das contas sintéticas 03 e 04.',
        formula: 'Contas 03 (receita) − 04.1 (custos) − 04.2 (despesas)',
        contas: [],
      }
  }
}

/* ============================== MAIN EXPORT ============================== */

export function BiKpiCards({ data, loading, clienteId, ano, onKpisChanged }: BiKpiCardsProps) {
  const [detailType, setDetailType] = useState<KpiType | null>(null)

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-l-4 border-l-gray-200">
            <CardContent className="p-5">
              <div className="space-y-3 animate-pulse">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-6 w-32 rounded bg-muted" />
                <div className="h-2 w-20 rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Receita Bruta', 'Custos Fixos', 'Despesas', 'Lucro Líquido'].map((label) => (
          <Card key={label} className="border-l-4 border-l-gray-200">
            <CardContent className="p-5">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-muted-foreground/40">R$ --</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const cards: KpiCardDef[] = [
    { type: 'receita', label: 'Receita Bruta', value: data.receitaBruta, icon: DollarSign, color: '#059669', bgColor: '#ecfdf5', borderColor: '#10b981', subtitle: `Líquida: ${fmtCurrency(data.receitaLiquida)}` },
    { type: 'custos_fixos', label: 'Custos Fixos', value: Math.abs(data.custosFixos), icon: Receipt, color: '#dc2626', bgColor: '#fef2f2', borderColor: '#ef4444', subtitle: `Lucro Bruto: ${fmtCurrency(data.lucroBruto)}` },
    { type: 'despesas', label: 'Despesas', value: Math.abs(data.despesasOperacionais), icon: Wallet, color: '#d97706', bgColor: '#fffbeb', borderColor: '#f59e0b', subtitle: `EBITDA: ${fmtCurrency(data.ebitda)}` },
    { type: 'lucro_liquido', label: 'Lucro Líquido', value: data.lucroLiquido, icon: BarChart3, color: MODULE_COLOR, bgColor: '#f5f3ff', borderColor: MODULE_COLOR, negative: true, subtitle: `Margem: ${fmtPercent(data.margemLiquida)}` },
  ]

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <KpiCard key={card.type} def={card} onOpenDetail={setDetailType} />
        ))}
      </div>

      {detailType && data && clienteId && ano && (
        <KpiDetailModal
          type={detailType} data={data}
          clienteId={clienteId} ano={ano}
          onClose={() => setDetailType(null)}
          onKpisChanged={() => { setDetailType(null); onKpisChanged?.() }}
        />
      )}
    </>
  )
}
