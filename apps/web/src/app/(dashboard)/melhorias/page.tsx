'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Plus, TrendingUp, Trash2, Pencil, Loader2, Check, X, ShoppingCart, ExternalLink,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { MELHORIA_STATUS_LABEL, STATUS_COMPRA_LABELS } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

const STATUS_COLORS: Record<string, string> = {
  REGISTRADA: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  IMPLEMENTADA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  CANCELADA: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
}

interface Row {
  id: string; legacyId: number | null; titulo: string; descricao: string | null
  status: string; previstaPara: string | null; implementadaEm: string | null
  area: { id: string; name: string } | null
}
interface CompraMel {
  id: string; code: number; status: string; melhoriaObs: string | null
  createdAt: string; setor: string | null
  fornecedor: { razaoSocial: string } | null
}
interface Opcao { id: string; name: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/**
 * Melhorias da Qualidade — página única, do tamanho do módulo: registro em
 * modal (título, descrição, área, data prevista) e, abaixo, as melhorias que
 * chegaram pelas aquisições (`Compra.melhoria`), como o índice do v1 somava.
 */
export default function MelhoriasPage() {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'melhorias')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [data, setData] = useState<{ data: Row[]; total: number } | null>(null)
  const [compras, setCompras] = useState<CompraMel[]>([])
  const [areas, setAreas] = useState<Opcao[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

  // Modal criar/editar
  const [aberta, setAberta] = useState(false)
  const [editando, setEditando] = useState<Row | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [areaId, setAreaId] = useState('')
  const [prevista, setPrevista] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [detalhe, setDetalhe] = useState<Row | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.melhoria as any).listar.query({ page: 1, limit: 100, status: status || undefined })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [status])
  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    ;(trpc.melhoria as any).listarComprasMelhoria.query().then(setCompras).catch(() => setCompras([]))
    ;(trpc.melhoria as any).listarAreas.query().then(setAreas).catch(() => setAreas([]))
  }, [])

  function abrirNova() {
    setEditando(null); setTitulo(''); setDescricao(''); setAreaId(''); setPrevista('')
    setAberta(true)
  }
  function abrirEdicao(m: Row) {
    setEditando(m); setTitulo(m.titulo); setDescricao(m.descricao ?? '')
    setAreaId(m.area?.id ?? ''); setPrevista(m.previstaPara ? m.previstaPara.slice(0, 10) : '')
    setAberta(true)
  }

  async function salvar() {
    if (titulo.trim().length < 3) { alerts.error('Falta o título', 'Dê um título à melhoria.'); return }
    setSalvando(true)
    try {
      const payload = {
        titulo: titulo.trim(),
        descricao: descricao || null,
        areaId: areaId || null,
        previstaPara: prevista || null,
      }
      if (editando) await (trpc.melhoria as any).atualizar.mutate({ id: editando.id, ...payload })
      else await (trpc.melhoria as any).criar.mutate(payload)
      alerts.success('Salvo', editando ? 'Melhoria atualizada.' : 'Melhoria registrada.')
      setAberta(false); fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function mudarStatus(m: Row, novo: string) {
    try {
      await (trpc.melhoria as any).atualizar.mutate({ id: m.id, status: novo })
      alerts.success('Pronto', novo === 'IMPLEMENTADA' ? 'Marcada como implementada.' : 'Situação alterada.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluir(m: Row) {
    const ok = await alerts.confirm({ title: `Excluir "${m.titulo}"?`, text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.melhoria as any).excluir.mutate({ id: m.id })
      alerts.success('Excluída', 'Melhoria removida.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <h1>Melhorias</h1>
            <p className="text-sm text-muted-foreground">Oportunidades de melhoria registradas e as que chegaram pelas aquisições</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {podeEscrever && (
            <Button variant="success" size="sm" onClick={abrirNova}><Plus className="h-4 w-4" />Nova Melhoria</Button>
          )}
        </div>
      </div>

      {/* ── Melhorias registradas ── */}
      <Card>
        <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <h4 className="text-[13px] font-semibold">Registradas</h4>
          <Select value={status || '__all__'} onValueChange={(v) => setStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as situações</SelectItem>
              {Object.entries(MELHORIA_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Nº</TableHead>
              <TableHead>Melhoria</TableHead>
              <TableHead className="hidden md:table-cell w-[180px]">Área de aplicação</TableHead>
              <TableHead className="hidden sm:table-cell w-[120px]">Prevista para</TableHead>
              <TableHead className="w-[140px]">Situação</TableHead>
              <TableHead className="w-[130px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Nenhuma melhoria registrada.</TableCell></TableRow>
            ) : data.data.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => setDetalhe(m)}>
                <TableCell className="text-xs text-muted-foreground tabular-nums">{m.legacyId ?? '—'}</TableCell>
                <TableCell className="font-medium text-sm"><span className="block truncate" title={m.titulo}>{m.titulo}</span></TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{m.area?.name ?? '—'}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(m.previstaPara)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[m.status])}>
                    {MELHORIA_STATUS_LABEL[m.status as keyof typeof MELHORIA_STATUS_LABEL] ?? m.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                    {podeEscrever && m.status === 'REGISTRADA' && (
                      <Button variant="success" size="xs" title="Marcar como implementada" onClick={() => mudarStatus(m, 'IMPLEMENTADA')}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {podeEscrever && (
                      <Button variant="soft-info" size="icon-sm" title="Editar" onClick={() => abrirEdicao(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {podeExcluir && (
                      <Button variant="soft-destructive" size="icon-sm" title="Excluir" onClick={() => excluir(m)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Vindas das aquisições ── */}
      <Card>
        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/20 px-4 py-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-[13px] font-semibold">Vindas das aquisições</h4>
          <span className="text-[11px] text-muted-foreground">— pedidos marcados como melhoria na avaliação</span>
        </div>
        {compras.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum pedido marcado como melhoria.</p>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">Pedido</TableHead>
                <TableHead>Fornecedor / observação</TableHead>
                <TableHead className="hidden md:table-cell w-[150px]">Setor</TableHead>
                <TableHead className="hidden sm:table-cell w-[110px]">Data</TableHead>
                <TableHead className="w-[60px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm tabular-nums">#{c.code}</TableCell>
                  <TableCell className="text-sm">
                    <span className="block truncate font-medium">{c.fornecedor?.razaoSocial ?? '—'}</span>
                    {c.melhoriaObs && <span className="text-[11px] text-muted-foreground truncate block" title={c.melhoriaObs}>{c.melhoriaObs}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{c.setor ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(c.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="soft" size="icon-sm" asChild title={`Abrir o pedido (${STATUS_COMPRA_LABELS[c.status] ?? c.status})`}>
                      <Link href={`/aquisicoes/${c.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* ── Modal criar/editar ── */}
      <Dialog open={aberta} onOpenChange={(o) => { if (!salvando) setAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={TrendingUp} color={editando ? 'sky' : 'emerald'}>
            <DialogTitle>{editando ? 'Editar melhoria' : 'Nova melhoria'}</DialogTitle>
            <DialogDescription>Oportunidade de melhoria: o quê, onde se aplica e para quando.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="h-9 text-sm mt-1.5" />
            </div>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Área de aplicação</Label>
                <Select value={areaId || '__none__'} onValueChange={(v) => setAreaId(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem área" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem área</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Prevista para</Label>
                <Input type="date" value={prevista} onChange={(e) => setPrevista(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <div className="mt-1.5"><RichEditor value={descricao} onChange={setDescricao} placeholder="O que melhorar e por quê..." /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)} disabled={salvando}><X className="h-4 w-4" />Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando || titulo.trim().length < 3}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal de leitura ── */}
      <Dialog open={!!detalhe} onOpenChange={(o) => { if (!o) setDetalhe(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={TrendingUp} color="violet">
            <DialogTitle>{detalhe?.titulo}</DialogTitle>
            <DialogDescription>
              {[detalhe?.area?.name, detalhe?.previstaPara ? `prevista para ${dataBR(detalhe.previstaPara)}` : null,
                detalhe?.implementadaEm ? `implementada em ${dataBR(detalhe.implementadaEm)}` : null]
                .filter(Boolean).join(' · ') || 'Sem área ou data definida'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {detalhe?.descricao
              ? <RichContent className="text-sm [&_p]:my-1 [&_ul]:my-1" html={detalhe.descricao} />
              : <p className="text-sm text-muted-foreground">Sem descrição.</p>}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
