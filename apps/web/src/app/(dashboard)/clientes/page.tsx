'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search, Filter, Settings2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  MoreVertical, FileUp, FileDown, Plug, BarChart3,
  ChevronDown, X, Database, Loader2, Sparkles, UserCog,
  FileSearch,
  Ban, RotateCcw, Building2, ExternalLink, Copy,
  Calculator, FileText, Users, Briefcase, ClipboardList, Wallet, Tag,
  ShieldCheck, ShieldAlert, ShieldX, ShieldOff,
  type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BADGE } from '@/lib/color-styles'
import { areaTone } from './_lib/area-tone'
import { trpc } from '@/lib/trpc'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { IntegracoesModal } from './_components/integracoes-modal'
import { InativarClienteModal } from './_components/inativar-cliente-modal'
import { ReativarClienteModal } from './_components/reativar-cliente-modal'
import { STATUS_BADGE_CLASS, EX_CLIENTE_BADGE_CLASS, INATIVAR_BTN_CLASS, isExCliente } from './_components/cliente-status-ui'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'
import { SITUACAO_LABELS, SITUACAO_COLORS } from '@saas/types'
import { masks } from '@/lib/masks'
import { EnriquecerCnaeDialog } from './_components/enriquecer-cnae-dialog'
import { DossieBackfillModal } from './_components/dossie-backfill-modal'
import { SincronizarResponsaveisDialog } from './_components/sincronizar-responsaveis-dialog'
import { useClientesPerms } from './_components/use-clientes-perms'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'

type ClienteListOutput = inferRouterOutputs<AppRouter>['cliente']['list']

interface Cliente {
  id: string; code: number; razaoSocial: string; nomeFantasia: string | null
  documento: string; tipoDocumento: string; situacao: string; status: string
  grupo: string | null; tributacao: string | null; areasContratadas: string | null
  cidade: string | null; uf: string | null; isActive: boolean; deletedAt?: string | null
  dataSaida?: string | null
  /** Qtd de filiais quando o cliente é matriz (CNPJ ordem 0001). 0 caso contrário. */
  filiaisCount?: number
  /** Status do certificado digital (maior validade entre os ativos). */
  certStatus?: 'valido' | 'expirando' | 'vencido' | 'sem'
  certExpiraEm?: string | null
}

interface Filial {
  id: string; documento: string; razaoSocial: string; nomeFantasia: string | null
  cidade: string | null; uf: string | null; status: string; situacao: string
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }
const PAGE_SIZES = [10, 20, 50, 100]

/** Ícone de status do certificado digital do cliente (verde/amarelo/vermelho/cinza). */
function CertIcon({ status, expiraEm }: { status?: Cliente['certStatus']; expiraEm?: string | null }) {
  const dt = expiraEm ? new Date(expiraEm).toLocaleDateString('pt-BR') : null
  const map = {
    valido:    { Icon: ShieldCheck, cls: 'text-emerald-500', title: dt ? `Certificado válido até ${dt}` : 'Certificado digital válido' },
    expirando: { Icon: ShieldAlert, cls: 'text-amber-500',   title: dt ? `Certificado a vencer em ${dt}` : 'Certificado digital a vencer' },
    vencido:   { Icon: ShieldX,     cls: 'text-red-500',     title: dt ? `Certificado vencido em ${dt}` : 'Certificado digital vencido' },
    sem:       { Icon: ShieldOff,   cls: 'text-slate-300 dark:text-slate-600', title: 'Sem certificado digital vinculado' },
  } as const
  const v = map[status ?? 'sem'] ?? map.sem
  const Icon = v.Icon
  return (
    <span title={v.title} className="inline-flex">
      <Icon className={cn('h-4 w-4', v.cls)} aria-label={v.title} />
    </span>
  )
}

const TRIBUTACAO_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real', MEI: 'MEI', IMUNE: 'Imune', ISENTA: 'Isenta',
}

export default function ClientesPage() {
  const router = useRouter()
  // Relatório de cadastros repetidos é só para administrador (mesma regra do backend).
  const { isMaster, isEmpresaMaster } = useUserPermissions()
  const { canCreate } = useClientesPerms()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'razaoSocial', dir: 'asc' })
  const [data, setData] = useState<ClienteListOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [enriquecimentoOpen, setEnriquecimentoOpen] = useState(false)
  // Varredura do dossiê (master) — ver o componente.
  const [dossieOpen, setDossieOpen] = useState(false)
  const [responsaveisOpen, setResponsaveisOpen] = useState(false)
  const [integracoesOpen, setIntegracoesOpen] = useState(false)

  // Modal de filiais (grupo CNPJ — mesma raiz, ordens != 0001)
  const [filiaisModal, setFiliaisModal] = useState<{ documento: string; matrizNome: string } | null>(null)
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [filiaisLoading, setFiliaisLoading] = useState(false)

  // Gerenciador de opcoes (Atividade, Origem)
  const [opcoesModal, setOpcoesModal] = useState(false)
  const [opcoesTab, setOpcoesTab] = useState<'ATIVIDADE' | 'ORIGEM' | 'GRUPO' | 'BENEFICIO'>('ATIVIDADE')
  const [opcoes, setOpcoes] = useState<Array<{ id: string; tipo: string; valor: string; ordem: number; count?: number }>>([])
  const [opcoesLoading, setOpcoesLoading] = useState(false)
  const [novaOpcao, setNovaOpcao] = useState('')
  const [opcoesBusca, setOpcoesBusca] = useState('')

  const loadOpcoes = useCallback(async (tipo: string) => {
    setOpcoesLoading(true)
    setOpcoesBusca('')
    try {
      if (tipo === 'BENEFICIO') {
        // Catálogo de benefícios fiscais (tipos). count = clientes usando (emUso).
        const cat = await (trpc as any).beneficioFiscal.listCatalogo.query({ incluirInativos: true }) as Array<{ id: string; nome: string; emUso?: number }>
        setOpcoes(cat.map(c => ({ id: c.id, tipo: 'BENEFICIO', valor: c.nome, ordem: 0, count: c.emUso || 0 })))
      } else {
        const data = await (trpc.cliente as any).listOpcoes.query({ tipo }) as typeof opcoes
        setOpcoes(data)
      }
    } catch { /* */ }
    finally { setOpcoesLoading(false) }
  }, [])

  const openOpcoesModal = () => { setOpcoesModal(true); loadOpcoes(opcoesTab) }

  const handleAddOpcao = async () => {
    const valor = novaOpcao.trim()
    if (!valor) return
    // Feedback imediato — não permite duplicata (case-insensitive) já no cliente.
    if (opcoes.some(o => o.valor.trim().toLowerCase() === valor.toLowerCase())) {
      alerts.error('Duplicado', `"${valor}" já está cadastrado nesta lista.`)
      return
    }
    try {
      if (opcoesTab === 'BENEFICIO') {
        await (trpc as any).beneficioFiscal.createCatalogo.mutate({ nome: valor })
      } else {
        await (trpc.cliente as any).createOpcao.mutate({ tipo: opcoesTab, valor })
      }
      setNovaOpcao('')
      loadOpcoes(opcoesTab)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleUpdateOpcao = async (id: string, valor: string) => {
    try {
      if (opcoesTab === 'BENEFICIO') {
        await (trpc as any).beneficioFiscal.updateCatalogo.mutate({ id, nome: valor })
      } else {
        await (trpc.cliente as any).updateOpcao.mutate({ id, valor })
      }
    } catch { /* */ }
  }

  const handleDeleteOpcao = async (id: string, valor: string, count = 0) => {
    // Bloqueio imediato — não exclui se houver clientes vinculados.
    if (count > 0) {
      alerts.error('Não é possível excluir', `"${valor}" tem ${count} cliente(s) vinculado(s). Reatribua-os antes de excluir.`)
      return
    }
    const ok = await alerts.confirmDelete(valor)
    if (!ok) return
    try {
      if (opcoesTab === 'BENEFICIO') {
        await (trpc as any).beneficioFiscal.removeCatalogo.mutate({ id })
      } else {
        await (trpc.cliente as any).deleteOpcao.mutate({ id })
      }
      setOpcoes(prev => prev.filter(o => o.id !== id))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }
  const [exporting, setExporting] = useState(false)

  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterSituacao, setFilterSituacao] = useState('')
  // Status do cliente (#HLP0209): 'ATIVO' (padrão) · 'INATIVO' · 'TODOS' (ativos+inativos).
  const [filterStatus, setFilterStatus] = useState('ATIVO')
  const [filterTributacao, setFilterTributacao] = useState('')
  const [filterGrupo, setFilterGrupo] = useState('')
  const [filterCidade, setFilterCidade] = useState('')
  const [filterUf, setFilterUf] = useState('')
  // Novos filtros
  const [filterNumero, setFilterNumero] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterAtividade, setFilterAtividade] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterBeneficio, setFilterBeneficio] = useState('')
  const [debouncedNumero, setDebouncedNumero] = useState('')
  const [filterOptions, setFilterOptions] = useState<{ grupos: (string | null)[]; cidades: (string | null)[]; estados: (string | null)[]; tipos: (string | null)[]; atividades: string[]; beneficios: string[]; areas: string[] }>({ grupos: [], cidades: [], estados: [], tipos: [], atividades: [], beneficios: [], areas: [] })

  useEffect(() => {
    if (!filiaisModal) { setFiliais([]); return }
    let cancelled = false
    setFiliaisLoading(true)
    // Vai o mesmo filtro Ativo/Inativo da lista: o modal mostra as filiais que o
    // selo contou, nem uma a mais.
    ;(trpc.cliente as any).listFiliais.query({ documento: filiaisModal.documento, status: filterStatus === 'TODOS' ? undefined : filterStatus })
      .then((r: Filial[]) => { if (!cancelled) setFiliais(r) })
      .catch(() => { if (!cancelled) setFiliais([]) })
      .finally(() => { if (!cancelled) setFiliaisLoading(false) })
    return () => { cancelled = true }
  }, [filiaisModal, filterStatus])

  // Filtro persistente: somente mensais
  const [onlyMensal, setOnlyMensal] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('clientes_only_mensal') === '1'
    return false
  })
  function toggleOnlyMensal() {
    setOnlyMensal(prev => {
      const next = !prev
      localStorage.setItem('clientes_only_mensal', next ? '1' : '0')
      if (next) { setFilterSituacao(''); setOnlyExCliente(false); localStorage.setItem('clientes_only_ex', '0') }
      setPage(1)
      return next
    })
  }

  // #HLP0210 (Fase 3) — atalho "Somente Ex-clientes": estado derivado (mensal ∧ inativo ∧
  // data de saída). Mutuamente exclusivo com "Somente Mensais". Trava os seletores.
  const [onlyExCliente, setOnlyExCliente] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('clientes_only_ex') === '1'
    return false
  })
  function setExCliente(next: boolean) {
    localStorage.setItem('clientes_only_ex', next ? '1' : '0')
    if (next) { setOnlyMensal(false); localStorage.setItem('clientes_only_mensal', '0') }
    setOnlyExCliente(next)
    setPage(1)
  }
  function toggleOnlyExCliente() { setExCliente(!onlyExCliente) }

  // Inativação (#HLP0209/0211) — modal único (data de saída opcional + motivo).
  // `ids` cobre tanto a linha (1 id) quanto o lote (vários). A Lixeira foi
  // aposentada: inativo agora é status=INATIVO, visível pelo filtro "Inativo".
  const [inativarAlvo, setInativarAlvo] = useState<{ ids: string[]; nome: string } | null>(null)
  const [reativarAlvo, setReativarAlvo] = useState<{ id: string; nome: string } | null>(null)

  // Importação legado
  const [legacyImporting, setLegacyImporting] = useState(false)

  // Seleção em lote
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // Campo "Número" (texto) — debounce próprio pra não refazer a query a cada tecla
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedNumero(filterNumero); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [filterNumero])

  // Carregar opções de filtro
  useEffect(() => {
    trpc.cliente.getFilterOptions.query().then(setFilterOptions).catch(() => {})
  }, [])

  // Monta o input de filtros da listagem — reusado pela exportação (exporta o
  // conjunto filtrado, não todos os clientes).
  const buildListInput = useCallback(() => {
    const situacaoFinal = onlyMensal ? 'MENSAL' : (filterSituacao || undefined)
    return {
      page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir,
      // Ex-clientes: o backend aplica MENSAL ∧ INATIVO ∧ dataSaida; ignora situacao/status.
      ...(onlyExCliente
        ? { exCliente: true }
        : {
            ...(situacaoFinal ? { situacao: situacaoFinal as 'MENSAL' } : {}),
            // 'TODOS' = ativos+inativos (backend não filtra por status); senão filtra pelo valor.
            ...(filterStatus === 'TODOS' ? { incluirInativos: true } : { status: filterStatus as 'ATIVO' }),
          }),
      ...(filterTributacao ? { tributacao: filterTributacao as 'SIMPLES_NACIONAL' } : {}),
      ...(filterGrupo ? { grupo: filterGrupo } : {}),
      ...(filterCidade ? { cidade: filterCidade } : {}),
      ...(filterUf ? { uf: filterUf } : {}),
      ...(debouncedNumero.trim() ? { numero: debouncedNumero.trim() } : {}),
      ...(filterTipo ? { tipoCliente: filterTipo } : {}),
      ...(filterAtividade ? { atividade: filterAtividade } : {}),
      ...(filterArea ? { areaContratada: filterArea } : {}),
      ...(filterBeneficio ? { comBeneficio: filterBeneficio } : {}),
    }
  }, [page, limit, debouncedSearch, sort, filterSituacao, filterStatus, filterTributacao, filterGrupo, filterCidade, filterUf, debouncedNumero, filterTipo, filterAtividade, filterArea, filterBeneficio, onlyMensal, onlyExCliente])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const input = buildListInput()
      const result = await trpc.cliente.list.query(input)
      setData(result)
      setSelected(new Set())
    } catch { /* silent */ } finally { setLoading(false) }
  }, [buildListInput])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  function toggleSort(column: string) {
    setSort((prev) => ({ column, dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  function clearFilters() {
    setFilterSituacao(''); setFilterStatus('ATIVO'); setFilterTributacao(''); setFilterGrupo(''); setFilterCidade(''); setFilterUf('')
    setFilterNumero(''); setFilterTipo(''); setFilterAtividade(''); setFilterArea(''); setFilterBeneficio('')
    setExCliente(false) // Ex-cliente volta para "Não"
    setOnlyMensal(false); localStorage.setItem('clientes_only_mensal', '0') // desliga "Somente Mensais"
    setSearch(''); setPage(1)
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function toggleSelectAll() {
    if (!data?.data) return
    if (selected.size === data.data.length) setSelected(new Set())
    else setSelected(new Set(data.data.map(c => c.id)))
  }

  const EXPORT_COLUMNS: ExportColumn[] = [
    { header: 'ID', accessor: 'code' }, { header: 'Situação', accessor: 'situacao' },
    { header: 'Razão Social', accessor: 'razaoSocial' }, { header: 'Nome Fantasia', accessor: 'nomeFantasia' },
    { header: 'Documento', accessor: 'documento' }, { header: 'Tributação', accessor: 'tributacao' },
    { header: 'Grupo', accessor: 'grupo' }, { header: 'Áreas Contratadas', accessor: 'areasContratadas' },
    { header: 'Cidade', accessor: 'cidade' }, { header: 'UF', accessor: 'uf' },
    { header: 'Telefone', accessor: 'telefone' }, { header: 'E-mail', accessor: 'email' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      // Exporta exatamente o conjunto filtrado (mesmos filtros da listagem).
      const all = await trpc.cliente.exportAll.query(buildListInput())
      const sufixo = hasActiveFilters || debouncedSearch ? '-filtrados' : ''
      exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, `clientes${sufixo}-${new Date().toISOString().slice(0, 10)}`)
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
    finally { setExporting(false) }
  }

  // Abre o modal de inativação (linha ou lote). O modal cuida dos próprios
  // campos (data de saída opcional + motivo).
  function openInativar(ids: string[], nome: string) {
    if (ids.length === 0) return
    setInativarAlvo({ ids, nome })
  }

  // Confirma a inativação de 1..N clientes com a MESMA data de saída + motivo.
  async function inativarConfirmado(dataSaida: string, motivo: string) {
    if (!inativarAlvo) return
    let ok = 0
    for (const id of inativarAlvo.ids) {
      try {
        await trpc.cliente.inativar.mutate({ id, dataSaida: dataSaida || undefined, motivo })
        ok++
      } catch { /* skip */ }
    }
    const n = inativarAlvo.ids.length
    await alerts.success('Cliente inativado', n === 1 ? `"${inativarAlvo.nome}" foi inativado.` : `${ok} de ${n} clientes inativados.`)
    fetchClientes()
  }

  // Reativação também registra motivo (obrigatório) — usa o mesmo modal do detalhe.
  async function reativarConfirmado(motivo: string) {
    if (!reativarAlvo) return
    try {
      await trpc.cliente.reativar.mutate({ id: reativarAlvo.id, motivo })
      await alerts.success('Cliente reativado', `"${reativarAlvo.nome}" voltou a ser ativo.`)
      fetchClientes()
    } catch { alerts.error('Erro', 'Não foi possível reativar.') }
  }

  async function handleLegacyImport() {
    const confirmed = await alerts.confirmDelete('Isso importará todos os clientes do sistema legado. Clientes existentes serão atualizados.')
    if (!confirmed) return
    setLegacyImporting(true)
    try {
      const result = await trpc.cliente.legacyImport.mutate()
      await alerts.success(
        'Importação concluída',
        `${result.imported} importados, ${result.updated} atualizados${result.errors.length ? `, ${result.errors.length} erros` : ''} de ${result.total} clientes.`
      )
      fetchClientes()
    } catch (e) {
      alerts.error('Erro na importação', (e as Error).message || 'Não foi possível conectar ao banco legado.')
    } finally { setLegacyImporting(false) }
  }

  function formatDocumento(doc: string, tipo: string) {
    return tipo === 'CPF' ? masks.cpf(doc) : masks.cnpj(doc)
  }

  // Ícone por área (chave normalizada, sem acento). A COR vem da fonte única
  // `areaTone` (→ BADGE do color-styles, dark-correto) — a mesma de /clientes/[id]
  // aba Obrigações. O ícone herda a cor do texto do badge (currentColor).
  const AREA_ICON: Record<string, LucideIcon> = {
    contabil: Calculator,
    fiscal: FileText,
    trabalhista: Users,
    societario: Briefcase,
    legalizacao: Building2,
    administrativo: ClipboardList,
    financeiro: Wallet,
    pessoal: UserCog,
    dp: UserCog,
  }

  function renderAreas(areas: string | null) {
    if (!areas) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {areas.split(';').map((area) => {
          const trimmed = area.trim()
          if (!trimmed) return null
          const key = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const Icon = AREA_ICON[key] ?? Tag
          return (
            <span
              key={trimmed}
              title={trimmed}
              className={cn('inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[9px] font-semibold uppercase leading-tight tracking-wide', BADGE[areaTone(trimmed)])}
            >
              <Icon className="h-2.5 w-2.5 shrink-0" />
              {trimmed}
            </span>
          )
        })}
      </div>
    )
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  function getPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  const hasActiveFilters = filterSituacao || (filterStatus !== 'ATIVO') || filterTributacao || filterGrupo || filterCidade || filterUf || filterNumero || filterTipo || filterAtividade || filterArea || filterBeneficio || onlyMensal || onlyExCliente

  return (
    <div className="space-y-6">
      {/* Header padrão (como o /crm): barra full-bleed, título + trilha, ações à direita */}
      <PageHeaderBar
        actions={<>
              <Button variant="outline" size="sm" onClick={openOpcoesModal} className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Opcoes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIntegracoesOpen(true)} className="gap-1.5">
                <Plug className="h-4 w-4" />Integrações
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => router.push('/clientes/relatorios')}><BarChart3 className="h-4 w-4 text-emerald-600" />Relatórios</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar Excel/CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLegacyImport} disabled={legacyImporting}>
                    {legacyImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    {legacyImporting ? 'Importando...' : 'Importar do Legado'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport} disabled={exporting}><FileDown className="h-4 w-4" />Exportar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEnriquecimentoOpen(true)}>
                    <Sparkles className="h-4 w-4 text-orange-500" />Enriquecer CNAE
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setResponsaveisOpen(true)}>
                    <UserCog className="h-4 w-4 text-orange-500" />Sincronizar Responsáveis
                  </DropdownMenuItem>
                  {(isMaster || isEmpresaMaster) && (
                    <DropdownMenuItem onClick={() => router.push('/clientes/duplicidades')}>
                      <Copy className="h-4 w-4 text-amber-600" />Cadastros repetidos
                    </DropdownMenuItem>
                  )}
                  {isMaster && (
                    <DropdownMenuItem onClick={() => setDossieOpen(true)}>
                      <FileSearch className="h-4 w-4 text-violet-600" />Varredura do dossiê
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
          {canCreate && (
            <Button size="sm" asChild className="gap-1.5">
              <Link href="/clientes/new"><Plus className="h-4 w-4" />Novo Cliente</Link>
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Clientes</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cadastros</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Clientes</span>
        </p>
      </PageHeaderBar>

      {/* Filtros colapsáveis */}
      <Card className={cn('overflow-hidden transition-all', filtersOpen ? '' : 'cursor-pointer')} onClick={() => !filtersOpen && setFiltersOpen(true)}>
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen) }}>
            <div className="flex items-center gap-3 text-sm font-medium cursor-pointer">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filtros
                {hasActiveFilters && (() => { const count = [filterSituacao, (filterStatus !== 'ATIVO'), filterTributacao, filterGrupo, filterCidade, filterUf, filterNumero, filterTipo, filterAtividade, filterArea, filterBeneficio].filter(Boolean).length + (onlyMensal ? 1 : 0) + (onlyExCliente ? 1 : 0); return count > 0 ? <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500">{count}</Badge> : null })()}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleOnlyMensal() }}
                className={cn(
                  'flex items-center gap-1.5 rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold transition-all',
                  onlyMensal
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'bg-transparent text-muted-foreground border border-border/60 hover:border-sky-500 hover:text-sky-500',
                )}
              >
                Somente Mensais
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleOnlyExCliente() }}
                title="Ex-clientes: mensais que foram inativados com data de saída"
                className={cn(
                  'flex items-center gap-1.5 rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold transition-all',
                  onlyExCliente
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-transparent text-muted-foreground border border-border/60 hover:border-rose-500 hover:text-rose-500',
                )}
              >
                Somente Ex-clientes
              </button>
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
          {/* Anima expandir/retrair via grid-template-rows (0fr↔1fr), como em /orcamentos.
              Os SelectContent do Radix saem em portal, então o overflow:hidden do wrapper
              da animação não os corta. */}
          <div
            className="grid transition-all duration-300 ease-out motion-reduce:transition-none"
            style={{ gridTemplateRows: filtersOpen ? '1fr' : '0fr', opacity: filtersOpen ? 1 : 0 }}
            aria-hidden={!filtersOpen}
          >
            <div className="min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-t border-border/40">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Linha 1: Número · Grupo · Atividade · Município · Estado · Tributação */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Número</label>
                  <Input value={filterNumero} onChange={(e) => setFilterNumero(e.target.value.replace(/\D/g, ''))} placeholder="Nº do cliente" inputMode="numeric" className="h-8 text-xs bg-card" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Grupo Empresarial</label>
                  <Select value={filterGrupo || '__all__'} onValueChange={(v) => { setFilterGrupo(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.grupos.map((g) => <SelectItem key={g} value={g!}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Atividade</label>
                  <Select value={filterAtividade || '__all__'} onValueChange={(v) => { setFilterAtividade(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {filterOptions.atividades.map((a) => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Município</label>
                  <Select value={filterCidade || '__all__'} onValueChange={(v) => { setFilterCidade(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.cidades.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Estado</label>
                  <Select value={filterUf || '__all__'} onValueChange={(v) => { setFilterUf(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.estados.map((e) => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tributação</label>
                  <Select value={filterTributacao || '__all__'} onValueChange={(v) => { setFilterTributacao(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(TRIBUTACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Linha 2: Áreas Contratadas · Tipo de Cliente · Situação · Cliente com Benefício · Cliente Ativo/Inativo */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Áreas Contratadas</label>
                  <Select value={filterArea || '__all__'} onValueChange={(v) => { setFilterArea(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {filterOptions.areas.map((a) => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Cliente</label>
                  <Select value={filterTipo || '__all__'} onValueChange={(v) => { setFilterTipo(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.tipos.map((t) => <SelectItem key={t} value={t!}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Situação</label>
                  <Select value={(onlyMensal || onlyExCliente) ? 'MENSAL' : (filterSituacao || '__all__')} onValueChange={(v) => { setFilterSituacao(v === '__all__' ? '' : v); setPage(1) }} disabled={onlyMensal || onlyExCliente}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(SITUACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente com Benefício</label>
                  <Select value={filterBeneficio || '__all__'} onValueChange={(v) => { setFilterBeneficio(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="__com__">Com benefício (qualquer)</SelectItem>
                      <SelectItem value="__sem__">Sem benefício</SelectItem>
                      {filterOptions.beneficios.map((b) => <SelectItem key={b} value={b!}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente Ativo / Inativo</label>
                  {/* #HLP0209 — Ativos (padrão) · Inativos · Todos (ativos+inativos). Ex-cliente trava em Inativos. */}
                  <Select value={onlyExCliente ? 'INATIVO' : filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1) }} disabled={onlyExCliente}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATIVO">Ativos</SelectItem>
                      <SelectItem value="INATIVO">Inativos</SelectItem>
                      <SelectItem value="TODOS">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* #HLP0210 (Fase 3) — filtro Ex-cliente (mensal ∧ inativo ∧ data de saída).
                    O atalho "Somente Ex-clientes" no cabeçalho liga/desliga este mesmo filtro. */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Ex-cliente</label>
                  <Select value={onlyExCliente ? 'sim' : 'nao'} onValueChange={(v) => setExCliente(v === 'sim')}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao">Não</SelectItem>
                      <SelectItem value="sim">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            </div>
          </div>
        </Card>

      {/* Seleção em lote */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
          {/* Âmbar soft com borda (tom do KPI "Backlog em aberto"): destaca sobre o fundo
              esmeralda da barra, onde o soft-warning (tint 10%) sumia. O per-row segue
              soft-warning (fica sobre a linha, homogêneo com o Editar/Reativar). */}
          <Button variant="outline" className={INATIVAR_BTN_CLASS} size="sm" onClick={() => openInativar(Array.from(selected), `${selected.size} clientes selecionados`)}>
            <Ban className="h-3.5 w-3.5" />Inativar selecionados
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      {/* DataTable */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="hidden sm:inline">registros</span>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox checked={!!(data?.data && data.data.length > 0 && selected.size === data.data.length)} onCheckedChange={toggleSelectAll} />
              </TableHead>
              <TableHead className="w-[60px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Nº <SortIcon column="code" />
                </button>
              </TableHead>
              <TableHead className="w-[110px]">
                <button onClick={() => toggleSort('situacao')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Situação <SortIcon column="situacao" />
                </button>
              </TableHead>
              <TableHead className="w-[44px] text-center" title="Certificado digital">
                <ShieldCheck className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('razaoSocial')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Cliente <SortIcon column="razaoSocial" />
                </button>
              </TableHead>
              <TableHead className="hidden xl:table-cell w-[170px]">CNPJ/CPF</TableHead>
              <TableHead className="hidden lg:table-cell">Tributação</TableHead>
              <TableHead className="hidden lg:table-cell">Grupo</TableHead>
              <TableHead className="hidden md:table-cell">Município</TableHead>
              <TableHead className="hidden md:table-cell w-[50px]">UF</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-10 text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((cliente) => (
                <TableRow key={cliente.id} className="cursor-pointer" onClick={() => router.push(`/clientes/${cliente.id}`)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(cliente.id)} onCheckedChange={() => toggleSelect(cliente.id)} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">{cliente.code}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <InlineSituacaoSelect
                      clienteId={cliente.id}
                      value={cliente.situacao}
                      onUpdated={(newVal) => {
                        setData((prev) => prev ? {
                          ...prev,
                          data: prev.data.map((c) => c.id === cliente.id ? { ...c, situacao: newVal } : c),
                        } : prev)
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <CertIcon status={cliente.certStatus} expiraEm={cliente.certExpiraEm} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{cliente.razaoSocial}</p>
                        {cliente.status === 'INATIVO' && (
                          isExCliente(cliente)
                            ? <Badge className={cn('text-[10px] px-1.5 py-0 border-transparent', EX_CLIENTE_BADGE_CLASS)}>Ex-cliente</Badge>
                            : <Badge className={cn('text-[10px] px-1.5 py-0 border-transparent', STATUS_BADGE_CLASS.INATIVO)}>Inativo</Badge>
                        )}
                        {(cliente.filiaisCount ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setFiliaisModal({ documento: cliente.documento, matrizNome: cliente.razaoSocial }) }}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                            title={`Ver ${cliente.filiaisCount} ${cliente.filiaisCount === 1 ? 'filial' : 'filiais'} deste grupo`}
                          >
                            <Building2 className="h-2.5 w-2.5" />
                            {cliente.filiaisCount} {cliente.filiaisCount === 1 ? 'filial' : 'filiais'}
                          </button>
                        )}
                      </div>
                      {renderAreas(cliente.areasContratadas)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-xs text-muted-foreground">
                    {formatDocumento(cliente.documento, cliente.tipoDocumento)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {cliente.tributacao ? (TRIBUTACAO_LABELS[cliente.tributacao] || cliente.tributacao) : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{cliente.grupo || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.cidade || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.uf || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" title="Editar" onClick={() => router.push(`/clientes/${cliente.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {cliente.status === 'INATIVO' ? (
                        <Button variant="soft-success" size="icon-sm" title="Reativar" onClick={() => setReativarAlvo({ id: cliente.id, nome: cliente.razaoSocial })}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button variant="soft-warning" size="icon-sm" title="Inativar" onClick={() => openInativar([cliente.id], cliente.razaoSocial)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer */}
        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? (
                'Mostrando 0 registros'
              ) : (
                <>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>
              )}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map((p) => (
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchClientes} />
      <IntegracoesModal open={integracoesOpen} onClose={() => setIntegracoesOpen(false)} onRefreshList={fetchClientes} />
      <DossieBackfillModal open={dossieOpen} onOpenChange={setDossieOpen} />
      <EnriquecerCnaeDialog
        open={enriquecimentoOpen}
        onOpenChange={setEnriquecimentoOpen}
        onAfterRun={fetchClientes}
      />
      <SincronizarResponsaveisDialog
        open={responsaveisOpen}
        onOpenChange={setResponsaveisOpen}
        onAfterRun={fetchClientes}
      />

      {/* Inativar cliente(s) (#HLP0209/0211) — modal reutilizável (data opcional + motivo). */}
      <InativarClienteModal
        open={!!inativarAlvo}
        count={inativarAlvo?.ids.length ?? 0}
        nome={inativarAlvo?.nome}
        onOpenChange={o => { if (!o) setInativarAlvo(null) }}
        onConfirm={inativarConfirmado}
      />

      {/* Reativar cliente (#HLP0209) — mesmo modal usado no detalhe. */}
      <ReativarClienteModal
        open={!!reativarAlvo}
        nome={reativarAlvo?.nome}
        onOpenChange={o => { if (!o) setReativarAlvo(null) }}
        onConfirm={reativarConfirmado}
      />

      {/* Modal de filiais do grupo (CNPJ raiz comum, ordem != 0001) */}
      <Dialog open={!!filiaisModal} onOpenChange={o => { if (!o) setFiliaisModal(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Building2} color="violet">
            <DialogTitle className="text-[15px]">Filiais do grupo</DialogTitle>
            <DialogDescription className="text-[11px]">
              {filiaisModal?.matrizNome ?? ''}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {filiaisLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando filiais...
              </div>
            ) : filiais.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma filial encontrada com a mesma raiz de CNPJ.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/30 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">CNPJ</th>
                      <th className="text-left px-3 py-2 font-medium">Razão Social</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Cidade/UF</th>
                      <th className="text-right px-3 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filiais.map(f => (
                      <tr key={f.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{formatDocumento(f.documento, 'CNPJ')}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{f.razaoSocial}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {[f.cidade, f.uf].filter(Boolean).join('/') || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <a
                            href={`/clientes/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Abrir filial"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" type="button" onClick={() => setFiliaisModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciador de Opcoes (Atividade / Origem) */}
      <Dialog open={opcoesModal} onOpenChange={setOpcoesModal}>
        <DialogContent className="max-w-[620px]">
          <DialogHeaderIcon icon={Settings2} color="emerald">
            <DialogTitle className="text-[15px]">Opcoes de Cadastro</DialogTitle>
            <DialogDescription className="text-[11px]">Gerencie as opcoes dos campos Atividade, Origem, Grupo e o catálogo de Benefícios</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {/* Tabs */}
            <div className="flex gap-1 mb-3 border-b">
              {(['ATIVIDADE', 'ORIGEM', 'GRUPO', 'BENEFICIO'] as const).map(tab => (
                <button key={tab} type="button"
                  className={cn('px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px', opcoesTab === tab ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  onClick={() => { setOpcoesTab(tab); loadOpcoes(tab) }}
                >
                  {tab === 'ATIVIDADE' ? 'Atividades' : tab === 'ORIGEM' ? 'Origens' : tab === 'GRUPO' ? 'Grupos' : 'Benefícios'}
                </button>
              ))}
            </div>
            {/* Filtro */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Filtrar..." value={opcoesBusca} onChange={e => setOpcoesBusca(e.target.value)} className="h-8 text-sm pl-8" />
            </div>
            {/* Lista — compacta, sem molduras (inputs viram texto editável) */}
            {(() => {
              const filtradas = opcoes.filter(o => !opcoesBusca || o.valor.toLowerCase().includes(opcoesBusca.toLowerCase()))
              return (
                <div className="h-[50vh] overflow-y-auto divide-y divide-border/50 -mx-1">
                  {opcoesLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : opcoes.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhuma opcao cadastrada</p>
                  ) : filtradas.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">Nenhum resultado para &quot;{opcoesBusca}&quot;</p>
                  ) : filtradas.map(op => (
                    <div key={op.id} className="group flex items-center gap-1 px-1">
                      <Input
                        value={op.valor}
                        onChange={e => setOpcoes(prev => prev.map(o => o.id === op.id ? { ...o, valor: e.target.value } : o))}
                        onBlur={() => handleUpdateOpcao(op.id, op.valor)}
                        className="h-7 text-sm flex-1 border-0 bg-transparent shadow-none px-2 rounded hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-1"
                      />
                      {op.count ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums px-1.5 py-0.5 rounded bg-muted/60" title={`${op.count} cliente(s) vinculado(s)`}>
                          {op.count}
                        </span>
                      ) : null}
                      <button type="button" className="shrink-0 p-1 rounded text-muted-foreground/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all" onClick={() => handleDeleteOpcao(op.id, op.valor, op.count || 0)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}
            {/* Adicionar */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Input placeholder={opcoesTab === 'ATIVIDADE' ? 'Nova atividade...' : opcoesTab === 'ORIGEM' ? 'Nova origem...' : opcoesTab === 'GRUPO' ? 'Novo grupo...' : 'Novo benefício...'} value={novaOpcao} onChange={e => setNovaOpcao(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddOpcao() }} className="h-8 text-sm flex-1" />
              <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={handleAddOpcao} disabled={!novaOpcao.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpcoesModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Componente inline para editar Situação direto na tabela
function InlineSituacaoSelect({ clienteId, value, onUpdated }: { clienteId: string; value: string; onUpdated: (v: string) => void }) {
  const [saving, setSaving] = useState(false)

  async function handleChange(newValue: string) {
    if (newValue === value) return
    setSaving(true)
    try {
      await trpc.cliente.update.mutate({ id: clienteId, data: { situacao: newValue as 'MENSAL' } })
      onUpdated(newValue)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  const sc = SITUACAO_COLORS[value as keyof typeof SITUACAO_COLORS]
  const isSolid = value === 'MENSAL'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="block w-full rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold text-center cursor-pointer transition-opacity hover:opacity-80"
          style={isSolid
            ? { backgroundColor: sc?.bg || '#e5e5e5', color: sc?.color || '#666' }
            : { backgroundColor: 'transparent', color: sc?.bg || '#666', border: `1.5px solid ${sc?.bg || '#ccc'}` }
          }
        >
          {saving ? '...' : (SITUACAO_LABELS[value as keyof typeof SITUACAO_LABELS] || value)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-1 min-w-[140px]">
        {Object.entries(SITUACAO_LABELS).map(([v, l]) => {
          const c = SITUACAO_COLORS[v as keyof typeof SITUACAO_COLORS]
          const solid = v === 'MENSAL'
          return (
            <DropdownMenuItem key={v} onClick={() => handleChange(v)} className="p-1 focus:bg-transparent">
              <span
                className={`block w-full rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold text-center ${v === value ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                style={solid
                  ? { backgroundColor: c?.bg || '#e5e5e5', color: c?.color || '#666' }
                  : { backgroundColor: 'transparent', color: c?.bg || '#666', border: `1.5px solid ${c?.bg || '#ccc'}` }
                }
              >
                {l}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
