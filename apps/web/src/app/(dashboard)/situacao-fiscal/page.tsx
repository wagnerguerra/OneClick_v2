'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Loader2, Download, Trash2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Eye, RotateCcw,
  Archive, Filter, ChevronDown, X, Shield, Play, Square, Users,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { getApiUrl } from '@/lib/api-url'
import Swal from 'sweetalert2'

interface Consulta {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  periodo: string | null
  tipoCertidao: string | null
  protocolo: string | null
  etapa: string
  sucesso: boolean
  erro: string | null
  createdAt: string
  deletedAt?: string | null
  cliente: { id: string; razaoSocial: string } | null
  user: { id: string; name: string } | null
}

const CERTIDAO_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Negativa': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  'Positiva': { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  'Positiva com Efeitos de Negativa': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  'Pendente': { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' },
  'Não identificada': { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-500 dark:text-gray-500', border: 'border-gray-200 dark:border-gray-700' },
}

const PAGE_SIZES = [10, 20, 50]
// URL resolvida dinamicamente para funcionar via localhost e IP de rede

interface ClienteMensal {
  id: string
  razaoSocial: string
  documento: string
  tipoDocumento: string
  alertaProcuracao?: boolean
}

type LoteStatus = 'idle' | 'running' | 'paused' | 'done'
interface LoteItem {
  clienteId: string
  documento: string
  razaoSocial: string
  status: 'pendente' | 'consultando' | 'sucesso' | 'erro' | 'pulado'
  tipoCertidao?: string | null
  erro?: string | null
  sociosImportados?: number
}

export default function SituacaoFiscalPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Consulta[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [consultando, setConsultando] = useState(false)
  const [trashMode, setTrashMode] = useState(false)
  const [filterCertidao, setFilterCertidao] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)

  // PDF viewer
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Consulta em lote
  const [loteOpen, setLoteOpen] = useState(false)
  const [loteClientes, setLoteClientes] = useState<ClienteMensal[]>([])
  const [loteSelecionados, setLoteSelecionados] = useState<Set<string>>(new Set())
  const [loteItems, setLoteItems] = useState<LoteItem[]>([])
  const [loteStatus, setLoteStatus] = useState<LoteStatus>('idle')
  const [loteDelay, setLoteDelay] = useState(10)
  const [loteSearchFilter, setLoteSearchFilter] = useState('')
  const loteAbortRef = useRef(false)
  const loteCountdownRef = useRef(0)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const input = { page, limit, search: debouncedSearch || undefined, situacao: filterCertidao || undefined }
      const result = trashMode
        ? await trpc.sitfis.listTrash.query({ page, limit, search: debouncedSearch || undefined })
        : await trpc.sitfis.list.query(input)
      setData(result)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, filterCertidao, trashMode])

  useEffect(() => { fetchData() }, [fetchData])

  // ============================================================
  // Ações
  // ============================================================

  async function handleConsultar() {
    // Carregar clientes MENSAL para o select filtrável
    let clientesMensal: { id: string; razaoSocial: string; documento: string; tipoDocumento: string }[] = []
    try {
      clientesMensal = await trpc.sitfis.listClientesMensal.query() as typeof clientesMensal
    } catch { /* fallback: campo manual */ }

    const clientesData = JSON.stringify(clientesMensal.map(c => ({
      id: c.id,
      doc: c.documento,
      nome: c.razaoSocial,
      docFmt: masks.cpfCnpj(c.documento),
    })))

    const { value: documento, isConfirmed } = await Swal.fire({
      title: 'Consultar Situação Fiscal',
      width: 520,
      html: `
        <p style="font-size:13px;color:#666;margin-bottom:14px">
          Selecione um cliente mensal ou informe o CNPJ/CPF para consultar junto à Receita Federal via SERPRO.
        </p>
        ${clientesMensal.length ? `
          <div style="position:relative;text-align:left">
            <label style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:block">
              Cliente Mensal
            </label>
            <input
              id="swal-search"
              type="text"
              placeholder="Buscar por nome ou CNPJ..."
              autocomplete="off"
              style="width:100%;padding:9px 12px;font-size:13px;border:1px solid #d5d5d5;border-radius:6px;outline:none;box-sizing:border-box;transition:border-color 0.2s"
              onfocus="this.style.borderColor='#0ea5e9'"
              onblur="setTimeout(()=>{this.style.borderColor='#d5d5d5'},150)"
            />
            <input id="swal-selected-doc" type="hidden" />
            <input id="swal-selected-clienteid" type="hidden" />
            <div
              id="swal-dropdown"
              style="display:none;position:absolute;left:0;right:0;top:100%;z-index:99;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #e2e2e2;border-top:none;border-radius:0 0 6px 6px;box-shadow:0 4px 12px rgba(0,0,0,0.08)"
            ></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
            <div style="flex:1;height:1px;background:#e5e5e5"></div>
            <span style="font-size:11px;color:#999">ou informe manualmente</span>
            <div style="flex:1;height:1px;background:#e5e5e5"></div>
          </div>
        ` : ''}
        <div style="text-align:left">
          <label style="font-size:11px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;display:block">
            CNPJ / CPF
          </label>
          <input
            id="swal-doc"
            type="text"
            placeholder="Somente números"
            style="width:100%;padding:9px 12px;font-size:14px;border:1px solid #d5d5d5;border-radius:6px;outline:none;box-sizing:border-box;font-family:monospace;transition:border-color 0.2s"
            onfocus="this.style.borderColor='#0ea5e9'"
            onblur="this.style.borderColor='#d5d5d5'"
          />
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Consultar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0ea5e9',
      didOpen: () => {
        const searchEl = document.getElementById('swal-search') as HTMLInputElement | null
        const dropdownEl = document.getElementById('swal-dropdown') as HTMLDivElement | null
        const hiddenDoc = document.getElementById('swal-selected-doc') as HTMLInputElement | null
        const hiddenClienteId = document.getElementById('swal-selected-clienteid') as HTMLInputElement | null
        const docInput = document.getElementById('swal-doc') as HTMLInputElement
        const clientes: { id: string; doc: string; nome: string; docFmt: string }[] = JSON.parse(clientesData)

        if (!searchEl || !dropdownEl || !hiddenDoc || !hiddenClienteId) return

        function renderList(filter: string) {
          const term = filter.toLowerCase()
          const filtered = term
            ? clientes.filter(c => c.nome.toLowerCase().includes(term) || c.doc.includes(term.replace(/\D/g, '')) || c.docFmt.includes(term))
            : clientes
          if (!filtered.length) {
            dropdownEl!.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#999">Nenhum cliente encontrado</div>'
            dropdownEl!.style.display = 'block'
            return
          }
          dropdownEl!.innerHTML = filtered.map(c =>
            `<div class="swal-cli-item" data-doc="${c.doc}" data-nome="${c.nome}" data-id="${c.id}" style="padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f3f3f3;transition:background 0.15s">
              <div style="font-weight:500;color:#333">${c.nome}</div>
              <div style="font-size:11px;color:#888;font-family:monospace;margin-top:1px">${c.docFmt}</div>
            </div>`
          ).join('')
          dropdownEl!.style.display = 'block'

          dropdownEl!.querySelectorAll('.swal-cli-item').forEach(el => {
            el.addEventListener('mouseenter', () => (el as HTMLElement).style.background = '#f0f9ff')
            el.addEventListener('mouseleave', () => (el as HTMLElement).style.background = '')
            el.addEventListener('mousedown', (e) => {
              e.preventDefault()
              const target = el as HTMLElement
              const doc = target.dataset.doc || ''
              const nome = target.dataset.nome || ''
              const id = target.dataset.id || ''
              searchEl!.value = nome
              hiddenDoc!.value = doc
              hiddenClienteId!.value = id
              docInput.value = doc
              dropdownEl!.style.display = 'none'
            })
          })
        }

        searchEl.addEventListener('focus', () => renderList(searchEl.value))
        searchEl.addEventListener('input', () => {
          hiddenDoc.value = ''
          hiddenClienteId.value = ''
          docInput.value = ''
          renderList(searchEl.value)
        })

        document.addEventListener('click', (e) => {
          if (!(e.target as HTMLElement).closest('#swal-search') && !(e.target as HTMLElement).closest('#swal-dropdown')) {
            dropdownEl.style.display = 'none'
          }
        }, { once: false })
      },
      preConfirm: () => {
        const docInput = document.getElementById('swal-doc') as HTMLInputElement
        const hiddenDoc = document.getElementById('swal-selected-doc') as HTMLInputElement | null
        const hiddenCli = document.getElementById('swal-selected-clienteid') as HTMLInputElement | null
        const doc = (docInput.value || hiddenDoc?.value || '').replace(/\D/g, '')
        if (doc.length !== 11 && doc.length !== 14) {
          Swal.showValidationMessage('Selecione um cliente ou informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
          return false
        }
        return { documento: doc, clienteId: hiddenCli?.value || undefined }
      },
    })
    if (!isConfirmed || !documento) return
    const { documento: docFinal, clienteId } = documento as unknown as { documento: string; clienteId?: string }

    setConsultando(true)
    try {
      // Montar mensagem de sucesso incluindo info de sócios sincronizados
      function buildSuccessMsg(r: Record<string, unknown>) {
        let msg = `Certidão: ${(r.tipoCertidao as string) || 'Processando'}${r.temPdf ? ' — PDF disponível.' : ''}`
        const sync = r.sociosSincronizados as { importados: number; total: number; erros: string[] } | null
        if (sync && sync.importados > 0) {
          msg += `\n\n👥 ${sync.importados} sócio(s) importado(s) automaticamente do QSA.`
          if (sync.erros.length) msg += ` (${sync.erros.length} erro(s))`
        }
        return msg
      }

      // Primeira chamada: verificar se já foi consultado nas últimas 24h
      const result = await trpc.sitfis.consultar.mutate({ documento: docFinal, clienteId }) as Record<string, unknown>

      if (result.consultaRecente) {
        // Consulta nas últimas 24h — perguntar ao usuário
        const dataConsulta = result.consultaRecenteData
          ? new Date(result.consultaRecenteData as string).toLocaleString('pt-BR')
          : ''
        const { isConfirmed: forcar } = await Swal.fire({
          title: 'Consulta recente encontrada',
          html: `<p style="font-size:13px">Este documento já foi consultado em <strong>${dataConsulta}</strong>.</p>
                 <p style="font-size:13px;color:#666;margin-top:8px">Certidão: <strong>${(result.tipoCertidao as string) || '—'}</strong></p>
                 <p style="font-size:12px;color:#999;margin-top:12px">Deseja forçar uma nova consulta ao SERPRO?</p>`,
          icon: 'info',
          showCancelButton: true,
          confirmButtonText: 'Forçar nova consulta',
          cancelButtonText: 'Manter resultado atual',
          confirmButtonColor: '#0ea5e9',
        })

        if (forcar) {
          // Forçar nova consulta ignorando o limite de 24h
          const novaResult = await trpc.sitfis.consultar.mutate({ documento: docFinal, clienteId, forcarNova: true }) as Record<string, unknown>
          if (novaResult.sucesso) {
            await alerts.success('Consulta realizada', buildSuccessMsg(novaResult))
          } else {
            alerts.error('Erro na consulta', (novaResult.erro as string) || 'Não foi possível consultar.')
          }
        }

        fetchData()
        return
      }

      if (result.sucesso) {
        await alerts.success('Consulta realizada', buildSuccessMsg(result))
      } else {
        alerts.error('Erro na consulta', (result.erro as string) || 'Não foi possível consultar.')
      }
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setConsultando(false) }
  }

  function handleVisualizarPdf(id: string) {
    setPdfUrl(`${getApiUrl()}/api/sitfis/${id}/pdf`)
  }

  async function handleDownloadPdf(id: string, documento: string) {
    try {
      const link = document.createElement('a')
      link.href = `${getApiUrl()}/api/sitfis/${id}/download-pdf`
      link.download = `sitfis_${documento}_${new Date().toISOString().slice(0, 10)}.pdf`
      link.click()
    } catch { alerts.error('Erro', 'Não foi possível baixar o PDF.') }
  }

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete('esta consulta')) return
    try { await trpc.sitfis.delete.mutate({ id }); fetchData() }
    catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  async function handleRestore(id: string) {
    try { await trpc.sitfis.restore.mutate({ id }); await alerts.success('Restaurado', 'Consulta restaurada com sucesso.'); fetchData() }
    catch { alerts.error('Erro', 'Não foi possível restaurar.') }
  }

  // ============================================================
  // Consulta em lote
  // ============================================================

  async function handleAbrirLote() {
    setLoteOpen(true)
    setLoteStatus('idle')
    setLoteItems([])
    setLoteSearchFilter('')
    loteAbortRef.current = false
    try {
      const clientes = await trpc.sitfis.listClientesMensal.query() as ClienteMensal[]
      setLoteClientes(clientes)
      setLoteSelecionados(new Set(clientes.map(c => c.id)))
    } catch {
      setLoteClientes([])
    }
  }

  function loteToggle(id: string) {
    setLoteSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function loteToggleAll(checked: boolean) {
    if (checked) {
      setLoteSelecionados(new Set(loteClientesFiltrados.map(c => c.id)))
    } else {
      setLoteSelecionados(new Set())
    }
  }

  const loteClientesFiltrados = loteClientes.filter(c => {
    if (!loteSearchFilter) return true
    const t = loteSearchFilter.toLowerCase()
    return c.razaoSocial.toLowerCase().includes(t) || c.documento.includes(t.replace(/\D/g, ''))
  })

  async function handleIniciarLote() {
    const selecionados = loteClientes.filter(c => loteSelecionados.has(c.id))
    if (!selecionados.length) return

    const items: LoteItem[] = selecionados.map(c => ({
      clienteId: c.id,
      documento: c.documento,
      razaoSocial: c.razaoSocial,
      status: 'pendente',
    }))
    setLoteItems(items)
    setLoteStatus('running')
    loteAbortRef.current = false

    for (let i = 0; i < items.length; i++) {
      if (loteAbortRef.current) {
        setLoteItems(prev => prev.map((it, idx) => idx >= i && it.status === 'pendente' ? { ...it, status: 'pulado' } : it))
        break
      }

      // Marcar como consultando
      setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'consultando' } : it))

      const item = items[i]!
      try {
        const result = await trpc.sitfis.consultar.mutate({
          documento: item.documento,
          clienteId: item.clienteId,
          forcarNova: true,
        }) as Record<string, unknown>

        const sync = result.sociosSincronizados as { importados: number } | null
        setLoteItems(prev => prev.map((it, idx) => idx === i ? {
          ...it,
          status: result.sucesso ? 'sucesso' : 'erro',
          tipoCertidao: result.tipoCertidao as string | null,
          erro: (result.erro as string) || null,
          sociosImportados: sync?.importados ?? 0,
        } : it))
      } catch (e) {
        setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'erro', erro: (e as Error).message } : it))
      }

      // Delay entre consultas (exceto a última)
      if (i < items.length - 1 && !loteAbortRef.current) {
        for (let s = loteDelay; s > 0; s--) {
          if (loteAbortRef.current) break
          loteCountdownRef.current = s
          setLoteItems(prev => [...prev]) // force re-render para o countdown
          await new Promise(r => setTimeout(r, 1000))
        }
        loteCountdownRef.current = 0
      }
    }

    setLoteStatus('done')
    fetchData()
  }

  function handlePararLote() {
    loteAbortRef.current = true
    setLoteStatus('done')
  }

  function formatDoc(doc: string, tipo: number) {
    return tipo === 1 ? masks.cpf(doc) : masks.cnpj(doc)
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function clearFilters() { setFilterCertidao(''); setSearch(''); setPage(1) }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const hasActiveFilters = !!filterCertidao

  function getPageNumbers() {
    const p: number[] = []
    let s = Math.max(1, page - 2)
    const e = Math.min(totalPages, s + 4)
    s = Math.max(1, e - 4)
    for (let i = s; i <= e; i++) p.push(i)
    return p
  }

  function CertidaoBadge({ tipo }: { tipo: string | null }) {
    if (!tipo) return <span className="text-muted-foreground text-xs">—</span>
    const fallback = { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-500 dark:text-gray-500', border: 'border-gray-200 dark:border-gray-700' }
    const colors = CERTIDAO_COLORS[tipo] ?? fallback
    return (
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold', colors.bg, colors.text, colors.border)}>
        {tipo === 'Negativa' && <CheckCircle2 className="h-3 w-3" />}
        {tipo === 'Positiva' && <XCircle className="h-3 w-3" />}
        {tipo === 'Positiva com Efeitos de Negativa' && <AlertTriangle className="h-3 w-3" />}
        {tipo === 'Pendente' && <Clock className="h-3 w-3" />}
        {tipo}
      </span>
    )
  }

  function EtapaBadge({ etapa, sucesso }: { etapa: string; sucesso: boolean }) {
    if (etapa === 'concluido' && sucesso) {
      return <div className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-xs">OK</span></div>
    }
    if (etapa === 'erro') {
      return <div className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" /><span className="text-xs">Erro</span></div>
    }
    const etapaLabels: Record<string, string> = {
      pendente: 'Pendente', autenticando: 'Autenticando', solicitando_protocolo: 'Protocolo',
      emitindo_relatorio: 'Emitindo', concluido: 'Concluído',
    }
    return (
      <div className="flex items-center gap-1 text-amber-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="text-xs">{etapaLabels[etapa] || etapa}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* PDF Viewer Modal */}
      {pdfUrl && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setPdfUrl(null)} />
          <div className="fixed inset-4 z-50 flex flex-col rounded-lg bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Visualização do PDF — Situação Fiscal</h3>
              <Button variant="ghost" size="icon-sm" onClick={() => setPdfUrl(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe src={pdfUrl} className="h-full w-full" title="PDF Situação Fiscal" />
            </div>
          </div>
        </>
      )}

      {/* Modal Consulta em Lote */}
      {loteOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => loteStatus !== 'running' && setLoteOpen(false)} />
          <div className="fixed inset-x-4 top-[5%] bottom-[5%] z-50 mx-auto flex max-w-3xl flex-col rounded-lg bg-background shadow-2xl sm:inset-x-auto sm:w-[720px]">
            {/* Header do modal */}
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold">Consulta em Lote — Situação Fiscal</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Consulte múltiplos clientes MENSAL junto à Receita Federal via SERPRO</p>
              </div>
              {loteStatus !== 'running' && (
                <Button variant="ghost" size="icon-sm" onClick={() => setLoteOpen(false)}><X className="h-4 w-4" /></Button>
              )}
            </div>

            {/* Controles */}
            <div className="flex items-center gap-3 border-b px-5 py-3 bg-muted/30">
              <div className="flex items-center gap-2 flex-1">
                <Input
                  placeholder="Filtrar clientes..."
                  value={loteSearchFilter}
                  onChange={e => setLoteSearchFilter(e.target.value)}
                  className="h-8 text-xs max-w-[220px]"
                  disabled={loteStatus === 'running'}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  disabled={loteStatus === 'running'}
                  onClick={() => loteToggleAll(loteSelecionados.size < loteClientesFiltrados.length)}
                >
                  {loteSelecionados.size >= loteClientesFiltrados.length && loteClientesFiltrados.length > 0 ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {loteSelecionados.size} de {loteClientes.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] text-muted-foreground whitespace-nowrap">Intervalo:</label>
                <Select value={String(loteDelay)} onValueChange={v => setLoteDelay(Number(v))} disabled={loteStatus === 'running'}>
                  <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5s</SelectItem>
                    <SelectItem value="10">10s</SelectItem>
                    <SelectItem value="15">15s</SelectItem>
                    <SelectItem value="20">20s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                    <SelectItem value="60">60s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lista de clientes ou progresso */}
            <div className="flex-1 overflow-y-auto">
              {loteStatus === 'idle' ? (
                /* Lista de seleção */
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] pl-5">
                        <input
                          type="checkbox"
                          checked={loteClientesFiltrados.length > 0 && loteClientesFiltrados.every(c => loteSelecionados.has(c.id))}
                          onChange={e => loteToggleAll(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                      </TableHead>
                      <TableHead className="text-xs">Razão Social</TableHead>
                      <TableHead className="text-xs w-[160px]">CNPJ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!loteClientesFiltrados.length ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs">Nenhum cliente MENSAL encontrado</TableCell></TableRow>
                    ) : loteClientesFiltrados.map(c => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => loteToggle(c.id)}>
                        <TableCell className="pl-5">
                          <input
                            type="checkbox"
                            checked={loteSelecionados.has(c.id)}
                            onChange={() => loteToggle(c.id)}
                            className="h-3.5 w-3.5 rounded border-gray-300"
                          />
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            {c.razaoSocial}
                            {c.alertaProcuracao && <span title="Possível falta de procuração no e-CAC" className="shrink-0 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /></span>}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {masks.cnpj(c.documento)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                /* Progresso da execução */
                <div className="divide-y">
                  {loteItems.map((item, idx) => (
                    <div key={item.clienteId} className={cn(
                      'flex items-center gap-3 px-5 py-2.5 text-xs',
                      item.status === 'consultando' && 'bg-sky-50/50 dark:bg-sky-900/10',
                    )}>
                      <div className="w-5 shrink-0 text-center font-mono text-muted-foreground">{idx + 1}</div>
                      <div className="w-5 shrink-0">
                        {item.status === 'pendente' && <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        {item.status === 'consultando' && <Loader2 className="h-3.5 w-3.5 text-sky-500 animate-spin" />}
                        {item.status === 'sucesso' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {item.status === 'erro' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
                        {item.status === 'pulado' && <X className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.razaoSocial}</p>
                        <p className="font-mono text-muted-foreground text-[10px]">
                          {masks.cnpj(item.documento)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right min-w-[140px]">
                        {item.status === 'consultando' && (
                          <span className="text-sky-600 font-medium">Consultando...</span>
                        )}
                        {item.status === 'sucesso' && (
                          <div>
                            <CertidaoBadge tipo={item.tipoCertidao || null} />
                            {(item.sociosImportados ?? 0) > 0 && (
                              <p className="text-[10px] text-emerald-600 mt-0.5">{item.sociosImportados} sócio(s)</p>
                            )}
                          </div>
                        )}
                        {item.status === 'erro' && (
                          <span className="text-red-500 text-[10px] line-clamp-1" title={item.erro || ''}>{item.erro || 'Erro'}</span>
                        )}
                        {item.status === 'pulado' && <span className="text-muted-foreground">Cancelado</span>}
                        {item.status === 'pendente' && loteStatus === 'running' && idx === loteItems.findIndex(it => it.status === 'pendente') && loteCountdownRef.current > 0 && (
                          <span className="text-amber-500 font-mono">Aguardando {loteCountdownRef.current}s</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer com resumo e ações */}
            <div className="flex items-center justify-between border-t px-5 py-3 bg-muted/30">
              {loteStatus === 'done' ? (
                <>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-medium">
                      {loteItems.filter(i => i.status === 'sucesso').length} sucesso
                    </span>
                    {loteItems.filter(i => i.status === 'erro').length > 0 && (
                      <span className="text-red-500 font-medium">
                        {loteItems.filter(i => i.status === 'erro').length} erro(s)
                      </span>
                    )}
                    {loteItems.filter(i => i.status === 'pulado').length > 0 && (
                      <span className="text-muted-foreground">
                        {loteItems.filter(i => i.status === 'pulado').length} cancelado(s)
                      </span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLoteOpen(false)}>Fechar</Button>
                </>
              ) : loteStatus === 'running' ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
                    Processando {loteItems.filter(i => i.status === 'sucesso' || i.status === 'erro').length + 1} de {loteItems.length}...
                  </div>
                  <Button variant="destructive" size="sm" onClick={handlePararLote} className="gap-1.5">
                    <Square className="h-3.5 w-3.5" />Parar
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {loteSelecionados.size} cliente(s) selecionado(s) — intervalo de {loteDelay}s entre consultas
                  </p>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleIniciarLote}
                    disabled={!loteSelecionados.size}
                    className="gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />Iniciar Consultas
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="fiscal" icon={Shield} />
          <div>
            <h1>{trashMode ? 'Lixeira — Situação Fiscal' : 'Situação Fiscal'}</h1>
            <p className="text-sm text-muted-foreground">
              {trashMode ? 'Consultas excluídas. Restaure ou exclua permanentemente.' : 'Consulte a situação fiscal de clientes junto à Receita Federal via SERPRO'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!trashMode ? (
            <>
              <Button variant="success" size="sm" onClick={handleConsultar} disabled={consultando} className="gap-1.5">
                {consultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {consultando ? 'Consultando...' : 'Nova Consulta'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleAbrirLote} className="gap-1.5">
                <Users className="h-4 w-4" />
                Consulta em Lote
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm"><RefreshCw className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={fetchData}><RefreshCw className="h-4 w-4" />Atualizar lista</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setTrashMode(true); setPage(1) }}><Archive className="h-4 w-4" />Lixeira</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setTrashMode(false); setPage(1) }}>
              <RotateCcw className="h-4 w-4" />Voltar aos ativos
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      {!trashMode && (
        <Card className={cn('overflow-hidden transition-all', filtersOpen ? '' : 'cursor-pointer')} onClick={() => !filtersOpen && setFiltersOpen(true)}>
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen) }}>
            <div className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtros
              {hasActiveFilters && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-sky-500">1</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); clearFilters() }}>
                  <X className="h-3 w-3" />Limpar
                </Button>
              )}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
            </div>
          </div>
          {filtersOpen && (
            <div className="px-4 py-3 border-t border-border/40">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Certidão</label>
                  <Select value={filterCertidao || '__all__'} onValueChange={v => { setFilterCertidao(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="Negativa">Negativa</SelectItem>
                      <SelectItem value="Positiva">Positiva</SelectItem>
                      <SelectItem value="Positiva com Efeitos de Negativa">Positiva c/ Efeitos de Negativa</SelectItem>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* DataTable */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="hidden sm:inline">registros</span>
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
              <TableHead className="w-[140px] text-right">Ações</TableHead>
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
                {trashMode ? 'Nenhuma consulta na lixeira' : 'Nenhuma consulta realizada ainda'}
              </TableCell></TableRow>
            ) : data.data.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{formatDoc(c.documento, c.tipoDocumento)}</TableCell>
                <TableCell className="text-sm">
                  <div>
                    <p className="font-medium">{c.cliente?.razaoSocial || c.razaoSocial || '—'}</p>
                    {c.cliente && <p className="text-xs text-muted-foreground">{c.cliente.razaoSocial}</p>}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell"><CertidaoBadge tipo={c.tipoCertidao} /></TableCell>
                <TableCell className="hidden sm:table-cell"><EtapaBadge etapa={c.etapa} sucesso={c.sucesso} /></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{c.user?.name || '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {trashMode ? (
                      <Button variant="soft" size="icon-sm" onClick={() => handleRestore(c.id)} title="Restaurar">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <>
                        {c.sucesso && (
                          <>
                            <Button variant="soft-info" size="icon-sm" onClick={() => handleVisualizarPdf(c.id)} title="Visualizar PDF">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="soft" size="icon-sm" onClick={() => handleDownloadPdf(c.id, c.documento)} title="Baixar PDF">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(c.id)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Paginação */}
        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (
                <>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>
              )}
            </p>
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
