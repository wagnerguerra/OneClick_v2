'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, MoreVertical, Trash2, Pencil, Loader2,
  Package, RefreshCw, RotateCcw, CheckCircle2, EyeOff,
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
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

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

interface CatalogoTexto {
  id: string
  catalogoId: string
  titulo: string
  descricao: string | null
  valor: number | string | null
  ordem: number
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

// Máscara monetária ao vivo: interpreta os dígitos digitados como centavos
// e formata em pt-BR (ex.: "123456" → "1.234,56").
function mascaraMoeda(input: string): string {
  const digits = (input || '').replace(/\D/g, '')
  if (!digits) return ''
  return numeroParaMoeda(Number(digits) / 100)
}

export default function ParametrosOrcamentosPage() {
  const router = useRouter()
  // Catálogo de serviços é configuração admin do módulo. Acesso via URL direta
  // por usuário comum redireciona pra /orcamentos.
  // Acesso: master/empresa-master OU sub-permissão 'acessar_configuracoes' do módulo orçamentos.
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const orcSubPerms = (permissions.find(p => p.moduleSlug === 'orcamentos')?.subPermissions ?? {}) as Record<string, boolean>
  const isAdmin = isMaster || isEmpresaMaster || orcSubPerms.acessar_configuracoes === true
  useEffect(() => {
    if (!permsLoading && !isAdmin) {
      router.replace('/orcamentos')
    }
  }, [permsLoading, isAdmin, router])

  const [items, setItems] = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState<string>('__all__')
  // Default: só os itens adicionáveis aos orçamentos (disponivelOrcamento=true).
  // O filtro permite ver os demais (todos/ativos/inativos/indisponíveis) quando preciso.
  const [statusFilter, setStatusFilter] = useState<string>('disponiveis')

  // Modal create/edit
  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogoItem | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'TAXA', valorPadrao: '', textoPadrao: '', disponivelOrcamento: true })
  const [saving, setSaving] = useState(false)

  // Textos do registro (titulo + descricao + valor) — só no modo edição (item já tem id)
  const [textos, setTextos] = useState<CatalogoTexto[]>([])
  const [textosLoading, setTextosLoading] = useState(false)
  // Editor de texto (sub-modal): null = fechado; { id?: string } = abrindo p/ criar/editar
  const [textoEdit, setTextoEdit] = useState<CatalogoTexto | null>(null)
  const [textoForm, setTextoForm] = useState({ titulo: '', descricao: '', valor: '' })
  const [textoSaving, setTextoSaving] = useState(false)

  const loadTextos = useCallback(async (catalogoId: string) => {
    setTextosLoading(true)
    try {
      const data = await (trpc.orcamento as any).listCatalogoTextos.query({ catalogoId })
      setTextos(data || [])
    } catch {
      setTextos([])
    } finally {
      setTextosLoading(false)
    }
  }, [])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      // Traz excluídos junto (`ativo = false`), mas eles só são exibidos na
      // visão "Excluídos" — ver `filtered`. Buscar tudo de uma vez evita
      // recarregar ao alternar o filtro; quem decide o que aparece é a tela.
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
    if (permsLoading || !isAdmin) return
    fetchData()
  }, [fetchData, permsLoading, isAdmin])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!i.nome.toLowerCase().includes(q)) return false
      }
      if (tipoFilter !== '__all__' && i.tipo !== tipoFilter) return false
      // #HLP0282: item excluído (`ativo = false`) some de todas as visões —
      // era por aparecer aqui que o usuário excluía e ele continuava na lista.
      // Só a visão dedicada "Excluídos" os mostra, e é de lá que se restaura.
      if (statusFilter === 'excluidos') return !i.ativo
      if (!i.ativo) return false
      if (statusFilter === 'disponiveis' && !i.disponivelOrcamento) return false
      if (statusFilter === 'indisponiveis' && i.disponivelOrcamento) return false
      return true
    })
  }, [items, search, tipoFilter, statusFilter])

  // Excluído não entra em contagem nenhuma além da própria pílula "Excluídos".
  const stats = useMemo(() => ({
    total: items.filter(i => i.ativo).length,
    disponiveis: items.filter(i => i.ativo && i.disponivelOrcamento).length,
    indisponiveis: items.filter(i => i.ativo && !i.disponivelOrcamento).length,
    excluidos: items.filter(i => !i.ativo).length,
  }), [items])

  function abrirNovo() {
    setEditing(null)
    setForm({ nome: '', tipo: 'TAXA', valorPadrao: '', textoPadrao: '', disponivelOrcamento: true })
    setTextos([])
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
    setTextos([])
    // Textos só existem para itens do catálogo (ServicoCatalogo). Serviços (tipo
    // SERVICO vindos do módulo Serviços) não têm textos múltiplos — carrega mesmo
    // assim; a lista volta vazia e a UI orienta.
    loadTextos(item.id)
    setEditOpen(true)
  }

  // ── Textos do registro ──
  function abrirNovoTexto() {
    setTextoForm({ titulo: '', descricao: '', valor: '' })
    setTextoEdit({ id: '', catalogoId: editing?.id ?? '', titulo: '', descricao: '', valor: null, ordem: 0 })
  }

  function abrirEditarTexto(t: CatalogoTexto) {
    setTextoForm({
      titulo: t.titulo,
      descricao: t.descricao || '',
      valor: t.valor != null ? numeroParaMoeda(t.valor) : '',
    })
    setTextoEdit(t)
  }

  async function handleSaveTexto() {
    if (!editing) return
    if (!textoForm.titulo.trim()) { alerts.warning('Atenção', 'Informe o título do texto'); return }
    setTextoSaving(true)
    try {
      const valor = textoForm.valor ? moedaParaNumero(textoForm.valor) : undefined
      if (textoEdit && textoEdit.id) {
        await (trpc.orcamento as any).updateCatalogoTexto.mutate({
          id: textoEdit.id,
          titulo: textoForm.titulo.trim(),
          descricao: textoForm.descricao.trim() || null,
          valor: valor ?? null,
        })
        alerts.success('Salvo', 'Texto atualizado.')
      } else {
        const novo = await (trpc.orcamento as any).addCatalogoTexto.mutate({
          catalogoId: editing.id,
          titulo: textoForm.titulo.trim(),
          descricao: textoForm.descricao.trim() || undefined,
          valor,
        })
        // Mantém o sub-modal aberto, agora em modo edição do texto recém-criado.
        setTextoEdit({
          id: novo?.id ?? '', catalogoId: editing.id,
          titulo: textoForm.titulo.trim(), descricao: textoForm.descricao.trim() || null,
          valor: valor ?? null, ordem: novo?.ordem ?? 0,
        })
        alerts.success('Salvo', 'Texto adicionado.')
      }
      loadTextos(editing.id)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setTextoSaving(false)
    }
  }

  async function handleExcluirTexto(t: CatalogoTexto) {
    const ok = await alerts.confirm({ title: `Excluir texto "${t.titulo}"?`, text: 'Esta ação não pode ser desfeita.', confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.orcamento as any).removeCatalogoTexto.mutate({ id: t.id })
      if (editing) loadTextos(editing.id)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
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

  async function handleExcluir(item: CatalogoItem) {
    // #HLP0282: é exclusão para todos os efeitos visíveis — o item sai do
    // catálogo e deixa de ser oferecido. Os orçamentos que já o usam não são
    // afetados (a exclusão é não destrutiva no banco), e é isso que o texto
    // comunica, em vez de expor "inativo" ou prometer irreversibilidade.
    const text = item.usoCount > 0
      ? `Este item sai do catálogo e deixa de ser oferecido em novos orçamentos. Os ${item.usoCount} orçamento(s) que já o utilizam não são afetados.`
      : 'Este item sai do catálogo e deixa de ser oferecido em novos orçamentos.'
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

  async function handleRestaurar(item: CatalogoItem) {
    const ok = await alerts.confirm({
      title: `Restaurar "${item.nome}"?`,
      text: 'O item volta ao catálogo e pode ser usado em novos orçamentos.',
      confirmText: 'Restaurar',
      icon: 'question',
    })
    if (!ok) return
    try {
      await (trpc.orcamento as any).restaurarCatalogo.mutate({ id: item.id })
      alerts.success('Restaurado', 'O item voltou ao catálogo')
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
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1>Catálogo de Serviços</h1>
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
          <BackButton href="/orcamentos" />
        </div>
      </div>

      {/* Indicadores (pílulas-filtro) — padrão /gestao-certificados */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          // Uma cor por significado, sem repetir matiz: cinza = neutro/tudo,
          // verde = pode usar, âmbar = existe mas está fora de uso, vermelho =
          // excluído. Antes, "Disponíveis" usava a cor rosada do módulo — lida
          // como negação — e brigava com o vermelho de "Excluídos", enquanto
          // "Todos" e "Indisponíveis" eram dois cinzas quase idênticos.
          { key: '__all__', label: 'Todos', count: stats.total, color: '#64748b', icon: Package },
          { key: 'disponiveis', label: 'Disponíveis', count: stats.disponiveis, color: '#10b981', icon: CheckCircle2 },
          { key: 'indisponiveis', label: 'Indisponíveis', count: stats.indisponiveis, color: '#f59e0b', icon: EyeOff },
          // Visão dedicada: é o único lugar onde item excluído aparece, e de
          // onde ele pode ser restaurado.
          { key: 'excluidos', label: 'Excluídos', count: stats.excluidos, color: '#ef4444', icon: Trash2 },
        ].map(f => {
          const Icon = f.icon
          const active = statusFilter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
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
              <TableHead className="w-[50px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum item encontrado
              </TableCell></TableRow>
            ) : filtered.map(item => (
              <TableRow key={item.id} className="whitespace-nowrap">
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
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {/* Item excluído só oferece restaurar: editar um registro
                          que o usuário considera inexistente não faz sentido. */}
                      {item.ativo ? (
                        <>
                          <DropdownMenuItem onClick={() => abrirEdicao(item)}>
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleExcluir(item)}>
                            <Trash2 className="h-4 w-4" /> Excluir
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem onClick={() => handleRestaurar(item)}>
                          <RotateCcw className="h-4 w-4" /> Restaurar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Modal de criacao/edicao */}
      {/* modal={!textoEdit}: quando o sub-modal de texto abre, este vira não-modal
          (sem inert/focus-trap) — senão os campos do sub-modal não aceitam digitação. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen} modal={!textoEdit}>
        <DialogContent className="sm:max-w-[860px]">
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
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))} disabled={editing?.tipo === 'SERVICO'}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* SERVIÇO só aqui para exibir itens vindos do módulo Serviços; novos
                        itens deste catálogo são apenas Taxa/Despesa (serviços nascem em Serviços). */}
                    {editing?.tipo === 'SERVICO' && <SelectItem value="SERVICO">Serviço</SelectItem>}
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
                    inputMode="numeric"
                    value={form.valorPadrao}
                    onChange={e => setForm(f => ({ ...f, valorPadrao: mascaraMoeda(e.target.value) }))}
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

            {/* Textos do registro (titulo + descricao + valor) — adicionais aos campos legados */}
            <div className="border-t border-border pt-4 -mx-5 px-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <Label className="text-[13px] font-semibold text-foreground">Textos do registro</Label>
                  <p className="text-[11px] text-muted-foreground">Variações de texto (título + descrição + valor) que poderão ser escolhidas ao adicionar este item num orçamento.</p>
                </div>
                {editing && (
                  <Button type="button" variant="outline" size="xs" className="gap-1 shrink-0" onClick={abrirNovoTexto}>
                    <Plus className="h-3.5 w-3.5" /> Texto
                  </Button>
                )}
              </div>

              {!editing ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/30 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                  Salve o item primeiro para poder adicionar textos a ele.
                </div>
              ) : textosLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" /> Carregando textos...</div>
              ) : textos.length === 0 ? (
                <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
                  Nenhum texto cadastrado. Use o botão "Texto" para adicionar.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {textos.map(t => (
                    <div key={t.id} className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium truncate">{t.titulo}</span>
                          {t.valor != null && (
                            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">{formatCurrency(t.valor)}</Badge>
                          )}
                        </div>
                        {t.descricao && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5"
                            dangerouslySetInnerHTML={{ __html: t.descricao }} />
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => abrirEditarTexto(t)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleExcluirTexto(t)} title="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Sub-modal: editor de um texto do registro */}
      <Dialog open={!!textoEdit} onOpenChange={open => { if (!open) setTextoEdit(null) }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeaderIcon icon={textoEdit?.id ? Pencil : Plus} color={textoEdit?.id ? 'sky' : 'emerald'}>
            <DialogTitle className="text-[15px]">{textoEdit?.id ? 'Editar texto' : 'Novo texto'}</DialogTitle>
            <DialogDescription className="text-[11px]">
              Título, descrição e valor. A descrição vira o texto padrão do item quando este texto for escolhido no orçamento.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-8">
                <Label className="text-xs font-medium">Título <span className="text-rose-500">*</span></Label>
                <Input
                  value={textoForm.titulo}
                  onChange={e => setTextoForm(f => ({ ...f, titulo: e.target.value }))}
                  className="h-9 text-sm"
                  placeholder="Ex.: Plano Básico"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs font-medium">Valor</Label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground shrink-0">R$</span>
                  <Input
                    inputMode="numeric"
                    value={textoForm.valor}
                    onChange={e => setTextoForm(f => ({ ...f, valor: mascaraMoeda(e.target.value) }))}
                    className="h-9 text-sm"
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Descrição</Label>
              <RichEditor
                value={textoForm.descricao}
                onChange={v => setTextoForm(f => ({ ...f, descricao: v }))}
                placeholder="Descreva este texto..."
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTextoEdit(null)} disabled={textoSaving}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleSaveTexto} disabled={textoSaving}>
              {textoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {textoEdit?.id ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
