'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  FileText, Loader2, Search, Building2, Receipt,
  Download, ExternalLink, Maximize2, X,
  ArrowDownToLine, ArrowUpFromLine, Calendar,
} from 'lucide-react'
import {
  Button, Input, Card, cn, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

interface ClienteCount {
  clienteId: string | null  // null = notas sem cliente vinculado
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  totalNotas: number
  valorTotal: string | null
  ultimaNota: string | null
}

interface NfseRow {
  id: string
  chave: string | null
  numero: string  // string, varia conforme prefeitura
  serie: string | null
  prestadorRazao: string
  prestadorCnpj: string
  tomadorRazao: string | null
  tomadorCnpjCpf: string | null
  valorServicos: string  // Decimal vira string
  dataEmissao: string
  status: string
  pdfKey: string | null
}

const STATUS_COLOR: Record<string, string> = {
  EMITIDA:     'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  CANCELADA:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
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

export default function NfseGaleriaPage() {
  const searchParams = useSearchParams()
  const clienteParam = searchParams.get('cliente')

  const [clientes, setClientes] = useState<ClienteCount[]>([])
  const [loadingClientes, setLoadingClientes] = useState(true)
  const [clienteAtivo, setClienteAtivo] = useState<string | null>(null)
  const [buscaCliente, setBuscaCliente] = useState('')

  const [notas, setNotas] = useState<NfseRow[]>([])
  const [loadingNotas, setLoadingNotas] = useState(false)
  const [buscaNota, setBuscaNota] = useState('')
  const [competencia, setCompetencia] = useState<string>('__all__')  // YYYY-MM ou __all__
  const [tipo, setTipo] = useState<'todos' | 'entrada' | 'saida'>('todos')
  const [selecionado, setSelecionado] = useState<NfseRow | null>(null)
  const [previewFullscreen, setPreviewFullscreen] = useState(false)

  // Lista de clientes — se ?cliente=X na URL, usa esse como ativo
  useEffect(() => {
    setLoadingClientes(true)
    // TODO: criar endpoints tRPC nfse.*
    ;(trpc as any).nfse.listClientesComNotas.query()
      .then((rows: ClienteCount[]) => {
        setClientes(rows)
        // Se URL tem ?cliente=X, prioriza
        if (clienteParam && rows.some(r => (r.clienteId ?? '__null__') === clienteParam)) {
          setClienteAtivo(clienteParam === '__null__' ? '__null__' : clienteParam)
        } else if (rows.length > 0 && !clienteAtivo) {
          setClienteAtivo(rows[0]!.clienteId ?? '__null__')
        }
      })
      .finally(() => setLoadingClientes(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteParam])

  // Notas do cliente ativo
  const carregarNotas = useCallback(async (clienteId: string) => {
    setLoadingNotas(true)
    setSelecionado(null)
    try {
      // TODO: criar endpoints tRPC nfse.*
      const r = await (trpc as any).nfse.listGaleriaPorCliente.query({ clienteId, limit: 500 })
      const lista = r.data as NfseRow[]
      setNotas(lista)
      // Reseta filtros ao trocar cliente
      setCompetencia('__all__')
      setTipo('todos')
      if (lista.length > 0) setSelecionado(lista[0]!)
    } finally {
      setLoadingNotas(false)
    }
  }, [])

  useEffect(() => {
    if (clienteAtivo) carregarNotas(clienteAtivo)
  }, [clienteAtivo, carregarNotas])

  const clientesFiltrados = clientes.filter(c =>
    !buscaCliente ||
    c.razaoSocial.toLowerCase().includes(buscaCliente.toLowerCase()) ||
    c.documento.includes(buscaCliente.replace(/\D/g, ''))
  )

  const clienteAtual = clientes.find(c => (c.clienteId ?? '__null__') === clienteAtivo)
  const docCliente = clienteAtual?.documento.replace(/\D/g, '') ?? ''

  /** Classifica NFS-e como 'entrada' (cliente é tomador) ou 'saida' (cliente é prestador). */
  function classificarTipo(n: NfseRow): 'entrada' | 'saida' | 'outro' {
    if (!docCliente) return 'outro'
    const prest = n.prestadorCnpj.replace(/\D/g, '')
    const tom = (n.tomadorCnpjCpf ?? '').replace(/\D/g, '')
    if (prest === docCliente) return 'saida'
    if (tom === docCliente) return 'entrada'
    return 'outro'
  }

  /** Competências (YYYY-MM) disponíveis nas notas do cliente atual. */
  const competenciasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    for (const n of notas) {
      const dt = new Date(n.dataEmissao)
      const yyyymm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      set.add(yyyymm)
    }
    return Array.from(set).sort().reverse()
  }, [notas])

  function fmtCompetencia(yyyymm: string): string {
    const [y, m] = yyyymm.split('-')
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
    return `${meses[Number(m) - 1]}/${y}`
  }

  const notasFiltradas = notas.filter(n => {
    // Busca textual
    if (buscaNota) {
      const q = buscaNota.toLowerCase()
      const matches =
        (n.chave ?? '').includes(buscaNota) ||
        n.numero.toString().includes(buscaNota) ||
        n.prestadorRazao.toLowerCase().includes(q) ||
        (n.tomadorRazao ?? '').toLowerCase().includes(q)
      if (!matches) return false
    }
    // Competência
    if (competencia !== '__all__') {
      const dt = new Date(n.dataEmissao)
      const yyyymm = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      if (yyyymm !== competencia) return false
    }
    // Tipo
    if (tipo !== 'todos') {
      if (classificarTipo(n) !== tipo) return false
    }
    return true
  })

  // Contadores pros chips de tipo
  const counts = useMemo(() => {
    let entrada = 0, saida = 0, outro = 0
    for (const n of notas) {
      const t = classificarTipo(n)
      if (t === 'entrada') entrada++
      else if (t === 'saida') saida++
      else outro++
    }
    return { entrada, saida, outro, total: notas.length }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notas, docCliente])

  // Auto-seleciona 1ª nota filtrada quando o filtro muda
  useEffect(() => {
    if (notasFiltradas.length > 0 && !notasFiltradas.find(n => n.id === selecionado?.id)) {
      setSelecionado(notasFiltradas[0]!)
    } else if (notasFiltradas.length === 0) {
      setSelecionado(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competencia, tipo, buscaNota])

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <h1>Galeria NFS-e</h1>
            <p className="text-sm text-muted-foreground">Cliente → lista de notas de serviço → visualização do PDF</p>
          </div>
        </div>
        <div className="flex gap-2">
          <BackButton href="/nfse" />
        </div>
      </div>

      {/* Layout 3 colunas */}
      <div className="grid grid-cols-12 gap-3 min-h-[calc(100vh-180px)]">
        {/* ── COLUNA 1: Clientes ─────────────────────────────── */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <Card className="h-full p-3 flex flex-col">
            <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground tracking-wider px-1">
              Clientes
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
            <div className="flex-1 overflow-y-auto -mx-1 space-y-1">
              {loadingClientes ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : clientesFiltrados.length === 0 ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  {clientes.length === 0
                    ? 'Nenhum cliente com NFS-e vinculada ainda. Vincule uma pasta do Drive pra começar.'
                    : 'Nenhum resultado.'}
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
                      <Building2 className={cn(
                        'h-3.5 w-3.5 shrink-0 mt-0.5',
                        ativo ? 'text-white' : 'text-muted-foreground',
                      )} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{c.razaoSocial}</div>
                        <div className={cn(
                          'text-[10px] mt-0.5',
                          ativo ? 'text-white/80' : 'text-muted-foreground',
                        )}>
                          {c.totalNotas} nota{c.totalNotas > 1 ? 's' : ''}
                          {c.valorTotal && <> · {fmtBRL(c.valorTotal)}</>}
                        </div>
                      </div>
                    </div>
                  </button>
                  )
                })
              )}
            </div>
          </Card>
        </aside>

        {/* ── COLUNA 2: Lista de documentos ──────────────────── */}
        <section className="col-span-12 md:col-span-4 lg:col-span-3">
          <Card className="h-full p-3 flex flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">
                Documentos {notas.length > 0 && <span className="text-foreground">({notasFiltradas.length}/{notas.length})</span>}
              </span>
            </div>

            {/* Filtros */}
            <div className="space-y-1.5 mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={buscaNota}
                  onChange={(e) => setBuscaNota(e.target.value)}
                  placeholder="Nº, chave, prestador..."
                  className="pl-7 h-8 text-xs"
                />
              </div>

              {/* Competência */}
              <Select value={competencia} onValueChange={setCompetencia}>
                <SelectTrigger className="h-8 text-xs">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as competências</SelectItem>
                  {competenciasDisponiveis.map(c => (
                    <SelectItem key={c} value={c}>{fmtCompetencia(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tipo — só faz sentido se tiver doc do cliente */}
              {docCliente && (
                <div className="flex items-center gap-1 rounded-md border p-0.5 bg-muted/40">
                  <button
                    onClick={() => setTipo('todos')}
                    className={cn(
                      'flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                      tipo === 'todos' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Todos ({counts.total})
                  </button>
                  <button
                    onClick={() => setTipo('entrada')}
                    className={cn(
                      'flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1',
                      tipo === 'entrada' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Cliente é o tomador (recebeu o serviço)"
                  >
                    <ArrowDownToLine className="h-3 w-3" />
                    Entrada ({counts.entrada})
                  </button>
                  <button
                    onClick={() => setTipo('saida')}
                    className={cn(
                      'flex-1 px-2 py-1 text-[10px] font-medium rounded transition-colors flex items-center justify-center gap-1',
                      tipo === 'saida' ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Cliente é o prestador (forneceu o serviço)"
                  >
                    <ArrowUpFromLine className="h-3 w-3" />
                    Saída ({counts.saida})
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 space-y-0.5">
              {loadingNotas ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : !clienteAtivo ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  Selecione um cliente.
                </div>
              ) : notasFiltradas.length === 0 ? (
                <div className="text-center py-8 px-2 text-xs text-muted-foreground">
                  {notas.length === 0 ? 'Nenhuma NFS-e.' : 'Nenhum resultado.'}
                </div>
              ) : (
                notasFiltradas.map((n) => {
                  const tipoNota = classificarTipo(n)
                  const TipoIcon = tipoNota === 'entrada' ? ArrowDownToLine : tipoNota === 'saida' ? ArrowUpFromLine : null
                  return (
                  <button
                    key={n.id}
                    onClick={() => setSelecionado(n)}
                    disabled={!n.pdfKey}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                      selecionado?.id === n.id
                        ? 'text-white shadow-sm'
                        : 'hover:bg-muted/60',
                    )}
                    style={selecionado?.id === n.id ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        {TipoIcon && (
                          <TipoIcon
                            className={cn(
                              'h-3 w-3',
                              selecionado?.id === n.id
                                ? 'text-white'
                                : tipoNota === 'entrada' ? 'text-emerald-600' : 'text-sky-600',
                            )}
                          />
                        )}
                        Nº {n.numero}
                      </span>
                      <Badge className={cn(
                        'text-[9px] py-0 px-1 border-0',
                        selecionado?.id === n.id ? 'bg-white/20 text-white' : STATUS_COLOR[n.status] ?? 'bg-slate-100',
                      )}>
                        {n.status}
                      </Badge>
                    </div>
                    <div className={cn(
                      'text-[10px] truncate mt-0.5',
                      selecionado?.id === n.id ? 'text-white/80' : 'text-muted-foreground',
                    )} title={n.prestadorRazao}>
                      {n.prestadorRazao}
                    </div>
                    <div className={cn(
                      'flex items-center justify-between text-[10px] mt-0.5',
                      selecionado?.id === n.id ? 'text-white/80' : 'text-muted-foreground',
                    )}>
                      <span>{fmtDate(n.dataEmissao)}</span>
                      <span className={cn(
                        'font-semibold',
                        selecionado?.id === n.id ? 'text-white' : 'text-foreground',
                      )}>
                        {fmtBRL(n.valorServicos)}
                      </span>
                    </div>
                  </button>
                  )
                })
              )}
            </div>
          </Card>
        </section>

        {/* ── COLUNA 3: Preview ──────────────────────────────── */}
        <section className="col-span-12 md:col-span-5 lg:col-span-7">
          <Card className="h-full p-0 flex flex-col overflow-hidden">
            {!selecionado ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <FileText className="h-12 w-12 opacity-20" />
                <p className="text-sm">Selecione uma NFS-e pra visualizar.</p>
                {clienteAtual && notas.length === 0 && (
                  <p className="text-xs">Nenhuma NFS-e vinculada a {clienteAtual.razaoSocial}.</p>
                )}
              </div>
            ) : (
              <>
                {/* Header do preview */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      NFS-e Nº {selecionado.numero}{selecionado.serie ? ` — Série ${selecionado.serie}` : ''}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {selecionado.prestadorRazao} · {fmtCnpj(selecionado.prestadorCnpj)} · {fmtDate(selecionado.dataEmissao)} · {fmtBRL(selecionado.valorServicos)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* TODO: criar rota REST /api/nfse/:id/pdf */}
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Baixar PDF"
                      onClick={() => window.open(`${getApiUrl()}/api/nfse/${selecionado.id}/pdf`, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Link href={`/nfse/${selecionado.id}`}>
                      <Button variant="outline" size="icon-sm" title="Página de detalhe">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="outline"
                      size="icon-sm"
                      title="Tela cheia"
                      onClick={() => setPreviewFullscreen(true)}
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {/* PDF inline */}
                {selecionado.pdfKey ? (
                  <iframe
                    key={selecionado.id}
                    src={`${getApiUrl()}/api/nfse/${selecionado.id}/pdf`}
                    className="flex-1 w-full bg-white"
                    title={`NFS-e ${selecionado.numero}`}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6">
                    <FileText className="h-12 w-12 opacity-20" />
                    <p className="text-sm">PDF não disponível para esta NFS-e.</p>
                    <p className="text-xs">Pode estar pendente de geração — abra a página de detalhe pra regerar.</p>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      {/* Overlay fullscreen do PDF */}
      {previewFullscreen && selecionado && selecionado.pdfKey && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex flex-col"
          onClick={() => setPreviewFullscreen(false)}
        >
          <div className="flex items-center justify-between px-4 py-2 bg-card border-b" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold">
              NFS-e Nº {selecionado.numero} — {selecionado.prestadorRazao}
            </div>
            <Button variant="outline" size="icon-sm" title="Fechar" onClick={() => setPreviewFullscreen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <iframe
            src={`${getApiUrl()}/api/nfse/${selecionado.id}/pdf`}
            className="flex-1 w-full bg-white"
            title={`NFS-e ${selecionado.numero}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
