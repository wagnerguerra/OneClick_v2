'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText, Upload, Loader2, Search, Download,
  FileCheck2, CircleX, Coins, History, LayoutGrid,
  Building2, ChevronRight, AlertCircle, Clock,
} from 'lucide-react'
import {
  Button, Input, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BuscarNotasModal } from './_components/buscar-notas-modal'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

interface ClienteAgregado {
  clienteId: string | null
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  totalDanfes: number
  valorTotal: string | null
  ultimaNota: string | null
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

export default function DanfePage() {
  const [clientes, setClientes] = useState<ClienteAgregado[]>([])
  const [stats, setStats] = useState<{ total: number; autorizadas: number; canceladas: number; mes: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [buscarOpen, setBuscarOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.danfe as any).listClientesComDanfes.query()
      setClientes(r as ClienteAgregado[])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setLoading(false) }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const s = await (trpc.danfe as any).getStats.query()
      setStats(s)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])
  useEffect(() => { void fetchStats() }, [fetchStats])

  const clientesFiltrados = clientes.filter(c =>
    !busca ||
    c.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
    c.documento.includes(busca.replace(/\D/g, ''))
  )

  const totalValor = clientes.reduce((sum, c) => sum + Number(c.valorTotal ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1>DANFE</h1>
            <p className="text-sm text-muted-foreground">Sincronização e visualização de NFe por cliente</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/danfe/galeria">
            <Button variant="outline" size="sm" className="gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Galeria por Cliente
            </Button>
          </Link>
          <Link href="/danfe/lotes">
            <Button variant="outline" size="sm" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> Lotes
            </Button>
          </Link>
          <Link href="/danfe/agendamento">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Agendamento
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setBuscarOpen(true)} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Buscar notas
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }}>
            <Upload className="h-3.5 w-3.5" /> Upload XML
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <Card className="p-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard icon={FileText}    label="Total"          value={stats?.total ?? 0}        color="sky" />
          <KpiCard icon={FileCheck2}  label="Autorizadas"    value={stats?.autorizadas ?? 0}  color="emerald" />
          <KpiCard icon={CircleX}     label="Canceladas"     value={stats?.canceladas ?? 0}   color="rose" />
          <KpiCard icon={Coins}       label="Este mês"       value={stats?.mes ?? 0}          color="amber" />
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
            <Input placeholder="Buscar cliente, CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 pl-8 w-full sm:w-[280px] text-xs bg-card" />
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
              <TableRow><TableCell colSpan={6}><div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div></TableCell></TableRow>
            ) : clientesFiltrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <div className="text-center py-10 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">
                      {clientes.length === 0 ? 'Nenhuma DANFE no sistema ainda.' : 'Nenhum cliente bate com a busca.'}
                    </p>
                    {clientes.length === 0 && (
                      <p className="text-xs mt-1">Vincule uma pasta do Drive em algum cliente ou faça upload manual.</p>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : clientesFiltrados.map((c, idx) => (
              <TableRow
                key={c.clienteId ?? `null-${idx}`}
                className="hover:bg-muted/40 cursor-pointer group"
              >
                <TableCell>
                  <Link
                    href={c.clienteId ? `/danfe/galeria?cliente=${c.clienteId}` : '/danfe/galeria?cliente=__null__'}
                    className="flex items-center gap-2 group-hover:text-emerald-600"
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
                  {c.totalDanfes}
                </TableCell>
                <TableCell className="text-right text-[12px] tabular-nums font-semibold">
                  {fmtBRL(c.valorTotal)}
                </TableCell>
                <TableCell className="text-[11px] tabular-nums">{fmtDate(c.ultimaNota)}</TableCell>
                <TableCell className="text-right">
                  <Link href={c.clienteId ? `/danfe/galeria?cliente=${c.clienteId}` : '/danfe/galeria?cliente=__null__'}>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                      Abrir <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onSuccess={() => { void fetchData(); void fetchStats() }} />

      <BuscarNotasModal open={buscarOpen} onOpenChange={(o) => { setBuscarOpen(o); if (!o) { void fetchData(); void fetchStats() } }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, color }: { icon: typeof FileText; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    rose:    'text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-300',
    amber:   'text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-300',
    emerald: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-300',
    sky:     'text-sky-700 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300',
  }
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-2.5">
      <div className={cn('h-9 w-9 rounded-md flex items-center justify-center', map[color])}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-bold tabular-nums leading-none">{value.toLocaleString('pt-BR')}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Modal de upload — mesma lógica original, simplificado pro layout novo
// ─────────────────────────────────────────────────────────────
function UploadModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function reset() { setFiles([]); setUploading(false); setDragOver(false) }

  function handleFiles(list: FileList | null) {
    if (!list) return
    const arr = Array.from(list).filter(f =>
      f.name.toLowerCase().endsWith('.xml') || f.name.toLowerCase().endsWith('.zip'),
    )
    setFiles(prev => [...prev, ...arr])
  }

  async function handleUpload() {
    if (files.length === 0) return
    setUploading(true)
    try {
      const fd = new FormData()
      const isLote = files.length > 1 || files.some(f => f.name.toLowerCase().endsWith('.zip'))
      if (isLote) {
        files.forEach(f => fd.append('files', f))
        const resp = await fetch(`/api/danfe/batch`, { method: 'POST', body: fd, credentials: 'include' })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.message ?? 'Falha no upload')
        await alerts.success('Lote iniciado', `Processando ${json.totalXmls} XML(s). Acompanhe em "Lotes".`)
      } else {
        fd.append('file', files[0]!)
        const resp = await fetch(`/api/danfe/upload`, { method: 'POST', body: fd, credentials: 'include' })
        const json = await resp.json()
        if (!resp.ok) throw new Error(json.message ?? 'Falha no upload')
        if (json.code === 'DUPLICADO') {
          await alerts.info('Já cadastrada', json.message)
        } else {
          await alerts.success('Importada', `NFe ${json.chave} adicionada.`)
        }
      }
      onSuccess()
      reset()
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={Upload} color="sky">
          <DialogTitle>Upload de XML de NFe</DialogTitle>
          <DialogDescription>Envie 1 XML, vários, ou um .zip com XMLs.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            className={cn(
              'border-2 border-dashed rounded-md p-6 text-center transition-colors',
              dragOver ? 'border-sky-400 bg-sky-50/50' : 'border-border',
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Arraste arquivos aqui ou</p>
            <label className="text-xs text-sky-600 cursor-pointer hover:underline">
              clique para selecionar
              <input type="file" multiple accept=".xml,.zip" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            </label>
            {files.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s)</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button onClick={handleUpload} disabled={uploading || files.length === 0} className="bg-sky-600 hover:bg-sky-700">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Enviando...' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
