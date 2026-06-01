'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  FileText, Loader2, Search, Building2, FileSpreadsheet,
  Download, ExternalLink, Maximize2, X,
  ArrowDownToLine, ArrowUpFromLine, Calendar,
  ChevronLeft, ChevronRight, RefreshCw, ShieldCheck, AlertTriangle,
  PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, FileCode2,
} from 'lucide-react'
import {
  Button, Input, Card, cn, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'
/** Quantos documentos por página na coluna Documentos. */
const ITEMS_POR_PAGINA = 30

interface ClienteCount {
  clienteId: string | null
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  totalDanfes: number
  totalNfse: number
  total: number
  valorTotal: string | null
  ultimaNota: string | null
}

type OrigemNota = 'drive' | 'local' | 'lote' | 'manual' | 'nfe-sefaz' | 'nfse-adn' | 'nfse-municipal'

interface DocumentoRow {
  tipoDoc: 'nfe' | 'nfse'
  id: string
  chave: string | null
  numero: string
  serie: string | null
  emitenteRazao: string
  emitenteCnpj: string
  destRazao: string | null
  destCnpjCpf: string | null
  valorTotal: string
  dataEmissao: string
  status: string
  pdfKey: string | null
  /** Só pra NFS-e: true = DANFSe oficial gov.br; false = auxiliar interno. */
  pdfOficial?: boolean
  /** Como o documento foi importado: Drive / Pasta local / Lote / Manual / API. */
  origem: OrigemNota
}

/** Texto + cor pro badge de origem. */
function origemBadge(origem: OrigemNota): { label: string; classes: string; title: string } {
  switch (origem) {
    case 'drive':           return { label: 'Drive',     classes: 'bg-sky-100 text-sky-700',         title: 'Importado do Google Drive' }
    case 'local':           return { label: 'Pasta',     classes: 'bg-amber-100 text-amber-800',     title: 'Importado da pasta local do PC' }
    case 'nfe-sefaz':       return { label: 'SEFAZ',     classes: 'bg-violet-100 text-violet-700',   title: 'Baixado da API NFeDistribuicaoDFe da SEFAZ' }
    case 'nfse-adn':        return { label: 'ADN',       classes: 'bg-emerald-100 text-emerald-700', title: 'Baixado do ADN gov.br (NFS-e Nacional)' }
    case 'nfse-municipal':  return { label: 'Municipal', classes: 'bg-teal-100 text-teal-700',       title: 'NFS-e em leiaute municipal' }
    case 'lote':            return { label: 'Lote',      classes: 'bg-indigo-100 text-indigo-700',   title: 'Upload em lote de XMLs' }
    case 'manual':          return { label: 'Manual',    classes: 'bg-slate-100 text-slate-700',     title: 'Upload manual direto' }
  }
}

interface CompetenciaInfo {
  ym: string
  totalNfe: number
  totalNfse: number
}

const STATUS_COLOR: Record<string, string> = {
  AUTORIZADA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  CANCELADA:  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
  DENEGADA:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  INUTILIZADA: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300',
  EMITIDA:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  SUBSTITUIDA: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
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
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return doc
}

function fmtCompetencia(yyyymm: string): string {
  const [y, m] = yyyymm.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[Number(m) - 1]}/${y}`
}

function competenciaAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type FiltroTipo = 'todos' | 'nfe-entrada' | 'nfe-saida' | 'nfse-tomada' | 'nfse-prestada'

export default function DanfeGaleriaPage() {
  const searchParams = useSearchParams()
  const clienteParam = searchParams.get('cliente')

  const [clientes, setClientes] = useState<ClienteCount[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [clienteAtivo, setClienteAtivo] = useState<string | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')

  /** Cache: clienteId → competência → docs já carregados. Evita refetch ao alternar. */
  const [cacheDocs, setCacheDocs] = useState<Map<string, Map<string, DocumentoRow[]>>>(new Map())
  const [competencias, setCompetencias] = useState<CompetenciaInfo[]>([])
  const [loadingCompetencias, setLoadingCompetencias] = useState(false)
  const [competenciaAtiva, setCompetenciaAtiva] = useState<string>(competenciaAtual())
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')
  const [pagina, setPagina] = useState(1)
  const [selecionado, setSelecionado] = useState<DocumentoRow | null>(null)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)
  const [regerando, setRegerando] = useState(false)
  /** Bump pra forçar recarregamento do iframe quando o PDF muda mas o id permanece. */
  const [pdfCacheKey, setPdfCacheKey] = useState(0)
  /** Estados de colapso das colunas laterais (persiste em localStorage). */
  const [clientesCollapsed, setClientesCollapsed] = useState(false)
  const [documentosCollapsed, setDocumentosCollapsed] = useState(false)

  // Restaura preferência salva ao montar
  useEffect(() => {
    if (typeof window === 'undefined') return
    setClientesCollapsed(localStorage.getItem('galeria.clientes.collapsed') === '1')
    setDocumentosCollapsed(localStorage.getItem('galeria.documentos.collapsed') === '1')
  }, [])
  // Persiste quando muda
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('galeria.clientes.collapsed', clientesCollapsed ? '1' : '0')
  }, [clientesCollapsed])
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('galeria.documentos.collapsed', documentosCollapsed ? '1' : '0')
  }, [documentosCollapsed])

  // Lista de clientes — combina NFe + NFS-e, ordem alfabética por razaoSocial
  useEffect(() => {
    setLoadingClientes(true)
    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trpc.danfe as any).listClientesComDanfes.query().catch(() => []),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trpc as any).nfse.listClientesComNotas.query().catch(() => []),
    ])
      .then(([nfeRows, nfseRows]) => {
        const map = new Map<string, ClienteCount>()
        for (const r of nfeRows as Array<{ clienteId: string | null; razaoSocial: string; nomeFantasia: string | null; documento: string; totalDanfes: number; valorTotal: string | null; ultimaNota: string | null }>) {
          const key = r.clienteId ?? '__null__'
          map.set(key, {
            clienteId: r.clienteId,
            razaoSocial: r.razaoSocial,
            nomeFantasia: r.nomeFantasia,
            documento: r.documento,
            totalDanfes: r.totalDanfes,
            totalNfse: 0,
            total: r.totalDanfes,
            valorTotal: r.valorTotal,
            ultimaNota: r.ultimaNota,
          })
        }
        for (const r of nfseRows as Array<{ clienteId: string | null; razaoSocial: string; nomeFantasia: string | null; documento: string; totalNotas: number; valorTotal: string | null; ultimaNota: string | null }>) {
          const key = r.clienteId ?? '__null__'
          const existente = map.get(key)
          if (existente) {
            existente.totalNfse = r.totalNotas
            existente.total += r.totalNotas
            const ultimaA = existente.ultimaNota ? new Date(existente.ultimaNota).getTime() : 0
            const ultimaB = r.ultimaNota ? new Date(r.ultimaNota).getTime() : 0
            if (ultimaB > ultimaA) existente.ultimaNota = r.ultimaNota
          } else {
            map.set(key, {
              clienteId: r.clienteId,
              razaoSocial: r.razaoSocial,
              nomeFantasia: r.nomeFantasia,
              documento: r.documento,
              totalDanfes: 0,
              totalNfse: r.totalNotas,
              total: r.totalNotas,
              valorTotal: r.valorTotal,
              ultimaNota: r.ultimaNota,
            })
          }
        }
        const rows = Array.from(map.values()).sort((a, b) =>
          a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR', { sensitivity: 'base' })
        )
        setClientes(rows)
        if (clienteParam && rows.some(r => (r.clienteId ?? '__null__') === clienteParam)) {
          setClienteAtivo(clienteParam)
        } else if (rows.length > 0 && !clienteAtivo) {
          setClienteAtivo(rows[0]!.clienteId ?? '__null__')
        }
      })
      .finally(() => setLoadingClientes(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteParam])

  // Ao trocar cliente: busca competências e carrega a atual (ou a primeira disponível)
  useEffect(() => {
    if (!clienteAtivo) return
    setLoadingCompetencias(true)
    setSelecionado(null)
    setPagina(1)
    ;(trpc as any).drive.listCompetenciasFiscais.query({ clienteId: clienteAtivo })
      .then((comps: CompetenciaInfo[]) => {
        setCompetencias(comps)
        // Escolhe competência inicial: a do mês atual se existir; senão a mais recente.
        const atual = competenciaAtual()
        const hasAtual = comps.some(c => c.ym === atual)
        const inicial = hasAtual ? atual : (comps[0]?.ym ?? atual)
        setCompetenciaAtiva(inicial)
      })
      .catch(() => setCompetencias([]))
      .finally(() => setLoadingCompetencias(false))
  }, [clienteAtivo])

  /** Documentos carregados pra cliente/competência atual (lendo do cache). */
  const documentosCache: DocumentoRow[] = useMemo(() => {
    if (!clienteAtivo) return []
    return cacheDocs.get(clienteAtivo)?.get(competenciaAtiva) ?? []
  }, [cacheDocs, clienteAtivo, competenciaAtiva])

  // Carrega documentos da competência ativa quando ela muda (com cache)
  useEffect(() => {
    if (!clienteAtivo) return
    // Se já tem no cache, não refetch
    if (cacheDocs.get(clienteAtivo)?.has(competenciaAtiva)) {
      setPagina(1)
      const docs = cacheDocs.get(clienteAtivo)!.get(competenciaAtiva)!
      if (docs.length > 0) setSelecionado(docs[0]!)
      return
    }

    let cancelado = false
    setLoadingDocs(true)
    setSelecionado(null)
    setPagina(1)

    Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trpc.danfe as any).listGaleriaPorCliente.query({ clienteId: clienteAtivo, competencia: competenciaAtiva, limit: 1000 }).catch(() => ({ data: [] })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trpc as any).nfse.listGaleriaPorCliente.query({ clienteId: clienteAtivo, competencia: competenciaAtiva, limit: 1000 }).catch(() => ({ data: [] })),
    ])
      .then(([danfeR, nfseR]) => {
        if (cancelado) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nfes: DocumentoRow[] = (danfeR.data as any[]).map((d) => ({
          tipoDoc: 'nfe',
          id: d.id,
          chave: d.chave,
          numero: String(d.numero),
          serie: d.serie != null ? String(d.serie) : null,
          emitenteRazao: d.emitenteRazao,
          emitenteCnpj: d.emitenteCnpj,
          destRazao: d.destRazao,
          destCnpjCpf: d.destCnpjCpf,
          valorTotal: String(d.valorTotal),
          dataEmissao: d.dataEmissao,
          status: d.status,
          pdfKey: d.pdfKey,
          origem: (d.origem as OrigemNota) ?? 'manual',
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nfses: DocumentoRow[] = (nfseR.data as any[]).map((n) => {
          const valorBruto = Number(n.valorServicos ?? 0)
          const valorLiq = n.valorLiquido != null ? Number(n.valorLiquido) : null
          const valorExibido = (valorLiq && valorLiq > 0) ? valorLiq : valorBruto
          return {
            tipoDoc: 'nfse' as const,
            id: n.id, chave: n.chave, numero: String(n.numero), serie: n.serie,
            emitenteRazao: n.prestadorRazao, emitenteCnpj: n.prestadorCnpj,
            destRazao: n.tomadorRazao, destCnpjCpf: n.tomadorCnpjCpf,
            valorTotal: String(valorExibido), dataEmissao: n.dataEmissao,
            status: n.status, pdfKey: n.pdfKey,
            pdfOficial: !!n.pdfOficial,
            origem: (n.origem as OrigemNota) ?? 'manual',
          }
        })
        const todos = [...nfes, ...nfses].sort((a, b) =>
          new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime()
        )
        setCacheDocs(prev => {
          const next = new Map(prev)
          const subMap = new Map(next.get(clienteAtivo) ?? [])
          subMap.set(competenciaAtiva, todos)
          next.set(clienteAtivo, subMap)
          return next
        })
        if (todos.length > 0) setSelecionado(todos[0]!)
      })
      .finally(() => {
        if (!cancelado) setLoadingDocs(false)
      })

    return () => { cancelado = true }
  }, [clienteAtivo, competenciaAtiva, cacheDocs])

  const clientesFiltrados = clientes.filter(c =>
    !buscaCliente ||
    c.razaoSocial.toLowerCase().includes(buscaCliente.toLowerCase()) ||
    c.documento.includes(buscaCliente.replace(/\D/g, ''))
  )

  const clienteAtual = clientes.find(c => (c.clienteId ?? '__null__') === clienteAtivo)
  const docCliente = clienteAtual?.documento.replace(/\D/g, '') ?? ''

  function classificar(d: DocumentoRow): FiltroTipo | 'outro' {
    if (!docCliente) return 'outro'
    const emit = d.emitenteCnpj.replace(/\D/g, '')
    const dest = (d.destCnpjCpf ?? '').replace(/\D/g, '')
    if (d.tipoDoc === 'nfe') {
      if (emit === docCliente) return 'nfe-saida'
      if (dest === docCliente) return 'nfe-entrada'
      return 'outro'
    }
    if (emit === docCliente) return 'nfse-prestada'
    if (dest === docCliente) return 'nfse-tomada'
    return 'outro'
  }

  const documentosFiltrados = documentosCache.filter(d => {
    if (busca) {
      const q = busca.toLowerCase()
      const matches =
        (d.chave?.includes(busca) ?? false) ||
        d.numero.toLowerCase().includes(q) ||
        d.emitenteRazao.toLowerCase().includes(q) ||
        (d.destRazao ?? '').toLowerCase().includes(q)
      if (!matches) return false
    }
    if (filtro !== 'todos') {
      if (classificar(d) !== filtro) return false
    }
    return true
  })

  // Paginação client-side da lista filtrada
  const totalPaginas = Math.max(1, Math.ceil(documentosFiltrados.length / ITEMS_POR_PAGINA))
  const paginaSegura = Math.min(pagina, totalPaginas)
  const skipPagina = (paginaSegura - 1) * ITEMS_POR_PAGINA
  const documentosPaginados = documentosFiltrados.slice(skipPagina, skipPagina + ITEMS_POR_PAGINA)

  const counts = useMemo(() => {
    const c = { 'nfe-entrada': 0, 'nfe-saida': 0, 'nfse-tomada': 0, 'nfse-prestada': 0, outro: 0 }
    for (const d of documentosCache) {
      const t = classificar(d)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(c as any)[t] = ((c as any)[t] ?? 0) + 1
    }
    return { ...c, total: documentosCache.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentosCache, docCliente])

  // Reset pra página 1 ao mudar busca/filtro
  useEffect(() => { setPagina(1) }, [busca, filtro])

  // Auto-seleciona 1ª nota visível quando paginação muda
  useEffect(() => {
    if (documentosPaginados.length > 0 && !documentosPaginados.find(d => d.id === selecionado?.id)) {
      setSelecionado(documentosPaginados[0]!)
    } else if (documentosPaginados.length === 0) {
      setSelecionado(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaSegura, busca, filtro, competenciaAtiva])

  const pdfUrl = selecionado
    ? `${getApiUrl()}/api/${selecionado.tipoDoc === 'nfe' ? 'danfe' : 'nfse'}/${selecionado.id}/pdf${pdfCacheKey > 0 ? `?v=${pdfCacheKey}` : ''}`
    : null

  const xmlUrl = selecionado
    ? `${getApiUrl()}/api/${selecionado.tipoDoc === 'nfe' ? 'danfe' : 'nfse'}/${selecionado.id}/xml`
    : null

  /** Tenta baixar DANFSe oficial da API gov.br pra NFS-e atual.
   *  Em sucesso, atualiza o card no cache em memória. */
  async function handleRegerarPdf() {
    if (!selecionado || selecionado.tipoDoc !== 'nfse') return
    setRegerando(true)
    try {
      const r = await trpcMutate<{ ok: boolean; pdfOficial: boolean; mensagem: string }>(
        'nfse.regerarPdf',
        { id: selecionado.id },
        { timeoutMs: 60_000 },
      )
      if (r.ok) {
        if (r.pdfOficial) {
          await alerts.success('DANFSe oficial baixado', r.mensagem)
        } else {
          await alerts.success('DANFSe local gerado', r.mensagem)
        }
        const novo: DocumentoRow = { ...selecionado, pdfOficial: r.pdfOficial }
        setCacheDocs(prev => {
          const next = new Map(prev)
          for (const [cid, subMap] of next) {
            for (const [ym, docs] of subMap) {
              const idx = docs.findIndex(d => d.id === selecionado.id && d.tipoDoc === 'nfse')
              if (idx >= 0) {
                const novos = [...docs]
                novos[idx] = novo
                subMap.set(ym, novos)
                next.set(cid, new Map(subMap))
              }
            }
          }
          return next
        })
        setSelecionado(novo)
        // Bump cache key pro iframe recarregar o PDF novo (o id é o mesmo, mas o blob mudou)
        setPdfCacheKey(k => k + 1)
      } else {
        await alerts.warning('Não foi possível regerar', r.mensagem)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setRegerando(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-140px)] overflow-hidden">
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1>Galeria Fiscal</h1>
            <p className="text-sm text-muted-foreground">NFe + NFS-e — selecione cliente e competência</p>
          </div>
        </div>
        <div className="flex gap-2">
          <BackButton href="/danfe" />
        </div>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* ── COLUNA 1: Clientes (colapsável) ─────────────────── */}
        <aside className={cn(
          'shrink-0 min-h-0 transition-[width] duration-200',
          clientesCollapsed ? 'w-10' : 'w-48 lg:w-56'
        )}>
          {clientesCollapsed ? (
            <Card
              className="h-full p-0 flex flex-col items-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setClientesCollapsed(false)}
              title="Expandir Clientes"
            >
              <Button variant="ghost" size="icon-sm" className="mt-2 mb-1" onClick={(e) => { e.stopPropagation(); setClientesCollapsed(false) }}>
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180 mt-1">
                Clientes
              </span>
            </Card>
          ) : (
          <Card className="h-full min-h-0 p-3 flex flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
                Clientes
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setClientesCollapsed(true)}
                title="Recolher coluna Clientes"
                className="h-6 w-6 -mr-1"
              >
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                placeholder="Buscar..."
                className="pl-7 h-8 text-xs"
              />
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 space-y-1 nice-scrollbar">
              {loadingClientes ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  {clientes.length === 0 ? 'Nenhum cliente com notas.' : 'Nenhum resultado.'}
                </div>
              ) : (
                clientesFiltrados.map((c) => {
                  const key = c.clienteId ?? '__null__'
                  const ativo = clienteAtivo === key
                  return (
                  <button
                    key={key}
                    onClick={() => setClienteAtivo(key)}
                    className={cn(
                      'w-full text-left px-2 py-2 rounded transition-colors',
                      ativo ? 'text-white shadow-sm' : 'hover:bg-muted/60',
                    )}
                    style={ativo ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <Building2 className={cn('h-3.5 w-3.5 shrink-0 mt-0.5', ativo ? 'text-white' : 'text-muted-foreground')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{c.razaoSocial}</div>
                        <div className={cn('text-[10px] mt-0.5', ativo ? 'text-white/80' : 'text-muted-foreground')}>
                          {c.totalDanfes > 0 && <>{c.totalDanfes} NFe</>}
                          {c.totalDanfes > 0 && c.totalNfse > 0 && <> · </>}
                          {c.totalNfse > 0 && <>{c.totalNfse} NFS-e</>}
                        </div>
                      </div>
                    </div>
                  </button>
                  )
                })
              )}
            </div>
          </Card>
          )}
        </aside>

        {/* ── COLUNA 2: Documentos (colapsável) ──────────────── */}
        <section className={cn(
          'shrink-0 min-h-0 transition-[width] duration-200',
          documentosCollapsed ? 'w-10' : 'w-72 lg:w-80'
        )}>
          {documentosCollapsed ? (
            <Card
              className="h-full p-0 flex flex-col items-center cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setDocumentosCollapsed(false)}
              title="Expandir Documentos"
            >
              <Button variant="ghost" size="icon-sm" className="mt-2 mb-1" onClick={(e) => { e.stopPropagation(); setDocumentosCollapsed(false) }}>
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground [writing-mode:vertical-rl] rotate-180 mt-1">
                Documentos {documentosCache.length > 0 && `(${documentosFiltrados.length})`}
              </span>
            </Card>
          ) : (
          <Card className="h-full min-h-0 p-3 flex flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
                Documentos {documentosCache.length > 0 && <span className="text-foreground">({documentosFiltrados.length}/{documentosCache.length})</span>}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDocumentosCollapsed(true)}
                title="Recolher coluna Documentos"
                className="h-6 w-6 -mr-1"
              >
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-1.5 mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nº, chave, emitente..."
                  className="pl-7 h-8 text-xs"
                />
              </div>

              {/* Competência — lista vinda do endpoint dedicado */}
              <Select value={competenciaAtiva} onValueChange={setCompetenciaAtiva} disabled={loadingCompetencias}>
                <SelectTrigger className="h-8 text-xs">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder={loadingCompetencias ? 'Carregando...' : 'Competência'} />
                </SelectTrigger>
                <SelectContent>
                  {competencias.length === 0 ? (
                    <SelectItem value={competenciaAtual()}>{fmtCompetencia(competenciaAtual())} (vazio)</SelectItem>
                  ) : (
                    competencias.map(c => (
                      <SelectItem key={c.ym} value={c.ym}>
                        {fmtCompetencia(c.ym)} · {c.totalNfe + c.totalNfse} doc{(c.totalNfe + c.totalNfse) !== 1 ? 's' : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {docCliente && (
                <Select value={filtro} onValueChange={(v) => setFiltro(v as FiltroTipo)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas ({counts.total})</SelectItem>
                    <SelectItem value="nfe-entrada">NFe — entradas ({counts['nfe-entrada']})</SelectItem>
                    <SelectItem value="nfe-saida">NFe — saídas ({counts['nfe-saida']})</SelectItem>
                    <SelectItem value="nfse-tomada">NFS-e — tomadas ({counts['nfse-tomada']})</SelectItem>
                    <SelectItem value="nfse-prestada">NFS-e — prestadas ({counts['nfse-prestada']})</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex-1 overflow-y-scroll -mx-1 nice-scrollbar divide-y divide-border/60">
              {loadingDocs ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : !clienteAtivo ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  Selecione um cliente.
                </div>
              ) : documentosPaginados.length === 0 ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  {documentosCache.length === 0
                    ? `Nenhum documento em ${fmtCompetencia(competenciaAtiva)}.`
                    : 'Nenhum resultado nesta página.'}
                </div>
              ) : (
                documentosPaginados.map((d) => {
                  const tipo = classificar(d)
                  const isEntrada = tipo === 'nfe-entrada' || tipo === 'nfse-tomada'
                  const isSaida = tipo === 'nfe-saida' || tipo === 'nfse-prestada'
                  const TipoIcon = isEntrada ? ArrowDownToLine : isSaida ? ArrowUpFromLine : null
                  const ativo = selecionado?.id === d.id && selecionado?.tipoDoc === d.tipoDoc
                  return (
                  <button
                    key={`${d.tipoDoc}-${d.id}`}
                    onClick={() => setSelecionado(d)}
                    disabled={!d.pdfKey}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      ativo ? 'text-white shadow-sm' : 'hover:bg-muted/60',
                    )}
                    style={ativo ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5 min-w-0">
                        {TipoIcon && (
                          <TipoIcon className={cn('h-3 w-3 shrink-0', ativo ? 'text-white' : isEntrada ? 'text-emerald-600' : 'text-sky-600')} />
                        )}
                        <Badge className={cn(
                          'text-[8px] py-0 px-1 border-0 shrink-0',
                          ativo ? 'bg-white/20 text-white' :
                            d.tipoDoc === 'nfe' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700',
                        )}>
                          {d.tipoDoc === 'nfe' ? 'NFe' : 'NFS-e'}
                        </Badge>
                        <span className="truncate">Nº {d.numero}</span>
                      </span>
                      <Badge className={cn(
                        'text-[9px] py-0 px-1 border-0 shrink-0',
                        ativo ? 'bg-white/20 text-white' : STATUS_COLOR[d.status] ?? 'bg-slate-100',
                      )}>
                        {d.status}
                      </Badge>
                    </div>
                    <div className={cn('text-[10px] truncate mt-0.5', ativo ? 'text-white/80' : 'text-muted-foreground')} title={d.emitenteRazao}>
                      {d.emitenteRazao}
                    </div>
                    <div className={cn('flex items-center justify-between text-[10px] mt-0.5 gap-1.5', ativo ? 'text-white/80' : 'text-muted-foreground')}>
                      <span className="flex items-center gap-1.5">
                        {(() => {
                          const o = origemBadge(d.origem)
                          return (
                            <Badge className={cn('text-[8px] py-0 px-1 border-0', ativo ? 'bg-white/20 text-white' : o.classes)} title={o.title}>
                              {o.label}
                            </Badge>
                          )
                        })()}
                        <span>{fmtDate(d.dataEmissao)}</span>
                      </span>
                      <span className={cn('font-semibold', ativo ? 'text-white' : 'text-foreground')}>
                        {fmtBRL(d.valorTotal)}
                      </span>
                    </div>
                  </button>
                  )
                })
              )}
            </div>

            {/* Paginação */}
            {documentosFiltrados.length > ITEMS_POR_PAGINA && (
              <div className="flex items-center justify-between border-t border-border pt-2 mt-2 -mx-1 px-1">
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {skipPagina + 1}–{Math.min(skipPagina + ITEMS_POR_PAGINA, documentosFiltrados.length)} de {documentosFiltrados.length}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={paginaSegura <= 1}
                    onClick={() => setPagina(p => Math.max(1, p - 1))}
                    title="Anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-[10px] font-semibold tabular-nums px-1">
                    {paginaSegura}/{totalPaginas}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={paginaSegura >= totalPaginas}
                    onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                    title="Próxima"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
          )}
        </section>

        {/* ── COLUNA 3: Preview (ocupa o restante) ───────────── */}
        <section className="flex-1 min-w-0 min-h-0">
          <Card className="h-full min-h-0 p-0 flex flex-col overflow-hidden">
            {!selecionado ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm">Selecione um documento pra visualizar.</p>
                {clienteAtual && documentosCache.length === 0 && !loadingDocs && (
                  <p className="text-xs">Nenhum documento em {fmtCompetencia(competenciaAtiva)}.</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      <Badge className={cn(
                        'text-[9px] py-0 px-1.5 border-0',
                        selecionado.tipoDoc === 'nfe' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700',
                      )}>
                        {selecionado.tipoDoc === 'nfe' ? 'NFe' : 'NFS-e'}
                      </Badge>
                      Nº {selecionado.numero}
                      {selecionado.serie && <span className="text-muted-foreground"> — Série {selecionado.serie}</span>}
                      {selecionado.tipoDoc === 'nfse' && (
                        selecionado.pdfOficial ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px] py-0 px-1.5 flex items-center gap-1" title="DANFSe v1.0 oficial baixado da API gov.br — QR de verificação assinado pela União">
                            <ShieldCheck className="h-2.5 w-2.5" /> Oficial
                          </Badge>
                        ) : (
                          <Badge className="bg-sky-100 text-sky-700 border-0 text-[9px] py-0 px-1.5 flex items-center gap-1" title="DANFSe local seguindo NT 008/2026 (layout v1.0). Clique em ↻ pra tentar baixar o oficial quando a API gov.br voltar.">
                            <AlertTriangle className="h-2.5 w-2.5" /> Local NT 008
                          </Badge>
                        )
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {selecionado.emitenteRazao} · {fmtCnpj(selecionado.emitenteCnpj)} · {fmtDate(selecionado.dataEmissao)} · {fmtBRL(selecionado.valorTotal)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {selecionado.tipoDoc === 'nfse' && !selecionado.pdfOficial && (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        title="Re-tentar baixar DANFSe oficial (API gov.br). Fallback gera DANFSe local NT 008."
                        onClick={handleRegerarPdf}
                        disabled={regerando}
                      >
                        {regerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    )}
                    {pdfUrl && (
                      <Button variant="outline" size="icon-sm" title="Baixar PDF" onClick={() => window.open(pdfUrl, '_blank')}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                    {xmlUrl && (
                      <Button variant="outline" size="icon-sm" title="Baixar XML original" onClick={() => window.open(xmlUrl, '_blank')}>
                        <FileCode2 className="h-4 w-4" />
                      </Button>
                    )}
                    {selecionado.tipoDoc === 'nfe' && (
                      <Link href={`/danfe/${selecionado.id}`}>
                        <Button variant="outline" size="icon-sm" title="Página de detalhe">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    )}
                    <Button variant="outline" size="icon-sm" title="Tela cheia" onClick={() => setPreviewFullscreen(true)}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {selecionado.pdfKey && pdfUrl ? (
                  <iframe
                    key={`${selecionado.tipoDoc}-${selecionado.id}`}
                    src={pdfUrl}
                    className="flex-1 w-full bg-white"
                    title={`${selecionado.tipoDoc === 'nfe' ? 'DANFE' : 'NFS-e'} ${selecionado.numero}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6">
                    <FileText className="h-12 w-12 opacity-20" />
                    <p className="text-sm">PDF não disponível para este documento.</p>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      {previewFullscreen && selecionado && selecionado.pdfKey && pdfUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={() => setPreviewFullscreen(false)}>
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">
              {selecionado.tipoDoc === 'nfe' ? 'DANFE' : 'NFS-e'} Nº {selecionado.numero} — {selecionado.emitenteRazao}
            </div>
            <Button variant="outline" size="icon-sm" title="Fechar" onClick={() => setPreviewFullscreen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <iframe
            src={pdfUrl}
            className="flex-1 w-full bg-white"
            title={`${selecionado.tipoDoc === 'nfe' ? 'DANFE' : 'NFS-e'} ${selecionado.numero}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
