'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, Search, Loader2, Plus, MoreVertical, Trash2, Edit, History,
  FileCheck2, FileX2, Tag, Pencil,
  ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CLAUSULA_CATEGORIA_LABELS, type ClausulaCategoria } from '@saas/types'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Clausula {
  id: string
  codigo: string
  versao: number
  titulo: string
  conteudo: string
  categoria: ClausulaCategoria
  parentId: string | null
  ordem: number
  publicada: boolean
  publicadaEm: string | null
  notasVersao: string | null
  createdAt: string
}

const CATEGORIAS_ORDEM: ClausulaCategoria[] = [
  'OBJETO', 'RESPONSABILIDADES', 'OBRIGACOES', 'DISPOSICOES',
  'DOCUMENTACAO', 'PRIVACIDADE', 'HONORARIOS', 'EXTRAORDINARIOS',
  'VIGENCIA', 'FORO', 'OUTROS',
]

export default function ClausulasPage() {
  const [clausulas, setClausulas] = useState<Clausula[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')

  // Categorias expandidas (todas começam recolhidas).
  const [categoriasExpandidas, setCategoriasExpandidas] = useState<Set<string>>(new Set())
  function toggleCategoria(cat: string) {
    setCategoriasExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  // Modal CRUD
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Clausula | null>(null)
  const [formCodigo, setFormCodigo] = useState('')
  const [formTitulo, setFormTitulo] = useState('')
  const [formConteudo, setFormConteudo] = useState('')
  const [formCategoria, setFormCategoria] = useState<ClausulaCategoria>('OUTROS')
  const [formParentId, setFormParentId] = useState<string>('none')
  const [formOrdem, setFormOrdem] = useState('0')
  const [formPublicada, setFormPublicada] = useState(false)
  const [formNotas, setFormNotas] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal Histórico
  const [histOpen, setHistOpen] = useState(false)
  const [histCodigo, setHistCodigo] = useState('')
  const [histVersoes, setHistVersoes] = useState<Clausula[]>([])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.contrato as any).listClausulas.query({})
      setClausulas(data || [])
    } catch (e) {
      console.warn('[Clausulas] erro:', (e as Error).message)
      setClausulas([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Agrupar por categoria
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const filtered = clausulas.filter((c) => {
      if (filtroCategoria !== 'todas' && c.categoria !== filtroCategoria) return false
      if (q && !c.codigo.toLowerCase().includes(q) && !c.titulo.toLowerCase().includes(q)) return false
      return true
    })
    const map = new Map<ClausulaCategoria, Clausula[]>()
    for (const cat of CATEGORIAS_ORDEM) map.set(cat, [])
    for (const c of filtered) {
      if (!map.has(c.categoria)) map.set(c.categoria, [])
      map.get(c.categoria)!.push(c)
    }
    // Sort: pais primeiro, depois por código
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        if (!a.parentId && b.parentId) return -1
        if (a.parentId && !b.parentId) return 1
        return a.codigo.localeCompare(b.codigo)
      })
    }
    return map
  }, [clausulas, busca, filtroCategoria])

  function openCreate() {
    setEditing(null)
    setFormCodigo('')
    setFormTitulo('')
    setFormConteudo('')
    setFormCategoria('OUTROS')
    setFormParentId('none')
    setFormOrdem('0')
    setFormPublicada(false)
    setFormNotas('')
    setEditorOpen(true)
  }

  function openEdit(c: Clausula) {
    setEditing(c)
    setFormCodigo(c.codigo)
    setFormTitulo(c.titulo)
    setFormConteudo(c.conteudo || '')
    setFormCategoria(c.categoria)
    setFormParentId(c.parentId || 'none')
    setFormOrdem(String(c.ordem))
    setFormPublicada(c.publicada)
    setFormNotas('')
    setEditorOpen(true)
  }

  async function handleSalvar() {
    if (!formTitulo.trim()) return alerts.error('Erro', 'Título é obrigatório')
    if (!editing && !formCodigo.trim()) return alerts.error('Erro', 'Código é obrigatório')
    setSalvando(true)
    try {
      const payload = {
        titulo: formTitulo,
        conteudo: formConteudo,
        categoria: formCategoria,
        parentId: formParentId === 'none' ? null : formParentId,
        ordem: Number(formOrdem) || 0,
        publicada: formPublicada,
        notasVersao: formNotas || null,
      }
      if (editing) {
        await (trpc.contrato as any).updateClausula.mutate({ id: editing.id, data: payload })
        await alerts.success('Atualizado', `Nova versão da cláusula "${editing.codigo}" criada.`)
      } else {
        await (trpc.contrato as any).createClausula.mutate({ codigo: formCodigo, ...payload })
        await alerts.success('Criada', `Cláusula "${formCodigo}" cadastrada.`)
      }
      setEditorOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function handlePublicar(c: Clausula) {
    try {
      await (trpc.contrato as any).publicarClausula.mutate({ id: c.id })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleExcluir(c: Clausula) {
    const ok = await alerts.confirm({
      title: 'Despublicar cláusula?',
      text: `Todas as versões de "${c.codigo}" serão despublicadas. Contratos antigos não são afetados (snapshots permanecem).`,
      confirmText: 'Despublicar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.contrato as any).deleteClausula.mutate({ codigo: c.codigo })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function abrirHistorico(c: Clausula) {
    setHistCodigo(c.codigo)
    setHistOpen(true)
    try {
      const data = await (trpc.contrato as any).listClausulaVersoes.query({ codigo: c.codigo })
      setHistVersoes(data || [])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setHistVersoes([])
    }
  }

  // Lista plana de potenciais "pais" para o select hierárquico (apenas raiz)
  const possibleParents = clausulas.filter(c => !c.parentId && c.id !== editing?.id)

  return (
    <div className="space-y-5">
      {/* Header padrão Comercial */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="comercial" icon={FileText} />
          <div>
            <h1>Cláusulas</h1>
            <p className="text-sm text-muted-foreground">Biblioteca de cláusulas para montar contratos — versionadas, com histórico</p>
          </div>
        </div>
        <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova Cláusula
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por código ou título..." className="pl-8 h-9 text-sm" />
          </div>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="h-9 text-sm w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIAS_ORDEM.map(cat => (
                <SelectItem key={cat} value={cat}>{CLAUSULA_CATEGORIA_LABELS[cat]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {clausulas.length} cláusula{clausulas.length !== 1 ? 's' : ''} cadastrada{clausulas.length !== 1 ? 's' : ''}
          </span>
        </div>
      </Card>

      {/* Lista por categoria */}
      {loading ? (
        <Card className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando cláusulas...
        </Card>
      ) : clausulas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm mb-3">Nenhuma cláusula cadastrada ainda</p>
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova Cláusula
          </Button>
        </Card>
      ) : (() => {
        // Categorias com itens (depois dos filtros). Usado pra "Expandir tudo".
        const categoriasComItens = CATEGORIAS_ORDEM.filter(cat => (grupos.get(cat) || []).length > 0)
        return (
        <>
          {/* Barra de ações: expandir/recolher todas */}
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setCategoriasExpandidas(new Set(categoriasComItens))}
              disabled={categoriasExpandidas.size === categoriasComItens.length}
            >
              <ChevronsUpDown className="h-3.5 w-3.5" /> Expandir tudo
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setCategoriasExpandidas(new Set())}
              disabled={categoriasExpandidas.size === 0}
            >
              <ChevronsDownUp className="h-3.5 w-3.5" /> Recolher tudo
            </Button>
          </div>

        <div className="space-y-3">
          {CATEGORIAS_ORDEM.map(cat => {
            const items = grupos.get(cat) || []
            if (items.length === 0) return null
            const isOpen = categoriasExpandidas.has(cat)
            return (
              <Card key={cat} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategoria(cat)}
                  className={cn(
                    'w-full border-b bg-muted/30 px-4 py-2.5 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left cursor-pointer',
                    !isOpen && 'border-b-transparent',
                  )}
                >
                  {isOpen
                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <Tag className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider flex-1">{CLAUSULA_CATEGORIA_LABELS[cat]}</h3>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{items.length}</Badge>
                </button>
                {isOpen && (
                <div className="divide-y divide-border/60">
                  {items.map(c => (
                    <div key={c.id} className={cn('group px-4 py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors', c.parentId && 'pl-10')}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded">{c.codigo}</code>
                          <span className="text-[10px] text-muted-foreground">v{c.versao}</span>
                          {c.publicada ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] h-4 px-1.5 gap-1">
                              <FileCheck2 className="h-2.5 w-2.5" /> Publicada
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-1">
                              <FileX2 className="h-2.5 w-2.5" /> Rascunho
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">{c.titulo}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => openEdit(c)} className="text-xs gap-2 cursor-pointer">
                            <Edit className="h-3.5 w-3.5" /> Editar (nova versão)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => abrirHistorico(c)} className="text-xs gap-2 cursor-pointer">
                            <History className="h-3.5 w-3.5" /> Histórico
                          </DropdownMenuItem>
                          {!c.publicada && (
                            <DropdownMenuItem onClick={() => handlePublicar(c)} className="text-xs gap-2 cursor-pointer">
                              <FileCheck2 className="h-3.5 w-3.5" /> Publicar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleExcluir(c)} className="text-xs gap-2 text-destructive cursor-pointer">
                            <Trash2 className="h-3.5 w-3.5" /> Despublicar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
                )}
              </Card>
            )
          })}
        </div>
        </>
        )
      })()}

      {/* Modal Edit/Create */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-[820px] max-h-[88vh] overflow-y-auto">
          <DialogHeaderIcon icon={editing ? Pencil : Plus} color={editing ? 'sky' : 'emerald'}>
            <DialogTitle>
              {editing ? (
                <span className="flex items-center gap-2">
                  Editar cláusula <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{editing.codigo}</code>
                  <span className="text-xs text-muted-foreground font-normal">→ criará v{editing.versao + 1}</span>
                </span>
              ) : 'Nova Cláusula'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Editar cria uma NOVA versão. Contratos antigos preservam o snapshot da versão original.'
                : 'O código é estável entre versões — use algo como OBJ.CONTABIL ou RESP.5.'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Código *</Label>
                <Input
                  value={formCodigo}
                  onChange={e => setFormCodigo(e.target.value.toUpperCase())}
                  placeholder="Ex: OBJ.CONTABIL"
                  disabled={!!editing}
                  className="h-9 text-sm font-mono"
                />
              </div>
              <div className="col-span-12 sm:col-span-5 space-y-1.5">
                <Label className="text-[13px] font-semibold">Título *</Label>
                <Input value={formTitulo} onChange={e => setFormTitulo(e.target.value)} placeholder="Título da cláusula" className="h-9 text-sm" />
              </div>
              <div className="col-span-12 sm:col-span-3 space-y-1.5">
                <Label className="text-[13px] font-semibold">Categoria</Label>
                <Select value={formCategoria} onValueChange={v => setFormCategoria(v as ClausulaCategoria)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_ORDEM.map(cat => (
                      <SelectItem key={cat} value={cat}>{CLAUSULA_CATEGORIA_LABELS[cat]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-8 space-y-1.5">
                <Label className="text-[13px] font-semibold">Cláusula pai (hierarquia)</Label>
                <Select value={formParentId} onValueChange={setFormParentId}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nenhuma (cláusula raiz) —</SelectItem>
                    {possibleParents.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        [{p.codigo}] {p.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-2 space-y-1.5">
                <Label className="text-[13px] font-semibold">Ordem</Label>
                <Input type="number" value={formOrdem} onChange={e => setFormOrdem(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-6 sm:col-span-2 flex items-end gap-2 pb-1">
                <input
                  id="publ"
                  type="checkbox"
                  checked={formPublicada}
                  onChange={e => setFormPublicada(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-rose-600"
                />
                <Label htmlFor="publ" className="text-[13px] font-semibold cursor-pointer">Publicar</Label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Conteúdo (HTML)</Label>
              <RichEditor
                value={formConteudo}
                onChange={setFormConteudo}
                placeholder="Texto da cláusula. Pode usar placeholders {{cliente.razao_social}}, {{honorario.valor}}..."
              />
              <p className="text-[10px] text-muted-foreground">
                Placeholders disponíveis: <code>{'{{cliente.razao_social}}'}</code>, <code>{'{{cliente.cnpj}}'}</code>, <code>{'{{honorario.valor}}'}</code>, <code>{'{{contrato.numero}}'}</code>, <code>{'{{contrato.data_inicio}}'}</code>
              </p>
            </div>

            {editing && (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Notas da nova versão (changelog)</Label>
                <Input
                  value={formNotas}
                  onChange={e => setFormNotas(e.target.value)}
                  placeholder="Ex: Atualização do código de ética CFC nº 803/96 → 1.474/24"
                  className="h-9 text-sm"
                />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button
              size="sm"
              onClick={handleSalvar}
              disabled={salvando}
              style={{ backgroundColor: MODULE_COLOR }}
              className="text-white gap-1.5"
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              {editing ? 'Criar nova versão' : 'Cadastrar cláusula'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Histórico */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeaderIcon icon={History} color="rose">
            <DialogTitle className="flex items-center gap-2">
              Histórico — <code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{histCodigo}</code>
            </DialogTitle>
            <DialogDescription>Todas as versões dessa cláusula. A versão publicada é a que entra em novos contratos.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-2">
            {histVersoes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhuma versão encontrada</p>
            ) : histVersoes.map(v => (
              <div key={v.id} className={cn('rounded-md border p-3', v.publicada && 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20')}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold">v{v.versao}</span>
                  {v.publicada && <Badge className="bg-emerald-100 text-emerald-700 text-[10px] h-4 px-1.5">Publicada</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {v.publicadaEm
                      ? `Publicada em ${new Date(v.publicadaEm).toLocaleDateString('pt-BR')}`
                      : `Criada em ${new Date(v.createdAt).toLocaleDateString('pt-BR')}`}
                  </span>
                </div>
                <p className="text-sm font-medium mb-1">{v.titulo}</p>
                {v.notasVersao && (
                  <p className="text-xs text-muted-foreground italic">📝 {v.notasVersao}</p>
                )}
                <div
                  className="text-xs text-muted-foreground mt-2 line-clamp-2 prose prose-xs"
                  dangerouslySetInnerHTML={{ __html: v.conteudo || '<i>(sem conteúdo)</i>' }}
                />
              </div>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
