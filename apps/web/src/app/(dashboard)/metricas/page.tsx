'use client'

import { useState, useEffect } from 'react'
import { Activity, Search, DollarSign, Hash, FileText, Save } from 'lucide-react'
import {
  Button, Input, Label, Card, CardHeader,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { MasterGate } from '@/components/auth/master-gate'
import { alerts } from '@/lib/alerts'

interface Metrics {
  totalRequests: number
  uniqueDocuments: number
  totalCost: number
  sources: string[]
  pricing: Array<{ source: string; unitPrice: number; multiplier: number; currency: string }>
  daily: Array<{ date: string; unique: number; total: number; costUnique: number; costTotal: number }>
}

export default function MetricasPage() {
  return (
    <MasterGate>
      <MetricasPageInner />
    </MasterGate>
  )
}

function MetricasPageInner() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [source, setSource] = useState('')

  async function fetchMetrics() {
    setLoading(true)
    try {
      const data = await trpc.admin.getMetrics.query({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        source: source || undefined,
      })
      setMetrics(data)
    } catch { alerts.error('Erro', 'Não foi possível carregar as métricas.') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchMetrics() }, [])

  async function handleSavePricing(src: string, unitPrice: number, multiplier: number) {
    try {
      await trpc.admin.savePricing.mutate({ source: src, unitPrice, multiplier, currency: 'BRL' })
      alerts.success('Salvo', `Preço de "${src}" atualizado.`)
    } catch { alerts.error('Erro', 'Não foi possível salvar.') }
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-orange-500 text-white shadow-md">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1>Métricas</h1>
            <p className="text-sm text-muted-foreground">Acompanhe o consumo de APIs externas e custos estimados</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label>Data Inicial</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label>Data Final</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="col-span-12 md:col-span-3 space-y-1.5">
              <Label>Fonte</Label>
              <Select value={source || '__all__'} onValueChange={(v) => setSource(v === '__all__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {(metrics?.sources || []).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-3">
              <Button variant="success" className="w-full" onClick={fetchMetrics} disabled={loading}>
                <Search className="h-4 w-4" />{loading ? 'Carregando...' : 'Filtrar'}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Cards de totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hash className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Documentos Únicos</p>
              <p className="text-2xl font-bold">{metrics?.uniqueDocuments || 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total de Requisições</p>
              <p className="text-2xl font-bold">{metrics?.totalRequests || 0}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Custo Estimado</p>
              <p className="text-2xl font-bold">{fmt(metrics?.totalCost || 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabela de precificação */}
      {metrics && metrics.pricing.length > 0 && (
        <Card>
          <CardHeader>
            <h5 className="text-sm font-semibold mb-0">Precificação por Fonte</h5>
          </CardHeader>
          <div className="p-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Valor Unitário</TableHead>
                  <TableHead>Multiplicador</TableHead>
                  <TableHead>Moeda</TableHead>
                  <TableHead className="w-[80px]">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.pricing.map((p) => (
                  <PricingRow key={p.source} pricing={p} onSave={handleSavePricing} />
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-2">Fórmula: custo = requisições × valor unitário × multiplicador</p>
          </div>
        </Card>
      )}

      {/* Tabela série por dia */}
      <Card>
        <CardHeader>
          <h5 className="text-sm font-semibold mb-0">Série Diária</h5>
        </CardHeader>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : !metrics?.daily.length ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum registro no período selecionado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Únicos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.daily.map((d) => (
                  <TableRow key={d.date}>
                    <TableCell>{new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="text-right font-mono">{d.unique}</TableCell>
                    <TableCell className="text-right font-mono">{d.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  )
}

function PricingRow({ pricing, onSave }: { pricing: { source: string; unitPrice: number; multiplier: number; currency: string }; onSave: (src: string, price: number, mult: number) => void }) {
  const [price, setPrice] = useState(String(pricing.unitPrice))
  const [mult, setMult] = useState(String(pricing.multiplier))

  return (
    <TableRow>
      <TableCell className="font-medium">{pricing.source}</TableCell>
      <TableCell><Input value={price} onChange={(e) => setPrice(e.target.value)} className="w-24" /></TableCell>
      <TableCell><Input value={mult} onChange={(e) => setMult(e.target.value)} className="w-20" /></TableCell>
      <TableCell>{pricing.currency}</TableCell>
      <TableCell>
        <Button variant="soft" size="icon-sm" onClick={() => onSave(pricing.source, Number(price), Number(mult))}>
          <Save className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  )
}
