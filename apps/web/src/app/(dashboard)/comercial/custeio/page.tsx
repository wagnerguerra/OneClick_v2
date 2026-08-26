'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calculator, Users, TrendingUp, TrendingDown, Wallet, Settings2,
  Loader2, RefreshCw, X, Save,
} from 'lucide-react'
import {
  Button, Card, Input, Label, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { StatCard } from '@/components/stat-card'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

type Linha = {
  clienteId: string
  numero: number | null
  documento: string | null
  cliente: string | null
  custoDireto: number
  custoRateioApoio: number
  custoTdabc: number
  custoTotal: number
  receitaReferencia: number
  margem: number | null
}

type Parametros = {
  encargosPercentual: number; usarHorasServicos: boolean; aplicarAumentoFaturamento: boolean
  horasMesReferencia: number; beneficioAlimentacaoDia: number; beneficioValeTransporteDia: number
  beneficioPlanoSaudeMensal: number; multCategoriaStandard: number; multCategoriaAdvanced: number
  multCategoriaPremium: number
}

const fmtMoeda = (v: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

function fmtCnpj(doc: string | null) {
  if (!doc) return '—'
  const s = String(doc)
  if (s.length !== 14) return s
  return s.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
}

function mesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function MargemBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted-foreground">—</span>
  const neg = pct < 0
  const low = pct >= 0 && pct < 20
  const cls = neg ? TEXT.rose
    : low ? TEXT.amber
      : TEXT.emerald
  return (
    <span className={cn('inline-flex items-center gap-1 font-medium tabular-nums', cls)}>
      {neg ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
      {pct}%
    </span>
  )
}

export default function CusteioPage() {
  const router = useRouter()
  const [refMes, setRefMes] = useState(mesAtual())
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [loading, setLoading] = useState(true)
  const [recalculando, setRecalculando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [showParams, setShowParams] = useState(false)
  const [params, setParams] = useState<Parametros | null>(null)
  const [savingParams, setSavingParams] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const rows = await trpc.custeio.listarMes.query({ refMes })
      setLinhas(rows as Linha[])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
      setLinhas([])
    } finally {
      setLoading(false)
    }
  }, [refMes])

  useEffect(() => { carregar() }, [carregar])

  async function recalcular() {
    setRecalculando(true)
    setErro(null)
    try {
      await trpc.custeio.recalcular.mutate({ refMes })
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao recalcular')
    } finally {
      setRecalculando(false)
    }
  }

  async function abrirParams() {
    setShowParams(true)
    if (!params) {
      try {
        const p = await trpc.custeio.getParametros.query()
        setParams(p as Parametros)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar parâmetros')
      }
    }
  }

  async function salvarParams() {
    if (!params) return
    setSavingParams(true)
    try {
      await trpc.custeio.saveParametros.mutate(params)
      setShowParams(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar parâmetros')
    } finally {
      setSavingParams(false)
    }
  }

  const custoTotal = linhas.reduce((s, l) => s + l.custoTotal, 0)
  const receitaTotal = linhas.reduce((s, l) => s + l.receitaReferencia, 0)
  const margemMedia = receitaTotal > 0 ? Math.round(((receitaTotal - custoTotal) / receitaTotal) * 1000) / 10 : null

  const upd = (patch: Partial<Parametros>) => setParams(p => (p ? { ...p, ...patch } : p))

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline padrão (subpágina de Comercial) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Calculator className="h-6 w-6" />
          </div>
          <div>
            <h1>Custeio de Clientes</h1>
            <p className="text-sm text-muted-foreground">Custo de servir × receita de referência — rentabilidade por cliente</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input type="month" value={refMes} onChange={e => setRefMes(e.target.value)} className="h-9 w-[150px] text-sm" />
          <Button size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={recalcular} disabled={recalculando || loading}>
            {recalculando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {recalculando ? 'Recalculando…' : 'Recalcular mês'}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={abrirParams} title="Parâmetros de custeio"><Settings2 className="h-4 w-4" /></Button>
          <BackButton href="/comercial" label="Voltar" />
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Clientes custeados" value={linhas.length} color={MODULE_COLOR} loading={loading} />
        <StatCard icon={Wallet} label="Custo total" value={fmtMoeda(custoTotal)} color="#f43f5e" loading={loading} />
        <StatCard icon={TrendingUp} label="Receita de referência" value={fmtMoeda(receitaTotal)} color="#10b981" loading={loading} />
        <StatCard icon={Calculator} label="Margem média" value={margemMedia == null ? '—' : `${margemMedia}%`} color="#6366f1" loading={loading} />
      </div>

      {erro && <div className={cn('rounded border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm', TEXT.rose)}>{erro}</div>}

      {/* Tabela */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <Calculator className="h-4 w-4" style={{ color: MODULE_COLOR }} />
          <span className="text-sm font-semibold">Rentabilidade por cliente — {refMes.split('-').reverse().join('/')}</span>
        </div>
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Cliente</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Custo direto</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Rateio apoio</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">TDABC</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Custo total</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Receita ref.</TableHead>
                  <TableHead className="text-center text-xs font-semibold uppercase tracking-wider">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 && !loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum custeio calculado para este mês. Ajuste os parâmetros e clique em &quot;Recalcular mês&quot;.
                    </TableCell>
                  </TableRow>
                ) : linhas.map(l => (
                  <TableRow key={l.clienteId} className="cursor-pointer" onClick={() => router.push(`/clientes/${l.clienteId}`)}>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate text-sm font-medium">{l.cliente || '—'}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{fmtCnpj(l.documento)}</div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(l.custoDireto)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(l.custoRateioApoio)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{l.custoTdabc > 0 ? fmtMoeda(l.custoTdabc) : '—'}</TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">{fmtMoeda(l.custoTotal)}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmtMoeda(l.receitaReferencia)}</TableCell>
                    <TableCell className="text-center text-sm"><MargemBadge pct={l.margem} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      {/* Modal de parâmetros */}
      {showParams && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowParams(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-lg bg-card shadow-xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                  <Settings2 className="h-4 w-4 text-muted-foreground" /> Parâmetros de custeio
                </h4>
                <button type="button" onClick={() => setShowParams(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-[65vh] space-y-4 overflow-y-auto p-5">
                {!params ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Encargos (%)</Label>
                        <Input type="number" value={params.encargosPercentual} onChange={e => upd({ encargosPercentual: Number(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Horas/mês de referência</Label>
                        <Input type="number" value={params.horasMesReferencia} onChange={e => upd({ horasMesReferencia: Number(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-3 space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Benefícios (custo do colaborador)</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>Alimentação/dia</Label>
                          <Input type="number" value={params.beneficioAlimentacaoDia} onChange={e => upd({ beneficioAlimentacaoDia: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Transporte/dia</Label>
                          <Input type="number" value={params.beneficioValeTransporteDia} onChange={e => upd({ beneficioValeTransporteDia: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Plano saúde/mês</Label>
                          <Input type="number" value={params.beneficioPlanoSaudeMensal} onChange={e => upd({ beneficioPlanoSaudeMensal: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                    </div>
                    <div className="rounded border border-border/60 p-3 space-y-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Multiplicador por categoria comercial</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <Label>Standard</Label>
                          <Input type="number" step="0.1" value={params.multCategoriaStandard} onChange={e => upd({ multCategoriaStandard: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Advanced</Label>
                          <Input type="number" step="0.1" value={params.multCategoriaAdvanced} onChange={e => upd({ multCategoriaAdvanced: Number(e.target.value) || 0 })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Premium</Label>
                          <Input type="number" step="0.1" value={params.multCategoriaPremium} onChange={e => upd({ multCategoriaPremium: Number(e.target.value) || 0 })} />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={params.aplicarAumentoFaturamento}
                          onCheckedChange={v => upd({ aplicarAumentoFaturamento: v === true })} />
                        Aplicar crescimento de faturamento na receita de referência
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={params.usarHorasServicos}
                          onCheckedChange={v => upd({ usarHorasServicos: v === true })} />
                        Incluir custo por horas de execução (TDABC)
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
                <Button variant="outline" size="sm" onClick={() => setShowParams(false)}>Fechar</Button>
                <Button size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={salvarParams} disabled={savingParams || !params}>
                  {savingParams ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingParams ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
