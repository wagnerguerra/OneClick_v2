'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Percent, Loader2, Plus, MoreVertical, Edit2, Trash2, Settings2,
  CheckCircle2, Clock, AlertTriangle, MinusCircle, Receipt,
  ChevronUp, ChevronDown, ChevronsUpDown, GitBranch,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label, cn, Checkbox, Textarea,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Switch,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
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
  servicoNome: string | null
  catalogoServicoId: string | null
  orcamentoNumero: number | null
  orcamentoStatus: string | null
  processoId: string | null
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

// Elegível p/ orçamento automático: vencendo/vencido, com serviço vinculado e sem orçamento.
function elegivelParaOrcar(v: Vinculo) {
  return !v.orcamentoId && !!v.servicoNome && (v.status === 'VENCENDO' || v.status === 'VENCIDO')
}
function escHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
}

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
  type SortKey = 'cliente' | 'beneficio' | 'vencimento' | 'status'
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'cliente', dir: 'asc' })
  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [orcando, setOrcando] = useState(false)
  const [excluindoLote, setExcluindoLote] = useState(false)

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

  // Ordenação clicável por coluna (Cliente é o padrão, alfabético asc).
  const visiveis = useMemo(() => {
    const base = filtroStatus ? vinculos.filter(v => v.status === filtroStatus) : vinculos
    const dir = sort.dir === 'asc' ? 1 : -1
    const STATUS_ORDEM: Record<string, number> = { VENCIDO: 0, VENCENDO: 1, NO_PRAZO: 2, SEM_DATA: 3 }
    const cmp = (a: Vinculo, b: Vinculo): number => {
      switch (sort.key) {
        case 'beneficio': return a.beneficioNome.localeCompare(b.beneficioNome, 'pt-BR', { sensitivity: 'base' })
        case 'status': return (STATUS_ORDEM[a.status] ?? 9) - (STATUS_ORDEM[b.status] ?? 9)
        case 'vencimento': {
          const ta = a.dataVencimento ? new Date(a.dataVencimento).getTime() : Infinity
          const tb = b.dataVencimento ? new Date(b.dataVencimento).getTime() : Infinity
          return ta - tb
        }
        default: return a.clienteNome.localeCompare(b.clienteNome, 'pt-BR', { sensitivity: 'base' })
      }
    }
    return [...base].sort((a, b) => {
      const r = cmp(a, b) * dir
      // desempate estável por cliente
      return r !== 0 ? r : a.clienteNome.localeCompare(b.clienteNome, 'pt-BR', { sensitivity: 'base' })
    })
  }, [vinculos, filtroStatus, sort])
  const catalogoAtivo = useMemo(() => catalogo.filter(c => c.ativo), [catalogo])

  const podeSelecionar = canGerarOrcamento || canDelete
  function toggleSel(id: string) {
    setSelecionados(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelTodos() {
    setSelecionados(prev => {
      const ids = visiveis.map(v => v.id)
      const todos = ids.length > 0 && ids.every(id => prev.has(id))
      return todos ? new Set() : new Set(ids)
    })
  }
  const selElegiveis = visiveis.filter(v => selecionados.has(v.id) && elegivelParaOrcar(v))

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

  async function confirmarEGerar(itens: Vinculo[], limparSelecao = false) {
    const elegiveis = itens.filter(elegivelParaOrcar)
    if (elegiveis.length === 0) {
      await alerts.custom({
        title: 'Nenhum item elegível',
        icon: 'info',
        html: 'Para gerar orçamento, o benefício precisa estar <strong>vencendo ou vencido</strong> e ter um <strong>serviço vinculado</strong> no catálogo.',
        showCancelButton: false,
        confirmButtonText: 'Entendi',
      })
      return
    }
    const linhas = elegiveis.map(v =>
      `<li style="margin-bottom:4px"><strong>${escHtml(v.clienteNome)}</strong> — <em>${escHtml(v.beneficioNome)}</em> <span style="color:#9ca3af">(${escHtml(v.servicoNome!)})</span></li>`,
    ).join('')
    const res = await alerts.custom({
      title: 'Gerar orçamentos automáticos?',
      icon: 'question',
      html: `<ol style="text-align:left;margin:0 auto;max-width:360px;padding-left:1.4em;font-size:14px;line-height:1.45">${linhas}</ol>`
        + `<p style="margin-top:14px;font-size:13px;color:#6b7280">Será criado um orçamento para cada item elegível (vencendo/vencido e com serviço vinculado).</p>`,
      confirmButtonText: 'Sim, gerar',
      cancelButtonText: 'Cancelar',
    })
    if (!res.isConfirmed) return
    setOrcando(true)
    try {
      const r = await trpcBF().gerarOrcamentoMassa.mutate({ ids: elegiveis.map(v => v.id) })
      if (limparSelecao) setSelecionados(new Set())
      loadDados()
      const pul = r.pulados.length ? ` ${r.pulados.length} pulado(s).` : ''
      alerts.success('Orçamentos gerados', `${r.gerados} gerado(s).${pul}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setOrcando(false) }
  }

  const gerarOrcamento = (v: Vinculo) => confirmarEGerar([v])
  const gerarMassa = () => confirmarEGerar(selElegiveis, true)

  async function handleExcluirMassa() {
    if (selecionados.size === 0) return
    const total = selecionados.size
    const ok = await alerts.confirm('Excluir em massa', `Excluir ${total} vínculo(s) de benefício selecionado(s)? Esta ação é irreversível.`)
    if (!ok) return
    setExcluindoLote(true)
    try {
      const r = await trpcBF().removeMany.mutate({ ids: Array.from(selecionados) })
      setSelecionados(new Set())
      loadDados()
      alerts.success('Excluídos', `${r.ok} vínculo(s) excluído(s)${r.falhou ? `, ${r.falhou} falhou(aram)` : ''}.`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setExcluindoLote(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header — padrão de /gestao-certificados (Legalização) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Percent className="h-6 w-6" />
          </div>
          <div>
            <h1>Benefícios Fiscais</h1>
            <p className="text-sm text-muted-foreground">Gestão dos incentivos fiscais dos clientes, vencimentos e geração de orçamentos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canManageCatalogo && (
            <Button variant="outline" size="sm" onClick={() => setCatModalOpen(true)} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Catálogo
            </Button>
          )}
          {canWrite && (
            <Button size="sm" onClick={() => setVincModal({ _new: true })} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              <Plus className="h-4 w-4" /> Novo benefício
            </Button>
          )}
        </div>
      </div>

      {/* Filtros (pílulas) + busca — padrão /gestao-certificados */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {([
          { key: null as Status | null, label: 'Todos', count: dash.TOTAL, color: '#94a3b8', icon: Percent },
          ...(['NO_PRAZO', 'VENCENDO', 'VENCIDO', 'SEM_DATA'] as Status[]).map(s => ({
            key: s as Status | null, label: STATUS_CFG[s].label, count: dash[s], color: STATUS_CFG[s].color, icon: STATUS_CFG[s].icon,
          })),
        ]).map(f => {
          const Icon = f.icon
          const active = filtroStatus === f.key
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setFiltroStatus(f.key)}
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                active ? 'border-foreground/20' : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              style={active ? { borderColor: f.color, backgroundColor: `${f.color}10`, color: f.color } : undefined}
            >
              <Icon className="h-3.5 w-3.5" style={!active ? { color: f.color } : undefined} />
              <span>{f.label}</span>
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums"
                style={active ? { backgroundColor: `${f.color}20`, color: f.color } : undefined}
              >
                {f.count}
              </Badge>
            </button>
          )
        })}
        <div className="ml-auto">
          <Input
            placeholder="Buscar por cliente ou benefício..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="h-8 w-[280px] text-xs"
          />
        </div>
      </div>

      {/* Tabela */}
      <Card className="overflow-hidden">
        {/* Barra de ações em massa — aparece quando há seleção */}
        {podeSelecionar && selecionados.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 bg-fuchsia-50 dark:bg-fuchsia-950/20 border-b border-fuchsia-200 dark:border-fuchsia-900">
            <div className="text-sm font-medium">{selecionados.size} selecionado(s)</div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())} disabled={orcando || excluindoLote}>
                Limpar seleção
              </Button>
              {canGerarOrcamento && selElegiveis.length > 0 && (
                <Button size="sm" onClick={gerarMassa} disabled={orcando || excluindoLote} className="gap-1.5">
                  {orcando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                  Orçar ({selElegiveis.length})
                </Button>
              )}
              {canDelete && (
                <Button variant="destructive" size="sm" onClick={handleExcluirMassa} disabled={orcando || excluindoLote} className="gap-1.5">
                  {excluindoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {excluindoLote ? 'Excluindo...' : `Excluir ${selecionados.size}`}
                </Button>
              )}
            </div>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : visiveis.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">Nenhum benefício encontrado.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="whitespace-nowrap">
                {podeSelecionar && (
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={visiveis.length > 0 && visiveis.every(v => selecionados.has(v.id))}
                      onCheckedChange={toggleSelTodos}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                )}
                <SortableHead label="Cliente" sortKey="cliente" sort={sort} onSort={toggleSort} />
                <SortableHead label="Benefício" sortKey="beneficio" sort={sort} onSort={toggleSort} />
                <SortableHead label="Vencimento" sortKey="vencimento" sort={sort} onSort={toggleSort} />
                <TableHead className="w-[44px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map(v => {
                const cfg = STATUS_CFG[v.status]
                return (
                  <TableRow
                    key={v.id}
                    className={cn(
                      'whitespace-nowrap',
                      !v.ativo && 'opacity-50',
                      selecionados.has(v.id) && 'bg-fuchsia-50/50 dark:bg-fuchsia-950/10',
                    )}
                  >
                    {podeSelecionar && (
                      <TableCell>
                        <Checkbox
                          checked={selecionados.has(v.id)}
                          onCheckedChange={() => toggleSel(v.id)}
                          aria-label={`Selecionar ${v.clienteNome}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="max-w-[420px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {v.orcamentoId && (
                          <a
                            href={v.processoId ? `/processos/${v.processoId}` : `/orcamentos/${v.orcamentoId}`}
                            title={v.processoId ? 'Abrir processo de liberação do benefício' : 'Abrir orçamento'}
                            className={cn(
                              'shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border hover:opacity-80',
                              v.processoId
                                ? 'border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300'
                                : 'border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-300',
                            )}
                          >
                            {v.processoId ? <GitBranch className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                            #{v.orcamentoNumero}
                          </a>
                        )}
                        <span className="font-semibold text-sm truncate">{v.clienteNome}</span>
                      </div>
                      {[v.portaria, v.processo].filter(Boolean).length > 0 && (
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {[v.portaria, v.processo].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.beneficioNome}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] border" style={{ color: cfg.color, borderColor: cfg.color + '55', backgroundColor: cfg.bg }}>
                        {fmtDateBR(v.dataVencimento)}
                      </Badge>
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
                          {canGerarOrcamento && elegivelParaOrcar(v) && (
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
          <DialogHeaderIcon icon={Percent} color="fuchsia">
            <DialogTitle>{vincModal?._new ? 'Novo benefício do cliente' : 'Editar benefício'}</DialogTitle>
            <DialogDescription>Vincule um benefício fiscal do catálogo a um cliente.</DialogDescription>
          </DialogHeaderIcon>
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

/* Cabeçalho de coluna ordenável (clica pra ordenar; seta indica direção). */
function SortableHead({ label, sortKey, sort, onSort }: {
  label: string
  sortKey: 'cliente' | 'beneficio' | 'vencimento' | 'status'
  sort: { key: string; dir: 'asc' | 'desc' }
  onSort: (k: 'cliente' | 'beneficio' | 'vencimento' | 'status') => void
}) {
  const active = sort.key === sortKey
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 select-none hover:text-foreground', active && 'text-foreground font-semibold')}
      >
        {label}
        {active
          ? (sort.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
          : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </TableHead>
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
        <DialogHeaderIcon icon={Settings2} color="fuchsia">
          <DialogTitle>Catálogo de benefícios</DialogTitle>
          <DialogDescription>Benefícios disponíveis e o serviço usado para gerar orçamento.</DialogDescription>
        </DialogHeaderIcon>
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
