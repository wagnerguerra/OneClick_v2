'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, Loader2, Trash2, CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Eye, RotateCcw,
  Download, X, Play, Users, FileOutput, CalendarClock,
  MoreVertical, RefreshCw, Shield, DollarSign, UserX, MapPin, Flame, Landmark, Mail,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { masks, limparCnpj } from '@/lib/masks'
import { getApiUrl } from '@/lib/api-url'

// ============================================================
// Componente de validade (client-only para evitar hydration mismatch)
// ============================================================

function MunValidade({ data }: { data: string }) {
  const [info, setInfo] = useState<{ formatted: string; diffDias: number } | null>(null)
  useEffect(() => {
    const val = new Date(data + 'T00:00:00')
    const diffDias = Math.ceil((val.getTime() - Date.now()) / 86400000)
    setInfo({ formatted: val.toLocaleDateString('pt-BR'), diffDias })
  }, [data])
  if (!info) return <span className="text-muted-foreground text-[10px]">—</span>
  if (info.diffDias < 0) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
      <XCircle className="h-3 w-3" />{info.formatted}
    </span>
  )
  if (info.diffDias <= 15) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" />{info.formatted} <span className="text-[9px] opacity-70">({info.diffDias}d)</span>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-3 w-3" />{info.formatted}
    </span>
  )
}

// ============================================================
// Tipos
// ============================================================

interface CndRecord {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  etapa: string
  tipoCertidao: string | null
  codigoControle: string | null
  dataEmissao: string | null
  dataValidade: string | null
  temPdf: boolean
  statusApi: number | null
  mensagemApi: string | null
  sucesso: boolean
  erro: string | null
  clienteId: string | null
  createdAt: string
  deletedAt: string | null
}

interface ClienteMensal {
  id: string
  razaoSocial: string
  documento: string
  tipoDocumento: string
  alertaProcuracao?: boolean
}

// ============================================================
// Helpers
// ============================================================

const CERTIDAO_COLORS: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle2 }> = {
  'Negativa': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
  'Positiva com Efeitos de Negativa': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', icon: AlertTriangle },
  'Pendente': { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: Clock },
}

function CertidaoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-xs text-muted-foreground">—</span>
  const c = CERTIDAO_COLORS[tipo] || CERTIDAO_COLORS['Pendente']!
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', c.bg, c.text, c.border)}>
      <Icon className="h-3 w-3" />{tipo}
    </span>
  )
}

function formatDoc(d: string) {
  const clean = limparCnpj(d) // preserva letras do CNPJ alfanumérico
  if (clean.length === 11) return masks.cpf(clean)
  if (clean.length === 14) return masks.cnpj(clean)
  return d
}

function formatDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}

function diasRestantes(dataValidade: string | null): number | null {
  if (!dataValidade) return null
  const val = new Date(dataValidade)
  const hoje = new Date()
  return Math.ceil((val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function getPageNumbers(current: number, total: number): number[] {
  const pages: number[] = []
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
}

function Pagination({ page, total, limit, setPage }: { page: number; total: number; limit: number; setPage: (v: number | ((p: number) => number)) => void }) {
  const totalPages = Math.ceil(total / limit)
  if (total === 0) return null
  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Mostrando <span className="font-medium">{start}</span> a <span className="font-medium">{end}</span> de <span className="font-medium">{total}</span>
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
          {getPageNumbers(page, totalPages).map(p => (
            <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
          ))}
          <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  )
}

const DIAS_SEMANA = [
  { key: '1', label: 'Seg' }, { key: '2', label: 'Ter' }, { key: '3', label: 'Qua' },
  { key: '4', label: 'Qui' }, { key: '5', label: 'Sex' }, { key: '6', label: 'Sáb' }, { key: '0', label: 'Dom' },
]
const HORAS_DISPONIVEIS = Array.from({ length: 24 }, (_, i) => i)

function parseCron(cron: string) {
  const parts = cron.split(' ')
  if (parts.length < 5) return { dias: ['1'], horas: [7] }
  const horasStr = parts[1] || '7'
  const diasStr = parts[4] || '*'
  const horas = horasStr === '*' ? [7] : horasStr.split(',').map(Number)
  const dias = diasStr === '*' ? ['1','2','3','4','5','6','0'] : diasStr.split(',')
  return { dias, horas }
}

function buildCron(dias: string[], horas: number[]) {
  return `0 ${horas.sort((a, b) => a - b).join(',')} * * ${dias.length === 7 ? '*' : dias.join(',')}`
}

// ============================================================
// Pagina
// ============================================================


export default function CertidoesCndPage() {
  const searchParams = useSearchParams()
  const filtroParam = searchParams.get('filtro')

  // Aba principal
  const [abaAtiva, setAbaAtiva] = useState<'federal' | 'estadual' | 'municipal' | 'alvara' | 'trabalhista' | 'fgts' | 'cgu'>(
    searchParams.get('aba') === 'estadual' ? 'estadual' : searchParams.get('aba') === 'municipal' ? 'municipal' : searchParams.get('aba') === 'alvara' ? 'alvara' : 'federal'
  )

  // Municipal
  const [munData, setMunData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; municipio: string; sucesso: boolean; tipoCertidao: string | null; mensagem: string | null; dataValidade: string | null; createdAt: string | null }>>([])
  const [munTotal, setMunTotal] = useState(0)
  const [munPage, setMunPage] = useState(1)
  const [munSearch, setMunSearch] = useState('')
  const [munDebouncedSearch, setMunDebouncedSearch] = useState('')
  const [munLoading, setMunLoading] = useState(false)
  const [munMunicipio, setMunMunicipio] = useState('VITÓRIA')
  const [munConsultando, setMunConsultando] = useState(false)
  const [munSelected, setMunSelected] = useState<Set<string>>(new Set())
  const [munTotais, setMunTotais] = useState({ total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 })
  const [munFiltroStatus, setMunFiltroStatus] = useState<string | null>(null)
  const [munConsultaOpen, setMunConsultaOpen] = useState(false)
  const [munConsultaClientes, setMunConsultaClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [munConsultaSearch, setMunConsultaSearch] = useState('')
  const [munConsultaSelecionado, setMunConsultaSelecionado] = useState('')
  const [munConsultaDoc, setMunConsultaDoc] = useState('')
  const [munConsultaStatus, setMunConsultaStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [munConsultaMsg, setMunConsultaMsg] = useState('')
  const [munConsultaEtapa, setMunConsultaEtapa] = useState('')
  const munEtapaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [munPdfData, setMunPdfData] = useState<string | null>(null)
  const [munPdfOpen, setMunPdfOpen] = useState(false)
  const [munDebitos, setMunDebitos] = useState<string[]>([])
  const [munDebitosOpen, setMunDebitosOpen] = useState(false)
  const [munDebitosCliente, setMunDebitosCliente] = useState('')
  const [munLoteOpen, setMunLoteOpen] = useState(false)
  const [munLoteProgress, setMunLoteProgress] = useState<{
    status: string; total: number; current: number; emitidas: number; naoEmitidas: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const munLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // CGU
  const [cguData, setCguData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; sucesso: boolean; tipoCertidao: string | null; mensagem: string | null; situacao: string | null; dataConsulta: string | null; createdAt: string | null }>>([])
  const [cguTotal, setCguTotal] = useState(0)
  const [cguPage, setCguPage] = useState(1)
  const [cguSearch, setCguSearch] = useState('')
  const [cguDebouncedSearch, setCguDebouncedSearch] = useState('')
  const [cguLoading, setCguLoading] = useState(false)
  const [cguTotais, setCguTotais] = useState({ total: 0, nadaConsta: 0, consta: 0, naoEmitidas: 0 })
  const [cguFiltroStatus, setCguFiltroStatus] = useState<string | null>(null)
  const [cguSelected, setCguSelected] = useState<Set<string>>(new Set())
  const [cguConsultaOpen, setCguConsultaOpen] = useState(false)
  const [cguConsultaDoc, setCguConsultaDoc] = useState('')
  const [cguConsultaStatus, setCguConsultaStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [cguConsultaMsg, setCguConsultaMsg] = useState('')
  const [cguConsultaEtapa, setCguConsultaEtapa] = useState('')
  const cguEtapaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [cguPdfData, setCguPdfData] = useState<string | null>(null)
  const [cguPdfOpen, setCguPdfOpen] = useState(false)
  const [cguLoteOpen, setCguLoteOpen] = useState(false)
  const [cguLoteProgress, setCguLoteProgress] = useState<{
    status: string; total: number; current: number; emitidas: number; naoEmitidas: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const cguLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // CRF/FGTS
  const [fgtsData, setFgtsData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; sucesso: boolean; tipoCertidao: string | null; mensagem: string | null; numeroCertificado: string | null; dataValidade: string | null; createdAt: string | null }>>([])
  const [fgtsTotal, setFgtsTotal] = useState(0)
  const [fgtsPage, setFgtsPage] = useState(1)
  const [fgtsSearch, setFgtsSearch] = useState('')
  const [fgtsDebouncedSearch, setFgtsDebouncedSearch] = useState('')
  const [fgtsLoading, setFgtsLoading] = useState(false)
  const [fgtsTotais, setFgtsTotais] = useState({ total: 0, regulares: 0, irregulares: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 })
  const [fgtsFiltroStatus, setFgtsFiltroStatus] = useState<string | null>(null)
  const [fgtsSelected, setFgtsSelected] = useState<Set<string>>(new Set())
  const [fgtsConsultaOpen, setFgtsConsultaOpen] = useState(false)
  const [fgtsConsultaDoc, setFgtsConsultaDoc] = useState('')
  const [fgtsConsultaStatus, setFgtsConsultaStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [fgtsConsultaMsg, setFgtsConsultaMsg] = useState('')
  const [fgtsConsultaEtapa, setFgtsConsultaEtapa] = useState('')
  const fgtsEtapaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [fgtsPdfData, setFgtsPdfData] = useState<string | null>(null)
  const [fgtsPdfOpen, setFgtsPdfOpen] = useState(false)
  const [fgtsLoteOpen, setFgtsLoteOpen] = useState(false)
  const [fgtsLoteProgress, setFgtsLoteProgress] = useState<{
    status: string; total: number; current: number; emitidas: number; naoEmitidas: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const fgtsLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Alvará Bombeiros
  const [alvData, setAlvData] = useState<Array<{ id: string; alvaraId: number; documento: string | null; razaoSocial: string; nomeFantasia: string | null; endereco: string | null; municipio: string | null; status: string; codigoValidacao: string | null; dataFimValidade: string | null; createdAt: string | null }>>([])
  const [alvTotal, setAlvTotal] = useState(0)
  const [alvPage, setAlvPage] = useState(1)
  const [alvSearch, setAlvSearch] = useState('')
  const [alvDebouncedSearch, setAlvDebouncedSearch] = useState('')
  const [alvLoading, setAlvLoading] = useState(false)
  const [alvConsultando, setAlvConsultando] = useState(false)
  const [alvLoteOpen, setAlvLoteOpen] = useState(false)
  const [alvLoteProgress, setAlvLoteProgress] = useState<{
    status: string; total: number; current: number; encontrados: number; naoEncontrados: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const alvLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [alvPdfData, setAlvPdfData] = useState<string | null>(null)
  const [alvPdfOpen, setAlvPdfOpen] = useState(false)
  const [alvTipo, setAlvTipo] = useState<'bombeiros' | 'funcionamento'>('bombeiros')
  const [alvFuncMunicipio, setAlvFuncMunicipio] = useState('SERRA')
  const [alvFuncData, setAlvFuncData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; municipio: string; sucesso: boolean; mensagem: string | null; createdAt: string | null }>>([])
  const [alvFuncTotal, setAlvFuncTotal] = useState(0)
  const [alvFuncPage, setAlvFuncPage] = useState(1)
  const [alvFuncSearch, setAlvFuncSearch] = useState('')
  const [alvFuncDebouncedSearch, setAlvFuncDebouncedSearch] = useState('')
  const [alvFuncLoading, setAlvFuncLoading] = useState(false)
  const [alvFuncSelected, setAlvFuncSelected] = useState<Set<string>>(new Set())

  // Compilar e Enviar
  const [compOpen, setCompOpen] = useState(false)
  const [compStep, setCompStep] = useState<'cnpj' | 'opcoes' | 'progresso' | 'resumo'>('cnpj')
  const [compDoc, setCompDoc] = useState('')
  const [compRazao, setCompRazao] = useState('')
  const [compTipos, setCompTipos] = useState<Set<string>>(new Set(['federal', 'estadual', 'municipal', 'trabalhista', 'fgts', 'cgu', 'alvara_bombeiros', 'alvara_funcionamento']))
  const [compForcar, setCompForcar] = useState(false)
  const [compEmail, setCompEmail] = useState('')
  const [compProgress, setCompProgress] = useState<{ status: string; items: Array<{ tipo: string; label: string; status: string; mensagem?: string }>; current: number; total: number } | null>(null)
  const compPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [compEnviando, setCompEnviando] = useState(false)
  const [compMsg, setCompMsg] = useState('')
  const [compContatos, setCompContatos] = useState<Array<{ email: string; nome: string | null }>>([])
  const [compSalvarContato, setCompSalvarContato] = useState(false)

  // CNDT Trabalhista
  const [trbData, setTrbData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; sucesso: boolean; tipoCertidao: string | null; mensagem: string | null; numeroCertidao: string | null; dataValidade: string | null; createdAt: string | null }>>([])
  const [trbTotal, setTrbTotal] = useState(0)
  const [trbPage, setTrbPage] = useState(1)
  const [trbSearch, setTrbSearch] = useState('')
  const [trbDebouncedSearch, setTrbDebouncedSearch] = useState('')
  const [trbLoading, setTrbLoading] = useState(false)
  const [trbTotais, setTrbTotais] = useState({ total: 0, negativas: 0, positivas: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, vigentes: 0 })
  const [trbFiltroStatus, setTrbFiltroStatus] = useState<string | null>(null)
  const [trbSelected, setTrbSelected] = useState<Set<string>>(new Set())
  const [trbConsultaOpen, setTrbConsultaOpen] = useState(false)
  const [trbConsultaDoc, setTrbConsultaDoc] = useState('')
  const [trbConsultaStatus, setTrbConsultaStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [trbConsultaMsg, setTrbConsultaMsg] = useState('')
  const [trbConsultaEtapa, setTrbConsultaEtapa] = useState('')
  const trbEtapaPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [trbPdfData, setTrbPdfData] = useState<string | null>(null)
  const [trbPdfOpen, setTrbPdfOpen] = useState(false)
  const [trbLoteOpen, setTrbLoteOpen] = useState(false)
  const [trbLoteProgress, setTrbLoteProgress] = useState<{
    status: string; total: number; current: number; emitidas: number; naoEmitidas: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const trbLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Estadual — estados
  const [estData, setEstData] = useState<Array<{ id: string; documento: string; razaoSocial: string | null; uf: string; sucesso: boolean; mensagem: string | null; temPdf: boolean; createdAt: string | null }>>([])
  const [estTotal, setEstTotal] = useState(0)
  const [estPage, setEstPage] = useState(1)
  const [estSearch, setEstSearch] = useState('')
  const [estDebouncedSearch, setEstDebouncedSearch] = useState('')
  const [estLoading, setEstLoading] = useState(false)
  const [estTotais, setEstTotais] = useState({ total: 0, emitidas: 0, naoEmitidas: 0 })
  const [estConsultando, setEstConsultando] = useState(false)
  const [estSelected, setEstSelected] = useState<Set<string>>(new Set())
  const [fedSelected, setFedSelected] = useState<Set<string>>(new Set())
  const [alvSelected, setAlvSelected] = useState<Set<string>>(new Set())
  const [estPdfData, setEstPdfData] = useState<string | null>(null)
  const [estPdfOpen, setEstPdfOpen] = useState(false)
  const [estLoteOpen, setEstLoteOpen] = useState(false)
  const [estLoteProgress, setEstLoteProgress] = useState<{
    status: string; total: number; current: number; emitidas: number; naoEmitidas: number; erros: number
    currentCliente: string; items: Array<{ razaoSocial: string; status: string; erro?: string }>
  } | null>(null)
  const estLotePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Estado principal
  const [data, setData] = useState<CndRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [lixeira, setLixeira] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState(filtroParam || '')
  const [totais, setTotais] = useState({ total: 0, negativas: 0, positivasEfeitos: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, lixeira: 0 })

  // Consulta individual
  const [consultaOpen, setConsultaOpen] = useState(false)
  const [consultaDoc, setConsultaDoc] = useState('')
  const [consultaLoading, setConsultaLoading] = useState(false)
  const [clientes, setClientes] = useState<ClienteMensal[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [forcarNova, setForcarNova] = useState(false)

  // Consulta em lote
  const [loteOpen, setLoteOpen] = useState(false)
  const [loteSelecionados, setLoteSelecionados] = useState<Set<string>>(new Set())
  const [loteSearch, setLoteSearch] = useState('')
  const [loteProgresso, setLoteProgresso] = useState<Array<{ documento: string; sucesso: boolean; erro?: string }>>([])
  const [loteRunning, setLoteRunning] = useState(false)

  // PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfRecord, setPdfRecord] = useState<CndRecord | null>(null)
  const [pdfTab, setPdfTab] = useState<'cnd' | 'sitfis' | 'darf'>('cnd')
  const [sitfisLoading, setSitfisLoading] = useState(false)
  const [sitfisUrl, setSitfisUrl] = useState<string | null>(null)
  const [sitfisErro, setSitfisErro] = useState<string | null>(null)
  const [sitfisFromCache, setSitfisFromCache] = useState(false)

  // DARF
  const [darfLoading, setDarfLoading] = useState(false)
  const [darfPdfBase64, setDarfPdfBase64] = useState<string | null>(null)
  const [darfConsolidado, setDarfConsolidado] = useState<Record<string, unknown> | null>(null)
  const [darfErro, setDarfErro] = useState<string | null>(null)
  const [darfForm, setDarfForm] = useState({ codigoReceita: '', dataPA: '', valorImposto: '', dataConsolidacao: new Date().toISOString().slice(0, 10), tipoPA: 'ME', observacao: '' })
  const [darfBlobUrl, setDarfBlobUrl] = useState<string | null>(null)

  // Agendamento
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleData, setScheduleData] = useState<Record<string, unknown> | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleClientes, setScheduleClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [scheduleProgress, setScheduleProgress] = useState<{ current: number; total: number; currentCliente: string; status: string; items: Array<{ razaoSocial: string; status: string; erro?: string }> } | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  // Fetch data
  const fetchTotais = useCallback(async () => {
    try {
      const t = await trpc.cnd.totalizadores.query() as typeof totais
      setTotais(t)
    } catch { /* */ }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.cnd.list.query({
        page, limit, search: debouncedSearch || undefined,
        sortBy: 'razaoSocial', sortDir: 'asc',
        tipoCertidao: filtroTipo || undefined,
        lixeira,
      }) as { data: CndRecord[]; total: number }
      setData(result.data)
      setTotal(result.total)
    } catch (e) { console.error('[CND] Erro:', (e as Error).message) }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, filtroTipo, lixeira])

  useEffect(() => { fetchData(); fetchTotais() }, [fetchData, fetchTotais])

  // Paginacao
  const totalPages = Math.ceil(total / limit)
  const startRecord = total > 0 ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)

  // ── Consulta individual ─────────────────────────────

  async function openConsulta() {
    setConsultaOpen(true)
    setConsultaDoc('')
    setClienteSelecionado('')
    setForcarNova(false)
    setClienteSearch('')
    try {
      const lista = await trpc.cnd.clientesMensais.query() as ClienteMensal[]
      setClientes(lista)
    } catch { /* */ }
  }

  async function handleConsultar() {
    const doc = clienteSelecionado
      ? clientes.find(c => c.id === clienteSelecionado)?.documento || ''
      : consultaDoc
    if (!doc || doc.replace(/\D/g, '').length < 11) { alerts.error('Atenção', 'Informe um documento válido'); return }

    const docLimpo = doc.replace(/\D/g, '')
    const tipo = docLimpo.length === 11 ? 2 : 1

    setConsultaLoading(true)
    try {
      const result = await trpc.cnd.consultar.mutate({
        documento: docLimpo,
        tipoDocumento: tipo,
        clienteId: clienteSelecionado || undefined,
        forcarNova,
      }) as CndRecord & { fromCache?: boolean }

      if (result.sucesso) {
        const cacheMsg = result.fromCache ? ' (do cache)' : ''
        alerts.success(`CND ${result.tipoCertidao || ''}${cacheMsg}`, result.codigoControle ? `Código: ${result.codigoControle}` : '')
      } else {
        alerts.warning('Certidão não emitida', result.erro || result.mensagemApi || 'Sem detalhes')
      }
      setConsultaOpen(false)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setConsultaLoading(false) }
  }

  // ── Inativar clientes ────────────────────────────────

  async function handleInativarCliente(cliente: ClienteMensal | { id: string; razaoSocial: string }) {
    const ok = await alerts.confirm({
      title: 'Inativar cliente',
      text: `Deseja inativar "${cliente.razaoSocial}"? O cliente será removido das consultas automáticas.`,
      confirmText: 'Inativar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await trpc.cnd.inativarCliente.mutate({ clienteId: cliente.id })
      setClientes(prev => prev.filter(c => c.id !== cliente.id))
      setLoteSelecionados(prev => { const n = new Set(prev); n.delete(cliente.id); return n })
      alerts.success('Inativado', `${cliente.razaoSocial} foi inativado.`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  /** Inativar por registro (busca clienteId pelo documento) */
  async function handleInativarPorDocumento(documento: string, razaoSocial: string) {
    const cli = clientes.find(c => c.documento.replace(/\D/g, '') === documento.replace(/\D/g, ''))
    if (cli) return handleInativarCliente(cli)
    // Buscar no banco
    const ok = await alerts.confirm({ title: 'Inativar cliente', text: `Deseja inativar "${razaoSocial}"?`, confirmText: 'Inativar', icon: 'warning' })
    if (!ok) return
    try {
      const all = await trpc.cnd.schedule.clientes.query() as ClienteMensal[]
      const found = all.find(c => c.documento.replace(/\D/g, '') === documento.replace(/\D/g, ''))
      if (found) {
        await trpc.cnd.inativarCliente.mutate({ clienteId: found.id })
        alerts.success('Inativado', `${razaoSocial} foi inativado.`)
      } else {
        alerts.warning('Aviso', 'Cliente não encontrado para inativação')
      }
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Consulta em lote ────────────────────────────────

  async function openLote() {
    setLoteOpen(true)
    setLoteSelecionados(new Set())
    setLoteSearch('')
    setLoteProgresso([])
    setLoteRunning(false)
    try {
      const lista = await trpc.cnd.clientesMensais.query() as ClienteMensal[]
      setClientes(lista)
      setLoteSelecionados(new Set(lista.map(c => c.id)))
    } catch { /* */ }
  }

  async function handleConsultarLote() {
    const docs = clientes
      .filter(c => loteSelecionados.has(c.id))
      .map(c => c.documento.replace(/\D/g, ''))

    if (docs.length === 0) { alerts.error('Atenção', 'Selecione ao menos um cliente'); return }

    setLoteRunning(true)
    setLoteProgresso([])
    try {
      const result = await trpc.cnd.consultarLote.mutate({ documentos: docs }) as Array<{ documento: string; sucesso: boolean; erro?: string }>
      setLoteProgresso(result)
      const ok = result.filter(r => r.sucesso).length
      const fail = result.filter(r => !r.sucesso).length
      alerts.success('Consulta em lote concluída', `${ok} sucesso, ${fail} falha(s)`)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoteRunning(false) }
  }

  // ── Reconsultar individual (forçar nova) ──────────

  async function handleReconsultar(r: CndRecord) {
    const ok = await alerts.confirm({
      title: 'Reconsultar CND',
      text: `Deseja forçar uma nova consulta para ${r.razaoSocial || formatDoc(r.documento)}? Isso irá ignorar o cache de 24h.`,
      confirmText: 'Reconsultar',
      icon: 'question',
    })
    if (!ok) return
    try {
      await trpc.cnd.consultar.mutate({
        documento: r.documento,
        tipoDocumento: r.tipoDocumento,
        clienteId: r.clienteId || undefined,
        forcarNova: true,
      })
      alerts.success('CND atualizada', `Consulta realizada para ${r.razaoSocial || formatDoc(r.documento)}`)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── PDF ─────────────────────────────────────────────

  function handleVerPdf(record: CndRecord) {
    setPdfUrl(`${getApiUrl()}/api/cnd/${record.id}/pdf`)
    setPdfRecord(record)
    setPdfTab('cnd')
    setSitfisUrl(null)
    setSitfisErro(null)
    setSitfisFromCache(false)
    setDarfPdfBase64(null)
    setDarfConsolidado(null)
    setDarfErro(null)
    setDarfForm({ codigoReceita: '', dataPA: '', valorImposto: '', dataConsolidacao: new Date().toISOString().slice(0, 10), tipoPA: 'ME', observacao: '' })
    if (darfBlobUrl) { URL.revokeObjectURL(darfBlobUrl); setDarfBlobUrl(null) }
  }
  async function handleCarregarSitfis(recordOverride?: CndRecord) {
    const record = recordOverride || pdfRecord
    if (!record) return
    setSitfisLoading(true)
    setSitfisErro(null)
    setSitfisUrl(null)
    setSitfisFromCache(false)
    try {
      // Primeiro verificar se tem cache
      const cache = await trpc.sitfis.verificarCache.query({ documento: record.documento }) as { encontrado: boolean; id?: string }
      if (cache.encontrado && cache.id) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${cache.id}/pdf`)
        setSitfisFromCache(true)
        setPdfTab('sitfis')
        setSitfisLoading(false)
        return
      }

      // Sem cache — consultar API SERPRO
      const result = await trpc.sitfis.consultar.mutate({
        documento: record.documento,
        clienteId: record.clienteId || undefined,
      }) as { id: string; sucesso: boolean; temPdf: boolean; erro: string | null; consultaRecente?: boolean; consultaRecenteId?: string }

      const id = result.consultaRecenteId || result.id
      if (result.sucesso || result.consultaRecente) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${id}/pdf`)
        setSitfisFromCache(!!result.consultaRecente)
        setPdfTab('sitfis')
      } else {
        setSitfisErro(result.erro || 'Não foi possível emitir a situação fiscal')
      }
    } catch (e) {
      setSitfisErro((e as Error).message)
    } finally { setSitfisLoading(false) }
  }

  async function handleEmitirDarf() {
    if (!pdfRecord) return
    if (!darfForm.codigoReceita || !darfForm.dataPA || !darfForm.valorImposto) {
      alerts.error('Atenção', 'Preencha código de receita, período e valor')
      return
    }
    setDarfLoading(true)
    setDarfErro(null)
    setDarfPdfBase64(null)
    setDarfConsolidado(null)
    if (darfBlobUrl) { URL.revokeObjectURL(darfBlobUrl); setDarfBlobUrl(null) }
    try {
      const result = await trpc.sitfis.emitirDarf.mutate({
        documento: pdfRecord.documento,
        tipoDocumento: pdfRecord.tipoDocumento,
        codigoReceita: darfForm.codigoReceita,
        dataPA: darfForm.dataPA,
        valorImposto: Number(darfForm.valorImposto.replace(',', '.')),
        dataConsolidacao: `${darfForm.dataConsolidacao}T00:00:00`,
        tipoPA: darfForm.tipoPA || undefined,
        observacao: darfForm.observacao || undefined,
      }) as { sucesso: boolean; consolidado: Record<string, unknown> | null; darfPdfBase64: string | null; numeroDocumento: string | null }

      if (result.sucesso && result.darfPdfBase64) {
        setDarfPdfBase64(result.darfPdfBase64)
        setDarfConsolidado(result.consolidado)
        // Criar blob URL para o iframe
        const bytes = Uint8Array.from(atob(result.darfPdfBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        setDarfBlobUrl(URL.createObjectURL(blob))
        alerts.success('DARF emitido', result.numeroDocumento ? `Documento: ${result.numeroDocumento}` : '')
      } else {
        setDarfErro('DARF emitido sem PDF')
      }
    } catch (e) {
      setDarfErro((e as Error).message)
    } finally { setDarfLoading(false) }
  }

  function handleDownloadDarf() {
    if (!darfPdfBase64) return
    const blob = new Blob([Uint8Array.from(atob(darfPdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `darf_${pdfRecord?.documento || 'doc'}_${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadPdf(id: string) {
    const link = document.createElement('a')
    link.href = `${getApiUrl()}/api/cnd/${id}/download-pdf`
    link.download = ''
    link.click()
  }

  // ── Excluir / Restaurar ─────────────────────────────

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete()) return
    try {
      await trpc.cnd.delete.mutate({ id })
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRestore(id: string) {
    try {
      await trpc.cnd.restore.mutate({ id })
      fetchData(); fetchTotais()
      alerts.success('Restaurado', '')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteFedLote() {
    const ids = Array.from(fedSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try {
      for (const id of ids) await trpc.cnd.hardDelete.mutate({ id })
      setFedSelected(new Set()); fetchData(); fetchTotais()
      alerts.success('Excluído', `${ids.length} registro(s) removido(s)`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteEstadual(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.estadual.delete.mutate({ id }); setEstSelected(prev => { const n = new Set(prev); n.delete(id); return n }); fetchEstadual() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteEstadualLote() {
    const ids = Array.from(estSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try { await trpc.cnd.estadual.deleteLote.mutate({ ids }); setEstSelected(new Set()); fetchEstadual(); alerts.success('Excluído', `${ids.length} registro(s) removido(s)`) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteAlvara(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.alvara.delete.mutate({ id }); setAlvSelected(prev => { const n = new Set(prev); n.delete(id); return n }); fetchAlvara() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteAlvaraLote() {
    const ids = Array.from(alvSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} registro(s) selecionado(s)`)) return
    try { await trpc.cnd.alvara.deleteLote.mutate({ ids }); setAlvSelected(new Set()); fetchAlvara(); alerts.success('Excluído', `${ids.length} registro(s) removido(s)`) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Agendamento ─────────────────────────────────────

  async function openSchedule() {
    setScheduleOpen(true)
    setScheduleLoading(true)
    try {
      const [status, clientesList] = await Promise.all([
        trpc.cnd.schedule.get.query() as Promise<Record<string, unknown>>,
        trpc.cnd.schedule.clientes.query() as Promise<typeof scheduleClientes>,
      ])
      setScheduleData(status)
      setScheduleClientes(clientesList)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleLoading(false) }
  }

  async function handleSaveSchedule() {
    if (!scheduleData) return
    setScheduleSaving(true)
    try {
      await trpc.cnd.schedule.update.mutate((scheduleData as { config: Record<string, unknown> }).config as never)
      alerts.success('Agendamento salvo', '')
      const status = await trpc.cnd.schedule.get.query() as Record<string, unknown>
      setScheduleData(status)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleSaving(false) }
  }

  async function handleRunNow() {
    try {
      const r = await trpc.cnd.schedule.runNow.mutate() as { message: string }
      alerts.success('Execução', r.message)
      setScheduleProgress({ current: 0, total: 0, currentCliente: 'Iniciando...', status: 'running', items: [] })
      startProgressPolling()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function startProgressPolling() {
    stopProgressPolling()
    progressIntervalRef.current = setInterval(async () => {
      try {
        const p = await trpc.cnd.schedule.progress.query() as typeof scheduleProgress
        setScheduleProgress(p)
        if (p?.status === 'idle') {
          stopProgressPolling()
          const status = await trpc.cnd.schedule.get.query() as Record<string, unknown>
          setScheduleData(status)
          fetchData(); fetchTotais()
        }
      } catch { /* */ }
    }, 2000)
  }

  function stopProgressPolling() {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
  }

  // ============================================================
  // ── Municipal: debounce + fetch ──────────────────────

  useEffect(() => {
    const t = setTimeout(() => setMunDebouncedSearch(munSearch), 400)
    return () => clearTimeout(t)
  }, [munSearch])

  const fetchMunicipal = useCallback(async () => {
    setMunLoading(true)
    setMunSelected(new Set())
    try {
      const result = await trpc.cnd.municipal.list.query({ page: munPage, limit: 10, search: munDebouncedSearch || undefined, municipio: munMunicipio, filtroStatus: munFiltroStatus || undefined }) as { data: typeof munData; total: number }
      setMunData(result.data)
      setMunTotal(result.total)
      // Atualizar totalizadores junto
      trpc.cnd.municipal.totalizadores.query({ municipio: munMunicipio || undefined })
        .then((t: unknown) => setMunTotais(t as typeof munTotais)).catch(() => {})
    } catch (e) { console.error('[CND-MUN] Erro:', (e as Error).message) }
    finally { setMunLoading(false) }
  }, [munPage, munDebouncedSearch, munMunicipio, munFiltroStatus])

  useEffect(() => { if (abaAtiva === 'municipal') fetchMunicipal() }, [abaAtiva, fetchMunicipal])

  const fetchMunTotais = useCallback(async () => {
    try {
      const t = await trpc.cnd.municipal.totalizadores.query({ municipio: munMunicipio || undefined }) as typeof munTotais
      setMunTotais(t)
    } catch {}
  }, [munMunicipio])

  useEffect(() => { if (abaAtiva === 'municipal') fetchMunTotais() }, [abaAtiva, fetchMunTotais])

  async function handleDeleteMunicipal(id: string) {
    if (!await alerts.confirmDelete()) return
    try {
      await trpc.cnd.municipal.delete.mutate({ id })
      setMunSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      fetchMunicipal()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteMunicipalLote() {
    const ids = Array.from(munSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try {
      await trpc.cnd.municipal.deleteLote.mutate({ ids })
      setMunSelected(new Set())
      fetchMunicipal()
      alerts.success('Excluído', `${ids.length} registro(s) removido(s)`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── CNDT Trabalhista: debounce + fetch ──────────────

  useEffect(() => {
    const t = setTimeout(() => setTrbDebouncedSearch(trbSearch), 400)
    return () => clearTimeout(t)
  }, [trbSearch])

  const fetchTrabalhista = useCallback(async () => {
    setTrbLoading(true)
    setTrbSelected(new Set())
    try {
      const result = await trpc.cnd.trabalhista.list.query({ page: trbPage, limit: 10, search: trbDebouncedSearch || undefined, filtroStatus: trbFiltroStatus || undefined }) as { data: typeof trbData; total: number }
      setTrbData(result.data)
      setTrbTotal(result.total)
      trpc.cnd.trabalhista.totalizadores.query()
        .then((t: unknown) => setTrbTotais(t as typeof trbTotais)).catch(() => {})
    } catch (e) { console.error('[CNDT] Erro:', (e as Error).message) }
    finally { setTrbLoading(false) }
  }, [trbPage, trbDebouncedSearch, trbFiltroStatus])

  useEffect(() => { if (abaAtiva === 'trabalhista') fetchTrabalhista() }, [abaAtiva, fetchTrabalhista])

  async function handleDeleteTrabalhista(id: string) {
    if (!await alerts.confirmDelete()) return
    try {
      await trpc.cnd.trabalhista.delete.mutate({ id })
      setTrbSelected(prev => { const n = new Set(prev); n.delete(id); return n })
      fetchTrabalhista()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteTrabalhistaLote() {
    const ids = Array.from(trbSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try {
      await trpc.cnd.trabalhista.deleteLote.mutate({ ids })
      setTrbSelected(new Set())
      fetchTrabalhista()
      alerts.success('Excluído', `${ids.length} registro(s) removido(s)`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── CGU: debounce + fetch ──────────────────────────

  useEffect(() => { const t = setTimeout(() => setCguDebouncedSearch(cguSearch), 400); return () => clearTimeout(t) }, [cguSearch])

  const fetchCgu = useCallback(async () => {
    setCguLoading(true); setCguSelected(new Set())
    try {
      const result = await trpc.cnd.cgu.list.query({ page: cguPage, limit: 10, search: cguDebouncedSearch || undefined, filtroStatus: cguFiltroStatus || undefined }) as { data: typeof cguData; total: number }
      setCguData(result.data); setCguTotal(result.total)
      trpc.cnd.cgu.totalizadores.query().then((t: unknown) => setCguTotais(t as typeof cguTotais)).catch(() => {})
    } catch (e) { console.error('[CGU] Erro:', (e as Error).message) }
    finally { setCguLoading(false) }
  }, [cguPage, cguDebouncedSearch, cguFiltroStatus])

  useEffect(() => { if (abaAtiva === 'cgu') fetchCgu() }, [abaAtiva, fetchCgu])

  async function handleDeleteCgu(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.cgu.delete.mutate({ id }); setCguSelected(prev => { const n = new Set(prev); n.delete(id); return n }); fetchCgu() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteCguLote() {
    const ids = Array.from(cguSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try { await trpc.cnd.cgu.deleteLote.mutate({ ids }); setCguSelected(new Set()); fetchCgu(); alerts.success('Excluído', `${ids.length} registro(s) removido(s)`) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── CRF/FGTS: debounce + fetch ─────────────────────

  useEffect(() => {
    const t = setTimeout(() => setFgtsDebouncedSearch(fgtsSearch), 400)
    return () => clearTimeout(t)
  }, [fgtsSearch])

  const fetchFgts = useCallback(async () => {
    setFgtsLoading(true); setFgtsSelected(new Set())
    try {
      const result = await trpc.cnd.fgts.list.query({ page: fgtsPage, limit: 10, search: fgtsDebouncedSearch || undefined, filtroStatus: fgtsFiltroStatus || undefined }) as { data: typeof fgtsData; total: number }
      setFgtsData(result.data); setFgtsTotal(result.total)
      trpc.cnd.fgts.totalizadores.query().then((t: unknown) => setFgtsTotais(t as typeof fgtsTotais)).catch(() => {})
    } catch (e) { console.error('[CRF] Erro:', (e as Error).message) }
    finally { setFgtsLoading(false) }
  }, [fgtsPage, fgtsDebouncedSearch, fgtsFiltroStatus])

  useEffect(() => { if (abaAtiva === 'fgts') fetchFgts() }, [abaAtiva, fetchFgts])

  async function handleDeleteFgts(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.fgts.delete.mutate({ id }); setFgtsSelected(prev => { const n = new Set(prev); n.delete(id); return n }); fetchFgts() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteFgtsLote() {
    const ids = Array.from(fgtsSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try { await trpc.cnd.fgts.deleteLote.mutate({ ids }); setFgtsSelected(new Set()); fetchFgts(); alerts.success('Excluído', `${ids.length} registro(s) removido(s)`) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Alvará Bombeiros: debounce + fetch ──────────────

  useEffect(() => {
    const t = setTimeout(() => setAlvDebouncedSearch(alvSearch), 400)
    return () => clearTimeout(t)
  }, [alvSearch])

  const fetchAlvara = useCallback(async () => {
    setAlvLoading(true)
    try {
      const result = await trpc.cnd.alvara.list.query({ page: alvPage, limit: 10, search: alvDebouncedSearch || undefined }) as { data: typeof alvData; total: number }
      setAlvData(result.data)
      setAlvTotal(result.total)
    } catch (e) { console.error('[Alvará] Erro:', (e as Error).message) }
    finally { setAlvLoading(false) }
  }, [alvPage, alvDebouncedSearch])

  useEffect(() => { if (abaAtiva === 'alvara') fetchAlvara() }, [abaAtiva, fetchAlvara])

  // ── Alvará Funcionamento: debounce + fetch ─────────

  useEffect(() => { const t = setTimeout(() => setAlvFuncDebouncedSearch(alvFuncSearch), 400); return () => clearTimeout(t) }, [alvFuncSearch])

  const fetchAlvaraFunc = useCallback(async () => {
    setAlvFuncLoading(true); setAlvFuncSelected(new Set())
    try {
      const result = await trpc.cnd.alvaraFunc.list.query({ page: alvFuncPage, limit: 10, search: alvFuncDebouncedSearch || undefined, municipio: alvFuncMunicipio }) as { data: typeof alvFuncData; total: number }
      setAlvFuncData(result.data); setAlvFuncTotal(result.total)
    } catch (e) { console.error('[AlvFunc] Erro:', (e as Error).message) }
    finally { setAlvFuncLoading(false) }
  }, [alvFuncPage, alvFuncDebouncedSearch, alvFuncMunicipio])

  useEffect(() => { if (abaAtiva === 'alvara' && alvTipo === 'funcionamento') fetchAlvaraFunc() }, [abaAtiva, alvTipo, fetchAlvaraFunc])

  async function handleDeleteAlvaraFunc(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.alvaraFunc.delete.mutate({ id }); setAlvFuncSelected(prev => { const n = new Set(prev); n.delete(id); return n }); fetchAlvaraFunc() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteAlvaraFuncLote() {
    const ids = Array.from(alvFuncSelected)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} registro(s) selecionado(s)`)) return
    try { await trpc.cnd.alvaraFunc.deleteLote.mutate({ ids }); setAlvFuncSelected(new Set()); fetchAlvaraFunc(); alerts.success('Excluído', `${ids.length} removido(s)`) } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleConsultaAlvara(razaoSocial: string, clienteId?: string) {
    setAlvConsultando(true)
    try {
      const r = await trpc.cnd.alvara.consultar.mutate({ razaoSocial, clienteId }) as { sucesso: boolean; total: number; mensagem: string }
      if (r.sucesso) alerts.success('Alvará encontrado', r.mensagem)
      else alerts.warning('Alvará', r.mensagem)
      fetchAlvara()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setAlvConsultando(false) }
  }

  // ── Estadual: debounce + fetch ──────────────────────

  useEffect(() => {
    const t = setTimeout(() => setEstDebouncedSearch(estSearch), 400)
    return () => clearTimeout(t)
  }, [estSearch])

  const fetchEstadual = useCallback(async () => {
    setEstLoading(true)
    try {
      const [result, tots] = await Promise.all([
        trpc.cnd.estadual.list.query({ page: estPage, limit: 10, search: estDebouncedSearch || undefined }) as Promise<typeof estData extends (infer T)[] ? { data: T[]; total: number } : never>,
        trpc.cnd.estadual.totalizadores.query() as Promise<typeof estTotais>,
      ])
      setEstData((result as { data: typeof estData; total: number }).data)
      setEstTotal((result as { total: number }).total)
      setEstTotais(tots)
    } catch (e) { console.error('[CND-ES] Erro:', (e as Error).message) }
    finally { setEstLoading(false) }
  }, [estPage, estDebouncedSearch])

  useEffect(() => { if (abaAtiva === 'estadual') fetchEstadual() }, [abaAtiva, fetchEstadual])

  async function handleConsultaEstadual(documento: string, clienteId?: string) {
    setEstConsultando(true)
    try {
      const r = await trpc.cnd.estadual.consultar.mutate({ documento, clienteId }) as { sucesso: boolean; mensagem: string; pdfBase64: string | null }
      if (r.sucesso) {
        alerts.success('CND Estadual emitida', r.mensagem)
        if (r.pdfBase64) { setEstPdfData(r.pdfBase64); setEstPdfOpen(true) }
      } else {
        alerts.warning('CND Estadual', r.mensagem)
      }
      fetchEstadual()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEstConsultando(false) }
  }

  async function handleVerPdfEstadual(id: string) {
    try {
      const pdf = await trpc.cnd.estadual.getPdf.query({ id }) as string | null
      if (pdf) { setEstPdfData(pdf); setEstPdfOpen(true) }
      else alerts.warning('PDF', 'Nenhum PDF disponível')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="legalizacao" icon={FileOutput} />
          <div>
            <h1>Certidões e Alvarás</h1>
            <p className="text-sm text-muted-foreground">Emissão e controle de CND's, CNDT, CRF/FGTS, CGU e Alvará de Bombeiros</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
          onClick={() => { setCompOpen(true); setCompStep('cnpj'); setCompDoc(''); setCompRazao(''); setCompEmail(''); setCompMsg(''); setCompProgress(null); setCompTipos(new Set(['federal', 'estadual', 'municipal', 'trabalhista', 'fgts', 'cgu', 'alvara_bombeiros', 'alvara_funcionamento'])); setCompForcar(false) }}>
          <Mail className="h-3.5 w-3.5" />Compilar e Enviar
        </Button>
      </div>

      {/* Abas Federal / Estadual */}
      <div className="flex items-center gap-0 border-b">
        <button type="button" onClick={() => setAbaAtiva('federal')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'federal' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <Shield className="h-4 w-4" />Federais
        </button>
        <button type="button" onClick={() => setAbaAtiva('estadual')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'estadual' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <MapPin className="h-4 w-4" />Estaduais
        </button>
        <button type="button" onClick={() => setAbaAtiva('municipal')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'municipal' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <Landmark className="h-4 w-4" />Municipais
        </button>
        <button type="button" onClick={() => setAbaAtiva('trabalhista')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'trabalhista' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <FileText className="h-4 w-4" />Trabalhista
        </button>
        <button type="button" onClick={() => setAbaAtiva('fgts')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'fgts' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <DollarSign className="h-4 w-4" />FGTS
        </button>
        <button type="button" onClick={() => setAbaAtiva('cgu')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'cgu' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <Shield className="h-4 w-4" />CGU
        </button>
        <button type="button" onClick={() => setAbaAtiva('alvara')}
          className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            abaAtiva === 'alvara' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          <Flame className="h-4 w-4" />Alvarás
        </button>
      </div>

      {abaAtiva === 'federal' && (
      <>
      {/* Filtros por tipo */}
      <div className="flex items-center gap-2">
        {([
          { key: '', label: 'Todas', icon: FileOutput, count: totais.total },
          { key: 'Negativa', label: 'Negativa', icon: CheckCircle2, count: totais.negativas },
          { key: 'Positiva com Efeitos de Negativa', label: 'Positiva c/ Efeitos', icon: AlertTriangle, count: totais.positivasEfeitos },
          { key: '__nao_emitida__', label: 'Não Emitida', icon: XCircle, count: totais.naoEmitidas },
          { key: '__vencendo__', label: 'Vencendo', icon: Clock, count: totais.vencendo },
          { key: '__vencidas__', label: 'Vencidas', icon: XCircle, count: totais.vencidas },
        ] as const).map(f => {
          const isActive = f.key === '' ? !filtroTipo && !lixeira : filtroTipo === f.key && !lixeira
          const Icon = f.icon
          return (
            <button key={f.key} type="button" onClick={() => { setFiltroTipo(f.key); setLixeira(false); setPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                isActive ? 'bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-700 dark:text-fuchsia-400 shadow-sm'
                  : 'border-border/40 text-muted-foreground hover:border-fuchsia-200 hover:text-foreground bg-card',
              )}>
              <Icon className="h-3.5 w-3.5" />{f.label}
              <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none',
                isActive ? 'bg-fuchsia-200/60 dark:bg-fuchsia-800/40 text-fuchsia-700 dark:text-fuchsia-300' : 'bg-muted text-muted-foreground',
              )}>{f.count}</span>
            </button>
          )
        })}
        <button type="button" onClick={() => { setLixeira(!lixeira); setFiltroTipo(''); setPage(1) }}
          className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ml-auto',
            lixeira ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 shadow-sm'
              : 'border-border/40 text-muted-foreground hover:border-red-200 hover:text-foreground bg-card',
          )}>
          <Trash2 className="h-3.5 w-3.5" />Lixeira
          {totais.lixeira > 0 && <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none', lixeira ? 'bg-red-200/60 text-red-700' : 'bg-muted text-muted-foreground')}>{totais.lixeira}</span>}
        </button>
      </div>

      <Card>
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-fuchsia-500" />
            <h3 className="text-sm font-semibold">CND Federal — SERPRO</h3>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="h-8 w-[200px] text-xs" />
            <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white" onClick={openConsulta}>
              <Search className="h-3.5 w-3.5" />Consultar
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openLote}>
              <Play className="h-3.5 w-3.5" />Lote
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={openSchedule}>
              <CalendarClock className="h-3.5 w-3.5" />Agendamento
            </Button>
            {fedSelected.size > 0 && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteFedLote}>
                <Trash2 className="h-3.5 w-3.5" />Excluir ({fedSelected.size})
              </Button>
            )}
          </div>
        </div>

        {/* Tabela */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={data.length > 0 && fedSelected.size === data.length}
                  onCheckedChange={(checked) => { if (checked) setFedSelected(new Set(data.map(r => r.id))); else setFedSelected(new Set()) }}
                  className="h-3.5 w-3.5" />
              </TableHead>
              <TableHead className="w-[35%] min-w-[180px]">Razão Social</TableHead>
              <TableHead className="hidden xl:table-cell w-[14%]">Documento</TableHead>
              <TableHead className="w-[20%] min-w-[150px]">Certidão</TableHead>
              <TableHead className="hidden md:table-cell w-[10%] text-center">Emissão</TableHead>
              <TableHead className="hidden sm:table-cell w-[12%] text-center">Validade</TableHead>
              <TableHead className="w-[40px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {lixeira ? 'Nenhum registro na lixeira' : 'Nenhuma certidão encontrada'}
              </TableCell></TableRow>
            ) : data.map(r => {
              const dias = diasRestantes(r.dataValidade)
              const vencida = dias !== null && dias <= 0
              const proxVencer = dias !== null && dias > 0 && dias <= 15
              return (
                <TableRow key={r.id} className={cn('hover:bg-muted/30', r.temPdf && 'cursor-pointer', fedSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')} onClick={() => r.temPdf && handleVerPdf(r)}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={fedSelected.has(r.id)}
                      onCheckedChange={(checked) => { setFedSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                      className="h-3.5 w-3.5" />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p>
                      {clientes.find(c => c.documento.replace(/\D/g, '') === r.documento)?.alertaProcuracao && (
                        <span title="Possível falta de procuração no e-CAC" className="shrink-0 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
                      )}
                    </div>
                    <p className="font-mono text-[10px] text-muted-foreground xl:hidden">{formatDoc(r.documento)}</p>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-sm text-muted-foreground">{formatDoc(r.documento)}</TableCell>
                  <TableCell>
                    {r.sucesso ? (
                      <CertidaoBadge tipo={r.tipoCertidao} />
                    ) : r.etapa === 'concluido' && !r.sucesso ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400" title={r.mensagemApi || r.erro || ''}>
                        <XCircle className="h-3 w-3" />{r.mensagemApi || r.erro || 'Certidão não emitida'}
                      </span>
                    ) : r.etapa === 'erro' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-500" title={r.erro || ''}><XCircle className="h-3 w-3" />{r.erro || 'Erro na consulta'}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{r.etapa === 'consultando' ? 'Consultando...' : r.etapa === 'autenticando' ? 'Autenticando...' : r.etapa}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground text-center">{formatDate(r.dataEmissao)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    {r.dataValidade ? (
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        vencida ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' :
                        proxVencer ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
                      )}>
                        {vencida ? <XCircle className="h-3 w-3" /> : proxVencer ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {formatDate(r.dataValidade)}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {r.temPdf && (
                          <>
                            <DropdownMenuItem onClick={() => handleVerPdf(r)} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar Certidão</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPdf(r.id)} className="text-xs gap-2"><Download className="h-3.5 w-3.5" />Baixar PDF</DropdownMenuItem>
                          </>
                        )}
                        {!r.temPdf && r.etapa === 'concluido' && !r.sucesso && (
                          <DropdownMenuItem onClick={() => {
                            setPdfRecord(r)
                            setPdfUrl('__sitfis__')
                            setPdfTab('sitfis')
                            setSitfisUrl(null)
                            setSitfisErro(null)
                            setSitfisFromCache(false)
                            handleCarregarSitfis(r)
                          }} className="text-xs gap-2">
                            <Shield className="h-3.5 w-3.5" />Ver Situação Fiscal
                          </DropdownMenuItem>
                        )}
                        {!lixeira && (
                          <DropdownMenuItem onClick={() => handleReconsultar(r)} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>
                        )}
                        {lixeira ? (
                          <DropdownMenuItem onClick={() => handleRestore(r.id)} className="text-xs gap-2"><RotateCcw className="h-3.5 w-3.5" />Restaurar</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleDelete(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Paginacao */}
        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers(page, totalPages).map(p => (
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Modal Consulta Individual ── */}
      <Dialog open={consultaOpen} onOpenChange={o => !o && setConsultaOpen(false)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeaderIcon icon={Search} color="fuchsia">
            <DialogTitle>Nova Consulta CND</DialogTitle>
            <DialogDescription>Consulte a certidão negativa de débitos federais</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Selecione um cliente mensal</label>
              <Input placeholder="Buscar cliente..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="h-8 text-xs" />
              <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                {clientes.filter(c => {
                  if (!clienteSearch) return true
                  const t = clienteSearch.toLowerCase()
                  return c.razaoSocial.toLowerCase().includes(t) || c.documento.includes(t)
                }).map(c => (
                  <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0', clienteSelecionado === c.id && 'bg-fuchsia-50/40')}>
                    <input type="radio" name="cliente-cnd" checked={clienteSelecionado === c.id} onChange={() => { setClienteSelecionado(c.id); setConsultaDoc(c.documento) }} className="h-3.5 w-3.5 accent-fuchsia-500 cursor-pointer" />
                    <span className="flex-1 truncate cursor-pointer" onClick={() => { setClienteSelecionado(c.id); setConsultaDoc(c.documento) }}>{c.razaoSocial}</span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                    <button type="button" onClick={() => handleInativarCliente(c)} title="Inativar cliente"
                      className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <UserX className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-center text-[10px] text-muted-foreground">ou informe manualmente</div>
            <Input placeholder="CNPJ ou CPF" value={consultaDoc} onChange={e => { setConsultaDoc(e.target.value); setClienteSelecionado('') }} className="h-9 text-sm font-mono" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={forcarNova} onCheckedChange={v => setForcarNova(!!v)} />
              Forçar nova consulta (ignorar cache)
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConsultaOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleConsultar} disabled={consultaLoading} className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white">
              {consultaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Consultar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Consulta em Lote ── */}
      <Dialog open={loteOpen} onOpenChange={o => !o && setLoteOpen(false)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeaderIcon icon={Users} color="fuchsia">
            <DialogTitle>Consulta em Lote</DialogTitle>
            <DialogDescription>Consulte CND de vários clientes mensais</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">{loteSelecionados.size} selecionado(s)</Badge>
              <div className="flex gap-2">
                <button className="text-[10px] text-fuchsia-600 hover:underline" onClick={() => setLoteSelecionados(new Set(clientes.map(c => c.id)))}>Todos</button>
                <button className="text-[10px] text-fuchsia-600 hover:underline" onClick={() => setLoteSelecionados(new Set())}>Nenhum</button>
              </div>
            </div>
            <Input placeholder="Buscar..." value={loteSearch} onChange={e => setLoteSearch(e.target.value)} className="h-8 text-xs" />
            <div className="border rounded-lg max-h-[250px] overflow-y-auto">
              {clientes.filter(c => !loteSearch || c.razaoSocial.toLowerCase().includes(loteSearch.toLowerCase())).map(c => (
                <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0', loteSelecionados.has(c.id) && 'bg-fuchsia-50/40')}>
                  <input type="checkbox" checked={loteSelecionados.has(c.id)} onChange={() => {
                    setLoteSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })
                  }} className="h-3.5 w-3.5 rounded accent-fuchsia-500 cursor-pointer" />
                  <span className="flex-1 truncate cursor-pointer" onClick={() => setLoteSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}>{c.razaoSocial}</span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                  <button type="button" onClick={() => handleInativarCliente(c)} title="Inativar cliente"
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <UserX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {loteProgresso.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b text-[11px] font-medium">
                  Resultado: {loteProgresso.filter(r => r.sucesso).length} sucesso, {loteProgresso.filter(r => !r.sucesso).length} falha(s)
                </div>
                <div className="max-h-[150px] overflow-y-auto divide-y">
                  {loteProgresso.filter(r => !r.sucesso).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="font-mono">{formatDoc(r.documento)}</span>
                      <span className="text-red-500 truncate">{r.erro}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLoteOpen(false)}>Fechar</Button>
            <Button size="sm" onClick={handleConsultarLote} disabled={loteRunning || loteSelecionados.size === 0} className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white">
              {loteRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Consultar ({loteSelecionados.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Agendamento ── */}
      <Dialog open={scheduleOpen} onOpenChange={o => { if (!o) { setScheduleOpen(false); stopProgressPolling() } }}>
        <DialogContent className="max-w-[620px]">
          <DialogHeaderIcon icon={CalendarClock} color="fuchsia">
            <DialogTitle>Agendamento Automático — CND</DialogTitle>
            <DialogDescription>Configure a consulta automática de certidões</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {scheduleLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>
            ) : scheduleData ? (() => {
              const cfg = (scheduleData as { config: { enabled: boolean; cron: string; delayMs: number; clienteIds: string[] } }).config
              const setCfg = (partial: Partial<typeof cfg>) => setScheduleData(prev => prev ? { ...prev, config: { ...cfg, ...partial } } : prev)
              const parsed = parseCron(cfg.cron)
              return (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 text-sm font-medium">
                      <button type="button" onClick={() => setCfg({ enabled: !cfg.enabled })}
                        className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors', cfg.enabled ? 'bg-fuchsia-500' : 'bg-gray-300 dark:bg-gray-600')}>
                        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5', cfg.enabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
                      </button>
                      Agendamento {cfg.enabled ? 'ativado' : 'desativado'}
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Dias da semana</label>
                    <div className="flex gap-1.5">
                      {DIAS_SEMANA.map(d => {
                        const active = parsed.dias.includes(d.key)
                        return (
                          <button key={d.key} type="button" onClick={() => {
                            const newDias = active ? parsed.dias.filter(x => x !== d.key) : [...parsed.dias, d.key]
                            if (newDias.length === 0) return
                            setCfg({ cron: buildCron(newDias, parsed.horas) })
                          }} className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-medium border transition-all',
                            active ? 'bg-fuchsia-500 text-white border-fuchsia-500 shadow-sm' : 'text-muted-foreground border-border/60 hover:border-fuchsia-400')}>
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Horários</label>
                    <div className="flex flex-wrap gap-1">
                      {HORAS_DISPONIVEIS.map(h => {
                        const active = parsed.horas.includes(h)
                        return (
                          <button key={h} type="button" onClick={() => {
                            const newHoras = active ? parsed.horas.filter(x => x !== h) : [...parsed.horas, h]
                            if (newHoras.length === 0) return
                            setCfg({ cron: buildCron(parsed.dias, newHoras) })
                          }} className={cn('rounded px-2 py-1 text-[11px] font-mono font-medium border min-w-[36px] transition-all',
                            active ? 'bg-fuchsia-500 text-white border-fuchsia-500 shadow-sm' : 'text-muted-foreground border-border/60 hover:border-fuchsia-400')}>
                            {String(h).padStart(2, '0')}h
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Progresso */}
                  {scheduleProgress && scheduleProgress.status === 'running' && (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-fuchsia-50 dark:bg-fuchsia-950/20 border-b">
                        <div className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-500" /><span className="font-medium">Processando {scheduleProgress.current}/{scheduleProgress.total}</span></div>
                      </div>
                      <div className="h-1.5 bg-muted"><div className="h-full bg-fuchsia-500 transition-all duration-500" style={{ width: `${scheduleProgress.total > 0 ? (scheduleProgress.current / scheduleProgress.total) * 100 : 0}%` }} /></div>
                      <div className="max-h-[200px] overflow-y-auto divide-y">
                        {scheduleProgress.items.map((item, idx) => (
                          <div key={idx} className={cn('flex items-center gap-2 px-3 py-1.5 text-[11px]', item.status === 'processando' && 'bg-fuchsia-50/50')}>
                            {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground/40" />}
                            {item.status === 'processando' && <Loader2 className="h-3 w-3 text-fuchsia-500 animate-spin" />}
                            {item.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-fuchsia-500" />}
                            {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            <span className={cn('flex-1 truncate', item.status === 'processando' && 'font-medium')}>{item.razaoSocial}</span>
                            {item.erro && <span className="text-[10px] text-red-500 truncate max-w-[150px]">{item.erro}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })() : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={scheduleProgress?.status === 'running'} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />Executar Agora
            </Button>
            <Button size="sm" onClick={handleSaveSchedule} disabled={scheduleSaving} className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white">
              {scheduleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal PDF com abas CND / Situação Fiscal ── */}
      {pdfUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setPdfUrl(null); setPdfRecord(null) }}>
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-fuchsia-500 text-white shrink-0">
                  <FileOutput className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{pdfRecord?.razaoSocial || 'Certidão'}</h3>
                  <p className="text-[11px] text-muted-foreground">{pdfRecord ? formatDoc(pdfRecord.documento) : ''} {pdfRecord?.tipoCertidao ? `· ${pdfRecord.tipoCertidao}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => {
                  const url = pdfTab === 'sitfis' && sitfisUrl ? sitfisUrl.replace('/pdf', '/download-pdf') : pdfUrl.replace('/pdf', '/download-pdf')
                  const a = document.createElement('a'); a.href = url; a.download = ''; a.click()
                }}>
                  <Download className="h-3 w-3" />Baixar
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => { setPdfUrl(null); setPdfRecord(null) }}><X className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Abas */}
            <div className="flex items-center border-b px-4 shrink-0">
              <button type="button" onClick={() => setPdfTab('cnd')}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  pdfTab === 'cnd' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <FileOutput className="h-3.5 w-3.5" />CND Federal
              </button>
              <button type="button" onClick={() => {
                setPdfTab('sitfis')
                if (!sitfisUrl && !sitfisLoading && !sitfisErro) handleCarregarSitfis()
              }}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  pdfTab === 'sitfis' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Shield className="h-3.5 w-3.5" />Situação Fiscal
                {sitfisLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
              {pdfRecord?.tipoCertidao && pdfRecord.tipoCertidao !== 'Negativa' && (
                <button type="button" onClick={() => setPdfTab('darf')}
                  className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    pdfTab === 'darf' ? 'border-fuchsia-500 text-fuchsia-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <DollarSign className="h-3.5 w-3.5" />Emitir DARF
                  {darfLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
              )}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-hidden">
              {pdfTab === 'cnd' && (
                pdfUrl && pdfUrl !== '__sitfis__' ? (
                  <iframe src={pdfUrl} className="h-full w-full" title="CND Federal" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <XCircle className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium text-foreground">Certidão não disponível</p>
                    <p className="text-xs text-center max-w-md">{pdfRecord?.mensagemApi || pdfRecord?.erro || 'A certidão não pôde ser emitida para este contribuinte'}</p>
                  </div>
                )
              )}
              {pdfTab === 'sitfis' && (
                <>
                  {sitfisLoading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" />
                      <p className="text-sm">Consultando situação fiscal via SERPRO...</p>
                      <p className="text-xs">Isso pode levar alguns segundos</p>
                    </div>
                  )}
                  {sitfisErro && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                      <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
                      <p className="text-xs text-center max-w-md">{sitfisErro}</p>
                      <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={() => handleCarregarSitfis()}>
                        <RefreshCw className="h-3.5 w-3.5" />Tentar novamente
                      </Button>
                    </div>
                  )}
                  {sitfisUrl && !sitfisLoading && (
                    <div className="flex flex-col h-full">
                      {sitfisFromCache && (
                        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b text-xs text-amber-700 dark:text-amber-400">
                          <span>Relatório do cache (consulta recente). Para atualizar, acesse o módulo de Situação Fiscal.</span>
                          <a href="/situacao-fiscal" className="font-medium underline hover:no-underline shrink-0 ml-3">Ir para Situação Fiscal</a>
                        </div>
                      )}
                      <iframe src={sitfisUrl} className="flex-1 w-full" title="Situação Fiscal" />
                    </div>
                  )}
                  {!sitfisUrl && !sitfisLoading && !sitfisErro && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Shield className="h-8 w-8 opacity-20" />
                      <p className="text-sm">Clique para carregar a situação fiscal</p>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleCarregarSitfis()}>
                        <Search className="h-3.5 w-3.5" />Consultar Situação Fiscal
                      </Button>
                    </div>
                  )}
                </>
              )}
              {pdfTab === 'darf' && (
                <div className="flex h-full">
                  {/* Formulário à esquerda */}
                  <div className="w-[340px] shrink-0 border-r overflow-y-auto p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-1">Emitir DARF</h4>
                      <p className="text-[11px] text-muted-foreground">Informe o código de receita, período e valor para gerar a guia de pagamento (DARF) via SICALC/SERPRO. O sistema calculará multa e juros automaticamente.</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <strong>Dica:</strong> Consulte a aba "Situação Fiscal" para identificar os códigos de receita e valores pendentes do contribuinte.
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Código de Receita *</label>
                      <input type="text" placeholder="Ex: 0220, 6106..." value={darfForm.codigoReceita}
                        onChange={e => setDarfForm(prev => ({ ...prev, codigoReceita: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Período (PA) *</label>
                        <input type="text" placeholder="MM/YYYY" value={darfForm.dataPA}
                          onChange={e => setDarfForm(prev => ({ ...prev, dataPA: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Tipo Período</label>
                        <select value={darfForm.tipoPA} onChange={e => setDarfForm(prev => ({ ...prev, tipoPA: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="ME">Mensal</option>
                          <option value="TR">Trimestral</option>
                          <option value="SE">Semestral</option>
                          <option value="AN">Anual</option>
                          <option value="DE">Decendial</option>
                          <option value="QU">Quinzenal</option>
                          <option value="SM">Semanal</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Valor do Imposto (R$) *</label>
                      <input type="text" placeholder="0,00" value={darfForm.valorImposto}
                        onChange={e => setDarfForm(prev => ({ ...prev, valorImposto: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Data de Consolidação</label>
                      <input type="date" value={darfForm.dataConsolidacao}
                        onChange={e => setDarfForm(prev => ({ ...prev, dataConsolidacao: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Observação</label>
                      <input type="text" placeholder="Opcional" value={darfForm.observacao}
                        onChange={e => setDarfForm(prev => ({ ...prev, observacao: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>

                    <Button className="w-full gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white" onClick={handleEmitirDarf} disabled={darfLoading}>
                      {darfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                      Emitir DARF
                    </Button>

                    {darfErro && (
                      <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-xs text-red-700 dark:text-red-400">
                        <p className="font-medium mb-1">Erro na emissão</p>
                        <p>{darfErro}</p>
                      </div>
                    )}

                    {darfConsolidado && (
                      <div className="rounded-md border border-fuchsia-200 bg-fuchsia-50 dark:bg-fuchsia-900/10 p-3 space-y-1.5 text-xs">
                        <p className="font-semibold text-fuchsia-700 dark:text-fuchsia-400 mb-2">Valores Consolidados</p>
                        {typeof darfConsolidado.valorPrincipalMoedaCorrente === 'number' && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-mono font-medium">R$ {Number(darfConsolidado.valorPrincipalMoedaCorrente).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorMultaMora === 'number' && Number(darfConsolidado.valorMultaMora) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Multa ({String(darfConsolidado.percentualMultaMora)}%)</span><span className="font-mono font-medium text-red-600">R$ {Number(darfConsolidado.valorMultaMora).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorJuros === 'number' && Number(darfConsolidado.valorJuros) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Juros ({String(darfConsolidado.percentualJuros)}%)</span><span className="font-mono font-medium text-amber-600">R$ {Number(darfConsolidado.valorJuros).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorTotalConsolidado === 'number' && (
                          <div className="flex justify-between border-t pt-1.5 mt-1.5"><span className="font-semibold">Total</span><span className="font-mono font-bold">R$ {Number(darfConsolidado.valorTotalConsolidado).toFixed(2)}</span></div>
                        )}
                      </div>
                    )}

                    {darfPdfBase64 && (
                      <Button variant="outline" className="w-full gap-1.5" onClick={handleDownloadDarf}>
                        <Download className="h-4 w-4" />Baixar DARF (PDF)
                      </Button>
                    )}
                  </div>

                  {/* Preview do DARF à direita */}
                  <div className="flex-1 min-w-0">
                    {darfLoading ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" />
                        <p className="text-sm">Emitindo DARF via SICALC/SERPRO...</p>
                      </div>
                    ) : darfBlobUrl ? (
                      <iframe src={darfBlobUrl} className="h-full w-full" title="DARF" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <DollarSign className="h-10 w-10 opacity-20" />
                        <p className="text-sm">Preencha os dados e clique em "Emitir DARF"</p>
                        <p className="text-xs">O documento será gerado via SICALC e exibido aqui</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ============================================================ */}
      {/* ABA ESTADUAL (SEFAZ ES) */}
      {/* ============================================================ */}
      {abaAtiva === 'estadual' && (
        <div className="space-y-4">
          {/* Totalizadores */}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setEstSearch(''); setEstPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400')}>
              <Shield className="h-3 w-3" />{estTotais.total} Total
            </button>
            <div className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium bg-emerald-50/50 border-emerald-200/50 text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />{estTotais.emitidas} Emitidas
            </div>
            {estTotais.naoEmitidas > 0 && (
              <div className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium bg-red-50 border-red-200 text-red-600">
                <XCircle className="h-3 w-3" />{estTotais.naoEmitidas} Não emitida
              </div>
            )}
          </div>

          {/* Ações */}
          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">CND Estadual — SEFAZ ES</h3>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar..." value={estSearch} onChange={e => { setEstSearch(e.target.value); setEstPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white" disabled={estConsultando}
                  onClick={async () => {
                    if (clientes.length === 0) {
                      alerts.error('Erro', 'Nenhum cliente carregado. Acesse a aba Federal primeiro.')
                      return
                    }
                    // Consultar o primeiro cliente para teste, ou abrir seleção
                    const doc = prompt('Digite o CNPJ para consultar:')
                    if (!doc) return
                    await handleConsultaEstadual(doc)
                  }}>
                  {estConsultando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={estConsultando}
                  onClick={async () => {
                    let clientesList = clientes
                    if (clientesList.length === 0) {
                      try { clientesList = await trpc.cnd.schedule.clientes.query() as ClienteMensal[]; setClientes(clientesList) } catch { /* */ }
                    }
                    if (clientesList.length === 0) { alerts.error('Erro', 'Nenhum cliente disponível'); return }
                    const ok = await alerts.confirm({ title: 'Consulta em lote — SEFAZ ES', text: `Consultar CND Estadual de ${clientesList.length} clientes mensais? Cada consulta leva ~20-30s (captcha + SEFAZ).`, confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setEstLoteOpen(true)
                    setEstLoteProgress(null)
                    try {
                      const docs = clientesList.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial }))
                      await trpc.cnd.estadual.consultarLote.mutate({ documentos: docs })
                      // Iniciar polling
                      if (estLotePollRef.current) clearInterval(estLotePollRef.current)
                      estLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.estadual.loteProgress.query() as typeof estLoteProgress
                        setEstLoteProgress(p)
                        if (p?.status === 'done') {
                          if (estLotePollRef.current) { clearInterval(estLotePollRef.current); estLotePollRef.current = null }
                          fetchEstadual()
                        }
                      }, 2000)
                      // Primeiro poll
                      const p0 = await trpc.cnd.estadual.loteProgress.query() as typeof estLoteProgress
                      setEstLoteProgress(p0)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote
                </Button>
                {estSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteEstadualLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({estSelected.size})
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={estData.length > 0 && estSelected.size === estData.length}
                      onCheckedChange={(checked) => { if (checked) setEstSelected(new Set(estData.map(r => r.id))); else setEstSelected(new Set()) }}
                      className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mensagem</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : estData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhuma certidão estadual consultada</TableCell></TableRow>
                ) : estData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', estSelected.has(r.id) && 'bg-emerald-50/40 dark:bg-emerald-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={estSelected.has(r.id)}
                        onCheckedChange={(checked) => { setEstSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                        className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                    </TableCell>
                    <TableCell>
                      {r.sucesso ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Emitida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          <XCircle className="h-3 w-3" />Não emitida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{r.mensagem || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.temPdf && (
                            <DropdownMenuItem onClick={() => handleVerPdfEstadual(r.id)} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar CND</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleConsultaEstadual(r.documento)} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteEstadual(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInativarPorDocumento(r.documento, r.razaoSocial || r.documento)} className="text-xs gap-2 text-red-500 focus:text-red-500"><UserX className="h-3.5 w-3.5" />Inativar cliente</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            <Pagination page={estPage} total={estTotal} limit={10} setPage={setEstPage} />
          </Card>

          {/* Modal progresso lote estadual */}
          <Dialog open={estLoteOpen} onOpenChange={open => { if (!open && estLoteProgress?.status !== 'running') { setEstLoteOpen(false); if (estLotePollRef.current) { clearInterval(estLotePollRef.current); estLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg">
              <DialogHeaderIcon icon={MapPin} color="fuchsia">
                <DialogTitle>CND Estadual — Lote SEFAZ ES</DialogTitle>
                <DialogDescription>
                  {estLoteProgress?.status === 'running' ? 'Consultando...' : estLoteProgress?.status === 'done' ? 'Concluído' : 'Iniciando...'}
                </DialogDescription>
              </DialogHeaderIcon>
              <DialogBody>
                {estLoteProgress && (
                  <div className="space-y-4">
                    {/* Barra de progresso */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{estLoteProgress.current} / {estLoteProgress.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-fuchsia-500 transition-all duration-500"
                          style={{ width: estLoteProgress.total > 0 ? `${(estLoteProgress.current / estLoteProgress.total) * 100}%` : '0%' }} />
                      </div>
                    </div>

                    {/* Cliente atual */}
                    {estLoteProgress.status === 'running' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <span className="truncate">{estLoteProgress.currentCliente}</span>
                      </div>
                    )}

                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-emerald-600">{estLoteProgress.emitidas}</p>
                        <p className="text-[10px] text-muted-foreground">Emitidas</p>
                      </div>
                      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-amber-600">{estLoteProgress.naoEmitidas}</p>
                        <p className="text-[10px] text-muted-foreground">Não emitidas</p>
                      </div>
                      <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-red-600">{estLoteProgress.erros}</p>
                        <p className="text-[10px] text-muted-foreground">Erros</p>
                      </div>
                    </div>

                    {/* Log */}
                    <div className="max-h-[250px] overflow-y-auto space-y-0.5 border rounded-lg p-2">
                      {estLoteProgress.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Aguardando...</p>
                      ) : (
                        [...estLoteProgress.items].reverse().map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[11px] py-0.5">
                            {item.status === 'emitida' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                            {item.status === 'nao_emitida' && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                            {item.status === 'erro' && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                            {item.status === 'processando' && <Loader2 className="h-3 w-3 text-fuchsia-500 animate-spin shrink-0" />}
                            {item.status === 'pendente' && <span className="h-3 w-3 text-muted-foreground shrink-0 text-center">·</span>}
                            <span className={cn('truncate',
                              item.status === 'pendente' && 'text-muted-foreground',
                              item.status === 'erro' && 'text-red-600',
                            )}>
                              {item.razaoSocial}
                              {item.erro && <span className="ml-1 text-[10px] text-red-400">({item.erro})</span>}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </DialogBody>
              {estLoteProgress?.status === 'done' && (
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setEstLoteOpen(false)}>Fechar</Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>

          {/* Modal PDF Estadual */}
          {estPdfOpen && estPdfData && (
            <Dialog open={estPdfOpen} onOpenChange={setEstPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={MapPin} color="fuchsia">
                  <DialogTitle>CND Estadual — SEFAZ ES</DialogTitle>
                </DialogHeaderIcon>
                <DialogBody>
                  <object data={`data:application/pdf;base64,${estPdfData}`} type="application/pdf" width="100%" height="600px">
                    <p className="text-sm text-muted-foreground text-center py-8">Seu navegador não suporta visualização de PDF inline. <a href={`data:application/pdf;base64,${estPdfData}`} download="cnd-estadual-es.pdf" className="text-fuchsia-500 hover:underline">Baixar PDF</a></p>
                  </object>
                </DialogBody>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
      {/* ============================================================ */}
      {/* ABA MUNICIPAL */}
      {/* ============================================================ */}
      {abaAtiva === 'municipal' && (
        <div className="space-y-4">
          {/* Totalizadores */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => { setMunFiltroStatus(null); setMunPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                !munFiltroStatus ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30 border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-400 ring-1 ring-fuchsia-400/30' : 'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-600')}>
              <Shield className="h-3 w-3" />{munTotais.total} Total
            </button>
            <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'negativa' ? null : 'negativa'); setMunPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                munFiltroStatus === 'negativa' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-400/30' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600')}>
              <CheckCircle2 className="h-3 w-3" />{munTotais.negativas} Negativa
            </button>
            {munTotais.positivas > 0 && (
              <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'positiva' ? null : 'positiva'); setMunPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  munFiltroStatus === 'positiva' ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 ring-1 ring-amber-400/30' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600')}>
                <AlertTriangle className="h-3 w-3" />{munTotais.positivas} Positiva
              </button>
            )}
            {munTotais.naoEmitidas > 0 && (
              <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'nao_emitida' ? null : 'nao_emitida'); setMunPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  munFiltroStatus === 'nao_emitida' ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 ring-1 ring-red-400/30' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600')}>
                <XCircle className="h-3 w-3" />{munTotais.naoEmitidas} Não emitida
              </button>
            )}
            <span className="w-px h-5 bg-border" />
            {munTotais.vigentes > 0 && (
              <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'vigente' ? null : 'vigente'); setMunPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  munFiltroStatus === 'vigente' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-400/30' : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 text-emerald-600/80')}>
                <CheckCircle2 className="h-3 w-3" />{munTotais.vigentes} Vigente
              </button>
            )}
            {munTotais.vencendo > 0 && (
              <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'vencendo' ? null : 'vencendo'); setMunPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  munFiltroStatus === 'vencendo' ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 ring-1 ring-amber-400/30' : 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/60 text-amber-600/80')}>
                <Clock className="h-3 w-3" />{munTotais.vencendo} Vencendo
              </button>
            )}
            {munTotais.vencidas > 0 && (
              <button type="button" onClick={() => { setMunFiltroStatus(munFiltroStatus === 'vencida' ? null : 'vencida'); setMunPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  munFiltroStatus === 'vencida' ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 ring-1 ring-red-400/30' : 'bg-red-50/50 dark:bg-red-900/10 border-red-200/60 text-red-600/80')}>
                <XCircle className="h-3 w-3" />{munTotais.vencidas} Vencida
              </button>
            )}
          </div>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">CND Municipal</h3>
                <Select value={munMunicipio} onValueChange={v => { setMunMunicipio(v); setMunPage(1); setMunFiltroStatus(null) }}>
                  <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VITÓRIA">Vitória</SelectItem>
                    <SelectItem value="VILA VELHA">Vila Velha</SelectItem>
                    <SelectItem value="SERRA">Serra</SelectItem>
                    <SelectItem value="CARIACICA">Cariacica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar..." value={munSearch} onChange={e => { setMunSearch(e.target.value); setMunPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                  onClick={async () => {
                    setMunConsultaOpen(true)
                    setMunConsultaStatus('idle')
                    setMunConsultaMsg('')
                    setMunConsultaSelecionado('')
                    setMunConsultaDoc('')
                    setMunConsultaSearch('')
                    try {
                      const c = await trpc.cnd.municipal.clientesMunicipio.query({ municipio: munMunicipio }) as Array<{ id: string; razaoSocial: string; documento: string }>
                      setMunConsultaClientes(c)
                    } catch { setMunConsultaClientes([]) }
                  }}>
                  <Search className="h-3.5 w-3.5" />Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={munConsultando}
                  onClick={async () => {
                    const clientesMun = await trpc.cnd.municipal.clientesMunicipio.query({ municipio: munMunicipio }) as Array<{ id: string; razaoSocial: string; documento: string }>
                    if (clientesMun.length === 0) { alerts.warning('Lote', `Nenhum cliente mensal em ${munMunicipio}`); return }
                    const ok = await alerts.confirm({ title: `CND Municipal — Lote ${munMunicipio}`, text: `Consultar CND de ${clientesMun.length} clientes mensais de ${munMunicipio}?`, confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setMunLoteOpen(true)
                    setMunLoteProgress(null)
                    try {
                      await trpc.cnd.municipal.consultarLote.mutate({ municipio: munMunicipio })
                      if (munLotePollRef.current) clearInterval(munLotePollRef.current)
                      munLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.municipal.loteProgress.query() as typeof munLoteProgress
                        setMunLoteProgress(p)
                        if (p?.status === 'done') {
                          if (munLotePollRef.current) { clearInterval(munLotePollRef.current); munLotePollRef.current = null }
                          fetchMunicipal()
                        }
                      }, 2000)
                      const p0 = await trpc.cnd.municipal.loteProgress.query() as typeof munLoteProgress
                      setMunLoteProgress(p0)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote ({munMunicipio})
                </Button>
                {munSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteMunicipalLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({munSelected.size})
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={munData.length > 0 && munSelected.size === munData.length}
                      onCheckedChange={(checked) => {
                        if (checked) setMunSelected(new Set(munData.map(r => r.id)))
                        else setMunSelected(new Set())
                      }}
                      className="h-3.5 w-3.5"
                    />
                  </TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mensagem</TableHead>
                  <TableHead className="text-xs">Validade</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Emissão</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {munLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : munData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">{munFiltroStatus ? 'Nenhum resultado para este filtro' : 'Nenhuma certidão municipal consultada'}</TableCell></TableRow>
                ) : munData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', munSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={munSelected.has(r.id)}
                        onCheckedChange={(checked) => {
                          setMunSelected(prev => {
                            const n = new Set(prev)
                            if (checked) n.add(r.id); else n.delete(r.id)
                            return n
                          })
                        }}
                        className="h-3.5 w-3.5"
                      />
                    </TableCell>
                    <TableCell><p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p></TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                    </TableCell>
                    <TableCell>
                      {r.sucesso && r.tipoCertidao === 'Negativa' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Negativa
                        </span>
                      ) : r.sucesso ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />{r.tipoCertidao || 'Positiva'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          <XCircle className="h-3 w-3" />Não emitida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[250px] truncate">{r.mensagem || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.dataValidade ? <MunValidade data={r.dataValidade} /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.sucesso && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.municipal.getDetalhes.query({ id: r.id }) as { pdfBase64: string | null; debitos: string[] }
                                if (det.pdfBase64) { setMunPdfData(det.pdfBase64); setMunPdfOpen(true) }
                                else alerts.warning('PDF', 'PDF não disponível')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar CND</DropdownMenuItem>
                          )}
                          {!r.sucesso && r.tipoCertidao === 'Positiva' && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.municipal.getDetalhes.query({ id: r.id }) as { pdfBase64: string | null; debitos: string[] }
                                setMunDebitos(det.debitos || [])
                                setMunDebitosCliente(r.razaoSocial || r.documento)
                                setMunDebitosOpen(true)
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><AlertTriangle className="h-3.5 w-3.5" />Ver débitos</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={async () => {
                            setMunConsultando(true)
                            try {
                              const res = await trpc.cnd.municipal.consultar.mutate({ documento: r.documento, municipio: 'Vitória' }) as { sucesso: boolean; mensagem: string }
                              if (res.sucesso) alerts.success('CND Municipal', res.mensagem); else alerts.warning('CND Municipal', res.mensagem)
                              fetchMunicipal()
                            } catch (e) { alerts.error('Erro', (e as Error).message) }
                            finally { setMunConsultando(false) }
                          }} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteMunicipal(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInativarPorDocumento(r.documento, r.razaoSocial || r.documento)} className="text-xs gap-2 text-red-500 focus:text-red-500"><UserX className="h-3.5 w-3.5" />Inativar cliente</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={munPage} total={munTotal} limit={10} setPage={setMunPage} />
          </Card>

          {/* Modal consulta individual municipal — usa overlay+card manual (Radix Dialog bloqueia input) */}
          {munConsultaOpen && (
            <>
              <div className="fixed inset-0 z-50 bg-black/60" onClick={() => munConsultaStatus !== 'loading' && setMunConsultaOpen(false)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-card border shadow-2xl rounded-lg w-full max-w-[500px] max-h-[90vh] flex flex-col overflow-hidden">
                  {/* Header */}
                  <div className="shrink-0 border-b px-5 py-4 flex items-center gap-3">
                    <PageHeaderIcon module="legalizacao" icon={Landmark} />
                    <div>
                      <h3 className="text-base font-semibold">CND Municipal — {munMunicipio}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">Selecione um cliente do município para consultar</p>
                    </div>
                    <button onClick={() => munConsultaStatus !== 'loading' && setMunConsultaOpen(false)} className="ml-auto rounded-md p-1.5 hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Selecione um cliente mensal de {munMunicipio}</label>
                      <input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={munConsultaSearch}
                        onChange={e => {
                          const v = e.target.value
                          console.log('[FILTER] value:', v, 'test:', 'ACBL INFORMACOES LTDA'.toLowerCase().includes(v.toLowerCase()), 'clients:', munConsultaClientes.length)
                          setMunConsultaSearch(v)
                        }}
                        className="flex w-full rounded-[2px] border border-input bg-background px-3 py-1.5 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-8"
                      />
                      <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                        {munConsultaClientes.filter(c => {
                          if (!munConsultaSearch.trim()) return true
                          const t = munConsultaSearch.trim().toLowerCase()
                          if (!c.razaoSocial.toLowerCase().includes(t) && !c.documento.replace(/\D/g, '').includes(t.replace(/\D/g, ''))) return false
                          return true
                        }).map(c => (
                          <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0 cursor-pointer', munConsultaSelecionado === c.id && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                            <input type="radio" name="cliente-cnd-mun" checked={munConsultaSelecionado === c.id} onChange={() => { setMunConsultaSelecionado(c.id); setMunConsultaDoc(c.documento) }} className="h-3.5 w-3.5 accent-violet-500 cursor-pointer" />
                            <span className="flex-1 truncate" onClick={() => { setMunConsultaSelecionado(c.id); setMunConsultaDoc(c.documento) }}>{c.razaoSocial}</span>
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{c.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</span>
                          </div>
                        ))}
                        {munConsultaClientes.length === 0 && (
                          <div className="px-3 py-4 text-xs text-muted-foreground text-center">Nenhum cliente mensal em {munMunicipio}</div>
                        )}
                      </div>
                    </div>
                    {munConsultaStatus === 'loading' && (
                      <div className="flex items-center gap-3 rounded-lg border bg-fuchsia-50/50 dark:bg-fuchsia-950/20 px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500 shrink-0" />
                        <div><p className="text-xs font-medium">Consultando CND Municipal...</p><p className="text-[10px] text-muted-foreground">{munConsultaEtapa || 'Aguarde enquanto a certidão é gerada'}</p></div>
                      </div>
                    )}
                    {munConsultaStatus === 'success' && (
                      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div><p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Consulta concluída</p><p className="text-[10px] text-muted-foreground">{munConsultaMsg}</p></div>
                      </div>
                    )}
                    {munConsultaStatus === 'error' && (
                      <div className="flex items-center gap-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
                        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        <div><p className="text-xs font-medium text-red-700 dark:text-red-400">Falha na consulta</p><p className="text-[10px] text-muted-foreground">{munConsultaMsg}</p></div>
                      </div>
                    )}
                  </div>
                  {/* Footer */}
                  <div className="shrink-0 flex justify-end gap-2 border-t px-5 py-3">
                    {munConsultaStatus === 'idle' && (
                      <Button variant="success" size="sm" disabled={!munConsultaDoc} className="gap-1.5"
                        onClick={async () => {
                          if (!munConsultaDoc) return
                          setMunConsultaStatus('loading')
                          setMunConsultaMsg('')
                          setMunConsultaEtapa('Iniciando consulta...')
                          // Start polling etapa
                          if (munEtapaPollRef.current) clearInterval(munEtapaPollRef.current)
                          munEtapaPollRef.current = setInterval(async () => {
                            try {
                              const res = await trpc.cnd.municipal.consultaEtapa.query() as { etapa: string }
                              if (res.etapa) setMunConsultaEtapa(res.etapa)
                            } catch {}
                          }, 2000)
                          try {
                            const r = await trpc.cnd.municipal.consultar.mutate({ documento: munConsultaDoc, municipio: munMunicipio, clienteId: munConsultaSelecionado || undefined }) as { sucesso: boolean; mensagem: string }
                            setMunConsultaStatus(r.sucesso ? 'success' : 'error')
                            setMunConsultaMsg(r.mensagem)
                            fetchMunicipal()
                          } catch (e) {
                            setMunConsultaStatus('error')
                            setMunConsultaMsg((e as Error).message)
                          } finally {
                            if (munEtapaPollRef.current) { clearInterval(munEtapaPollRef.current); munEtapaPollRef.current = null }
                            setMunConsultaEtapa('')
                          }
                        }}>
                        <Search className="h-3.5 w-3.5" />Consultar
                      </Button>
                    )}
                    {(munConsultaStatus === 'success' || munConsultaStatus === 'error') && (
                      <Button variant="outline" size="sm" onClick={() => { setMunConsultaStatus('idle'); setMunConsultaMsg(''); setMunConsultaSelecionado(''); setMunConsultaDoc(''); setMunConsultaEtapa('') }} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />Nova consulta
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setMunConsultaOpen(false)} disabled={munConsultaStatus === 'loading'}>Fechar</Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Modal PDF Municipal */}
          {munPdfOpen && munPdfData && (
            <Dialog open={munPdfOpen} onOpenChange={setMunPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={Landmark} color="fuchsia">
                  <DialogTitle>CND Municipal — {munMunicipio}</DialogTitle>
                </DialogHeaderIcon>
                <DialogBody>
                  <object data={`data:application/pdf;base64,${munPdfData}`} type="application/pdf" width="100%" height="600px">
                    <p className="text-sm text-muted-foreground text-center py-8">Seu navegador não suporta PDF inline. <a href={`data:application/pdf;base64,${munPdfData}`} download="cnd-municipal-vitoria.pdf" className="text-fuchsia-500 hover:underline">Baixar PDF</a></p>
                  </object>
                </DialogBody>
              </DialogContent>
            </Dialog>
          )}

          {/* Modal Débitos Municipal */}
          <Dialog open={munDebitosOpen} onOpenChange={setMunDebitosOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeaderIcon icon={AlertTriangle} color="amber">
                <DialogTitle>Pendências — {munDebitosCliente}</DialogTitle>
                <DialogDescription>{munDebitos.length} débito(s) encontrado(s)</DialogDescription>
              </DialogHeaderIcon>
              <DialogBody className="max-h-[400px] overflow-y-auto">
                {munDebitos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum débito detalhado</p>
                ) : (
                  <div className="space-y-1">
                    {munDebitos.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 rounded border px-3 py-2 text-xs">
                        <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                        <span>{d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DialogBody>
            </DialogContent>
          </Dialog>

          {/* Modal progresso lote municipal */}
          <Dialog open={munLoteOpen} onOpenChange={open => { if (!open && munLoteProgress?.status !== 'running') { setMunLoteOpen(false); if (munLotePollRef.current) { clearInterval(munLotePollRef.current); munLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg">
              <DialogHeaderIcon icon={Landmark} color="fuchsia">
                <DialogTitle>CND Municipal — Lote {munMunicipio}</DialogTitle>
                <DialogDescription>{munLoteProgress?.status === 'running' ? 'Consultando...' : munLoteProgress?.status === 'done' ? 'Concluído' : 'Iniciando...'}</DialogDescription>
              </DialogHeaderIcon>
              <DialogBody>
                {munLoteProgress && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{munLoteProgress.current} / {munLoteProgress.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-fuchsia-500 transition-all duration-500" style={{ width: munLoteProgress.total > 0 ? `${(munLoteProgress.current / munLoteProgress.total) * 100}%` : '0%' }} />
                      </div>
                    </div>
                    {munLoteProgress.status === 'running' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin shrink-0" /><span className="truncate">{munLoteProgress.currentCliente}</span></div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-2 text-center"><p className="text-lg font-bold text-emerald-600">{munLoteProgress.emitidas}</p><p className="text-[10px] text-muted-foreground">Emitidas</p></div>
                      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-2 text-center"><p className="text-lg font-bold text-amber-600">{munLoteProgress.naoEmitidas}</p><p className="text-[10px] text-muted-foreground">Não emitidas</p></div>
                      <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-2 text-center"><p className="text-lg font-bold text-red-600">{munLoteProgress.erros}</p><p className="text-[10px] text-muted-foreground">Erros</p></div>
                    </div>
                    <div className="max-h-[250px] overflow-y-auto space-y-0.5 border rounded-lg p-2">
                      {munLoteProgress.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Aguardando...</p>
                      ) : [...munLoteProgress.items].reverse().map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[11px] py-0.5">
                          {item.status === 'emitida' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                          {item.status === 'nao_emitida' && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                          {item.status === 'erro' && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                          {item.status === 'processando' && <Loader2 className="h-3 w-3 text-fuchsia-500 animate-spin shrink-0" />}
                          {item.status === 'pendente' && <span className="h-3 w-3 text-muted-foreground shrink-0 text-center">·</span>}
                          <span className={cn('truncate', item.status === 'pendente' && 'text-muted-foreground', item.status === 'erro' && 'text-red-600')}>
                            {item.razaoSocial}{item.erro && <span className="ml-1 text-[10px] text-red-400">({item.erro})</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </DialogBody>
              {munLoteProgress?.status === 'done' && (<DialogFooter><Button variant="outline" size="sm" onClick={() => setMunLoteOpen(false)}>Fechar</Button></DialogFooter>)}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ============================================================ */}
      {/* ABA ALVARÁ BOMBEIROS (SIAT/CBMES) */}
      {/* ============================================================ */}
      {abaAtiva === 'alvara' && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">Alvarás</h3>
                <Select value={alvTipo} onValueChange={v => { setAlvTipo(v as 'bombeiros' | 'funcionamento'); setAlvPage(1) }}>
                  <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bombeiros">Corpo de Bombeiros</SelectItem>
                    <SelectItem value="funcionamento">Funcionamento</SelectItem>
                  </SelectContent>
                </Select>
                {alvTipo === 'funcionamento' && (
                  <Select value={alvFuncMunicipio} onValueChange={v => { setAlvFuncMunicipio(v); setAlvPage(1) }}>
                    <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VITÓRIA">Vitória</SelectItem>
                      <SelectItem value="VILA VELHA">Vila Velha</SelectItem>
                      <SelectItem value="SERRA">Serra</SelectItem>
                      <SelectItem value="CARIACICA">Cariacica</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-center gap-2">
                {alvTipo === 'bombeiros' && <>
                <Input placeholder="Buscar..." value={alvSearch} onChange={e => { setAlvSearch(e.target.value); setAlvPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white" disabled={alvConsultando}
                  onClick={async () => {
                    const nome = prompt('Digite a Razão Social do cliente:')
                    if (!nome || nome.length < 3) return
                    await handleConsultaAlvara(nome)
                  }}>
                  {alvConsultando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={alvConsultando}
                  onClick={async () => {
                    let clientesList = clientes
                    if (clientesList.length === 0) {
                      try { clientesList = await trpc.cnd.schedule.clientes.query() as ClienteMensal[]; setClientes(clientesList) } catch { /* */ }
                    }
                    if (clientesList.length === 0) { alerts.error('Erro', 'Nenhum cliente disponível'); return }
                    const ok = await alerts.confirm({ title: 'Consulta em lote — Alvará Bombeiros', text: `Consultar alvará de ${clientesList.length} clientes mensais pela razão social?`, confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setAlvLoteOpen(true)
                    setAlvLoteProgress(null)
                    try {
                      await trpc.cnd.alvara.consultarLote.mutate({ clientes: clientesList.map(c => ({ razaoSocial: c.razaoSocial, clienteId: c.id })) })
                      if (alvLotePollRef.current) clearInterval(alvLotePollRef.current)
                      alvLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.alvara.loteProgress.query() as typeof alvLoteProgress
                        setAlvLoteProgress(p)
                        if (p?.status === 'done') {
                          if (alvLotePollRef.current) { clearInterval(alvLotePollRef.current); alvLotePollRef.current = null }
                          fetchAlvara()
                        }
                      }, 1500)
                      const p0 = await trpc.cnd.alvara.loteProgress.query() as typeof alvLoteProgress
                      setAlvLoteProgress(p0)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote
                </Button>
                {alvSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteAlvaraLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({alvSelected.size})
                  </Button>
                )}
                </>}
              </div>
            </div>

            {alvTipo === 'funcionamento' && (<>
              <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
                <Input placeholder="Buscar..." value={alvFuncSearch} onChange={e => { setAlvFuncSearch(e.target.value); setAlvFuncPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                  onClick={async () => {
                    const doc = prompt('Digite o CNPJ do cliente:')
                    if (!doc || doc.length < 11) return
                    try {
                      const r = await trpc.cnd.alvaraFunc.consultar.mutate({ documento: doc, municipio: alvFuncMunicipio }) as { sucesso: boolean; mensagem: string }
                      if (r.sucesso) alerts.success('Alvará', r.mensagem); else alerts.warning('Alvará', r.mensagem)
                      fetchAlvaraFunc()
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Search className="h-3.5 w-3.5" />Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={async () => {
                    const ok = await alerts.confirm({ title: `Alvará Funcionamento — Lote ${alvFuncMunicipio}`, text: `Consultar alvará de funcionamento dos clientes mensais de ${alvFuncMunicipio}?`, confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    try {
                      await trpc.cnd.alvaraFunc.consultarLote.mutate({ municipio: alvFuncMunicipio })
                      alerts.success('Lote', 'Consulta em lote iniciada')
                      fetchAlvaraFunc()
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote ({alvFuncMunicipio})
                </Button>
                {alvFuncSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteAlvaraFuncLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({alvFuncSelected.size})
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={alvFuncData.length > 0 && alvFuncSelected.size === alvFuncData.length}
                        onCheckedChange={(checked) => { if (checked) setAlvFuncSelected(new Set(alvFuncData.map(r => r.id))); else setAlvFuncSelected(new Set()) }}
                        className="h-3.5 w-3.5" />
                    </TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Mensagem</TableHead>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alvFuncLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                  ) : alvFuncData.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhum alvará de funcionamento consultado</TableCell></TableRow>
                  ) : alvFuncData.map(r => (
                    <TableRow key={r.id} className={cn('hover:bg-muted/30', alvFuncSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={alvFuncSelected.has(r.id)}
                          onCheckedChange={(checked) => { setAlvFuncSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                          className="h-3.5 w-3.5" />
                      </TableCell>
                      <TableCell><p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p></TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                        {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                      </TableCell>
                      <TableCell>
                        {r.sucesso ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />Emitido
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                            <XCircle className="h-3 w-3" />Não emitido
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[250px] truncate">{r.mensagem || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {r.sucesso && (
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  const det = await trpc.cnd.alvaraFunc.getPdf.query({ id: r.id }) as { pdfBase64: string | null }
                                  if (det.pdfBase64) { setAlvPdfData(det.pdfBase64); setAlvPdfOpen(true) }
                                  else alerts.warning('PDF', 'PDF não disponível')
                                } catch (e) { alerts.error('Erro', (e as Error).message) }
                              }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar Alvará</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleDeleteAlvaraFunc(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={alvFuncPage} total={alvFuncTotal} limit={10} setPage={setAlvFuncPage} />
            </>)}

            {alvTipo === 'bombeiros' && <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={alvData.length > 0 && alvSelected.size === alvData.length}
                      onCheckedChange={(checked) => { if (checked) setAlvSelected(new Set(alvData.map(r => r.id))); else setAlvSelected(new Set()) }}
                      className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="text-xs">Razão Social</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Endereço</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Código</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Validade</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alvLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : alvData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Nenhum alvará consultado</TableCell></TableRow>
                ) : alvData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', alvSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={alvSelected.has(r.id)}
                        onCheckedChange={(checked) => { setAlvSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                        className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium truncate max-w-[250px]">{r.razaoSocial}</p>
                      {r.nomeFantasia && <p className="text-[10px] text-muted-foreground">{r.nomeFantasia}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                      {r.endereco || '—'}
                    </TableCell>
                    <TableCell>
                      {r.status === 'Regular' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Regular
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />{r.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">{r.codigoValidacao || '—'}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {r.dataFimValidade ? r.dataFimValidade.slice(0, 10) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.status === 'Regular' && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.alvara.getPdf.query({ alvaraId: r.alvaraId }) as { pdfBase64: string | null }
                                if (det.pdfBase64) { setAlvPdfData(det.pdfBase64); setAlvPdfOpen(true) }
                                else alerts.warning('PDF', 'PDF não disponível — tente novamente em instantes')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar Alvará</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleConsultaAlvara(r.razaoSocial)} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteAlvara(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleInativarPorDocumento(r.documento || '', r.razaoSocial)} className="text-xs gap-2 text-red-500 focus:text-red-500"><UserX className="h-3.5 w-3.5" />Inativar cliente</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}

            {alvTipo === 'bombeiros' && <Pagination page={alvPage} total={alvTotal} limit={10} setPage={setAlvPage} />}
          </Card>

          {/* Modal progresso lote alvará */}
          <Dialog open={alvLoteOpen} onOpenChange={open => { if (!open && alvLoteProgress?.status !== 'running') { setAlvLoteOpen(false); if (alvLotePollRef.current) { clearInterval(alvLotePollRef.current); alvLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg">
              <DialogHeaderIcon icon={Flame} color="fuchsia">
                <DialogTitle>Alvará Bombeiros — Lote</DialogTitle>
                <DialogDescription>
                  {alvLoteProgress?.status === 'running' ? 'Consultando...' : alvLoteProgress?.status === 'done' ? 'Concluído' : 'Iniciando...'}
                </DialogDescription>
              </DialogHeaderIcon>
              <DialogBody>
                {alvLoteProgress && (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">{alvLoteProgress.current} / {alvLoteProgress.total}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-fuchsia-500 transition-all duration-500"
                          style={{ width: alvLoteProgress.total > 0 ? `${(alvLoteProgress.current / alvLoteProgress.total) * 100}%` : '0%' }} />
                      </div>
                    </div>

                    {alvLoteProgress.status === 'running' && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                        <span className="truncate">{alvLoteProgress.currentCliente}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-emerald-600">{alvLoteProgress.encontrados}</p>
                        <p className="text-[10px] text-muted-foreground">Encontrados</p>
                      </div>
                      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-amber-600">{alvLoteProgress.naoEncontrados}</p>
                        <p className="text-[10px] text-muted-foreground">Não encontrados</p>
                      </div>
                      <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 p-2 text-center">
                        <p className="text-lg font-bold text-red-600">{alvLoteProgress.erros}</p>
                        <p className="text-[10px] text-muted-foreground">Erros</p>
                      </div>
                    </div>

                    <div className="max-h-[250px] overflow-y-auto space-y-0.5 border rounded-lg p-2">
                      {alvLoteProgress.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">Aguardando...</p>
                      ) : (
                        [...alvLoteProgress.items].reverse().map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-[11px] py-0.5">
                            {item.status === 'encontrado' && <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />}
                            {item.status === 'nao_encontrado' && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                            {item.status === 'erro' && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
                            {item.status === 'processando' && <Loader2 className="h-3 w-3 text-fuchsia-500 animate-spin shrink-0" />}
                            {item.status === 'pendente' && <span className="h-3 w-3 text-muted-foreground shrink-0 text-center">·</span>}
                            <span className={cn('truncate',
                              item.status === 'pendente' && 'text-muted-foreground',
                              item.status === 'erro' && 'text-red-600',
                            )}>
                              {item.razaoSocial}
                              {item.erro && <span className="ml-1 text-[10px] text-red-400">({item.erro})</span>}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </DialogBody>
              {alvLoteProgress?.status === 'done' && (
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setAlvLoteOpen(false)}>Fechar</Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>

          {alvPdfOpen && alvPdfData && (
            <Dialog open={alvPdfOpen} onOpenChange={setAlvPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={Flame} color="fuchsia"><DialogTitle>Alvará de Licença — Corpo de Bombeiros</DialogTitle></DialogHeaderIcon>
                <DialogBody className="p-0"><iframe src={`data:application/pdf;base64,${alvPdfData}`} className="w-full h-[70vh]" /></DialogBody>
                <DialogFooter><Button variant="outline" size="sm" onClick={() => setAlvPdfOpen(false)}>Fechar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ABA: CNDT Trabalhista (TST)                       */}
      {/* ══════════════════════════════════════════════════ */}
      {abaAtiva === 'trabalhista' && (
        <div className="space-y-4">
          {/* Totalizadores */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => { setTrbFiltroStatus(null); setTrbPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                !trbFiltroStatus ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30 border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-400 ring-1 ring-fuchsia-400/30' : 'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-600')}>
              <Shield className="h-3 w-3" />{trbTotais.total} Total
            </button>
            <button type="button" onClick={() => { setTrbFiltroStatus(trbFiltroStatus === 'negativa' ? null : 'negativa'); setTrbPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                trbFiltroStatus === 'negativa' ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400/30' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 text-emerald-600')}>
              <CheckCircle2 className="h-3 w-3" />{trbTotais.negativas} Negativa
            </button>
            {trbTotais.naoEmitidas > 0 && (
              <button type="button" onClick={() => { setTrbFiltroStatus(trbFiltroStatus === 'nao_emitida' ? null : 'nao_emitida'); setTrbPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  trbFiltroStatus === 'nao_emitida' ? 'bg-red-100 border-red-300 text-red-700 ring-1 ring-red-400/30' : 'bg-red-50 border-red-200 text-red-600')}>
                <XCircle className="h-3 w-3" />{trbTotais.naoEmitidas} Não emitida
              </button>
            )}
            <span className="w-px h-5 bg-border" />
            {trbTotais.vigentes > 0 && (
              <button type="button" onClick={() => { setTrbFiltroStatus(trbFiltroStatus === 'vigente' ? null : 'vigente'); setTrbPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  trbFiltroStatus === 'vigente' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400/30' : 'bg-emerald-50/50 border-emerald-200/60 text-emerald-600/80')}>
                <CheckCircle2 className="h-3 w-3" />{trbTotais.vigentes} Vigente
              </button>
            )}
            {trbTotais.vencendo > 0 && (
              <button type="button" onClick={() => { setTrbFiltroStatus(trbFiltroStatus === 'vencendo' ? null : 'vencendo'); setTrbPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  trbFiltroStatus === 'vencendo' ? 'bg-amber-100 border-amber-300 text-amber-700 ring-1 ring-amber-400/30' : 'bg-amber-50/50 border-amber-200/60 text-amber-600/80')}>
                <Clock className="h-3 w-3" />{trbTotais.vencendo} Vencendo
              </button>
            )}
            {trbTotais.vencidas > 0 && (
              <button type="button" onClick={() => { setTrbFiltroStatus(trbFiltroStatus === 'vencida' ? null : 'vencida'); setTrbPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  trbFiltroStatus === 'vencida' ? 'bg-red-100 border-red-300 text-red-700 ring-1 ring-red-400/30' : 'bg-red-50/50 border-red-200/60 text-red-600/80')}>
                <XCircle className="h-3 w-3" />{trbTotais.vencidas} Vencida
              </button>
            )}
          </div>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">CNDT — Certidão Negativa de Débitos Trabalhistas</h3>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar..." value={trbSearch} onChange={e => { setTrbSearch(e.target.value); setTrbPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                  onClick={() => { setTrbConsultaOpen(true); setTrbConsultaStatus('idle'); setTrbConsultaMsg(''); setTrbConsultaDoc(''); setTrbConsultaEtapa('') }}>
                  <Search className="h-3.5 w-3.5" />Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={async () => {
                    const ok = await alerts.confirm({ title: 'CNDT — Lote', text: `Consultar CNDT de todos os clientes mensais ativos?`, confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setTrbLoteOpen(true); setTrbLoteProgress(null)
                    try {
                      const clientes = await trpc.cnd.clientesMensais.query() as Array<{ id: string; razaoSocial: string; documento: string }>
                      await trpc.cnd.trabalhista.consultarLote.mutate({ documentos: clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })) })
                      if (trbLotePollRef.current) clearInterval(trbLotePollRef.current)
                      trbLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.trabalhista.loteProgress.query() as typeof trbLoteProgress
                        setTrbLoteProgress(p)
                        if (p?.status === 'done') { if (trbLotePollRef.current) { clearInterval(trbLotePollRef.current); trbLotePollRef.current = null }; fetchTrabalhista() }
                      }, 2000)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote
                </Button>
                {trbSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteTrabalhistaLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({trbSelected.size})
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={trbData.length > 0 && trbSelected.size === trbData.length}
                      onCheckedChange={(checked) => { if (checked) setTrbSelected(new Set(trbData.map(r => r.id))); else setTrbSelected(new Set()) }}
                      className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Nº Certidão</TableHead>
                  <TableHead className="text-xs">Validade</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Emissão</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trbLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : trbData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">{trbFiltroStatus ? 'Nenhum resultado para este filtro' : 'Nenhuma CNDT consultada'}</TableCell></TableRow>
                ) : trbData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', trbSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={trbSelected.has(r.id)}
                        onCheckedChange={(checked) => { setTrbSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                        className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell><p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p></TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                    </TableCell>
                    <TableCell>
                      {r.sucesso && r.tipoCertidao === 'Negativa' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Negativa
                        </span>
                      ) : r.sucesso ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />{r.tipoCertidao || 'Positiva'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          <XCircle className="h-3 w-3" />Não emitida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">{r.numeroCertidao || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.dataValidade ? <MunValidade data={r.dataValidade} /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.sucesso && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.trabalhista.getPdf.query({ id: r.id }) as { pdfBase64: string | null }
                                if (det.pdfBase64) { setTrbPdfData(det.pdfBase64); setTrbPdfOpen(true) }
                                else alerts.warning('PDF', 'PDF não disponível')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar CNDT</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDeleteTrabalhista(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Paginação */}
            <Pagination page={trbPage} total={trbTotal} limit={10} setPage={setTrbPage} />
          </Card>

          {/* Modal Consulta Individual */}
          {trbConsultaOpen && (
            <>
              <div className="fixed inset-0 z-50 bg-black/60" onClick={() => trbConsultaStatus !== 'loading' && setTrbConsultaOpen(false)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-background rounded-xl shadow-2xl border w-full max-w-md flex flex-col max-h-[80vh]">
                  <div className="shrink-0 flex items-center gap-2 border-b px-5 py-3">
                    <FileText className="h-4 w-4 text-fuchsia-500" />
                    <h3 className="text-base font-semibold">CNDT — Consulta Individual</h3>
                    <button onClick={() => trbConsultaStatus !== 'loading' && setTrbConsultaOpen(false)} className="ml-auto rounded-md p-1.5 hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {trbConsultaStatus === 'idle' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block">CNPJ / CPF</label>
                          <Input value={trbConsultaDoc} onChange={e => setTrbConsultaDoc(e.target.value)} placeholder="00.000.000/0000-00" className="text-xs h-9" />
                        </div>
                      </div>
                    )}
                    {trbConsultaStatus === 'loading' && (
                      <div className="flex items-center gap-3 rounded-lg border bg-fuchsia-50/50 dark:bg-fuchsia-950/20 px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500 shrink-0" />
                        <div><p className="text-xs font-medium">Consultando CNDT...</p><p className="text-[10px] text-muted-foreground">{trbConsultaEtapa || 'Aguarde enquanto a certidão é gerada'}</p></div>
                      </div>
                    )}
                    {trbConsultaStatus === 'success' && (
                      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div><p className="text-xs font-medium text-emerald-700">Consulta concluída</p><p className="text-[10px] text-muted-foreground">{trbConsultaMsg}</p></div>
                      </div>
                    )}
                    {trbConsultaStatus === 'error' && (
                      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        <div><p className="text-xs font-medium text-red-700">Falha na consulta</p><p className="text-[10px] text-muted-foreground">{trbConsultaMsg}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex justify-end gap-2 border-t px-5 py-3">
                    {trbConsultaStatus === 'idle' && (
                      <Button variant="success" size="sm" disabled={!trbConsultaDoc} className="gap-1.5"
                        onClick={async () => {
                          if (!trbConsultaDoc) return
                          setTrbConsultaStatus('loading'); setTrbConsultaMsg(''); setTrbConsultaEtapa('Iniciando consulta...')
                          if (trbEtapaPollRef.current) clearInterval(trbEtapaPollRef.current)
                          trbEtapaPollRef.current = setInterval(async () => {
                            try { const res = await trpc.cnd.trabalhista.consultaEtapa.query() as { etapa: string }; if (res.etapa) setTrbConsultaEtapa(res.etapa) } catch {}
                          }, 2000)
                          try {
                            const r = await trpc.cnd.trabalhista.consultar.mutate({ documento: trbConsultaDoc }) as { sucesso: boolean; mensagem: string }
                            setTrbConsultaStatus(r.sucesso ? 'success' : 'error'); setTrbConsultaMsg(r.mensagem); fetchTrabalhista()
                          } catch (e) { setTrbConsultaStatus('error'); setTrbConsultaMsg((e as Error).message) }
                          finally { if (trbEtapaPollRef.current) { clearInterval(trbEtapaPollRef.current); trbEtapaPollRef.current = null }; setTrbConsultaEtapa('') }
                        }}>
                        <Search className="h-3.5 w-3.5" />Consultar
                      </Button>
                    )}
                    {(trbConsultaStatus === 'success' || trbConsultaStatus === 'error') && (
                      <Button variant="outline" size="sm" onClick={() => { setTrbConsultaStatus('idle'); setTrbConsultaMsg(''); setTrbConsultaDoc(''); setTrbConsultaEtapa('') }} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />Nova consulta
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setTrbConsultaOpen(false)} disabled={trbConsultaStatus === 'loading'}>Fechar</Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Modal PDF */}
          {trbPdfOpen && trbPdfData && (
            <Dialog open={trbPdfOpen} onOpenChange={setTrbPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={FileText} color="fuchsia">
                  <DialogTitle>CNDT — Certidão</DialogTitle>
                </DialogHeaderIcon>
                <DialogBody className="p-0">
                  <iframe src={`data:application/pdf;base64,${trbPdfData}`} className="w-full h-[70vh]" />
                </DialogBody>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setTrbPdfOpen(false)}>Fechar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Modal Lote */}
          <Dialog open={trbLoteOpen} onOpenChange={open => { if (!open && trbLoteProgress?.status !== 'running') { setTrbLoteOpen(false); if (trbLotePollRef.current) { clearInterval(trbLotePollRef.current); trbLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg max-h-[80vh]">
              <DialogHeaderIcon icon={FileText} color="fuchsia">
                <DialogTitle>CNDT — Consulta em Lote</DialogTitle>
              </DialogHeaderIcon>
              <DialogBody className="space-y-3">
                {trbLoteProgress && (
                  <>
                    <div className="flex items-center gap-3">
                      {trbLoteProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />}
                      {trbLoteProgress.status === 'done' && <CheckCircle2 className="h-4 w-4 text-fuchsia-500" />}
                      <p className="text-sm font-medium">{trbLoteProgress.current}/{trbLoteProgress.total} — {trbLoteProgress.currentCliente}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-fuchsia-500 h-2 rounded-full transition-all" style={{ width: `${(trbLoteProgress.current / trbLoteProgress.total) * 100}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600">{trbLoteProgress.emitidas} emitidas</span>
                      <span className="text-red-600">{trbLoteProgress.naoEmitidas} não emitidas</span>
                      <span className="text-muted-foreground">{trbLoteProgress.erros} erros</span>
                    </div>
                    <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                      {trbLoteProgress.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b last:border-b-0 text-xs">
                          <span className="truncate flex-1">{item.razaoSocial}</span>
                          {item.status === 'processando' && <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" />}
                          {item.status === 'emitida' && <CheckCircle2 className="h-3 w-3 text-fuchsia-500" />}
                          {item.status === 'nao_emitida' && <XCircle className="h-3 w-3 text-red-500" />}
                          {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                          {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </DialogBody>
              {trbLoteProgress?.status === 'done' && (
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setTrbLoteOpen(false)}>Fechar</Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ABA: CRF/FGTS (Caixa)                            */}
      {/* ══════════════════════════════════════════════════ */}
      {abaAtiva === 'fgts' && (
        <div className="space-y-4">
          {/* Totalizadores */}
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => { setFgtsFiltroStatus(null); setFgtsPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                !fgtsFiltroStatus ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30 border-fuchsia-300 dark:border-fuchsia-700 text-fuchsia-700 dark:text-fuchsia-400 ring-1 ring-fuchsia-400/30' : 'bg-fuchsia-50 dark:bg-fuchsia-900/20 border-fuchsia-200 dark:border-fuchsia-800 text-fuchsia-600')}>
              <Shield className="h-3 w-3" />{fgtsTotais.total} Total
            </button>
            <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'regular' ? null : 'regular'); setFgtsPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                fgtsFiltroStatus === 'regular' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400/30' : 'bg-emerald-50 border-emerald-200 text-emerald-600')}>
              <CheckCircle2 className="h-3 w-3" />{fgtsTotais.regulares} Regular
            </button>
            {fgtsTotais.irregulares > 0 && (
              <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'irregular' ? null : 'irregular'); setFgtsPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  fgtsFiltroStatus === 'irregular' ? 'bg-red-100 border-red-300 text-red-700 ring-1 ring-red-400/30' : 'bg-red-50 border-red-200 text-red-600')}>
                <XCircle className="h-3 w-3" />{fgtsTotais.irregulares} Irregular
              </button>
            )}
            {fgtsTotais.naoEmitidas > 0 && (
              <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'nao_emitida' ? null : 'nao_emitida'); setFgtsPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  fgtsFiltroStatus === 'nao_emitida' ? 'bg-amber-100 border-amber-300 text-amber-700 ring-1 ring-amber-400/30' : 'bg-amber-50 border-amber-200 text-amber-600')}>
                <AlertTriangle className="h-3 w-3" />{fgtsTotais.naoEmitidas} Não emitida
              </button>
            )}
            <span className="w-px h-5 bg-border" />
            {fgtsTotais.vigentes > 0 && (
              <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'vigente' ? null : 'vigente'); setFgtsPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  fgtsFiltroStatus === 'vigente' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400/30' : 'bg-emerald-50/50 border-emerald-200/60 text-emerald-600/80')}>
                <CheckCircle2 className="h-3 w-3" />{fgtsTotais.vigentes} Vigente
              </button>
            )}
            {fgtsTotais.vencendo > 0 && (
              <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'vencendo' ? null : 'vencendo'); setFgtsPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  fgtsFiltroStatus === 'vencendo' ? 'bg-amber-100 border-amber-300 text-amber-700 ring-1 ring-amber-400/30' : 'bg-amber-50/50 border-amber-200/60 text-amber-600/80')}>
                <Clock className="h-3 w-3" />{fgtsTotais.vencendo} Vencendo
              </button>
            )}
            {fgtsTotais.vencidas > 0 && (
              <button type="button" onClick={() => { setFgtsFiltroStatus(fgtsFiltroStatus === 'vencida' ? null : 'vencida'); setFgtsPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  fgtsFiltroStatus === 'vencida' ? 'bg-red-100 border-red-300 text-red-700 ring-1 ring-red-400/30' : 'bg-red-50/50 border-red-200/60 text-red-600/80')}>
                <XCircle className="h-3 w-3" />{fgtsTotais.vencidas} Vencida
              </button>
            )}
          </div>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">CRF — Certificado de Regularidade do FGTS</h3>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar..." value={fgtsSearch} onChange={e => { setFgtsSearch(e.target.value); setFgtsPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                  onClick={() => { setFgtsConsultaOpen(true); setFgtsConsultaStatus('idle'); setFgtsConsultaMsg(''); setFgtsConsultaDoc(''); setFgtsConsultaEtapa('') }}>
                  <Search className="h-3.5 w-3.5" />Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={async () => {
                    const ok = await alerts.confirm({ title: 'CRF/FGTS — Lote', text: 'Consultar CRF de todos os clientes mensais ativos?', confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setFgtsLoteOpen(true); setFgtsLoteProgress(null)
                    try {
                      const clientes = await trpc.cnd.clientesMensais.query() as Array<{ id: string; razaoSocial: string; documento: string }>
                      await trpc.cnd.fgts.consultarLote.mutate({ documentos: clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })) })
                      if (fgtsLotePollRef.current) clearInterval(fgtsLotePollRef.current)
                      fgtsLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.fgts.loteProgress.query() as typeof fgtsLoteProgress
                        setFgtsLoteProgress(p)
                        if (p?.status === 'done') { if (fgtsLotePollRef.current) { clearInterval(fgtsLotePollRef.current); fgtsLotePollRef.current = null }; fetchFgts() }
                      }, 2000)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote
                </Button>
                {fgtsSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteFgtsLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({fgtsSelected.size})
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={fgtsData.length > 0 && fgtsSelected.size === fgtsData.length}
                      onCheckedChange={(checked) => { if (checked) setFgtsSelected(new Set(fgtsData.map(r => r.id))); else setFgtsSelected(new Set()) }}
                      className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Nº Certificado</TableHead>
                  <TableHead className="text-xs">Validade</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Emissão</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fgtsLoading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : fgtsData.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">{fgtsFiltroStatus ? 'Nenhum resultado para este filtro' : 'Nenhum CRF/FGTS consultado'}</TableCell></TableRow>
                ) : fgtsData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', fgtsSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={fgtsSelected.has(r.id)}
                        onCheckedChange={(checked) => { setFgtsSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                        className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell><p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p></TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                    </TableCell>
                    <TableCell>
                      {r.sucesso ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Regular
                        </span>
                      ) : r.tipoCertidao === 'Irregular' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          <XCircle className="h-3 w-3" />Irregular
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />Não emitido
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">{r.numeroCertificado || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.dataValidade ? <MunValidade data={r.dataValidade} /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.sucesso && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.fgts.getPdf.query({ id: r.id }) as { pdfBase64: string | null }
                                if (det.pdfBase64) { setFgtsPdfData(det.pdfBase64); setFgtsPdfOpen(true) }
                                else alerts.warning('PDF', 'PDF não disponível')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar CRF</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDeleteFgts(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={fgtsPage} total={fgtsTotal} limit={10} setPage={setFgtsPage} />
          </Card>

          {/* Modal Consulta Individual */}
          {fgtsConsultaOpen && (
            <>
              <div className="fixed inset-0 z-50 bg-black/60" onClick={() => fgtsConsultaStatus !== 'loading' && setFgtsConsultaOpen(false)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-background rounded-xl shadow-2xl border w-full max-w-md flex flex-col max-h-[80vh]">
                  <div className="shrink-0 flex items-center gap-2 border-b px-5 py-3">
                    <DollarSign className="h-4 w-4 text-fuchsia-500" />
                    <h3 className="text-base font-semibold">CRF/FGTS — Consulta Individual</h3>
                    <button onClick={() => fgtsConsultaStatus !== 'loading' && setFgtsConsultaOpen(false)} className="ml-auto rounded-md p-1.5 hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {fgtsConsultaStatus === 'idle' && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block">CNPJ</label>
                          <Input value={fgtsConsultaDoc} onChange={e => setFgtsConsultaDoc(e.target.value)} placeholder="00.000.000/0000-00" className="text-xs h-9" />
                        </div>
                      </div>
                    )}
                    {fgtsConsultaStatus === 'loading' && (
                      <div className="flex items-center gap-3 rounded-lg border bg-fuchsia-50/50 dark:bg-fuchsia-950/20 px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500 shrink-0" />
                        <div><p className="text-xs font-medium">Consultando CRF/FGTS...</p><p className="text-[10px] text-muted-foreground">{fgtsConsultaEtapa || 'Aguarde enquanto o certificado é gerado'}</p></div>
                      </div>
                    )}
                    {fgtsConsultaStatus === 'success' && (
                      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div><p className="text-xs font-medium text-emerald-700">Consulta concluída</p><p className="text-[10px] text-muted-foreground">{fgtsConsultaMsg}</p></div>
                      </div>
                    )}
                    {fgtsConsultaStatus === 'error' && (
                      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        <div><p className="text-xs font-medium text-red-700">Falha na consulta</p><p className="text-[10px] text-muted-foreground">{fgtsConsultaMsg}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex justify-end gap-2 border-t px-5 py-3">
                    {fgtsConsultaStatus === 'idle' && (
                      <Button variant="success" size="sm" disabled={!fgtsConsultaDoc} className="gap-1.5"
                        onClick={async () => {
                          if (!fgtsConsultaDoc) return
                          setFgtsConsultaStatus('loading'); setFgtsConsultaMsg(''); setFgtsConsultaEtapa('Iniciando consulta...')
                          if (fgtsEtapaPollRef.current) clearInterval(fgtsEtapaPollRef.current)
                          fgtsEtapaPollRef.current = setInterval(async () => {
                            try { const res = await trpc.cnd.fgts.consultaEtapa.query() as { etapa: string }; if (res.etapa) setFgtsConsultaEtapa(res.etapa) } catch {}
                          }, 2000)
                          try {
                            const r = await trpc.cnd.fgts.consultar.mutate({ documento: fgtsConsultaDoc }) as { sucesso: boolean; mensagem: string }
                            setFgtsConsultaStatus(r.sucesso ? 'success' : 'error'); setFgtsConsultaMsg(r.mensagem); fetchFgts()
                          } catch (e) { setFgtsConsultaStatus('error'); setFgtsConsultaMsg((e as Error).message) }
                          finally { if (fgtsEtapaPollRef.current) { clearInterval(fgtsEtapaPollRef.current); fgtsEtapaPollRef.current = null }; setFgtsConsultaEtapa('') }
                        }}>
                        <Search className="h-3.5 w-3.5" />Consultar
                      </Button>
                    )}
                    {(fgtsConsultaStatus === 'success' || fgtsConsultaStatus === 'error') && (
                      <Button variant="outline" size="sm" onClick={() => { setFgtsConsultaStatus('idle'); setFgtsConsultaMsg(''); setFgtsConsultaDoc(''); setFgtsConsultaEtapa('') }} className="gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5" />Nova consulta
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setFgtsConsultaOpen(false)} disabled={fgtsConsultaStatus === 'loading'}>Fechar</Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Modal PDF */}
          {fgtsPdfOpen && fgtsPdfData && (
            <Dialog open={fgtsPdfOpen} onOpenChange={setFgtsPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={DollarSign} color="fuchsia">
                  <DialogTitle>CRF/FGTS — Certificado</DialogTitle>
                </DialogHeaderIcon>
                <DialogBody className="p-0">
                  <iframe src={`data:application/pdf;base64,${fgtsPdfData}`} className="w-full h-[70vh]" />
                </DialogBody>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setFgtsPdfOpen(false)}>Fechar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Modal Lote */}
          <Dialog open={fgtsLoteOpen} onOpenChange={open => { if (!open && fgtsLoteProgress?.status !== 'running') { setFgtsLoteOpen(false); if (fgtsLotePollRef.current) { clearInterval(fgtsLotePollRef.current); fgtsLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg max-h-[80vh]">
              <DialogHeaderIcon icon={DollarSign} color="fuchsia">
                <DialogTitle>CRF/FGTS — Consulta em Lote</DialogTitle>
              </DialogHeaderIcon>
              <DialogBody className="space-y-3">
                {fgtsLoteProgress && (
                  <>
                    <div className="flex items-center gap-3">
                      {fgtsLoteProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />}
                      {fgtsLoteProgress.status === 'done' && <CheckCircle2 className="h-4 w-4 text-fuchsia-500" />}
                      <p className="text-sm font-medium">{fgtsLoteProgress.current}/{fgtsLoteProgress.total} — {fgtsLoteProgress.currentCliente}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-fuchsia-500 h-2 rounded-full transition-all" style={{ width: `${(fgtsLoteProgress.current / fgtsLoteProgress.total) * 100}%` }} />
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600">{fgtsLoteProgress.emitidas} regulares</span>
                      <span className="text-red-600">{fgtsLoteProgress.naoEmitidas} irregulares</span>
                      <span className="text-muted-foreground">{fgtsLoteProgress.erros} erros</span>
                    </div>
                    <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                      {fgtsLoteProgress.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b last:border-b-0 text-xs">
                          <span className="truncate flex-1">{item.razaoSocial}</span>
                          {item.status === 'processando' && <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" />}
                          {item.status === 'emitida' && <CheckCircle2 className="h-3 w-3 text-fuchsia-500" />}
                          {item.status === 'nao_emitida' && <XCircle className="h-3 w-3 text-red-500" />}
                          {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                          {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </DialogBody>
              {fgtsLoteProgress?.status === 'done' && (
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setFgtsLoteOpen(false)}>Fechar</Button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* ABA: CGU (Certidão Negativa Correcional)          */}
      {/* ══════════════════════════════════════════════════ */}
      {abaAtiva === 'cgu' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => { setCguFiltroStatus(null); setCguPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                !cguFiltroStatus ? 'bg-fuchsia-100 dark:bg-fuchsia-900/30 border-fuchsia-300 text-fuchsia-700 ring-1 ring-fuchsia-400/30' : 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-600')}>
              <Shield className="h-3 w-3" />{cguTotais.total} Total
            </button>
            <button type="button" onClick={() => { setCguFiltroStatus(cguFiltroStatus === 'nada_consta' ? null : 'nada_consta'); setCguPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                cguFiltroStatus === 'nada_consta' ? 'bg-emerald-100 border-emerald-300 text-emerald-700 ring-1 ring-emerald-400/30' : 'bg-emerald-50 border-emerald-200 text-emerald-600')}>
              <CheckCircle2 className="h-3 w-3" />{cguTotais.nadaConsta} Nada Consta
            </button>
            {cguTotais.consta > 0 && (
              <button type="button" onClick={() => { setCguFiltroStatus(cguFiltroStatus === 'consta' ? null : 'consta'); setCguPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  cguFiltroStatus === 'consta' ? 'bg-red-100 border-red-300 text-red-700 ring-1 ring-red-400/30' : 'bg-red-50 border-red-200 text-red-600')}>
                <XCircle className="h-3 w-3" />{cguTotais.consta} Consta
              </button>
            )}
            {cguTotais.naoEmitidas > 0 && (
              <button type="button" onClick={() => { setCguFiltroStatus(cguFiltroStatus === 'nao_emitida' ? null : 'nao_emitida'); setCguPage(1) }}
                className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all hover:shadow-sm',
                  cguFiltroStatus === 'nao_emitida' ? 'bg-amber-100 border-amber-300 text-amber-700 ring-1 ring-amber-400/30' : 'bg-amber-50 border-amber-200 text-amber-600')}>
                <AlertTriangle className="h-3 w-3" />{cguTotais.naoEmitidas} Não emitida
              </button>
            )}
          </div>

          <Card>
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-fuchsia-500" />
                <h3 className="text-sm font-semibold">CGU — Certidão Negativa Correcional</h3>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Buscar..." value={cguSearch} onChange={e => { setCguSearch(e.target.value); setCguPage(1) }} className="h-8 w-[200px] text-xs" />
                <Button size="sm" className="gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white"
                  onClick={() => { setCguConsultaOpen(true); setCguConsultaStatus('idle'); setCguConsultaMsg(''); setCguConsultaDoc(''); setCguConsultaEtapa('') }}>
                  <Search className="h-3.5 w-3.5" />Consultar
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={async () => {
                    const ok = await alerts.confirm({ title: 'CGU — Lote', text: 'Consultar certidão CGU de todos os clientes mensais ativos?', confirmText: 'Iniciar', icon: 'question' })
                    if (!ok) return
                    setCguLoteOpen(true); setCguLoteProgress(null)
                    try {
                      const clientes = await trpc.cnd.clientesMensais.query() as Array<{ id: string; razaoSocial: string; documento: string }>
                      await trpc.cnd.cgu.consultarLote.mutate({ documentos: clientes.map(c => ({ documento: c.documento, clienteId: c.id, razaoSocial: c.razaoSocial })) })
                      if (cguLotePollRef.current) clearInterval(cguLotePollRef.current)
                      cguLotePollRef.current = setInterval(async () => {
                        const p = await trpc.cnd.cgu.loteProgress.query() as typeof cguLoteProgress
                        setCguLoteProgress(p)
                        if (p?.status === 'done') { if (cguLotePollRef.current) { clearInterval(cguLotePollRef.current); cguLotePollRef.current = null }; fetchCgu() }
                      }, 2000)
                    } catch (e) { alerts.error('Erro', (e as Error).message) }
                  }}>
                  <Play className="h-3.5 w-3.5" />Lote
                </Button>
                {cguSelected.size > 0 && (
                  <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleDeleteCguLote}>
                    <Trash2 className="h-3.5 w-3.5" />Excluir ({cguSelected.size})
                  </Button>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={cguData.length > 0 && cguSelected.size === cguData.length}
                      onCheckedChange={(checked) => { if (checked) setCguSelected(new Set(cguData.map(r => r.id))); else setCguSelected(new Set()) }}
                      className="h-3.5 w-3.5" />
                  </TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">CNPJ</TableHead>
                  <TableHead className="text-xs">Situação</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Mensagem</TableHead>
                  <TableHead className="text-xs">Data</TableHead>
                  <TableHead className="text-xs text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cguLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : cguData.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">{cguFiltroStatus ? 'Nenhum resultado para este filtro' : 'Nenhuma certidão CGU consultada'}</TableCell></TableRow>
                ) : cguData.map(r => (
                  <TableRow key={r.id} className={cn('hover:bg-muted/30', cguSelected.has(r.id) && 'bg-fuchsia-50/40 dark:bg-fuchsia-950/20')}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={cguSelected.has(r.id)}
                        onCheckedChange={(checked) => { setCguSelected(prev => { const n = new Set(prev); if (checked) n.add(r.id); else n.delete(r.id); return n }) }}
                        className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell><p className="text-sm font-medium truncate">{r.razaoSocial || '—'}</p></TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-muted-foreground">
                      {r.documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                    </TableCell>
                    <TableCell>
                      {r.tipoCertidao === 'Nada Consta' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />Nada Consta
                        </span>
                      ) : r.tipoCertidao === 'Consta' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
                          <XCircle className="h-3 w-3" />Consta
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3 w-3" />Não emitida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[250px] truncate">{r.mensagem || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          {r.sucesso && (
                            <DropdownMenuItem onClick={async () => {
                              try {
                                const det = await trpc.cnd.cgu.getPdf.query({ id: r.id }) as { pdfBase64: string | null }
                                if (det.pdfBase64) { setCguPdfData(det.pdfBase64); setCguPdfOpen(true) }
                                else alerts.warning('PDF', 'PDF não disponível')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar Certidão</DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDeleteCgu(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Pagination page={cguPage} total={cguTotal} limit={10} setPage={setCguPage} />
          </Card>

          {cguConsultaOpen && (
            <>
              <div className="fixed inset-0 z-50 bg-black/60" onClick={() => cguConsultaStatus !== 'loading' && setCguConsultaOpen(false)} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-background rounded-xl shadow-2xl border w-full max-w-md flex flex-col max-h-[80vh]">
                  <div className="shrink-0 flex items-center gap-2 border-b px-5 py-3">
                    <Shield className="h-4 w-4 text-fuchsia-500" />
                    <h3 className="text-base font-semibold">CGU — Consulta Individual</h3>
                    <button onClick={() => cguConsultaStatus !== 'loading' && setCguConsultaOpen(false)} className="ml-auto rounded-md p-1.5 hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {cguConsultaStatus === 'idle' && (
                      <div><label className="text-xs font-medium mb-1 block">CNPJ / CPF</label><Input value={cguConsultaDoc} onChange={e => setCguConsultaDoc(e.target.value)} placeholder="00.000.000/0000-00" className="text-xs h-9" /></div>
                    )}
                    {cguConsultaStatus === 'loading' && (
                      <div className="flex items-center gap-3 rounded-lg border bg-fuchsia-50/50 dark:bg-fuchsia-950/20 px-4 py-3">
                        <Loader2 className="h-5 w-5 animate-spin text-fuchsia-500 shrink-0" />
                        <div><p className="text-xs font-medium">Consultando CGU...</p><p className="text-[10px] text-muted-foreground">{cguConsultaEtapa || 'Aguarde'}</p></div>
                      </div>
                    )}
                    {cguConsultaStatus === 'success' && (
                      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div><p className="text-xs font-medium text-emerald-700">Consulta concluída</p><p className="text-[10px] text-muted-foreground">{cguConsultaMsg}</p></div>
                      </div>
                    )}
                    {cguConsultaStatus === 'error' && (
                      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                        <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        <div><p className="text-xs font-medium text-red-700">Falha</p><p className="text-[10px] text-muted-foreground">{cguConsultaMsg}</p></div>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex justify-end gap-2 border-t px-5 py-3">
                    {cguConsultaStatus === 'idle' && (
                      <Button variant="success" size="sm" disabled={!cguConsultaDoc} className="gap-1.5"
                        onClick={async () => {
                          if (!cguConsultaDoc) return
                          setCguConsultaStatus('loading'); setCguConsultaMsg(''); setCguConsultaEtapa('Iniciando...')
                          if (cguEtapaPollRef.current) clearInterval(cguEtapaPollRef.current)
                          cguEtapaPollRef.current = setInterval(async () => { try { const r = await trpc.cnd.cgu.consultaEtapa.query() as { etapa: string }; if (r.etapa) setCguConsultaEtapa(r.etapa) } catch {} }, 2000)
                          try {
                            const r = await trpc.cnd.cgu.consultar.mutate({ documento: cguConsultaDoc }) as { sucesso: boolean; mensagem: string }
                            setCguConsultaStatus(r.sucesso ? 'success' : 'error'); setCguConsultaMsg(r.mensagem); fetchCgu()
                          } catch (e) { setCguConsultaStatus('error'); setCguConsultaMsg((e as Error).message) }
                          finally { if (cguEtapaPollRef.current) { clearInterval(cguEtapaPollRef.current); cguEtapaPollRef.current = null }; setCguConsultaEtapa('') }
                        }}><Search className="h-3.5 w-3.5" />Consultar</Button>
                    )}
                    {(cguConsultaStatus === 'success' || cguConsultaStatus === 'error') && (
                      <Button variant="outline" size="sm" onClick={() => { setCguConsultaStatus('idle'); setCguConsultaMsg(''); setCguConsultaDoc('') }} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Nova consulta</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setCguConsultaOpen(false)} disabled={cguConsultaStatus === 'loading'}>Fechar</Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {cguPdfOpen && cguPdfData && (
            <Dialog open={cguPdfOpen} onOpenChange={setCguPdfOpen}>
              <DialogContent className="max-w-4xl max-h-[90vh]">
                <DialogHeaderIcon icon={Shield} color="fuchsia"><DialogTitle>CGU — Certidão</DialogTitle></DialogHeaderIcon>
                <DialogBody className="p-0"><iframe src={`data:application/pdf;base64,${cguPdfData}`} className="w-full h-[70vh]" /></DialogBody>
                <DialogFooter><Button variant="outline" size="sm" onClick={() => setCguPdfOpen(false)}>Fechar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={cguLoteOpen} onOpenChange={open => { if (!open && cguLoteProgress?.status !== 'running') { setCguLoteOpen(false); if (cguLotePollRef.current) { clearInterval(cguLotePollRef.current); cguLotePollRef.current = null } } }}>
            <DialogContent className="max-w-lg max-h-[80vh]">
              <DialogHeaderIcon icon={Shield} color="fuchsia"><DialogTitle>CGU — Consulta em Lote</DialogTitle></DialogHeaderIcon>
              <DialogBody className="space-y-3">
                {cguLoteProgress && (
                  <>
                    <div className="flex items-center gap-3">
                      {cguLoteProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />}
                      {cguLoteProgress.status === 'done' && <CheckCircle2 className="h-4 w-4 text-fuchsia-500" />}
                      <p className="text-sm font-medium">{cguLoteProgress.current}/{cguLoteProgress.total} — {cguLoteProgress.currentCliente}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2"><div className="bg-fuchsia-500 h-2 rounded-full transition-all" style={{ width: `${(cguLoteProgress.current / cguLoteProgress.total) * 100}%` }} /></div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-emerald-600">{cguLoteProgress.emitidas} nada consta</span>
                      <span className="text-red-600">{cguLoteProgress.naoEmitidas} consta/erro</span>
                      <span className="text-muted-foreground">{cguLoteProgress.erros} erros</span>
                    </div>
                    <div className="border rounded-lg max-h-[300px] overflow-y-auto">
                      {cguLoteProgress.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b last:border-b-0 text-xs">
                          <span className="truncate flex-1">{item.razaoSocial}</span>
                          {item.status === 'processando' && <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" />}
                          {item.status === 'emitida' && <CheckCircle2 className="h-3 w-3 text-fuchsia-500" />}
                          {item.status === 'nao_emitida' && <XCircle className="h-3 w-3 text-red-500" />}
                          {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                          {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </DialogBody>
              {cguLoteProgress?.status === 'done' && (<DialogFooter><Button variant="outline" size="sm" onClick={() => setCguLoteOpen(false)}>Fechar</Button></DialogFooter>)}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* MODAL: Compilar e Enviar por E-mail               */}
      {/* ══════════════════════════════════════════════════ */}
      {compOpen && (
        <Dialog open={compOpen} onOpenChange={open => { if (!open && compStep !== 'progresso') { setCompOpen(false); if (compPollRef.current) { clearInterval(compPollRef.current); compPollRef.current = null } } }}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeaderIcon icon={Mail} color="fuchsia">
              <DialogTitle>Compilar e Enviar Certidões</DialogTitle>
              <DialogDescription>
                {compStep === 'cnpj' && 'Informe o CNPJ do cliente'}
                {compStep === 'opcoes' && 'Selecione as certidões e opções'}
                {compStep === 'progresso' && 'Gerando certidões...'}
                {compStep === 'resumo' && 'Resumo e envio por e-mail'}
              </DialogDescription>
            </DialogHeaderIcon>
            <DialogBody className="space-y-4">

              {/* Step 1: CNPJ */}
              {compStep === 'cnpj' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">CNPJ do Cliente</label>
                    <Input value={compDoc} onChange={e => setCompDoc(e.target.value)} placeholder="00.000.000/0000-00" className="text-sm" />
                  </div>
                </div>
              )}

              {/* Step 2: Opções */}
              {compStep === 'opcoes' && (
                <div className="space-y-4">
                  <div className="rounded-lg border bg-muted/30 px-4 py-3">
                    <p className="text-sm font-medium">{compRazao}</p>
                    <p className="text-xs text-muted-foreground font-mono">{compDoc.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-2 block">Certidões a incluir</label>
                    <div className="space-y-1.5">
                      {([
                        { key: 'federal', label: 'CND Federal (PGFN/RFB)' },
                        { key: 'estadual', label: 'CND Estadual (SEFAZ ES)' },
                        { key: 'municipal', label: 'CND Municipal' },
                        { key: 'trabalhista', label: 'CNDT Trabalhista (TST)' },
                        { key: 'fgts', label: 'CRF/FGTS (Caixa)' },
                        { key: 'cgu', label: 'CGU (Certidão Correcional)' },
                        { key: 'alvara_bombeiros', label: 'Alvará Bombeiros (CBMES)' },
                        { key: 'alvara_funcionamento', label: 'Alvará de Funcionamento (Prefeitura)' },
                      ] as const).map(t => (
                        <label key={t.key} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/30 rounded px-2 py-1.5">
                          <Checkbox checked={compTipos.has(t.key)} onCheckedChange={checked => {
                            setCompTipos(prev => { const n = new Set(prev); if (checked) n.add(t.key); else n.delete(t.key); return n })
                          }} className="h-3.5 w-3.5" />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
                    <Checkbox checked={compForcar} onCheckedChange={v => setCompForcar(!!v)} className="h-3.5 w-3.5" />
                    <label className="text-xs cursor-pointer" onClick={() => setCompForcar(!compForcar)}>Forçar novas consultas (ignorar certidões existentes)</label>
                  </div>
                </div>
              )}

              {/* Step 3: Progresso */}
              {compStep === 'progresso' && compProgress && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {compProgress.status === 'running' && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-500" />}
                    {compProgress.status === 'done' && <CheckCircle2 className="h-4 w-4 text-fuchsia-500" />}
                    <p className="text-sm font-medium">{compProgress.current}/{compProgress.total}</p>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-fuchsia-500 h-2 rounded-full transition-all" style={{ width: `${compProgress.total > 0 ? (compProgress.current / compProgress.total) * 100 : 0}%` }} />
                  </div>
                  <div className="border rounded-lg max-h-[250px] overflow-y-auto">
                    {compProgress.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-xs">
                        <span className="truncate flex-1">{item.label}</span>
                        {item.status === 'processando' && <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" />}
                        {item.status === 'sucesso' && <CheckCircle2 className="h-3 w-3 text-fuchsia-500" />}
                        {item.status === 'falha' && <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3 w-3" /><span className="max-w-[120px] truncate">{item.mensagem}</span></span>}
                        {item.status === 'sem_pdf' && <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3 w-3" />Sem PDF</span>}
                        {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Resumo + E-mail */}
              {compStep === 'resumo' && compProgress && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b">
                          <th className="text-left px-3 py-2 font-medium">Certidão / Alvará</th>
                          <th className="text-left px-3 py-2 font-medium">Situação</th>
                          <th className="text-center px-3 py-2 font-medium w-[70px]">PDF</th>
                          <th className="w-[40px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {compProgress.items.map((item, i) => {
                          const sit = (item as { situacao?: string }).situacao
                          const sitLower = (sit || '').toLowerCase()
                          const sitColor = sitLower.includes('negativa') && !sitLower.includes('positiva') ? 'text-emerald-600'
                            : sitLower.includes('nada consta') ? 'text-emerald-600'
                            : sitLower.includes('regular') ? 'text-emerald-600'
                            : sitLower.includes('positiva') ? 'text-amber-600'
                            : sitLower.includes('irregular') || sitLower.includes('consta') ? 'text-red-500'
                            : 'text-muted-foreground'
                          return (
                            <tr key={i} className="border-b last:border-b-0 hover:bg-muted/20">
                              <td className="px-3 py-2">{item.label}</td>
                              <td className={cn('px-3 py-2 font-medium', sitColor)}>
                                {item.status === 'falha' ? <span className="text-red-500">{item.mensagem?.slice(0, 35) || 'Falha'}</span> : (sit || '—')}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {item.status === 'sucesso' ? (
                                  <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /></span>
                                ) : item.status === 'falha' ? (
                                  <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="h-3 w-3" /></span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-amber-500"><AlertTriangle className="h-3 w-3" /></span>
                                )}
                              </td>
                              <td className="px-1 py-2">
                                {item.status === 'processando' ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-fuchsia-500" />
                                ) : (item.status === 'falha' || item.status === 'sem_pdf') ? (
                                  <button type="button" title="Tentar novamente" className="rounded p-1.5 hover:bg-muted transition-colors"
                                    onClick={async () => {
                                      try {
                                        const tipo = item.tipo as 'federal' | 'estadual' | 'municipal' | 'trabalhista' | 'fgts' | 'cgu' | 'alvara_bombeiros' | 'alvara_funcionamento'
                                        // Marcar como processando localmente
                                        setCompProgress(prev => {
                                          if (!prev) return prev
                                          const items = [...prev.items]
                                          items[i] = { ...items[i]!, status: 'processando', mensagem: undefined }
                                          return { ...prev, items }
                                        })
                                        // Usar endpoint de retry que preserva os demais itens
                                        await trpc.cnd.compilarRetry.mutate({ documento: compDoc.replace(/\D/g, ''), tipo, itemIndex: i })
                                        // Polling até completar — atualiza apenas o item retentado
                                        const poll = setInterval(async () => {
                                          const p = await trpc.cnd.compilarProgress.query() as typeof compProgress
                                          // Atualizar o item em tempo real durante processamento
                                          const retryItem = p?.items[i]
                                          if (retryItem) {
                                            setCompProgress(prev => {
                                              if (!prev) return prev
                                              const items = [...prev.items]
                                              items[i] = retryItem
                                              return { ...prev, items }
                                            })
                                          }
                                          if (p?.status === 'done') {
                                            clearInterval(poll)
                                            fetchData(); fetchTotais(); fetchEstadual(); fetchMunicipal(); fetchTrabalhista(); fetchFgts(); fetchCgu(); fetchAlvara()
                                          }
                                        }, 2000)
                                      } catch (e) { alerts.error('Erro', (e as Error).message) }
                                    }}>
                                    <RefreshCw className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-3 text-xs font-medium">
                    <span className="text-emerald-600">{compProgress.items.filter(i => i.status === 'sucesso').length} anexo(s)</span>
                    <span className="text-red-500">{compProgress.items.filter(i => i.status === 'falha').length} falha(s)</span>
                    <span className="text-amber-500">{compProgress.items.filter(i => i.status === 'sem_pdf').length} sem PDF</span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium block">E-mail do destinatário</label>
                    {compContatos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1">
                        {compContatos.map((c, i) => (
                          <button key={i} type="button"
                            onClick={() => setCompEmail(c.email)}
                            className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all hover:shadow-sm cursor-pointer',
                              compEmail === c.email ? 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-700 ring-1 ring-fuchsia-400/30' : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50')}>
                            <Mail className="h-2.5 w-2.5" />
                            {c.nome ? `${c.nome} — ${c.email}` : c.email}
                          </button>
                        ))}
                      </div>
                    )}
                    <Input value={compEmail} onChange={e => { setCompEmail(e.target.value); setCompSalvarContato(false) }} placeholder="email@exemplo.com" className="text-sm" type="email" />
                    {compEmail && !compContatos.some(c => c.email.toLowerCase() === compEmail.toLowerCase()) && (
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox checked={compSalvarContato} onCheckedChange={v => setCompSalvarContato(!!v)} className="h-3.5 w-3.5" />
                        Salvar este e-mail nos contatos do cliente
                      </label>
                    )}
                  </div>
                  {compMsg && <p className={cn('text-xs font-medium', compMsg.includes('sucesso') || compMsg.includes('enviado') ? 'text-emerald-600' : 'text-red-500')}>{compMsg}</p>}
                </div>
              )}

            </DialogBody>
            <DialogFooter>
              {compStep === 'cnpj' && (
                <Button size="sm" disabled={!compDoc || compDoc.replace(/\D/g, '').length < 11} onClick={() => {
                  setCompRazao(compDoc.replace(/\D/g, ''))
                  setCompStep('opcoes')
                }} className="gap-1.5"><Search className="h-3.5 w-3.5" />Avançar</Button>
              )}
              {compStep === 'opcoes' && (<>
                <Button variant="outline" size="sm" onClick={() => setCompStep('cnpj')}>Voltar</Button>
                <Button size="sm" disabled={compTipos.size === 0} onClick={async () => {
                  setCompStep('progresso')
                  try {
                    await trpcMutate('cnd.processarLote', { documento: compDoc.replace(/\D/g, ''), tipos: Array.from(compTipos), forcarNova: compForcar })
                    if (compPollRef.current) clearInterval(compPollRef.current)
                    compPollRef.current = setInterval(async () => {
                      const p = await trpc.cnd.compilarProgress.query() as typeof compProgress & { razaoSocial?: string }
                      setCompProgress(p)
                      if (p?.razaoSocial) setCompRazao(p.razaoSocial)
                      if (p?.status === 'done') {
                        if (compPollRef.current) { clearInterval(compPollRef.current); compPollRef.current = null }
                        // Buscar contatos do cliente para sugestão
                        trpc.cnd.clienteContatos.query({ documento: compDoc.replace(/\D/g, '') })
                          .then((c: unknown) => setCompContatos(c as Array<{ email: string; nome: string | null }>))
                          .catch(() => setCompContatos([]))
                        // Atualizar todas as tabelas com os dados recém-gerados
                        fetchData(); fetchTotais(); fetchEstadual(); fetchMunicipal(); fetchTrabalhista(); fetchFgts(); fetchCgu(); fetchAlvara()
                        setCompStep('resumo')
                      }
                    }, 2000)
                    const p0 = await trpc.cnd.compilarProgress.query() as typeof compProgress & { razaoSocial?: string }
                    setCompProgress(p0)
                    if (p0?.razaoSocial) setCompRazao(p0.razaoSocial)
                  } catch (e) { alerts.error('Erro', (e as Error).message); setCompStep('opcoes') }
                }} className="gap-1.5"><Play className="h-3.5 w-3.5" />Gerar Certidões</Button>
              </>)}
              {compStep === 'resumo' && (<>
                <Button variant="outline" size="sm" onClick={() => { setCompOpen(false); if (compPollRef.current) { clearInterval(compPollRef.current); compPollRef.current = null } }}>Fechar</Button>
                <Button size="sm" disabled={!compEmail || compEnviando || (compProgress?.items.filter(i => i.status === 'sucesso').length || 0) === 0}
                  onClick={async () => {
                    setCompEnviando(true); setCompMsg('')
                    try {
                      const r = await trpc.cnd.compilarEnviar.mutate({ email: compEmail, documento: compDoc.replace(/\D/g, ''), razaoSocial: compRazao }) as { message: string }
                      setCompMsg(r.message)
                      // Salvar contato se marcado e é email novo
                      if (compSalvarContato && !compContatos.some(c => c.email.toLowerCase() === compEmail.toLowerCase())) {
                        try {
                          await trpc.cnd.salvarContato.mutate({ documento: compDoc.replace(/\D/g, ''), email: compEmail })
                          setCompContatos(prev => [...prev, { email: compEmail, nome: null }])
                          setCompMsg(r.message + ' | Contato salvo nos cadastros do cliente.')
                        } catch (err) { console.error('Erro ao salvar contato:', err) }
                      }
                    } catch (e) { setCompMsg((e as Error).message) }
                    finally { setCompEnviando(false) }
                  }}
                  className="gap-1.5">
                  {compEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                  Enviar E-mail
                </Button>
              </>)}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
