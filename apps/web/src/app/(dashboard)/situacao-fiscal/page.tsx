'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Loader2, Download, Trash2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CircleUser, FileText,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import Swal from 'sweetalert2'

interface Consulta {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  tipoCertidao: string | null
  etapa: string
  sucesso: boolean
  erro: string | null
  createdAt: string
  cliente: { id: string; razaoSocial: string } | null
  user: { id: string; name: string } | null
}

const CERTIDAO_COLORS: Record<string, string> = {
  'Negativa': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Positiva': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'Positiva com Efeitos de Negativa': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'Pendente': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const PAGE_SIZES = [10, 20, 50]

export default function SituacaoFiscalPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Consulta[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setData(await trpc.sitfis.list.query({ page, limit, search: debouncedSearch || undefined })) }
    catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleConsultar() {
    const { value: documento, isConfirmed } = await Swal.fire({
      title: 'Consultar Situação Fiscal',
      text: 'Informe o CNPJ ou CPF do contribuinte:',
      input: 'text',
      inputPlaceholder: 'CNPJ ou CPF (somente números)',
      showCancelButton: true,
      confirmButtonText: 'Consultar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#10b981',
      inputValidator: (value) => {
        const doc = value.replace(/\D/g, '')
        if (doc.length !== 11 && doc.length !== 14) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.'
        return null
      },
    })
    if (!isConfirmed || !documento) return

    setConsultando(true)
    try {
      const result = await trpc.sitfis.consultar.mutate({ documento: documento.replace(/\D/g, '') })
      if (result.sucesso) {
        await alerts.success('Consulta realizada', `Certidão: ${result.tipoCertidao || 'Processando'}${result.temPdf ? ' — PDF disponível para download.' : ''}`)
      } else {
        alerts.error('Erro na consulta', result.erro || 'Não foi possível consultar.')
      }
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setConsultando(false) }
  }

  async function handleDownloadPdf(id: string, documento: string) {
    try {
      const pdf = await trpc.sitfis.getPdf.query({ id })
      if (!pdf) { alerts.error('PDF não disponível', 'O relatório PDF não foi gerado nesta consulta.'); return }
      const blob = new Blob([Buffer.from(pdf, 'base64')], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `sitfis_${documento}_${new Date().toISOString().slice(0, 10)}.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch { alerts.error('Erro', 'Não foi possível baixar o PDF.') }
  }

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete('esta consulta')) return
    try { await trpc.sitfis.delete.mutate({ id }); fetchData() }
    catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  function formatDoc(doc: string, tipo: number) {
    return tipo === 1 ? masks.cpf(doc) : masks.cnpj(doc)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  function getPageNumbers() { const p: number[] = []; let s = Math.max(1, page - 2); const e = Math.min(totalPages, s + 4); s = Math.max(1, e - 4); for (let i = s; i <= e; i++) p.push(i); return p }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md">
            <CircleUser className="h-6 w-6" />
          </div>
          <div>
            <h1>Situação Fiscal</h1>
            <p className="text-sm text-muted-foreground">Consulte a situação fiscal de clientes junto à Receita Federal via SERPRO</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={handleConsultar} disabled={consultando} className="gap-1.5">
            {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {consultando ? 'Consultando...' : 'Nova Consulta'}
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por CNPJ, CPF ou razão social..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Razão Social / Cliente</TableHead>
              <TableHead className="hidden md:table-cell">Certidão</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Data</TableHead>
              <TableHead className="hidden lg:table-cell">Usuário</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhuma consulta realizada ainda
              </TableCell></TableRow>
            ) : data.data.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{formatDoc(c.documento, c.tipoDocumento)}</TableCell>
                <TableCell className="text-sm">
                  {c.cliente?.razaoSocial || c.razaoSocial || '—'}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {c.tipoCertidao ? (
                    <span className={cn('text-[10px] font-semibold px-2 py-1 rounded-full', CERTIDAO_COLORS[c.tipoCertidao] || 'bg-gray-100 text-gray-600')}>
                      {c.tipoCertidao}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {c.sucesso ? (
                    <div className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-xs">OK</span></div>
                  ) : c.etapa === 'erro' ? (
                    <div className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /><span className="text-xs" title={c.erro || ''}>Erro</span></div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-500"><Clock className="h-3.5 w-3.5" /><span className="text-xs">{c.etapa}</span></div>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{c.user?.name || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.sucesso && (
                      <Button variant="soft-info" size="icon-sm" onClick={() => handleDownloadPdf(c.id, c.documento)} title="Baixar PDF">
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(c.id)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span></p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map(p => <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>)}
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
