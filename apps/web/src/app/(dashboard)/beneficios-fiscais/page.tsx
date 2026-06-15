'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Percent, Loader2, Plus, MoreVertical, Edit2, Trash2, FileText, Settings2,
  CheckCircle2, Clock, AlertTriangle, MinusCircle, Receipt, ExternalLink, X,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label, cn, Checkbox, Textarea,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Switch,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeader } from '@/components/page-header'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useTabLabel } from '@/hooks/use-tab-label'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'
import { useBeneficioFiscalPerms } from '@/hooks/use-beneficio-fiscal'

const MODULE_COLOR = 'var(--mod-legalizacao, #e879f9)'

type Status = 'NO_PRAZO' | 'VENCENDO' | 'VENCIDO' | 'SEM_DATA'

interface Vinculo {
  id: string
  clienteId: string
  catalogoId: string
  orcamentoId: string | null
  dataVencimento: string | null
  portaria: string | null
  processo: string | null
  obs: string | null
  ativo: boolean
  clienteNome: string
  clienteDocumento: string | null
  beneficioNome: string
  orcamentoNumero: number | null
  orcamentoStatus: string | null
  status: Status
}
interface CatalogoItem {
  id: string; nome: string; servicoId: string | null; notificaVencimentoDias: number | null
  obs: string | null; ativo: boolean; servicoNome: string | null; servicoValor: number | null; emUso: number
}
interface ClienteOpt { id: string; razaoSocial: string; documento: string | null }
interface ServicoOpt { id: string; nome: string; valorPadrao: number | null; categoria: string | null }

const STATUS_CFG: Record<Status, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  NO_PRAZO: { label: 'No prazo', color: '#16a34a', bg: '#16a34a18', icon: CheckCircle2 },
  VENCENDO: { label: 'Vencendo', color: '#d97706', bg: '#d9770618', icon: Clock },
  VENCIDO: { label: 'Vencido', color: '#dc2626', bg: '#dc262618', icon: AlertTriangle },
  SEM_DATA: { label: 'Sem data', color: '#6b7280', bg: '#6b728018', icon: MinusCircle },
}

function toDateInput(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10)
}
function fmtDateBR(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

const trpcBF = () => (trpc as any).beneficioFiscal

export default function BeneficiosFiscaisPage() {
  useTabLabel('Benefícios Fiscais')
  const { canWrite, canManageCatalogo, canGerarOrcamento, canDelete } = useBeneficioFiscalPerms()

  const [loading, setLoading] = useState(true)
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [dash, setDash] = useState({ NO_PRAZO: 0, VENCENDO: 0, VENCIDO: 0, SEM_DATA: 0, TOTAL: 0 })
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])
  const [servicos, setServicos] = useState<ServicoOpt[]>([])

  const [filtroStatus, setFiltroStatus] = useState<Status | null>(null)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [orcando, setOrcando] = useState(false)

  // Modais
  const [vincModal, setVincModal] = useState<null | Partial<Vinculo> & { _new?: boolean }>(null)
  const [vincSaving, setVincSaving] = useState(false)
  const [catModalOpen, setCatModalOpen] = useState(false)

  const loadDados = useCallback(() => {
    Promise.all([
      trpcBF().dashboard.query() as Promise<typeof dash>,
      trpcBF().list.query({ busca: busca.trim() || undefined }) as Promise<Vinculo[]>,
    ])
      .then(([d, l]) => { setDash(d); setVinculos(l) })
      .catch((e: Error) => alerts.error('Erro', e.message))
      .finally(() => setLoading(false))
  }, [busca])

  useEffect(() => { loadDados() }, [loadDados])
  useEffect(() => {
    trpcBF().listCatalogo.query({ incluirInativos: true }).then(setCatalogo).catch(() => {})
    trpcBF().clienteOpcoes.query().then(setClientes).catch(() => {})
    trpcBF().servicoOpcoes.query().then(setServicos).catch(() => {})
  }, [])

  const visiveis = useMemo(
    () => (filtroStatus ? vinculos.filter(v => v.status === filtroStatus) : vinculos),
    [vinculos, filtroStatus],
  )
  const catalogoAtivo = useMemo(() => catalogo.filter(c => c.ativo), [catalogo])

  function toggleSel(id: string) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const selSemOrcamento = visiveis.filter(v => selecionados.has(v.id) && !v.orcamentoId)

  async function salvarVinculo() {
    if (!vincModal) return
    if (!vincModal.clienteId || !vincModal.catalogoId) {
      alerts.error('Campos obrigatórios', 'Selecione o cliente e o benefício.')
      return
    }
    setVincSaving(true)
    try {
      const payload = {
        clienteId: vincModal.clienteId,
        catalogoId: vincModal.catalogoId,
        dataVencimento: vincModal.dataVencimento || null,
        portaria: vincModal.portaria || null,
        processo: vincModal.processo || null,
        obs: vincModal.obs || null,
      }
      if (vincModal._new) await trpcBF().create.mutate(payload)
      else await trpcBF().update.mutate({ id: vincModal.id, ...payload })
      setVincModal(null)
      loadDados()
      alerts.success('Salvo', 'Benefício salvo com sucesso.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setVincSaving(false) }
  }

  async function excluirVinculo(v: Vinculo) {
    const ok = await alerts.confirmDelete(`${v.beneficioNome} — ${v.clienteNome}`)
    if (!ok) return
    try { await trpcBF().remove.mutate({ id: v.id }); loadDados() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function gerarOrcamento(v: Vinculo) {
    try {
      const r = await trpcBF().gerarOrcamento.mutate({ id: v.id })
      alerts.success('Orçamento gerado', `Orçamento #${r.numero} criado.`)
      loadDados()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function gerarMassa() {
    if (selSemOrcamento.length === 0) return
    const ok = await alerts.confirm('Orçar em massa', `Gerar orçamento para ${selSemOrcamento.length} benefício(s) selecionado(s)?`)
    if (!ok) return
    setOrcando(true)
    try {
      const r = await trpcBF().gerarOrcamentoMassa.mutate({ ids: selSemOrcamento.map(v => v.id) })
      setSelecionados(new Set())
      loadDados()
      const puladosMsg = r.pulados.length ? ` ${r.pulados.length} pulado(s).` : ''
      alerts.success('Orçamentos gerados', `${r.gerados} gerado(s).${puladosMsg}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setOrcando(false) }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        color={MODULE_COLOR}
        icon={Percent}
        title="Benefícios Fiscais"
        subtitle="Gestão dos incentivos fiscais dos clientes, vencimentos e geração de orçamentos"
        actions={
          <div className="flex items-center gap-2">
            {canManageCatalogo && (
              <Button variant="outline" size="sm" onClick={() => setCatModalOpen(true)}>
                <Settings2 className="h-4 w-4" /> Catálogo
              </Button>
            )}
            {canWrite && (
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} onClick={() => setVincModal({ _new: true })}>
                <Plus className="h-4 w-4" /> Novo benefício
              </Button>
            )}
          </div>
        }
      />

      {/* Cards de status (clicáveis = filtro) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['NO_PRAZO', 'VENCENDO', 'VENCIDO', 'SEM_DATA'] as Status[]).map(s => {
          const cfg = STATUS_CFG[s]; const Icon = cfg.icon
          const ativo = filtroStatus === s
          return (
            <button
              key={s}
              onClick={() => setFiltroStatus(ativo ? null : s)}
              className={cn('text-left rounded-xl border p-4 transition-all hover:shadow-sm', ativo && 'ring-2 ring-offset-1')}
              style={{ borderColor: cfg.color + '40', backgroundColor: cfg.bg, ...(ativo ? { boxShadow: `0 0 0 2px ${cfg.color}` } : {}) }}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold" style={{ color: cfg.color }}>{dash[s]}</span>
                <Icon className="h-5 w-5" style={{ color: cfg.color }} />
              </div>
              <p className="text-xs font-medium mt-1" style={{ color: cfg.color }}>{cfg.label}</p>
            </button>
          )
        })}
      </div>

      {/* Filtros + ações em massa */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por cliente ou benefício..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="h-9 max-w-xs"
        />
        {filtroStatus && (
          <Button variant="ghost" size="sm" onClick={() => setFiltroStatus(null)}>
            <X className="h-3.5 w-3.5" /> {STATUS_CFG[filtroStatus].label}
          </Button>
        )}
        <div className="flex-1" />
        {canGerarOrcamento && selSemOrcamento.length > 0 && (
          <Button size="sm" onClick={gerarMassa} disabled={orcando}>
            {orcando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            Orçar selecionados ({selSemOrcamento.length})
          </Button>
        )}
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhum benefício encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canGerarOrcamento && <TableHead className="w-8" />}
                <TableHead>Cliente</TableHead>
                <TableHead>Benefício</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Portaria / Processo</TableHead>
                <TableHead>Orçamento</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map(v => {
                const cfg = STATUS_CFG[v.status]
                return (
                  <TableRow key={v.id} className={cn(!v.ativo && 'opacity-50')}>
                    {canGerarOrcamento && (
                      <TableCell>
                        {!v.orcamentoId && (
                          <Checkbox checked={selecionados.has(v.id)} onCheckedChange={() => toggleSel(v.id)} />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{v.clienteNome}</TableCell>
                    <TableCell>{v.beneficioNome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px] gap-1 border" style={{ color: cfg.color, borderColor: cfg.color + '55', backgroundColor: cfg.bg }}>
                          {fmtDateBR(v.dataVencimento)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[v.portaria, v.processo].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell>
                      {v.orcamentoId
                        ? <a href={`/orcamentos/${v.orcamentoId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            #{v.orcamentoNumero} <ExternalLink className="h-3 w-3" />
                          </a>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canWrite && (
                            <DropdownMenuItem onClick={() => setVincModal({ ...v })}>
                              <Edit2 className="h-3.5 w-3.5" /> Editar
                            </DropdownMenuItem>
                          )}
                          {canGerarOrcamento && !v.orcamentoId && (
                            <DropdownMenuItem onClick={() => gerarOrcamento(v)}>
                              <Receipt className="h-3.5 w-3.5" /> Gerar orçamento
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem onClick={() => excluirVinculo(v)} className="text-destructive focus:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modal vínculo */}
      <Dialog open={!!vincModal} onOpenChange={o => !o && setVincModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={Percent} color={MODULE_COLOR} />
          <DialogTitle>{vincModal?._new ? 'Novo benefício do cliente' : 'Editar benefício'}</DialogTitle>
          <DialogDescription>Vincule um benefício fiscal do catálogo a um cliente.</DialogDescription>
          <DialogBody className="space-y-4">
            {vincModal?._new && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Cliente *</Label>
                <ClienteCombobox
                  clientes={clientes}
                  value={vincModal?.clienteId ?? ''}
                  onSelect={id => setVincModal(m => ({ ...m, clienteId: id }))}
                  placeholder="Selecione o cliente"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Benefício *</Label>
              <Select value={vincModal?.catalogoId ?? ''} onValueChange={v => setVincModal(m => ({ ...m, catalogoId: v }))} disabled={!vincModal?._new}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o benefício" /></SelectTrigger>
                <SelectContent>
                  {catalogoAtivo.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Vencimento</Label>
                <Input type="date" className="h-9 text-sm" value={toDateInput(vincModal?.dataVencimento ?? null)}
                  onChange={e => setVincModal(m => ({ ...m, dataVencimento: e.target.value || null }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Portaria</Label>
                <Input className="h-9 text-sm" value={vincModal?.portaria ?? ''}
                  onChange={e => setVincModal(m => ({ ...m, portaria: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Processo</Label>
              <Input className="h-9 text-sm" value={vincModal?.processo ?? ''}
                onChange={e => setVincModal(m => ({ ...m, processo: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observações</Label>
              <Textarea rows={3} className="text-sm" value={vincModal?.obs ?? ''}
                onChange={e => setVincModal(m => ({ ...m, obs: e.target.value }))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincModal(null)}>Cancelar</Button>
            <Button onClick={salvarVinculo} disabled={vincSaving} style={{ backgroundColor: MODULE_COLOR }}>
              {vincSaving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal catálogo */}
      <CatalogoModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        catalogo={catalogo}
        servicos={servicos}
        onChanged={() => trpcBF().listCatalogo.query({ incluirInativos: true }).then(setCatalogo).catch(() => {})}
      />
    </div>
  )
}

/* ============================ Catálogo ============================ */
function CatalogoModal({ open, onClose, catalogo, servicos, onChanged }: {
  open: boolean; onClose: () => void; catalogo: CatalogoItem[]; servicos: ServicoOpt[]; onChanged: () => void
}) {
  const [edit, setEdit] = useState<null | Partial<CatalogoItem> & { _new?: boolean }>(null)
  const [saving, setSaving] = useState(false)

  async function salvar() {
    if (!edit?.nome?.trim()) { alerts.error('Nome obrigatório', 'Informe o nome do benefício.'); return }
    setSaving(true)
    try {
      const payload = {
        nome: edit.nome,
        servicoId: edit.servicoId || null,
        notificaVencimentoDias: edit.notificaVencimentoDias ?? null,
        obs: edit.obs || null,
        ativo: edit.ativo ?? true,
      }
      if (edit._new) await trpcBF().createCatalogo.mutate(payload)
      else await trpcBF().updateCatalogo.mutate({ id: edit.id, ...payload })
      setEdit(null); onChanged()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }
  async function remover(c: CatalogoItem) {
    const ok = await alerts.confirm('Inativar benefício', `Inativar "${c.nome}" do catálogo?`)
    if (!ok) return
    try { await trpcBF().removeCatalogo.mutate({ id: c.id }); onChanged() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeaderIcon icon={Settings2} color={MODULE_COLOR} />
        <DialogTitle>Catálogo de benefícios</DialogTitle>
        <DialogDescription>Benefícios disponíveis e o serviço usado para gerar orçamento.</DialogDescription>
        <DialogBody className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setEdit({ _new: true, ativo: true, notificaVencimentoDias: 30 })}>
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
          </div>
          <div className="border rounded-lg divide-y max-h-[320px] overflow-y-auto">
            {catalogo.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">Catálogo vazio.</p>}
            {catalogo.map(c => (
              <div key={c.id} className={cn('flex items-center gap-3 p-3', !c.ativo && 'opacity-50')}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.nome} {!c.ativo && <span className="text-[10px] text-muted-foreground">(inativo)</span>}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.servicoNome ? `Serviço: ${c.servicoNome}` : 'Sem serviço vinculado'} · {c.emUso} em uso · avisa {c.notificaVencimentoDias ?? 30}d antes
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEdit({ ...c })}><Edit2 className="h-3.5 w-3.5" /></Button>
                {c.ativo && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remover(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            ))}
          </div>

          {edit && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-sm font-semibold">{edit._new ? 'Novo benefício' : 'Editar benefício'}</p>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Nome *</Label>
                <Input className="h-9 text-sm" value={edit.nome ?? ''} onChange={e => setEdit(s => ({ ...s, nome: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Serviço (p/ orçamento)</Label>
                  <Select value={edit.servicoId ?? '__none'} onValueChange={v => setEdit(s => ({ ...s, servicoId: v === '__none' ? null : v }))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Nenhum</SelectItem>
                      {servicos.map(s => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Avisar (dias antes)</Label>
                  <Input type="number" className="h-9 text-sm" value={edit.notificaVencimentoDias ?? ''}
                    onChange={e => setEdit(s => ({ ...s, notificaVencimentoDias: e.target.value ? Number(e.target.value) : null }))} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={edit.ativo ?? true} onCheckedChange={v => setEdit(s => ({ ...s, ativo: v }))} />
                <Label className="text-[13px]">Ativo</Label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>Cancelar</Button>
                <Button size="sm" onClick={salvar} disabled={saving} style={{ backgroundColor: MODULE_COLOR }}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
