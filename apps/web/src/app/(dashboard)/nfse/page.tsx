'use client'

/**
 * Página de listagem de NFS-e (Nota Fiscal de Serviço Eletrônica) — padrão Nacional.
 *
 * Layout idêntico ao de /danfe (NFe modelo 55) por consistência visual.
 * Dados via tRPC nfse.listClientesComNotas + nfse.getStats (mesmo padrão do /danfe).
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  Receipt, Upload, Loader2, Search,
  FileCheck2, CircleX, Coins, LayoutGrid,
  Building2, ChevronRight, AlertCircle,
} from 'lucide-react'
import {
  Button, Input, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

interface ClienteAgregadoNFSe {
  clienteId: string | null
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  totalNotas: number
  valorTotal: string | null
  ultimaNota: string | null
}

interface NFSeStats {
  total: number
  emitidas: number
  canceladas: number
  mes: number
}

function fmtBRL(v: string | number | null): string {
  if (v == null) return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function fmtCnpj(doc: string): string {
  const digits = doc.toUpperCase().replace(/[^0-9A-Z]/g, '') // preserva letras (CNPJ alfanumérico)
  if (digits.length === 14) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`
  if (digits.length === 11) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`
  return doc
}

export default function NFSePage() {
  const [clientes, setClientes] = useState<ClienteAgregadoNFSe[]>([])
  const [stats, setStats] = useState<NFSeStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.nfse as any).listClientesComNotas.query()
      setClientes(r as ClienteAgregadoNFSe[])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setLoading(false) }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.nfse as any).getStats.query()
      setStats(s as NFSeStats)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])
  useEffect(() => { void fetchStats() }, [fetchStats])

  const clientesFiltrados = clientes.filter((c) =>
    !busca ||
    c.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
    c.documento.includes(busca.replace(/\D/g, '')),
  )

  const totalValor = clientes.reduce((sum, c) => sum + Number(c.valorTotal ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm"
            style={{ background: MODULE_COLOR }}
          >
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1>NFS-e</h1>
            <p className="text-sm text-muted-foreground">
              Notas Fiscais de Serviço Eletrônicas — padrão Nacional gov.br
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/nfse/galeria">
            <Button variant="outline" size="sm" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Galeria por Cliente
            </Button>
          </Link>
          {/* Upload desabilitado até endpoint existir */}
          <Button
            size="sm"
            disabled
            className="gap-1.5 text-white opacity-60 cursor-not-allowed"
            style={{ backgroundColor: MODULE_COLOR }}
            title="Upload manual disponível em breve"
          >
            <Upload className="h-3.5 w-3.5" /> Upload XML
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={Receipt}     label="Total"        value={stats?.total ?? 0}       color="sky" />
          <KpiCard icon={FileCheck2}  label="Emitidas"     value={stats?.emitidas ?? 0}    color="emerald" />
          <KpiCard icon={CircleX}     label="Canceladas"   value={stats?.canceladas ?? 0}  color="rose" />
          <KpiCard icon={Coins}       label="Este mês"     value={stats?.mes ?? 0}         color="amber" />
        </div>
      </Card>

      {/* Tabela agregada por cliente */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} ·
            <span className="ml-1 font-semibold text-foreground">{fmtBRL(totalValor)} total</span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente, CNPJ..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 pl-8 w-full sm:w-[280px] text-xs bg-card"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">CNPJ</TableHead>
              <TableHead className="text-xs text-center">Notas</TableHead>
              <TableHead className="text-xs text-right">Valor total</TableHead>
              <TableHead className="text-xs">Última emissão</TableHead>
              <TableHead className="text-xs text-right w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : clientesFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="text-center py-10 text-muted-foreground">
                    <Receipt className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                      {clientes.length === 0
                        ? 'Nenhuma NFS-e ainda.'
                        : 'Nenhum cliente bate com a busca.'}
                    </p>
                    {clientes.length === 0 && (
                      <p className="text-xs mt-1">
                        Configure a sincronização no /clientes/[id] → Monitorar XML → NFS-e Nacional
                      </p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              clientesFiltrados.map((c, idx) => (
                <TableRow key={c.clienteId ?? `null-${idx}`} className="hover:bg-muted/40 cursor-pointer group">
                  <TableCell>
                    <Link
                      href={c.clienteId ? `/nfse/galeria?cliente=${c.clienteId}` : '/nfse/galeria?cliente=__null__'}
                      className="flex items-center gap-2 group-hover:text-sky-700"
                    >
                      {c.clienteId ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                      <span className="text-[12px] font-medium truncate max-w-[280px]" title={c.razaoSocial}>
                        {c.razaoSocial}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-[11px] font-mono text-muted-foreground">
                    {c.documento ? fmtCnpj(c.documento) : '—'}
                  </TableCell>
                  <TableCell className="text-center text-[12px] tabular-nums font-semibold">
                    {c.totalNotas}
                  </TableCell>
                  <TableCell className="text-right text-[12px] tabular-nums font-semibold">
                    {fmtBRL(c.valorTotal)}
                  </TableCell>
                  <TableCell className="text-[11px] tabular-nums">{fmtDate(c.ultimaNota)}</TableCell>
                  <TableCell className="text-right">
                    <Link href={c.clienteId ? `/nfse/galeria?cliente=${c.clienteId}` : '/nfse/galeria?cliente=__null__'}>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                        Abrir <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Receipt
  label: string
  value: number
  color: string
}) {
  const map: Record<string, string> = {
    rose:    'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
    amber:   'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
    sky:     'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-bold tabular-nums leading-none">{value.toLocaleString('pt-BR')}</p>
      </div>
    </div>
  )
}
