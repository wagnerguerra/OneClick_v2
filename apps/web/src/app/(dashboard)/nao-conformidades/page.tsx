'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, AlertTriangle, Trash2, Pencil, Loader2, Settings, RotateCcw,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { NC_SITUACAO_LABEL, NC_SITUACOES } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { MODULE_COLOR, NC_SITUACAO_BADGE, dataBR } from './shared'

const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string
  legacyId: number | null
  situacao: string
  detalhamento: string
  registradoEm: string
  prazo: string | null
  reincidencia: boolean
  temReincidencias: boolean
  clienteNomeResolvido: string | null
  areaNomeResolvida: string | null
  responsavelNomeResolvido: string | null
  origem: { id: string; nome: string } | null
  acoesAbertas: number
  acoesTotal: number
  eficaz: boolean | null
}
interface Opcao { id: string; nome?: string; name?: string }

const semTags = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Não Conformidades — port do sgq_rnc do v1. O fluxo (causa → ações →
 * avaliação, com reincidência automática) mora no detalhe; aqui é a visão
 * geral com filtros.
 */
export default function NaoConformidadesPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'nao-conformidades')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fSituacao, setFSituacao] = useState('')
  const [fOrigem, setFOrigem] = useState('')
  const [fArea, setFArea] = useState('')
  const [fReincidencia, setFReincidencia] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [origens, setOrigens] = useState<Opcao[]>([])
  const [areas, setAreas] = useState<Opcao[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.naoConformidade as any).listarOrigens.query().then(setOrigens).catch(() => setOrigens([]))
    ;(trpc.naoConformidade as any).listarAreas.query().then(setAreas).catch(() => setAreas([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.naoConformidade as any).listar.query({
        page, limit,
        search: debounced || undefined,
        situacao: fSituacao || undefined,
        origemId: fOrigem || undefined,
        areaId: fArea || undefined,
        reincidencia: fReincidencia === '' ? undefined : fReincidencia === 'sim',
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, fSituacao, fOrigem, fArea, fReincidencia])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(r: Row) {
    const ok = await alerts.confirm({
      title: `Excluir a NC ${r.legacyId ? `#${r.legacyId}` : ''}?`,
      text: 'O registro sai das listagens (ações, mensagens e histórico vão junto).',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.naoConformidade as any).excluir.mutate({ id: r.id })
      alerts.success('Excluída', '')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const filtrosAtivos = [fSituacao, fOrigem, fArea, fReincidencia].filter(Boolean).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h1>Não Conformidades</h1>
            <p className="text-sm text-muted-foreground">Registro e tratamento das não conformidades: causa, plano de ação e avaliação de eficácia</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {podeEscrever && (
            <Button variant="success" size="sm" asChild>
              <Link href="/nao-conformidades/new"><Plus className="h-4 w-4" />Nova NC</Link>
            </Button>
          )}
          {podeEscrever && (
            <Button variant="outline" size="icon-sm" asChild title="Origens">
              <Link href="/nao-conformidades/configuracoes"><Settings className="h-4 w-4" /></Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fSituacao || '__all__'} onValueChange={(v) => { setFSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[170px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {NC_SITUACOES.map((s) => <SelectItem key={s} value={s}>{NC_SITUACAO_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fOrigem || '__all__'} onValueChange={(v) => { setFOrigem(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as origens</SelectItem>
                {origens.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fArea || '__all__'} onValueChange={(v) => { setFArea(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[150px] text-xs bg-card"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as áreas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fReincidencia || '__all__'} onValueChange={(v) => { setFReincidencia(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue placeholder="Reincidência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Reincidência: todas</SelectItem>
                <SelectItem value="sim">Só reincidências</SelectItem>
                <SelectItem value="nao">Sem reincidência</SelectItem>
              </SelectContent>
            </Select>
            {filtrosAtivos > 0 && (
              <Button variant="outline" size="xs" onClick={() => { setFSituacao(''); setFOrigem(''); setFArea(''); setFReincidencia(''); setPage(1) }}>
                Limpar ({filtrosAtivos})
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por fato gerador ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[55px]">Nº</TableHead>
              <TableHead>Não conformidade</TableHead>
              <TableHead className="hidden lg:table-cell w-[170px]">Cliente</TableHead>
              <TableHead className="hidden md:table-cell w-[120px]">Área</TableHead>
              <TableHead className="w-[150px]">Situação</TableHead>
              <TableHead className="hidden sm:table-cell w-[95px]">Registro</TableHead>
              <TableHead className="hidden sm:table-cell w-[95px]">Prazo</TableHead>
              <TableHead className="w-[85px] text-center">Ações plano</TableHead>
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
                Nenhuma não conformidade encontrada.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/nao-conformidades/${r.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{r.legacyId ?? '—'}</TableCell>
                  <TableCell className="text-sm">
                    <span className="block truncate font-medium" title={semTags(r.detalhamento)}>{semTags(r.detalhamento)}</span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                      {r.origem?.nome && <span>{r.origem.nome}</span>}
                      {r.reincidencia && (
                        <span className={cn('inline-flex items-center gap-0.5 font-medium', TEXT.amber)}>
                          <RotateCcw className="h-3 w-3" />Reincidência
                        </span>
                      )}
                      {r.eficaz === false && <span className={TEXT.rose}>Não eficaz</span>}
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{r.clienteNomeResolvido ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{r.areaNomeResolvida ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', NC_SITUACAO_BADGE[r.situacao])}>
                      {NC_SITUACAO_LABEL[r.situacao] ?? r.situacao}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(r.registradoEm)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(r.prazo)}</TableCell>
                  <TableCell className="text-center text-xs tabular-nums">
                    {r.acoesTotal === 0 ? '—' : (
                      <span className={r.acoesAbertas > 0 ? cn('font-medium', TEXT.amber) : TEXT.emerald}>
                        {r.acoesTotal - r.acoesAbertas}/{r.acoesTotal}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/nao-conformidades/${r.id}`)} title="Abrir">
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
    </div>
  )
}
