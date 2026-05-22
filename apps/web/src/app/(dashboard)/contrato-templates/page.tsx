'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileBox, Loader2, Plus, MoreVertical, Trash2, Edit, X, Copy as CopyIcon,
  ChevronDown, FileText as FileTextIcon, Settings, Tag, Pencil,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Label,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
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
  categoria: ClausulaCategoria
  publicada: boolean
}

interface TemplateClausula {
  id: string
  templateId: string
  clausulaId: string
  ordem: number
  fixaVersao: boolean
  clausula: Clausula
}

interface Template {
  id: string
  nome: string
  descricao: string | null
  regimeTributario: string | null
  temIE: boolean | null
  comMovimento: boolean | null
  ativo: boolean
  clausulas: TemplateClausula[]
  _count?: { contratos: number }
}

const REGIMES = [
  { value: '', label: '— Qualquer —' },
  { value: 'SIMPLES', label: 'Simples Nacional' },
  { value: 'PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'REAL', label: 'Lucro Real' },
  { value: 'SEM_MOVIMENTO', label: 'Sem Movimento' },
]

export default function ContratoTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [clausulasDisponiveis, setClausulasDisponiveis] = useState<Clausula[]>([])
  const [loading, setLoading] = useState(true)

  // Modal CRUD do template
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formRegime, setFormRegime] = useState('')
  const [formTemIE, setFormTemIE] = useState<string>('any')
  const [formComMov, setFormComMov] = useState<string>('any')
  const [formAtivo, setFormAtivo] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Modal de organização das cláusulas
  const [orgOpen, setOrgOpen] = useState(false)
  const [orgTemplate, setOrgTemplate] = useState<Template | null>(null)
  const [orgClausulas, setOrgClausulas] = useState<Array<{ clausulaId: string; ordem: number; fixaVersao: boolean; titulo: string; codigo: string; categoria: ClausulaCategoria; versao: number }>>([])
  const [orgPickerOpen, setOrgPickerOpen] = useState(false)
  const [orgSavingClausulas, setOrgSavingClausulas] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [tpls, cls] = await Promise.all([
        (trpc.contrato as any).listTemplates.query(),
        (trpc.contrato as any).listClausulas.query({}),
      ])
      setTemplates(tpls || [])
      setClausulasDisponiveis((cls || []).filter((c: Clausula) => c.publicada))
    } catch (e) {
      console.warn('[Templates] erro:', (e as Error).message)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  function openCreate() {
    setEditing(null)
    setFormNome('')
    setFormDescricao('')
    setFormRegime('')
    setFormTemIE('any')
    setFormComMov('any')
    setFormAtivo(true)
    setEditorOpen(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setFormNome(t.nome)
    setFormDescricao(t.descricao || '')
    setFormRegime(t.regimeTributario || '')
    setFormTemIE(t.temIE === null ? 'any' : t.temIE ? 'true' : 'false')
    setFormComMov(t.comMovimento === null ? 'any' : t.comMovimento ? 'true' : 'false')
    setFormAtivo(t.ativo)
    setEditorOpen(true)
  }

  async function handleSalvar() {
    if (!formNome.trim()) return alerts.error('Erro', 'Nome é obrigatório')
    setSalvando(true)
    try {
      const payload = {
        nome: formNome,
        descricao: formDescricao || null,
        regimeTributario: formRegime || null,
        temIE: formTemIE === 'any' ? null : formTemIE === 'true',
        comMovimento: formComMov === 'any' ? null : formComMov === 'true',
        ativo: formAtivo,
      }
      if (editing) {
        await (trpc.contrato as any).updateTemplate.mutate({ id: editing.id, data: payload })
        await alerts.success('Atualizado', 'Modelo atualizado.')
      } else {
        await (trpc.contrato as any).createTemplate.mutate(payload)
        await alerts.success('Criado', 'Modelo criado.')
      }
      setEditorOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function handleExcluir(t: Template) {
    const ok = await alerts.confirm({ title: 'Desativar modelo?', text: t.nome, confirmText: 'Desativar', icon: 'warning' })
    if (!ok) return
    try {
      await (trpc.contrato as any).deleteTemplate.mutate({ id: t.id })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDuplicar(t: Template) {
    try {
      const novo = await (trpc.contrato as any).duplicateTemplate.mutate({ id: t.id })
      await alerts.success('Duplicado', `"${novo.nome}" criado com ${t.clausulas.length} cláusulas. Edite à vontade.`)
      fetchData()
      // Abre direto o editor pra ajustar nome/regime/IE etc.
      setTimeout(() => openEdit(novo), 100)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function abrirOrganizador(t: Template) {
    setOrgTemplate(t)
    setOrgClausulas(t.clausulas.map(tc => ({
      clausulaId: tc.clausulaId,
      ordem: tc.ordem,
      fixaVersao: tc.fixaVersao,
      titulo: tc.clausula.titulo,
      codigo: tc.clausula.codigo,
      categoria: tc.clausula.categoria,
      versao: tc.clausula.versao,
    })).sort((a, b) => a.ordem - b.ordem))
    setOrgOpen(true)
  }

  function adicionarClausula(c: Clausula) {
    if (orgClausulas.some(x => x.clausulaId === c.id)) {
      alerts.error('Erro', 'Cláusula já está no template')
      return
    }
    setOrgClausulas([...orgClausulas, {
      clausulaId: c.id,
      ordem: orgClausulas.length,
      fixaVersao: false,
      titulo: c.titulo,
      codigo: c.codigo,
      categoria: c.categoria,
      versao: c.versao,
    }])
    setOrgPickerOpen(false)
  }

  function removerClausula(idx: number) {
    setOrgClausulas(orgClausulas.filter((_, i) => i !== idx).map((x, i) => ({ ...x, ordem: i })))
  }

  function moverClausula(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= orgClausulas.length) return
    const arr = [...orgClausulas]
    const a = arr[idx]!
    const b = arr[newIdx]!
    arr[idx] = b
    arr[newIdx] = a
    setOrgClausulas(arr.map((x, i) => ({ ...x, ordem: i })))
  }

  function toggleFixa(idx: number) {
    const arr = [...orgClausulas]
    const item = arr[idx]
    if (!item) return
    item.fixaVersao = !item.fixaVersao
    setOrgClausulas(arr)
  }

  async function salvarOrganizacao() {
    if (!orgTemplate) return
    setOrgSavingClausulas(true)
    try {
      await (trpc.contrato as any).setTemplateClausulas.mutate({
        templateId: orgTemplate.id,
        clausulas: orgClausulas.map(c => ({ clausulaId: c.clausulaId, ordem: c.ordem, fixaVersao: c.fixaVersao })),
      })
      await alerts.success('Salvo', 'Cláusulas atualizadas.')
      setOrgOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setOrgSavingClausulas(false) }
  }

  // Cláusulas que ainda não estão no template (para o picker)
  const clausulasNaoAdicionadas = useMemo(() => {
    const inTpl = new Set(orgClausulas.map(c => c.clausulaId))
    return clausulasDisponiveis.filter(c => !inTpl.has(c.id))
  }, [clausulasDisponiveis, orgClausulas])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="comercial" icon={FileBox} />
          <div>
            <h1>Modelos de Contrato</h1>
            <p className="text-sm text-muted-foreground">Combine cláusulas em modelos para diferentes cenários (regime tributário, IE, movimento)</p>
          </div>
        </div>
        <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Modelo
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <Card className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </Card>
      ) : templates.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FileBox className="h-10 w-10 opacity-30 mb-3" />
          <p className="text-sm mb-3">Nenhum modelo cadastrado</p>
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Criar primeiro modelo
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map(t => (
            <Card key={t.id} className={cn('p-4 flex flex-col gap-3', !t.ativo && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate">{t.nome}</h3>
                  {t.descricao && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{t.descricao}</p>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => openEdit(t)} className="text-xs gap-2 cursor-pointer">
                      <Edit className="h-3.5 w-3.5" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => abrirOrganizador(t)} className="text-xs gap-2 cursor-pointer">
                      <Settings className="h-3.5 w-3.5" /> Organizar cláusulas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicar(t)} className="text-xs gap-2 cursor-pointer">
                      <CopyIcon className="h-3.5 w-3.5" /> Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExcluir(t)} className="text-xs gap-2 text-destructive cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" /> Desativar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {t.regimeTributario && (
                  <Badge variant="secondary" className="text-[10px] h-5 gap-1">
                    <Tag className="h-2.5 w-2.5" /> {t.regimeTributario}
                  </Badge>
                )}
                {t.temIE !== null && (
                  <Badge variant="secondary" className="text-[10px] h-5">{t.temIE ? 'Com IE' : 'Sem IE'}</Badge>
                )}
                {t.comMovimento !== null && (
                  <Badge variant="secondary" className="text-[10px] h-5">{t.comMovimento ? 'Com movimento' : 'Sem movimento'}</Badge>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <span className="flex items-center gap-1.5">
                  <FileTextIcon className="h-3.5 w-3.5" />
                  {t.clausulas.length} cláusula{t.clausulas.length !== 1 ? 's' : ''}
                </span>
                <span>{t._count?.contratos || 0} contrato{(t._count?.contratos || 0) !== 1 ? 's' : ''} usando</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Criar/Editar */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeaderIcon icon={editing ? Pencil : Plus} color={editing ? 'sky' : 'emerald'}>
            <DialogTitle>{editing ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
            <DialogDescription>Defina nome e cenário aplicável. Adicione cláusulas depois pelo menu "Organizar".</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Nome *</Label>
              <Input value={formNome} onChange={e => setFormNome(e.target.value)} placeholder="Ex: Simples Nacional COM IE" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <Input value={formDescricao} onChange={e => setFormDescricao(e.target.value)} placeholder="Quando usar este modelo" className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Regime</Label>
                <Select value={formRegime || 'any'} onValueChange={v => setFormRegime(v === 'any' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Qualquer</SelectItem>
                    {REGIMES.filter(r => r.value).map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Tem IE?</Label>
                <Select value={formTemIE} onValueChange={setFormTemIE}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Indiferente</SelectItem>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Com mov?</Label>
                <Select value={formComMov} onValueChange={setFormComMov}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Indiferente</SelectItem>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input id="ativo" type="checkbox" checked={formAtivo} onChange={e => setFormAtivo(e.target.checked)} className="h-4 w-4 rounded border-input accent-rose-600" />
              <Label htmlFor="ativo" className="text-[13px] font-semibold cursor-pointer">Ativo</Label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={handleSalvar} disabled={salvando} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Organizador */}
      <Dialog open={orgOpen} onOpenChange={setOrgOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[88vh] overflow-y-auto">
          <DialogHeaderIcon icon={Settings} color="slate">
            <DialogTitle>Organizar cláusulas — {orgTemplate?.nome}</DialogTitle>
            <DialogDescription>
              Adicione, remova e ordene. <strong>Versão flutuante</strong> = sempre usa a publicada mais recente do código (recomendado).
              <strong> Travada</strong> = fixa essa versão específica.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="space-y-2">
              {orgClausulas.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed rounded-md">
                  Nenhuma cláusula adicionada. Use o botão abaixo.
                </div>
              ) : orgClausulas.map((c, idx) => (
                <div key={c.clausulaId} className="flex items-center gap-2 rounded-md border bg-card p-2.5">
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => moverClausula(idx, -1)}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    ><ChevronDown className="h-3.5 w-3.5 rotate-180" /></button>
                    <button
                      type="button"
                      onClick={() => moverClausula(idx, 1)}
                      disabled={idx === orgClausulas.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    ><ChevronDown className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground w-6 text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{c.codigo}</code>
                      <span className="text-[10px] text-muted-foreground">v{c.versao}</span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{CLAUSULA_CATEGORIA_LABELS[c.categoria]}</Badge>
                    </div>
                    <p className="text-xs font-medium truncate">{c.titulo}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleFixa(idx)}
                    className={cn(
                      'text-[10px] px-2 py-1 rounded border transition-colors shrink-0',
                      c.fixaVersao
                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400',
                    )}
                    title={c.fixaVersao ? 'Versão travada — clique para soltar' : 'Versão flutuante — clique para travar'}
                  >
                    {c.fixaVersao ? `Travada na v${c.versao}` : 'Flutuante'}
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => removerClausula(idx)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setOrgPickerOpen(true)}
              disabled={clausulasNaoAdicionadas.length === 0}
            >
              <Plus className="h-3.5 w-3.5" />
              {clausulasNaoAdicionadas.length === 0 ? 'Todas as cláusulas já adicionadas' : 'Adicionar cláusula'}
            </Button>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrgOpen(false)} disabled={orgSavingClausulas}>Cancelar</Button>
            <Button size="sm" onClick={salvarOrganizacao} disabled={orgSavingClausulas} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              {orgSavingClausulas ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar organização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Picker de cláusulas pra adicionar */}
      <Dialog open={orgPickerOpen} onOpenChange={setOrgPickerOpen}>
        <DialogContent className="sm:max-w-[540px] max-h-[70vh] overflow-y-auto">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Adicionar cláusula ao modelo</DialogTitle>
            <DialogDescription>Apenas cláusulas publicadas aparecem aqui.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-1">
            {clausulasNaoAdicionadas.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">Nenhuma cláusula disponível</p>
            ) : clausulasNaoAdicionadas.map(c => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left p-2.5 rounded-md hover:bg-muted/40 border"
                onClick={() => adicionarClausula(c)}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{c.codigo}</code>
                  <span className="text-[10px] text-muted-foreground">v{c.versao}</span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{CLAUSULA_CATEGORIA_LABELS[c.categoria]}</Badge>
                </div>
                <p className="text-sm font-medium">{c.titulo}</p>
              </button>
            ))}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
