'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Search, Copy, Check, EyeOff, MessageSquare, Paperclip,
  Building2, User as UserIcon, MoreVertical, Eye, Inbox, Settings,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import {
  Button, Card, Input, Label, Badge, cn,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BADGE, TEXT } from '@/lib/color-styles'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { ManifestacaoDetalhe } from './manifestacao-detalhe'
import { NovaManifestacaoModal } from './nova-manifestacao'
import type { Config, Linha } from './tipos'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'

/** Rótulo e cor de cada situação — os três tipos compartilham a paleta. */
export const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  RECEBIDA: { texto: 'Recebida', classe: BADGE.sky },
  RESPONDIDA: { texto: 'Respondida', classe: BADGE.violet },
  ENCERRADA: { texto: 'Encerrada', classe: BADGE.emerald },
  AGUARDANDO_RETORNO: { texto: 'Aguardando retorno', classe: BADGE.amber },
  AGUARDANDO_ANALISE: { texto: 'Aguardando análise', classe: BADGE.sky },
  REGISTRAR_EFICACIA: { texto: 'Registrar eficácia', classe: BADGE.indigo },
  NAO_PROCEDENTE: { texto: 'Não procedente', classe: BADGE.slate },
  FINALIZADA: { texto: 'Finalizada', classe: BADGE.emerald },
}

/**
 * A tela dos três módulos da Qualidade.
 *
 * Elogio, reclamação e sugestão têm a mesma mecânica — listar, registrar,
 * tratar — e diferem nos campos e no fluxo. Uma tela só, parametrizada pela
 * `config` de cada módulo, evita manter três cópias que divergiriam na primeira
 * correção feita em uma delas.
 */
export function ManifestacaoPage({ config }: { config: Config }) {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find(p => p.moduleSlug === config.slug)?.subPermissions ?? {}) as Record<string, boolean>
  const podeTratar = isMaster || subs.tratar === true
  const podeRegistrar = isMaster || subs.registrar === true || subs.tratar === true
  const podeConfigurar = isMaster || isEmpresaMaster || subs.configurar === true

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaAtrasada, setBuscaAtrasada] = useState('')
  const [status, setStatus] = useState('')
  const [origem, setOrigem] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sortBy, setSortBy] = useState<string>('criadoEm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [novoOpen, setNovoOpen] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  // Link das notificações: /reclamacoes?abrir=<id> já abre o registro.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('abrir')
    if (id) setAbertoId(id)
  }, [])
  const [protocoloNovo, setProtocoloNovo] = useState<string | null>(null)

  // Busca com respiro: uma consulta por tecla digitada castigaria o servidor
  // sem melhorar nada para quem procura.
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAtrasada(busca); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [busca])

  const api = (trpc as never as Record<string, any>)[config.router]

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.listar.query({
        page, limit, sortBy, sortDir,
        ...(buscaAtrasada ? { search: buscaAtrasada } : {}),
        ...(status ? { status } : {}),
        ...(origem ? { origem } : {}),
      })
      setLinhas(r?.data ?? [])
      setTotal(r?.total ?? 0)
    } catch {
      setLinhas([]); setTotal(0)
    } finally {
      setCarregando(false)
    }
  }, [api, page, limit, sortBy, sortDir, buscaAtrasada, status, origem])

  // Paginação — PADRAO_PAGINAS §1.4
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const startRecord = total ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)
  const paginas = (() => {
    let ini = Math.max(1, page - 2)
    const fim = Math.min(totalPages, ini + 4)
    ini = Math.max(1, fim - 4)
    return Array.from({ length: fim - ini + 1 }, (_, i) => ini + i)
  })()
  const ordenar = (campo: string) => {
    if (sortBy === campo) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortBy(campo); setSortDir(campo === 'criadoEm' ? 'desc' : 'asc') }
    setPage(1)
  }
  const copiarProtocolo = async (protocolo: string) => {
    try { await navigator.clipboard.writeText(protocolo); alerts.toast('Protocolo copiado') } catch { /* sem área de transferência */ }
  }

  useEffect(() => { void carregar() }, [carregar])

  const Th = ({ campo, children, className }: { campo?: string; children?: React.ReactNode; className?: string }) => (
    <TableHead className={cn('whitespace-nowrap text-xs font-semibold uppercase tracking-wider', className)}>
      {campo ? (
        <button type="button" onClick={() => ordenar(campo)} className="inline-flex items-center gap-1 uppercase hover:text-foreground">
          {children}
          {sortBy === campo
            ? (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
            : <ArrowUpDown className="h-3 w-3 opacity-40" />}
        </button>
      ) : children}
    </TableHead>
  )

  return (
    <div className="flex h-[calc(100vh-98px)] flex-col gap-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
          {podeRegistrar && (
            <Button size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4" /> {config.rotuloNovo}
            </Button>
          )}
          {podeConfigurar && (
            <Button variant="outline" size="icon-sm" asChild title="Configurações (quem recebe as notificações)">
              <Link href={`/${config.slug}/configuracoes`}><Settings className="h-4 w-4" /></Link>
            </Button>
          )}
      </>}>
        <h1 className="truncate">{config.titulo}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>{config.titulo}</span>
        </p>
      </PageHeaderBar>

      {/* Card da tabela — PADRAO_PAGINAS §1.3/§1.5: só os registros rolam */}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        <div className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[68px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50, 100].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <span className="hidden sm:inline">registros</span>
            <Select value={status || '__all__'} onValueChange={v => { setStatus(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[180px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {config.status.map(st => <SelectItem key={st} value={st}>{STATUS_LABEL[st]?.texto ?? st}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={origem || '__all__'} onValueChange={v => { setOrigem(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as origens</SelectItem>
                <SelectItem value="CLIENTE">De cliente</SelectItem>
                <SelectItem value="INTERNA">De dentro de casa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por texto, cliente ou protocolo..." className="h-8 pl-8 text-xs" />
          </div>
        </div>

        <div className="nice-scrollbar min-h-0 flex-1 overflow-y-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <Th campo="protocolo" className="w-[132px]">Protocolo</Th>
                <Th campo="criadoEm" className="w-[104px]">Registro</Th>
                <Th campo="status" className="w-[230px]">Situação</Th>
                <Th className="hidden w-[240px] md:table-cell">Quem registrou</Th>
                <Th campo="titulo">Assunto</Th>
                <Th className="hidden w-[150px] xl:table-cell">Área</Th>
                <Th className="w-[80px] text-right">Ações</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                </TableCell></TableRow>
              ) : linhas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  {buscaAtrasada || status || origem ? 'Nada encontrado com esses filtros.' : config.vazio}
                </TableCell></TableRow>
              ) : linhas.map(l => {
                const st = STATUS_LABEL[l.status] ?? { texto: l.status, classe: 'bg-muted' }
                const assunto = l.titulo || l.descricao.replace(/<[^>]*>/g, '').slice(0, 140)
                // Uma linha por registro (PADRAO_PAGINAS §1.3): tudo nowrap, e
                // o farol do prazo vai inline, ao lado da situação.
                return (
                  <TableRow key={l.id} className="cursor-pointer whitespace-nowrap hover:bg-muted/40" onClick={() => setAbertoId(l.id)}>
                    <TableCell className="font-mono text-[12px]">{l.protocolo}</TableCell>
                    <TableCell className="text-[12px] tabular-nums text-muted-foreground">
                      {new Date(l.criadoEm).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        <Badge variant="outline" className={cn('shrink-0 text-[10px]', st.classe)}>{st.texto}</Badge>
                        {/* Farol do prazo, como no v1: só enquanto o retorno ao
                            cliente está pendente. Depois disso vira ruído. */}
                        {config.temFluxo && l.prazoRetorno && l.status === 'AGUARDANDO_RETORNO' && (
                          <Farol prazo={l.prazoRetorno} />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden truncate text-[13px] md:table-cell">
                      {l.anonima ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <EyeOff className="h-3.5 w-3.5 shrink-0" /> Anônima
                        </span>
                      ) : l.origem === 'CLIENTE' ? (
                        <span className="inline-flex max-w-full items-center gap-1" title={l.cliente?.razaoSocial ?? l.informanteNome ?? ''}>
                          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{l.cliente?.razaoSocial ?? l.informanteNome ?? 'Cliente'}</span>
                        </span>
                      ) : (
                        <span className="inline-flex max-w-full items-center gap-1">
                          <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{l.autor?.name ?? '—'}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      <span className="flex min-w-0 items-center gap-2" title={assunto}>
                        <span className="truncate">{assunto}</span>
                        {l._count?.mensagens ? <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><MessageSquare className="h-3 w-3" />{l._count.mensagens}</span> : null}
                        {l._count?.arquivos ? <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Paperclip className="h-3 w-3" />{l._count.arquivos}</span> : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden truncate text-[12px] text-muted-foreground xl:table-cell">{l.area?.name ?? '—'}</TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Ações"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setAbertoId(l.id)}><Eye className="h-4 w-4" />Abrir</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => copiarProtocolo(l.protocolo)}><Copy className="h-4 w-4" />Copiar protocolo</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* Rodapé — PADRAO_PAGINAS §1.4 */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span> registros
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              {paginas.map(n => (
                <Button key={n} variant={n === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(n)}>{n}</Button>
              ))}
              <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>
      </Card>

      {novoOpen && (
        <NovaManifestacaoModal
          config={config}
          onClose={() => setNovoOpen(false)}
          onCriado={(protocolo) => { setNovoOpen(false); setProtocoloNovo(protocolo); void carregar() }}
        />
      )}

      {abertoId && (
        <ManifestacaoDetalhe
          config={config}
          id={abertoId}
          podeTratar={podeTratar}
          onClose={() => setAbertoId(null)}
          onMudou={() => void carregar()}
        />
      )}

      <ProtocoloEntregue protocolo={protocoloNovo} onClose={() => setProtocoloNovo(null)} />
    </div>
  )
}

/**
 * Farol do prazo de retorno.
 *
 * Vermelho quando já venceu, âmbar no dia ou no seguinte, verde no resto. O v1
 * fazia o mesmo — é o que faz alguém olhar a lista e saber onde agir primeiro,
 * sem comparar datas de cabeça.
 */
function Farol({ prazo }: { prazo: string }) {
  const dia = 24 * 60 * 60 * 1000
  const so = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const faltam = Math.round((so(new Date(prazo)) - so(new Date())) / dia)

  const cor = faltam < 0
    ? BADGE.rose
    : faltam <= 1
      ? BADGE.amber
      : BADGE.emerald

  const texto = faltam < 0
    ? `venceu há ${Math.abs(faltam)}d`
    : faltam === 0 ? 'vence hoje' : `faltam ${faltam}d`

  return (
    <span className={cn('inline-block w-fit shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold', cor)}>
      {texto}
    </span>
  )
}

/**
 * O protocolo, entregue depois de registrar.
 *
 * Numa manifestação anônima este código é o ÚNICO caminho de volta — não há
 * autor guardado, então não há "minhas manifestações" nem e-mail de aviso.
 * Por isso ele aparece grande, com botão de copiar, e a tela avisa que sem ele
 * não há como acompanhar.
 */
function ProtocoloEntregue({ protocolo, onClose }: { protocolo: string | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!protocolo) return
    try {
      await navigator.clipboard.writeText(protocolo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem área de transferência — o código está à vista para copiar à mão */ }
  }

  return (
    <Dialog open={!!protocolo} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeaderIcon icon={Check} color="emerald">
          <DialogTitle>Registrado</DialogTitle>
          <DialogDescription>Guarde o protocolo para acompanhar.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3 text-center">
          <p className="select-all font-mono text-2xl font-bold tracking-wider">{protocolo}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copiar}>
            {copiado ? <Check className={cn('h-3.5 w-3.5', TEXT.emerald)} /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar código'}
          </Button>
          <p className="text-[12px] text-muted-foreground">
            Se você registrou sem se identificar, este código é a única forma de acompanhar a
            resposta — não há como recuperá-lo depois.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="success" size="sm" onClick={onClose}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { Label, RichEditor, alerts }
