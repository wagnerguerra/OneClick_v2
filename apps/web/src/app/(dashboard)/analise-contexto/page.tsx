'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Loader2, Check,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { TEXT } from '@/lib/color-styles'
import {
  ANALISE_CONTEXTO_ANALISE_LABEL, ANALISE_CONTEXTO_TIPO_LABEL, TIPOS_POR_ANALISE,
} from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { ANALISE_BADGE, TIPO_BADGE, riscoClasse, dataBR } from './shared'

const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string
  legacyId: number | null
  analise: string
  tipo: string
  identificacao: string
  processo: string | null
  prazo: string | null
  grauRisco: number | null
  responsavelNomeResolvido: string | null
  acoesAbertas: number
  acoesTotal: number
  avaliado: boolean
  eficaz: boolean | null
}
interface Usuario { id: string; name: string }

/**
 * Análise de Contexto (SWOT da ISO 9001 §4.1) — port do sgq_contexto do v1.
 * Listagem + cadastro em modal; plano de ação e avaliação moram no detalhe.
 */
export default function AnaliseContextoPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'analise-contexto')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fAnalise, setFAnalise] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fSituacao, setFSituacao] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Modal de cadastro
  const [aberta, setAberta] = useState(false)
  const [mAnalise, setMAnalise] = useState('')
  const [mTipo, setMTipo] = useState('')
  const [mIdentificacao, setMIdentificacao] = useState('')
  const [mProcesso, setMProcesso] = useState('')
  const [mParte, setMParte] = useState('')
  const [mGravidade, setMGravidade] = useState('')
  const [mProbabilidade, setMProbabilidade] = useState('')
  const [mResponsavel, setMResponsavel] = useState('')
  const [mPrazo, setMPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.analiseContexto as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.analiseContexto as any).listar.query({
        page, limit,
        search: debounced || undefined,
        analise: fAnalise || undefined,
        tipo: fTipo || undefined,
        situacao: fSituacao || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, fAnalise, fTipo, fSituacao])
  useEffect(() => { fetchData() }, [fetchData])

  function abrirCadastro() {
    setMAnalise(''); setMTipo(''); setMIdentificacao(''); setMProcesso(''); setMParte('')
    setMGravidade(''); setMProbabilidade(''); setMResponsavel(''); setMPrazo('')
    setAberta(true)
  }

  async function salvar() {
    if (!mAnalise || !mTipo) { alerts.error('Faltou classificar', 'Escolha a análise e o tipo.'); return }
    if (mIdentificacao.trim().length < 3) { alerts.error('Falta a identificação', 'Descreva o item da análise.'); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.analiseContexto as any).criar.mutate({
        analise: mAnalise, tipo: mTipo,
        identificacao: mIdentificacao,
        processo: mProcesso || null,
        parteInteressada: mParte || null,
        gravidade: mGravidade ? Number(mGravidade) : null,
        probabilidade: mProbabilidade ? Number(mProbabilidade) : null,
        responsavelId: mResponsavel || null,
        prazo: mPrazo || null,
      })
      alerts.success('Cadastrado', 'Registro criado.')
      setAberta(false)
      router.push(`/analise-contexto/${id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function handleDelete(r: Row) {
    const ok = await alerts.confirm({
      title: `Excluir "${r.identificacao}"?`,
      text: 'O registro sai das listagens (as ações vão junto).',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.analiseContexto as any).excluir.mutate({ id: r.id })
      alerts.success('Excluído', '')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const filtrosAtivos = [fAnalise, fTipo, fSituacao].filter(Boolean).length
  const tiposDoModal = mAnalise ? TIPOS_POR_ANALISE[mAnalise] ?? [] : []

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeEscrever && (
            <Button variant="success" size="sm" onClick={abrirCadastro}>
              <Plus className="h-4 w-4" />Novo Registro
            </Button>
          )}
      </>}>
        <h1 className="truncate">Análise de Contexto</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Análise de Contexto</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fAnalise || '__all__'} onValueChange={(v) => { setFAnalise(v === '__all__' ? '' : v); setFTipo(''); setPage(1) }}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Análise" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Externa e Interna</SelectItem>
                <SelectItem value="EXTERNA">Análise Externa</SelectItem>
                <SelectItem value="INTERNA">Análise Interna</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fTipo || '__all__'} onValueChange={(v) => { setFTipo(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {(fAnalise ? TIPOS_POR_ANALISE[fAnalise] ?? [] : Object.keys(ANALISE_CONTEXTO_TIPO_LABEL)).map((t) => (
                  <SelectItem key={t} value={t}>{ANALISE_CONTEXTO_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fSituacao || '__all__'} onValueChange={(v) => { setFSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="PENDENTE">Sem avaliação</SelectItem>
                <SelectItem value="AVALIADO">Avaliados</SelectItem>
              </SelectContent>
            </Select>
            {filtrosAtivos > 0 && (
              <Button variant="outline" size="xs" onClick={() => { setFAnalise(''); setFTipo(''); setFSituacao(''); setPage(1) }}>
                Limpar ({filtrosAtivos})
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por identificação ou processo..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Nº</TableHead>
              <TableHead>Identificação</TableHead>
              <TableHead className="hidden md:table-cell w-[120px]">Análise</TableHead>
              <TableHead className="w-[120px]">Tipo</TableHead>
              <TableHead className="w-[70px] text-center">Risco</TableHead>
              <TableHead className="hidden lg:table-cell w-[160px]">Responsável</TableHead>
              <TableHead className="hidden sm:table-cell w-[100px]">Prazo</TableHead>
              <TableHead className="w-[110px] text-center">Ações do plano</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/analise-contexto/${r.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{r.legacyId ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">
                    <span className="block truncate" title={r.identificacao}>{r.identificacao}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {r.processo ?? ''}{r.avaliado && (r.processo ? ' · ' : '')}{r.avaliado && (
                        <span className={r.eficaz ? TEXT.emerald : TEXT.rose}>
                          {r.eficaz ? 'Avaliado: eficaz' : 'Avaliado: não eficaz'}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className={cn('text-[10px]', ANALISE_BADGE[r.analise])}>
                      {ANALISE_CONTEXTO_ANALISE_LABEL[r.analise] ?? r.analise}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', TIPO_BADGE[r.tipo])}>
                      {ANALISE_CONTEXTO_TIPO_LABEL[r.tipo] ?? r.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn('inline-flex h-6 min-w-[24px] items-center justify-center rounded px-1.5 text-xs font-bold tabular-nums', riscoClasse(r.grauRisco))}
                      title="Gravidade/benefício × probabilidade">
                      {r.grauRisco ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{r.responsavelNomeResolvido ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(r.prazo)}</TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {r.acoesTotal === 0 ? '—' : (
                      <span className={r.acoesAbertas > 0 ? cn(TEXT.amber, 'font-medium') : TEXT.emerald}>
                        {r.acoesTotal - r.acoesAbertas}/{r.acoesTotal}
                        {r.acoesAbertas === 0 && <Check className="inline h-3 w-3 ml-0.5 -mt-0.5" />}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/analise-contexto/${r.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(r)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>)}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Modal: novo registro ── */}
      <Dialog open={aberta} onOpenChange={(o) => { if (!salvando) setAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo registro de contexto</DialogTitle>
            <DialogDescription>
              Classifique o item na SWOT, estime o risco e indique o responsável. O plano de ação entra no detalhe.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Análise <span className="text-rose-500">*</span></Label>
                <Select value={mAnalise || '__none__'} onValueChange={(v) => { setMAnalise(v === '__none__' ? '' : v); setMTipo('') }}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    <SelectItem value="EXTERNA">Análise Externa</SelectItem>
                    <SelectItem value="INTERNA">Análise Interna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Tipo <span className="text-rose-500">*</span></Label>
                <Select value={mTipo || '__none__'} onValueChange={(v) => setMTipo(v === '__none__' ? '' : v)} disabled={!mAnalise}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder={mAnalise ? 'Selecione' : 'Escolha a análise antes'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Selecione...</SelectItem>
                    {tiposDoModal.map((t) => <SelectItem key={t} value={t}>{ANALISE_CONTEXTO_TIPO_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Identificação <span className="text-rose-500">*</span></Label>
                <Input value={mIdentificacao} onChange={(e) => setMIdentificacao(e.target.value)}
                  placeholder="Ex.: Desenvolvimento de novos produtos" className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Processo</Label>
                <Input value={mProcesso} onChange={(e) => setMProcesso(e.target.value)}
                  placeholder="Ex.: Estratégico, Fiscal, Trabalhista..." className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Gravidade/benefício</Label>
                <Select value={mGravidade || '__none__'} onValueChange={(v) => setMGravidade(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="1">1 - Baixo</SelectItem>
                    <SelectItem value="2">2 - Médio</SelectItem>
                    <SelectItem value="3">3 - Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Probabilidade</Label>
                <Select value={mProbabilidade || '__none__'} onValueChange={(v) => setMProbabilidade(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    <SelectItem value="1">1 - Baixa</SelectItem>
                    <SelectItem value="2">2 - Média</SelectItem>
                    <SelectItem value="3">3 - Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Responsável</Label>
                <Select value={mResponsavel || '__none__'} onValueChange={(v) => setMResponsavel(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Prazo</Label>
                <Input type="date" value={mPrazo} onChange={(e) => setMPrazo(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Partes interessadas</Label>
                <div className="mt-1.5">
                  <RichEditor value={mParte} onChange={setMParte} placeholder="Clientes, colaboradores, fornecedores..." />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
