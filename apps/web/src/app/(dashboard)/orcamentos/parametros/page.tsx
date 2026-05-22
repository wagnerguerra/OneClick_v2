'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, MoreVertical, Trash2, Pencil, Loader2,
  Package, Tag as TagIcon, FileText, RefreshCw,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Label, RichEditor,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

const TIPO_LABELS: Record<string, string> = {
  SERVICO: 'Serviço',
  TAXA: 'Taxa',
  DESPESA: 'Despesa',
}

const TIPO_COLORS: Record<string, string> = {
  SERVICO: '#3b82f6',
  TAXA: '#f59e0b',
  DESPESA: '#ef4444',
}

interface CatalogoItem {
  id: string
  nome: string
  tipo: string
  valorPadrao: number | string | null
  textoPadrao: string | null
  ativo: boolean
  disponivelOrcamento: boolean
  usoCount: number
  createdAt: string
}

function formatCurrency(v: number | string | null | undefined): string {
  if (v == null) return '—'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function moedaParaNumero(s: string): number {
  if (!s) return 0
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

function numeroParaMoeda(n: number | string | null | undefined): string {
  if (n == null) return ''
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ParametrosOrcamentosPage() {
  const router = useRouter()
  // Catálogo de serviços é configuração admin do módulo. Acesso via URL direta
  // por usuário comum redireciona pra /orcamentos.
  const { profile, loading: profileLoading } = useCurrentUserProfile()
  const isAdmin = !!(profile?.isMaster || profile?.isEmpresaMaster)
  useEffect(() => {
    if (!profileLoading && profile && !isAdmin) {
      router.replace('/orcamentos')
    }
  }, [profileLoading, profile, isAdmin, router])

  const [items, setItems] = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('__all__')
  const [statusFilter, setStatusFilter] = useState<string>('__all__')

  // Modal create/edit
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogoItem | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'SERVICO', valorPadrao: '', textoPadrao: '', disponivelOrcamento: true })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await (trpc.orcamento as any).listCatalogo.query({ somenteAtivos: false })
      setItems(data)
    } catch {
      if (!silent) alerts.error('Erro', 'Falha ao carregar o catálogo')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Só carrega catálogo após confirmar que o user é admin
    if (profileLoading || !isAdmin) return
    fetchData()
  }, [fetchData, profileLoading, isAdmin])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!i.nome.toLowerCase().includes(q)) return false
      }
      if (tipoFilter !== '__all__' && i.tipo !== tipoFilter) return false
      if (statusFilter === 'ativos' && !i.ativo) return false
      if (statusFilter === 'inativos' && i.ativo) return false
      if (statusFilter === 'disponiveis' && !i.disponivelOrcamento) return false
      if (statusFilter === 'indisponiveis' && i.disponivelOrcamento) return false
      return true
    })
  }, [items, search, tipoFilter, statusFilter])

  const stats = useMemo(() => ({
    total: items.length,
    ativos: items.filter(i => i.ativo).length,
    disponiveis: items.filter(i => i.ativo && i.disponivelOrcamento).length,
    indisponiveis: items.filter(i => i.ativo && !i.disponivelOrcamento).length,
  }), [items])

  function abrirNovo() {
    setEditing(null)
    setForm({ nome: '', tipo: 'SERVICO', valorPadrao: '', textoPadrao: '', disponivelOrcamento: true })
    setEditOpen(true)
  }

  function abrirEdicao(item: CatalogoItem) {
    setEditing(item)
    setForm({
      nome: item.nome,
      tipo: item.tipo,
      valorPadrao: item.valorPadrao ? numeroParaMoeda(item.valorPadrao) : '',
      textoPadrao: item.textoPadrao || '',
      disponivelOrcamento: item.disponivelOrcamento,
    })
    setEditOpen(true)
  }

  async function handleSave() {
    if (!form.nome.trim()) { alerts.warning('Atenção', 'Informe o nome do serviço'); return }
    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        tipo: form.tipo,
        valorPadrao: form.valorPadrao ? moedaParaNumero(form.valorPadrao) : undefined,
        textoPadrao: form.textoPadrao.trim() || undefined,
        disponivelOrcamento: form.disponivelOrcamento,
      }
      if (editing) {
        await (trpc.orcamento as any).updateCatalogo.mutate({ id: editing.id, ...payload })
        alerts.success('Atualizado', 'Item atualizado com sucesso')
      } else {
        await (trpc.orcamento as any).createCatalogo.mutate(payload)
        alerts.success('Criado', 'Item adicionado ao catálogo')
      }
      setEditOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleDisponivel(item: CatalogoItem) {
    try {
      await (trpc.orcamento as any).updateCatalogo.mutate({ id: item.id, disponivelOrcamento: !item.disponivelOrcamento })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, disponivelOrcamento: !i.disponivelOrcamento } : i))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function toggleAtivo(item: CatalogoItem) {
    try {
      await (trpc.orcamento as any).updateCatalogo.mutate({ id: item.id, ativo: !item.ativo })
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleExcluir(item: CatalogoItem) {
    const text = item.usoCount > 0
      ? `Este item esta vinculado a ${item.usoCount} orcamento(s). Sera marcado como inativo.`
      : 'Esta ação não pode ser desfeita.'
    const ok = await alerts.confirm({ title: `Excluir "${item.nome}"?`, text, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.orcamento as any).deleteCatalogo.mutate({ id: item.id })
      alerts.success('Excluído', 'Item removido do catálogo')
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/orcamentos')}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1>Parametros de Orcamentos</h1>
            <p className="text-sm text-muted-foreground">Catálogo de serviços, taxas e despesas disponíveis para uso em orçamentos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fetchData()} className="gap-1.5" title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={abrirNovo}>
            <Plus className="h-4 w-4" /> Novo Item
          </Button>
        </div>
      </div>

      {/* Stats compactas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Total" value={stats.total} color="#64748b" icon={Package} />
        <StatBox label="Ativos" value={stats.ativos} color="#10b981" icon={TagIcon} />
        <StatBox label="Disponíveis" value={stats.disponiveis} color={MODULE_COLOR} icon={FileText} />
        <StatBox label="Indisponíveis" value={stats.indisponiveis} color="#94a3b8" icon={FileText} />
      </div>

      {/* Filtros + Tabela */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 flex-1 flex-wrap">
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                <SelectItem value="SERVICO">Serviço</SelectItem>
                <SelectItem value="TAXA">Taxa</SelectItem>
                <SelectItem value="DESPESA">Despesa</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="ativos">Apenas ativos</SelectItem>
                <SelectItem value="inativos">Apenas inativos</SelectItem>
                <SelectItem value="disponiveis">Disponíveis nos orçamentos</SelectItem>
                <SelectItem value="indisponiveis">Indisponíveis</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs bg-card"
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Tipo</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[140px] text-right">Valor Padrão</TableHead>
              <TableHead className="w-[80px] text-center">Usos</TableHead>
              <TableHead className="w-[110px] text-center">Disponível</TableHead>
              <TableHead className="w-[80px] text-center">Ativo</TableHead>
              <TableHead className="w-[50px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum item encontrado
              </TableCell></TableRow>
            ) : filtered.map(item => (
              <TableRow key={item.id} className={cn('whitespace-nowrap', !item.ativo && 'opacity-50')}>
                <TableCell>
                  <Badge style={{ backgroundColor: TIPO_COLORS[item.tipo] }} className="text-white text-[10px]">
                    {TIPO_LABELS[item.tipo] || item.tipo}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm font-medium">
                  <span className="block max-w-[400px] truncate cursor-pointer hover:text-foreground" onClick={() => abrirEdicao(item)}>
                    {item.nome}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(item.valorPadrao)}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground">{item.usoCount}</TableCell>
                <TableCell className="text-center">
                  <button
                    onClick={() => toggleDisponivel(item)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      item.disponivelOrcamento ? 'bg-rose-400' : 'bg-slate-300 dark:bg-slate-600'
                    )}
                    title={item.disponivelOrcamento ? 'Disponível para uso em orçamentos' : 'Indisponível'}
                  >
                    <span className={cn(
                      'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm',
                      item.disponivelOrcamento ? 'translate-x-[18px]' : 'translate-x-[2px]',
                    )} />
                  </button>
                </TableCell>
                <TableCell className="text-center">
                  <button
                    onClick={() => toggleAtivo(item)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      item.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    )}
                    title={item.ativo ? 'Ativo' : 'Inativo'}
                  >
                    <span className={cn(
                      'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm',
                      item.ativo ? 'translate-x-[18px]' : 'translate-x-[2px]',
                    )} />
                  </button>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => abrirEdicao(item)}>
                        <Pencil className="h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleExcluir(item)}>
                        <Trash2 className="h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Modal de criacao/edicao */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeaderIcon icon={editing ? Pencil : Plus} color={editing ? 'sky' : 'emerald'}>
            <DialogTitle className="text-[15px]">{editing ? 'Editar item do catálogo' : 'Novo item do catálogo'}</DialogTitle>
            <DialogDescription className="text-[11px]">
              Itens do catalogo ficam disponiveis para uso rapido ao montar um orcamento.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <Label className="text-xs font-medium">Tipo <span className="text-rose-500">*</span></Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SERVICO">Serviço</SelectItem>
                    <SelectItem value="TAXA">Taxa</SelectItem>
                    <SelectItem value="DESPESA">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6">
                <Label className="text-xs font-medium">Nome <span className="text-rose-500">*</span></Label>
                <Input
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Ex.: Honorários contábeis - Pessoa Jurídica"
                  required
                />
              </div>
              <div className="col-span-3">
                <Label className="text-xs font-medium">Valor base</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">R$</span>
                  <Input
                    value={form.valorPadrao}
                    onChange={e => setForm(f => ({ ...f, valorPadrao: e.target.value }))}
                    onBlur={e => {
                      const n = moedaParaNumero(e.target.value)
                      setForm(f => ({ ...f, valorPadrao: n > 0 ? numeroParaMoeda(n) : '' }))
                    }}
                    className="h-9 text-sm"
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs font-medium">Texto padrão (opcional)</Label>
              <p className="text-[11px] text-muted-foreground mb-2">Texto pre-preenchido como descricao detalhada quando este item for adicionado a um orcamento</p>
              <RichEditor
                value={form.textoPadrao}
                onChange={v => setForm(f => ({ ...f, textoPadrao: v }))}
                placeholder="Descreva o servico..."
              />
            </div>

            <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 rounded-md">
              <input
                type="checkbox"
                id="disponivel"
                checked={form.disponivelOrcamento}
                onChange={e => setForm(f => ({ ...f, disponivelOrcamento: e.target.checked }))}
                className="h-4 w-4 mt-0.5 rounded border-rose-300"
              />
              <label htmlFor="disponivel" className="cursor-pointer flex-1">
                <span className="text-sm font-medium block">Disponível para uso em orçamentos</span>
                <span className="text-[11px] text-muted-foreground">Quando desmarcado, este item nao aparece na lista de selecao ao adicionar itens em um orcamento. Util para inativar temporariamente sem excluir.</span>
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatBox({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}18` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
      </div>
    </Card>
  )
}
