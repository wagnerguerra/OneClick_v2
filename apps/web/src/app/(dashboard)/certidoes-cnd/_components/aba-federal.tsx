'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, Download, Eye, FileOutput, Loader2, MoreVertical,
  Play, RefreshCw, RotateCcw, Search, Shield, Trash2, XCircle,
} from 'lucide-react'
import {
  Button, Card, Checkbox, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { limparCnpj } from '@/lib/masks'
import {
  Indicadores, ListToolbar, Pagination, LinhaEstado, SortHead, SituacaoBadge, StatusBadge, ValidadeBadge,
  formatDoc, formatDate, toggleSet, useDebounced, STATUS_COR,
} from '../_lib/ui'
import { ConsultaDialog, type ResultadoConsulta } from './dialogs'
import { FederalPdfDialog, type CndRecord } from './federal-pdf-dialog'
import { FederalLoteDialog, AgendamentoDialog } from './federal-dialogs'

interface ClienteMensal { id: string; razaoSocial: string; documento: string; alertaProcuracao?: boolean }
type ResultadoFederal = CndRecord & { fromCache?: boolean; consultaFalhou?: boolean; mensagemFalha?: string }

const carregarClientes = () => trpc.cnd.clientesMensais.query() as Promise<ClienteMensal[]>

/**
 * A falha numa reconsulta não apaga mais a CND válida anterior: o backend
 * devolve a anterior com `consultaFalhou` — a tela conta que a nova falhou.
 */
function interpretar(r: ResultadoFederal): ResultadoConsulta {
  if (r.consultaFalhou) {
    return {
      sucesso: true,
      mensagem: `Mantida a certidão anterior${r.tipoCertidao ? ` (${r.tipoCertidao})` : ''}.`,
      aviso: `A nova consulta falhou: ${r.mensagemFalha || 'sem detalhes'}. A certidão válida anterior foi mantida.`,
    }
  }
  if (r.sucesso) {
    return { sucesso: true, mensagem: `CND ${r.tipoCertidao || ''}${r.fromCache ? ' (do cache)' : ''}${r.codigoControle ? ` — código ${r.codigoControle}` : ''}` }
  }
  return { sucesso: false, mensagem: r.erro || r.mensagemApi || 'Sem detalhes' }
}

/** CND Federal — PGFN/RFB via SERPRO. */
export function AbaFederal({ refreshKey, filtroInicial }: { refreshKey: number; filtroInicial: string }) {
  const [data, setData] = useState<CndRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const busca = useDebounced(search)
  const [sortBy, setSortBy] = useState('razaoSocial')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filtro, setFiltro] = useState(filtroInicial)
  const [lixeira, setLixeira] = useState(false)
  const [loading, setLoading] = useState(true)
  const [totais, setTotais] = useState({ total: 0, negativas: 0, positivasEfeitos: 0, naoEmitidas: 0, vencidas: 0, vencendo: 0, lixeira: 0 })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [clientes, setClientes] = useState<ClienteMensal[]>([])
  const [consultaOpen, setConsultaOpen] = useState(false)
  const [forcarNova, setForcarNova] = useState(false)
  const [loteOpen, setLoteOpen] = useState(false)
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [visualizar, setVisualizar] = useState<{ record: CndRecord; aba: 'cnd' | 'sitfis' } | null>(null)

  const fetchTotais = useCallback(() => {
    trpc.cnd.totalizadores.query().then(t => setTotais(t as typeof totais)).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true); setSel(new Set())
    try {
      const r = await trpc.cnd.list.query({
        page, limit, search: busca || undefined, sortBy, sortDir,
        tipoCertidao: filtro || undefined, lixeira,
      }) as { data: CndRecord[]; total: number }
      setData(r.data); setTotal(r.total)
      if (r.data.length === 0 && page > 1 && r.total > 0) setPage(p => p - 1)
    } catch (e) { alerts.toast('Erro ao carregar', { text: (e as Error).message, icon: 'error' }) }
    finally { setLoading(false) }
    fetchTotais()
  }, [page, limit, busca, sortBy, sortDir, filtro, lixeira, fetchTotais])

  useEffect(() => { fetchData() }, [fetchData, refreshKey])
  // Alerta de procuração vem do cadastro do cliente mensal.
  useEffect(() => { carregarClientes().then(setClientes).catch(() => {}) }, [])

  const alertaProcuracao = (doc: string) => clientes.find(c => limparCnpj(c.documento) === limparCnpj(doc))?.alertaProcuracao

  function ordenar(col: string) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
    setPage(1)
  }

  async function reconsultar(r: CndRecord) {
    const ok = await alerts.confirm({ title: 'Reconsultar CND', text: `Forçar nova consulta para ${r.razaoSocial || formatDoc(r.documento)}? Isso ignora o cache de 24h.`, confirmText: 'Reconsultar', icon: 'question' })
    if (!ok) return
    try {
      const res = interpretar(await trpc.cnd.consultar.mutate({ documento: r.documento, tipoDocumento: r.tipoDocumento, clienteId: r.clienteId || undefined, forcarNova: true }) as ResultadoFederal)
      if (res.aviso) alerts.warning('Nova consulta falhou', res.aviso)
      else if (res.sucesso) alerts.success('CND atualizada', res.mensagem)
      else alerts.warning('Certidão não emitida', res.mensagem)
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function baixarPdf(id: string) {
    const a = document.createElement('a'); a.href = `${getApiUrl()}/api/cnd/${id}/download-pdf`; a.download = ''; a.click()
  }

  async function excluir(id: string) {
    if (!await alerts.confirmDelete()) return
    try { await trpc.cnd.delete.mutate({ id }); fetchData() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function restaurar(id: string) {
    try { await trpc.cnd.restore.mutate({ id }); alerts.success('Restaurado'); fetchData() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluirSelecionados() {
    const ids = Array.from(sel)
    if (ids.length === 0) return
    if (!await alerts.confirmDelete(`${ids.length} certidão(ões) selecionada(s)`)) return
    try {
      for (const id of ids) await trpc.cnd.hardDelete.mutate({ id })
      alerts.success('Excluído', `${ids.length} registro(s) removido(s)`); fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Indicadores ativo={lixeira ? '__lixeira__' : filtro}
        onChange={k => {
          if (k === '__lixeira__') { setLixeira(l => !l); setFiltro('') }
          else { setLixeira(false); setFiltro(k === filtro ? '' : k) }
          setPage(1)
        }}
        itens={[
          { key: '', label: 'Todas', count: totais.total, cor: STATUS_COR.modulo, icon: FileOutput },
          { key: 'Negativa', label: 'Negativas', count: totais.negativas, cor: STATUS_COR.emerald, icon: CheckCircle2 },
          { key: 'Positiva com Efeitos de Negativa', label: 'Positivas c/ efeito', count: totais.positivasEfeitos, cor: STATUS_COR.amber, icon: AlertTriangle },
          { key: '__nao_emitida__', label: 'Não emitidas', count: totais.naoEmitidas, cor: STATUS_COR.red, icon: XCircle },
          { key: '__vencendo__', label: 'Vencendo', count: totais.vencendo, cor: STATUS_COR.amber, icon: Clock },
          { key: '__vencidas__', label: 'Vencidas', count: totais.vencidas, cor: STATUS_COR.red, icon: XCircle },
          { key: '__lixeira__', label: 'Lixeira', count: totais.lixeira, cor: STATUS_COR.slate, icon: Trash2 },
        ]} />

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ListToolbar limit={limit} setLimit={n => { setLimit(n); setPage(1) }} search={search} setSearch={v => { setSearch(v); setPage(1) }}
          acoes={<>
            {sel.size > 0 && <Button size="sm" variant="destructive" className="gap-1.5" onClick={excluirSelecionados}><Trash2 className="h-3.5 w-3.5" />Excluir ({sel.size})</Button>}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAgendaOpen(true)}><CalendarClock className="h-3.5 w-3.5" />Agendamento</Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setLoteOpen(true)}><Play className="h-3.5 w-3.5" />Lote</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setForcarNova(false); setConsultaOpen(true) }}><Search className="h-3.5 w-3.5" />Consultar</Button>
          </>} />

        <div className="nice-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={data.length > 0 && sel.size === data.length} onCheckedChange={c => setSel(c ? new Set(data.map(r => r.id)) : new Set())} className="h-3.5 w-3.5" />
                </TableHead>
                <TableHead><SortHead col="razaoSocial" label="Cliente" sortBy={sortBy} sortDir={sortDir} onSort={ordenar} /></TableHead>
                <TableHead className="hidden md:table-cell"><SortHead col="documento" label="Documento" sortBy={sortBy} sortDir={sortDir} onSort={ordenar} /></TableHead>
                <TableHead><SortHead col="tipoCertidao" label="Situação" sortBy={sortBy} sortDir={sortDir} onSort={ordenar} /></TableHead>
                <TableHead className="hidden lg:table-cell">Emissão</TableHead>
                <TableHead className="hidden sm:table-cell"><SortHead col="dataValidade" label="Validade" sortBy={sortBy} sortDir={sortDir} onSort={ordenar} /></TableHead>
                <TableHead className="w-10 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || data.length === 0 ? (
                <LinhaEstado colSpan={7} loading={loading} icon={FileOutput} vazio={lixeira ? 'Nenhum registro na lixeira' : filtro ? 'Nenhum resultado para este filtro' : 'Nenhuma certidão encontrada'} />
              ) : data.map(r => (
                <TableRow key={r.id} className={cn('hover:bg-muted/30', r.temPdf && 'cursor-pointer', sel.has(r.id) && 'bg-muted/40')}
                  onClick={() => r.temPdf && setVisualizar({ record: r, aba: 'cnd' })}>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Checkbox checked={sel.has(r.id)} onCheckedChange={c => setSel(prev => toggleSet(prev, r.id, !!c))} className="h-3.5 w-3.5" />
                  </TableCell>
                  <TableCell className="max-w-[340px]">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-medium" title={r.razaoSocial || ''}>{r.razaoSocial || '—'}</p>
                      {alertaProcuracao(r.documento) && (
                        <span title="Possível falta de procuração no e-CAC" className={cn('shrink-0', TEXT.amber)}><AlertTriangle className="h-3.5 w-3.5" /></span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground md:table-cell">{formatDoc(r.documento)}</TableCell>
                  <TableCell className="max-w-[240px]">
                    {r.sucesso || r.etapa === 'concluido' ? (
                      <SituacaoBadge sucesso={r.sucesso} tipo={r.sucesso ? r.tipoCertidao : null} falha={r.mensagemApi || r.erro || 'Certidão não emitida'} title={r.mensagemApi || r.erro || undefined} />
                    ) : r.etapa === 'erro' ? (
                      <StatusBadge tone="red" icon={XCircle} title={r.erro || ''}>{r.erro || 'Erro na consulta'}</StatusBadge>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />{r.etapa === 'consultando' ? 'Consultando...' : r.etapa === 'autenticando' ? 'Autenticando...' : r.etapa}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">{formatDate(r.dataEmissao)}</TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell"><ValidadeBadge data={r.dataValidade ? r.dataValidade.slice(0, 10) : null} /></TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {r.temPdf && (<>
                          <DropdownMenuItem onClick={() => setVisualizar({ record: r, aba: 'cnd' })} className="gap-2 text-xs"><Eye className="h-3.5 w-3.5" />Visualizar certidão</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => baixarPdf(r.id)} className="gap-2 text-xs"><Download className="h-3.5 w-3.5" />Baixar PDF</DropdownMenuItem>
                        </>)}
                        {!r.temPdf && r.etapa === 'concluido' && !r.sucesso && (
                          <DropdownMenuItem onClick={() => setVisualizar({ record: r, aba: 'sitfis' })} className="gap-2 text-xs"><Shield className="h-3.5 w-3.5" />Ver situação fiscal</DropdownMenuItem>
                        )}
                        {!lixeira && <DropdownMenuItem onClick={() => reconsultar(r)} className="gap-2 text-xs"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>}
                        <DropdownMenuSeparator />
                        {lixeira
                          ? <DropdownMenuItem onClick={() => restaurar(r.id)} className="gap-2 text-xs"><RotateCcw className="h-3.5 w-3.5" />Restaurar</DropdownMenuItem>
                          : <DropdownMenuItem onClick={() => excluir(r.id)} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>}
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

      <ConsultaDialog open={consultaOpen} onOpenChange={setConsultaOpen}
        titulo="CND Federal — Nova consulta" descricao="Certidão negativa de débitos federais (PGFN/RFB)" icon={Search}
        carregarClientes={carregarClientes}
        consultar={async ({ documento, clienteId }) => interpretar(await trpc.cnd.consultar.mutate({
          documento, tipoDocumento: documento.length === 11 ? 2 : 1, clienteId, forcarNova,
        }) as ResultadoFederal)}
        onConcluido={fetchData}
        extra={(
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={forcarNova} onCheckedChange={v => setForcarNova(!!v)} />Forçar nova consulta (ignorar cache de 24h)
          </label>
        )} />

      <FederalLoteDialog open={loteOpen} onOpenChange={setLoteOpen} onConcluido={fetchData} />
      <AgendamentoDialog open={agendaOpen} onOpenChange={setAgendaOpen} onConcluido={fetchData} />
      <FederalPdfDialog record={visualizar?.record ?? null} abaInicial={visualizar?.aba ?? 'cnd'} onClose={() => setVisualizar(null)} />
    </div>
  )
}
