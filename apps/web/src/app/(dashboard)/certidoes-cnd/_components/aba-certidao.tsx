'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Eye, MoreVertical, Play, RefreshCw, Search, Trash2, type LucideIcon } from 'lucide-react'
import {
  Button, Card, Checkbox, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { alerts } from '@/lib/alerts'
import {
  Indicadores, ListToolbar, Pagination, LinhaEstado, formatDoc, formatDateTime, toggleSet, useDebounced,
  type Indicador,
} from '../_lib/ui'
import { ConsultaDialog, LoteDialog, PdfDialog, type ClienteOpcao, type LoteProgresso, type ResultadoConsulta } from './dialogs'

export interface LinhaCertidao {
  id: string
  documento: string
  razaoSocial: string | null
  sucesso: boolean
  mensagem: string | null
  createdAt: string | null
}

export interface ColunaExtra<T> {
  header: string
  /** Classe da célula e do cabeçalho (ex.: `hidden lg:table-cell`). */
  className?: string
  cell: (r: T) => ReactNode
}

/**
 * Uma aba de certidão: indicadores-filtro, tabela paginada no servidor,
 * consulta individual, lote e PDF. Cada rotina só diz como falar com o seu
 * endpoint — a tela é a mesma.
 */
export function AbaCertidao<T extends LinhaCertidao>({
  nome, icon, refreshKey, filtros, indicadores, indicadoresFiltram = true, situacao, colunas, vazio,
  listar, totais, consultar, pollEtapa, carregarClientes, consultaModo, consultaRotulo,
  lote, pdf, podeVerPdf, reconsultar = true, acoesExtras, excluir, excluirLote,
}: {
  /** Nome curto da certidão ("CNDT", "CRF/FGTS"...). */
  nome: string
  icon: LucideIcon
  refreshKey: number
  /** Selects extras na toolbar (município). Mudança de filtro deve vir em `listar` via deps. */
  filtros?: ReactNode
  indicadores?: (t: Record<string, number>) => Indicador[]
  /** O endpoint aceita `filtroStatus`? Sem isso os indicadores só informam. */
  indicadoresFiltram?: boolean
  situacao: (r: T) => ReactNode
  colunas: ColunaExtra<T>[]
  vazio: string
  listar: (p: { page: number; limit: number; search?: string; filtroStatus?: string }) => Promise<{ data: T[]; total: number }>
  totais?: () => Promise<Record<string, number>>
  consultar: (alvo: { documento: string; razaoSocial: string; clienteId?: string }) => Promise<ResultadoConsulta>
  pollEtapa?: () => Promise<string>
  carregarClientes?: () => Promise<ClienteOpcao[]>
  consultaModo?: 'documento' | 'razaoSocial'
  consultaRotulo?: string
  lote: {
    descricao: string
    iniciar: (forcarNova: boolean) => Promise<void>
    progresso: () => Promise<LoteProgresso | null>
    rotulos: { ok: string; nok: string }
    permiteForcar?: boolean
  }
  pdf: {
    obter: (r: T) => Promise<string | null>
    titulo: string
    arquivo: (r: T) => string
    aviso?: (r: T) => string | null
  }
  podeVerPdf: (r: T) => boolean
  reconsultar?: boolean
  /** Itens extras do menu ⋮ da linha (ex.: "Ver débitos"). */
  acoesExtras?: (r: T) => ReactNode
  excluir: (id: string) => Promise<unknown>
  excluirLote: (ids: string[]) => Promise<unknown>
}) {
  const [data, setData] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const busca = useDebounced(search)
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [tots, setTots] = useState<Record<string, number>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [consultaOpen, setConsultaOpen] = useState(false)
  const [loteOpen, setLoteOpen] = useState(false)
  const [pdfAberto, setPdfAberto] = useState<{ base64: string; r: T } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setSel(new Set())
    try {
      const r = await listar({ page, limit, search: busca || undefined, filtroStatus: filtro || undefined })
      setData(r.data); setTotal(r.total)
      // Excluiu o último registro da página: volta uma (PADRAO_PAGINAS §1.4).
      if (r.data.length === 0 && page > 1 && r.total > 0) setPage(p => p - 1)
    } catch (e) { alerts.toast('Erro ao carregar', { text: (e as Error).message, icon: 'error' }) }
    finally { setLoading(false) }
    if (totais) totais().then(setTots).catch(() => {})
  }, [listar, totais, page, limit, busca, filtro])

  useEffect(() => { fetchData() }, [fetchData, refreshKey])

  async function verPdf(r: T) {
    try {
      const b64 = await pdf.obter(r)
      if (b64) setPdfAberto({ base64: b64, r })
      else alerts.warning('PDF', 'PDF não disponível')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleReconsultar(r: T) {
    const ok = await alerts.confirm({ title: `Reconsultar ${nome}`, text: `Nova consulta para ${r.razaoSocial || formatDoc(r.documento)}?`, confirmText: 'Reconsultar', icon: 'question' })
    if (!ok) return
    try {
      const res = await consultar({ documento: r.documento, razaoSocial: r.razaoSocial || '' })
      if (res.sucesso) alerts.success(nome, res.mensagem); else alerts.warning(nome, res.mensagem)
      if (res.aviso) alerts.warning('Atenção', res.aviso)
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleExcluir(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await excluir(id); fetchData() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleExcluirLote() {
    const ids = Array.from(sel)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} registro(s) selecionado(s)`)) return
    try { await excluirLote(ids); alerts.success('Excluído', `${ids.length} registro(s) removido(s)`); fetchData() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const colSpan = 6 + colunas.length
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {indicadores && <Indicadores itens={indicadores(tots)} ativo={filtro} onChange={indicadoresFiltram ? k => { setFiltro(k === filtro ? '' : k); setPage(1) } : undefined} />}

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ListToolbar limit={limit} setLimit={n => { setLimit(n); setPage(1) }} search={search} setSearch={v => { setSearch(v); setPage(1) }} filtros={filtros}
          acoes={<>
            {sel.size > 0 && (
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={handleExcluirLote}><Trash2 className="h-3.5 w-3.5" />Excluir ({sel.size})</Button>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLoteOpen(true)}><Play className="h-3.5 w-3.5" />Lote</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setConsultaOpen(true)}><Search className="h-3.5 w-3.5" />Consultar</Button>
          </>} />

        <div className="nice-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={data.length > 0 && sel.size === data.length}
                    onCheckedChange={c => setSel(c ? new Set(data.map(r => r.id)) : new Set())} className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Documento</TableHead>
                <TableHead>Situação</TableHead>
                {colunas.map(c => <TableHead key={c.header} className={c.className}>{c.header}</TableHead>)}
                <TableHead className="hidden sm:table-cell">Consulta</TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || data.length === 0 ? (
                <LinhaEstado colSpan={colSpan} loading={loading} vazio={filtro ? 'Nenhum resultado para este filtro' : vazio} icon={icon} />
              ) : data.map(r => (
                <TableRow key={r.id} className={cn('hover:bg-muted/30', podeVerPdf(r) && 'cursor-pointer', sel.has(r.id) && 'bg-muted/40')}
                  onClick={() => podeVerPdf(r) && verPdf(r)}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={c => setSel(prev => toggleSet(prev, r.id, !!c))} className="h-3.5 w-3.5" />
                  </TableCell>
                  <TableCell className="max-w-[320px]"><p className="truncate text-sm font-medium" title={r.razaoSocial || ''}>{r.razaoSocial || '—'}</p></TableCell>
                  <TableCell className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground md:table-cell">{formatDoc(r.documento)}</TableCell>
                  <TableCell className="max-w-[220px]">{situacao(r)}</TableCell>
                  {colunas.map(c => <TableCell key={c.header} className={cn('text-xs', c.className)}>{c.cell(r)}</TableCell>)}
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{formatDateTime(r.createdAt)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {podeVerPdf(r) && <DropdownMenuItem onClick={() => verPdf(r)} className="gap-2 text-xs"><Eye className="h-3.5 w-3.5" />Visualizar</DropdownMenuItem>}
                        {acoesExtras?.(r)}
                        {reconsultar && <DropdownMenuItem onClick={() => handleReconsultar(r)} className="gap-2 text-xs"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleExcluir(r.id)} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Pagination page={page} total={total} limit={limit} setPage={setPage} />
      </Card>

      <ConsultaDialog open={consultaOpen} onOpenChange={setConsultaOpen} titulo={`${nome} — Consulta individual`}
        icon={icon} carregarClientes={carregarClientes} modo={consultaModo} rotuloManual={consultaRotulo}
        consultar={consultar} pollEtapa={pollEtapa} onConcluido={fetchData} />

      <LoteDialog open={loteOpen} onOpenChange={setLoteOpen} titulo={`${nome} — Lote`} icon={icon}
        descricao={lote.descricao} iniciar={lote.iniciar} progresso={lote.progresso} rotulos={lote.rotulos}
        permiteForcar={lote.permiteForcar} onConcluido={fetchData} />

      <PdfDialog pdf={pdfAberto?.base64 ?? null} onClose={() => setPdfAberto(null)} titulo={pdf.titulo} icon={icon}
        nomeArquivo={pdfAberto ? pdf.arquivo(pdfAberto.r) : 'certidao.pdf'} aviso={pdfAberto && pdf.aviso ? pdf.aviso(pdfAberto.r) : null} />
    </div>
  )
}
