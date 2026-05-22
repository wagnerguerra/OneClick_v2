'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, Plus, Pencil, Trash2, ArrowLeft, Shield, CheckCircle2,
  Mail, Bell, ClipboardList, BookOpen, X, ChevronDown,
  AlertTriangle, MailWarning, Clock, Star, Zap, RotateCcw,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Collapsible, CollapsibleTrigger, CollapsibleContent,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import Link from 'next/link'

// ============================================================
// Tipos
// ============================================================

interface Regra {
  id: string
  nome: string
  descricao: string | null
  tipo: string
  ativo: boolean
  ordem: number
  palavrasChave: string | null
  origemContem: string | null
  assuntoContem: string | null
  codigoSistema: string | null
  pesoScore: number
  prioridadeMinima: string | null
  marcarRelevante: boolean
  desconsiderarSePesoMenor: number | null
  autoNotificar: boolean
  autoNotificarLider: boolean
  autoNotificarGerente: boolean
  autoCriarTarefa: boolean
  autoMarcarLida: boolean
  emailsExtras: string | null
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  PRIORIDADE: { label: 'Prioridade', color: 'bg-sky-100 text-sky-800 border-sky-200' },
  RELEVANCIA: { label: 'Relevância', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  DESCONSIDERAR: { label: 'Desconsiderar', color: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const EMPTY_FORM: Omit<Regra, 'id'> = {
  nome: '', descricao: null, tipo: 'PRIORIDADE', ativo: true, ordem: 0,
  palavrasChave: null, origemContem: null, assuntoContem: null, codigoSistema: null,
  pesoScore: 0, prioridadeMinima: null, marcarRelevante: false, desconsiderarSePesoMenor: null,
  autoNotificar: false, autoNotificarLider: false, autoNotificarGerente: false,
  autoCriarTarefa: false, autoMarcarLida: false, emailsExtras: null,
}

// ============================================================
// Tipo da configuração do classificador
// ============================================================

interface KeywordCategory { peso: number; palavras: string[] }

interface ClassifierConfig {
  thresholds: { P0: number; P1: number; P2: number }
  keywords: { criticas: KeywordCategory; medias: KeywordCategory; baixas: KeywordCategory }
  deadline: { vencido: number; urgente: number; proximo: number; valido: number }
  relevance: { alta: number; indicada: number }
  unread: { base: number; ciencia: number; prazoUrgente: number }
  acoesRecomendadas: { P0: string; P1: string; P2: string; P3: string }
}

// ============================================================
// Componente
// ============================================================

export default function CaixaPostalRegrasPage() {
  const [regras, setRegras] = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)

  // Config do classificador (editável)
  const [config, setConfig] = useState<ClassifierConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [configEditing, setConfigEditing] = useState(false)
  const [configDraft, setConfigDraft] = useState<ClassifierConfig | null>(null)
  const [configSaving, setConfigSaving] = useState(false)

  // Modal de edição de regra personalizada
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Keyword editing temp state
  const [kwInput, setKwInput] = useState<Record<string, string>>({})

  const fetchRegras = useCallback(async () => {
    setLoading(true)
    try {
      const data = await trpc.caixaPostal.regras.list.query() as Regra[]
      setRegras(data)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
    thresholds: { P0: 80, P1: 55, P2: 25 },
    keywords: {
      criticas: { peso: 30, palavras: ['INTIMACAO', 'TERMO DE INTIMACAO', 'NOTIFICACAO', 'AUTO DE INFRACAO', 'LANCAMENTO', 'FISCALIZACAO', 'DILIGENCIA', 'EXIGENCIA', 'PROCESSO', 'PRAZO', 'PENALIDADE', 'EXCLUSAO', 'SIMPLES', 'DTE', 'DTE-SN', 'PER/DCOMP', 'NAO HOMOLOGACAO', 'COMPENSACAO', 'DEBITO', 'INSCRICAO', 'COBRANCA', 'MULTA', 'APURACAO', 'DEFERIMENTO', 'INDEFERIMENTO'] },
      medias: { peso: 15, palavras: ['PENDENCIA', 'INCONSISTENCIA', 'MALHA', 'DIVERGENCIA', 'REGULARIDADE', 'CERTIDAO', 'CND', 'CPEND', 'RETIFICACAO', 'COMPLEMENTACAO'] },
      baixas: { peso: 5, palavras: ['COMUNICADO', 'ORIENTACAO', 'INFORMATIVO', 'AVISO', 'ATUALIZACAO'] },
    },
    deadline: { vencido: 50, urgente: 40, proximo: 25, valido: 10 },
    relevance: { alta: 35, indicada: 15 },
    unread: { base: 10, ciencia: 15, prazoUrgente: 20 },
    acoesRecomendadas: {
      P0: 'Ler imediatamente, registrar tarefa e acionar responsável (Fiscal/Contábil/Jurídico). Verificar prazo e anexos.',
      P1: 'Ler hoje/esta semana e abrir tarefa de tratamento. Verificar prazo e anexos.',
      P2: 'Monitorar e tratar em rotina',
      P3: 'Somente ciência/arquivo',
    },
  }

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const data = await trpc.caixaPostal.config.get.query() as ClassifierConfig
      setConfig(data)
    } catch {
      // Fallback para config default se o endpoint falhar
      setConfig(DEFAULT_CLASSIFIER_CONFIG)
    }
    finally { setConfigLoading(false) }
  }, [])

  useEffect(() => { fetchRegras(); fetchConfig() }, [fetchRegras, fetchConfig])

  function handleEditConfig() {
    if (!config) return
    setConfigDraft(JSON.parse(JSON.stringify(config)))
    setKwInput({})
    setConfigEditing(true)
  }

  async function handleSaveConfig() {
    if (!configDraft) return
    setConfigSaving(true)
    try {
      const saved = await trpc.caixaPostal.config.update.mutate(configDraft) as ClassifierConfig
      setConfig(saved)
      setConfigEditing(false)
      setConfigDraft(null)
      await alerts.success('Configuração salva', 'As regras do classificador foram atualizadas.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setConfigSaving(false) }
  }

  async function handleResetConfig() {
    const ok = await alerts.confirm({
      title: 'Restaurar padrões',
      text: 'Isso irá restaurar todas as regras do classificador para os valores originais. Deseja continuar?',
      confirmText: 'Sim, restaurar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      const reset = await trpc.caixaPostal.config.reset.mutate() as ClassifierConfig
      setConfig(reset)
      setConfigEditing(false)
      setConfigDraft(null)
      await alerts.success('Restaurado', 'Configuração restaurada para os valores padrão.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  function updateDraft<K extends keyof ClassifierConfig>(section: K, value: ClassifierConfig[K]) {
    setConfigDraft(prev => prev ? { ...prev, [section]: value } : prev)
  }

  function addKeyword(category: 'criticas' | 'medias' | 'baixas') {
    const val = (kwInput[category] || '').trim().toUpperCase()
    if (!val || !configDraft) return
    const current = configDraft.keywords[category].palavras
    if (current.includes(val)) return
    updateDraft('keywords', {
      ...configDraft.keywords,
      [category]: { ...configDraft.keywords[category], palavras: [...current, val] },
    })
    setKwInput(prev => ({ ...prev, [category]: '' }))
  }

  function removeKeyword(category: 'criticas' | 'medias' | 'baixas', palavra: string) {
    if (!configDraft) return
    updateDraft('keywords', {
      ...configDraft.keywords,
      [category]: {
        ...configDraft.keywords[category],
        palavras: configDraft.keywords[category].palavras.filter(p => p !== palavra),
      },
    })
  }

  function handleNova() {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setModalOpen(true)
  }

  function handleEditar(regra: Regra) {
    setEditId(regra.id)
    setForm({ ...regra })
    setModalOpen(true)
  }

  async function handleSalvar() {
    if (!form.nome.trim()) { alerts.error('Erro', 'Nome é obrigatório'); return }
    setSaving(true)
    try {
      const payload = {
        nome: form.nome, descricao: form.descricao || undefined,
        tipo: form.tipo as 'PRIORIDADE' | 'RELEVANCIA' | 'DESCONSIDERAR',
        ativo: form.ativo, ordem: form.ordem,
        palavrasChave: form.palavrasChave || undefined,
        origemContem: form.origemContem || undefined,
        assuntoContem: form.assuntoContem || undefined,
        codigoSistema: form.codigoSistema || undefined,
        pesoScore: form.pesoScore, prioridadeMinima: (form.prioridadeMinima || undefined) as 'P0' | 'P1' | 'P2' | 'P3' | undefined,
        marcarRelevante: form.marcarRelevante,
        desconsiderarSePesoMenor: form.desconsiderarSePesoMenor ?? undefined,
        autoNotificar: form.autoNotificar, autoNotificarLider: form.autoNotificarLider,
        autoNotificarGerente: form.autoNotificarGerente,
        autoCriarTarefa: form.autoCriarTarefa, autoMarcarLida: form.autoMarcarLida,
        emailsExtras: form.emailsExtras || undefined,
      }

      if (editId) {
        await trpc.caixaPostal.regras.update.mutate({ id: editId, data: payload })
        await alerts.success('Regra atualizada', '')
      } else {
        await trpc.caixaPostal.regras.create.mutate(payload)
        await alerts.success('Regra criada', '')
      }
      setModalOpen(false)
      fetchRegras()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSaving(false) }
  }

  async function handleExcluir(id: string) {
    if (!await alerts.confirmDelete('esta regra')) return
    try {
      await trpc.caixaPostal.regras.delete.mutate({ id })
      fetchRegras()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleToggleAtivo(regra: Regra) {
    try {
      await trpc.caixaPostal.regras.update.mutate({ id: regra.id, data: { ativo: !regra.ativo } })
      fetchRegras()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      {/* Modal de criação/edição */}
      <Dialog open={modalOpen} onOpenChange={(o) => { if (!o) setModalOpen(false) }}>
        <DialogContent className="max-w-[640px]">
          <DialogHeaderIcon icon={editId ? Pencil : Plus} color={editId ? 'sky' : 'emerald'}>
            <DialogTitle>{editId ? 'Editar Regra' : 'Nova Regra'}</DialogTitle>
            <DialogDescription>Configure as condições e ações da regra de classificação</DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="space-y-5">
            {/* Dados básicos */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-8 space-y-1">
                <label className="text-xs font-medium">Nome *</label>
                <Input value={form.nome} onChange={e => setField('nome', e.target.value)} placeholder="Nome da regra" className="h-8 text-xs" />
              </div>
              <div className="col-span-4 space-y-1">
                <label className="text-xs font-medium">Tipo</label>
                <Select value={form.tipo} onValueChange={v => setField('tipo', v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRIORIDADE">Prioridade</SelectItem>
                    <SelectItem value="RELEVANCIA">Relevância</SelectItem>
                    <SelectItem value="DESCONSIDERAR">Desconsiderar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 space-y-1">
                <label className="text-xs font-medium">Descrição</label>
                <Input value={form.descricao || ''} onChange={e => setField('descricao', e.target.value || null)} placeholder="Descrição opcional" className="h-8 text-xs" />
              </div>
              <div className="col-span-6 space-y-1">
                <label className="text-xs font-medium">Ordem</label>
                <Input type="number" value={form.ordem} onChange={e => setField('ordem', Number(e.target.value))} className="h-8 text-xs" />
              </div>
              <div className="col-span-6 flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.ativo} onCheckedChange={v => setField('ativo', !!v)} />
                  Regra ativa
                </label>
              </div>
            </div>

            {/* Condições */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condições</h4>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-12 space-y-1">
                  <label className="text-xs font-medium">Palavras-chave (separadas por vírgula)</label>
                  <Input value={form.palavrasChave || ''} onChange={e => setField('palavrasChave', e.target.value || null)} placeholder="INTIMACAO, NOTIFICACAO, AUTO DE INFRACAO" className="h-8 text-xs" />
                </div>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs font-medium">Origem contém</label>
                  <Input value={form.origemContem || ''} onChange={e => setField('origemContem', e.target.value || null)} placeholder="Ex: RECEITA FEDERAL" className="h-8 text-xs" />
                </div>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs font-medium">Assunto contém</label>
                  <Input value={form.assuntoContem || ''} onChange={e => setField('assuntoContem', e.target.value || null)} placeholder="Ex: MALHA FISCAL" className="h-8 text-xs" />
                </div>
                <div className="col-span-6 space-y-1">
                  <label className="text-xs font-medium">Código do sistema</label>
                  <Input value={form.codigoSistema || ''} onChange={e => setField('codigoSistema', e.target.value || null)} placeholder="Ex: DTE-SN" className="h-8 text-xs" />
                </div>
              </div>
            </div>

            {/* Classificação */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Classificação</h4>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-medium">Peso adicional</label>
                  <Input type="number" value={form.pesoScore} onChange={e => setField('pesoScore', Number(e.target.value))} className="h-8 text-xs" />
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-medium">Prioridade mínima</label>
                  <Select value={form.prioridadeMinima || '__none__'} onValueChange={v => setField('prioridadeMinima', v === '__none__' ? null : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      <SelectItem value="P0">P0 (Crítica)</SelectItem>
                      <SelectItem value="P1">P1 (Alta)</SelectItem>
                      <SelectItem value="P2">P2 (Média)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 space-y-1">
                  <label className="text-xs font-medium">Desconsiderar se peso &lt;</label>
                  <Input type="number" value={form.desconsiderarSePesoMenor ?? ''} onChange={e => setField('desconsiderarSePesoMenor', e.target.value ? Number(e.target.value) : null)} placeholder="—" className="h-8 text-xs" />
                </div>
                <div className="col-span-12">
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={form.marcarRelevante} onCheckedChange={v => setField('marcarRelevante', !!v)} />
                    Marcar como relevante
                  </label>
                </div>
              </div>
            </div>

            {/* Ações automáticas */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ações Automáticas</h4>
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.autoNotificar} onCheckedChange={v => setField('autoNotificar', !!v)} />
                  <Mail className="h-3.5 w-3.5 text-sky-500" /> Notificar responsável (todos os usuários da empresa)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.autoNotificarLider} onCheckedChange={v => setField('autoNotificarLider', !!v)} />
                  <Bell className="h-3.5 w-3.5 text-amber-500" /> Notificar líder da área
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.autoNotificarGerente} onCheckedChange={v => setField('autoNotificarGerente', !!v)} />
                  <Shield className="h-3.5 w-3.5 text-red-500" /> Notificar gerente geral (MASTER/ADMIN)
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.autoCriarTarefa} onCheckedChange={v => setField('autoCriarTarefa', !!v)} />
                  <ClipboardList className="h-3.5 w-3.5 text-purple-500" /> Criar tarefa/obrigação
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={form.autoMarcarLida} onCheckedChange={v => setField('autoMarcarLida', !!v)} />
                  <BookOpen className="h-3.5 w-3.5 text-gray-400" /> Marcar como lida automaticamente
                </label>
                <div className="mt-2 space-y-1">
                  <label className="text-xs font-medium">E-mails extras (separados por vírgula)</label>
                  <Input value={form.emailsExtras || ''} onChange={e => setField('emailsExtras', e.target.value || null)} placeholder="email1@empresa.com, email2@empresa.com" className="h-8 text-xs" />
                </div>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={handleSalvar} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {editId ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="fiscal" icon={Shield} />
          <div>
            <h1>Regras de Classificação</h1>
            <p className="text-sm text-muted-foreground">Gerencie regras automáticas de classificação de mensagens da Caixa Postal e-CAC</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={handleNova} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Regra
          </Button>
          <Link href="/caixapostal">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" />Voltar</Button>
          </Link>
        </div>
      </div>

      {/* Regras do Sistema (editáveis) */}
      {(() => {
        const cfg = configEditing ? configDraft : config
        if (configLoading || !cfg) return (
          <Card><div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" />Carregando configuração...</div></Card>
        )

        const ScoreInput = ({ value, onChange, className }: { value: number; onChange: (v: number) => void; className?: string }) => (
          configEditing
            ? <Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} className={cn('h-6 w-16 text-[10px] text-center px-1', className)} />
            : <span className={cn('text-[10px] font-bold', className)}>+{value} pts</span>
        )

        const KW_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof AlertTriangle; label: string }> = {
          criticas: { border: 'border-red-200 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400', icon: AlertTriangle, label: 'Críticas' },
          medias: { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', icon: Clock, label: 'Médias' },
          baixas: { border: 'border-gray-200 dark:border-gray-700', bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', icon: Mail, label: 'Baixas' },
        }

        return (
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-50 dark:bg-indigo-900/20">
                      <Zap className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Regras do Sistema</h3>
                      <p className="text-[11px] text-muted-foreground">Critérios automáticos de classificação — clique para expandir e editar</p>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t px-5 pb-5 space-y-5">
                  {/* Toolbar */}
                  <div className="pt-4 flex items-center justify-end gap-2">
                    {configEditing ? (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setConfigEditing(false); setConfigDraft(null) }} className="text-[11px] h-7">Cancelar</Button>
                        <Button variant="outline" size="sm" onClick={handleResetConfig} className="text-[11px] h-7 gap-1 text-amber-600">
                          <RotateCcw className="h-3 w-3" />Restaurar padrões
                        </Button>
                        <Button variant="success" size="sm" onClick={handleSaveConfig} disabled={configSaving} className="text-[11px] h-7 gap-1">
                          {configSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Salvar
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handleEditConfig} className="text-[11px] h-7 gap-1">
                        <Pencil className="h-3 w-3" />Editar
                      </Button>
                    )}
                  </div>

                  {/* Faixas de prioridade */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Faixas de Prioridade (Score)</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {([
                        { key: 'P0' as const, label: 'P0 — Crítica', icon: AlertTriangle, border: 'border-red-200 dark:border-red-800', bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-400' },
                        { key: 'P1' as const, label: 'P1 — Alta', icon: MailWarning, border: 'border-orange-200 dark:border-orange-800', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400' },
                        { key: 'P2' as const, label: 'P2 — Média', icon: Clock, border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400' },
                      ]).map(p => {
                        const Icon = p.icon
                        return (
                          <div key={p.key} className={cn('rounded-lg border p-3 text-center', p.border, p.bg)}>
                            <div className="flex items-center justify-center gap-1.5 mb-1">
                              <Icon className={cn('h-3.5 w-3.5', p.text)} />
                              <span className={cn('text-xs font-bold', p.text)}>{p.label}</span>
                            </div>
                            {configEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <span className={cn('text-xs', p.text)}>&ge;</span>
                                <Input type="number" value={cfg.thresholds[p.key]} onChange={e => updateDraft('thresholds', { ...cfg.thresholds, [p.key]: Number(e.target.value) })} className="h-7 w-16 text-center text-sm font-bold" />
                              </div>
                            ) : (
                              <p className={cn('text-lg font-bold', p.text)}>&ge; {cfg.thresholds[p.key]}</p>
                            )}
                          </div>
                        )
                      })}
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Mail className="h-3.5 w-3.5 text-gray-500" />
                          <span className="text-xs font-bold text-gray-600 dark:text-gray-400">P3 — Baixa</span>
                        </div>
                        <p className="text-lg font-bold text-gray-600 dark:text-gray-400">&lt; {cfg.thresholds.P2}</p>
                      </div>
                    </div>
                  </div>

                  {/* Critérios de pontuação */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Critérios de Pontuação</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Urgência por prazo */}
                      <div className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-red-500" />
                          <span className="text-xs font-semibold">Urgência por Prazo</span>
                        </div>
                        <div className="space-y-1">
                          {([
                            { label: 'Prazo vencido (≤ 0 dias)', field: 'vencido' as const, color: 'bg-red-50 text-red-700 border-red-200' },
                            { label: 'Prazo urgente (1–3 dias)', field: 'urgente' as const, color: 'bg-orange-50 text-orange-700 border-orange-200' },
                            { label: 'Prazo próximo (4–10 dias)', field: 'proximo' as const, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                            { label: 'Prazo válido (> 10 dias)', field: 'valido' as const, color: '' },
                          ]).map(item => (
                            <div key={item.field} className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">{item.label}</span>
                              <Badge variant="outline" className={cn('text-[10px]', item.color)}>
                                <ScoreInput value={cfg.deadline[item.field]} onChange={v => updateDraft('deadline', { ...cfg.deadline, [item.field]: v })} />
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Relevância */}
                      <div className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <Star className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs font-semibold">Relevância e Leitura</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Alta relevância (API)</span>
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              <ScoreInput value={cfg.relevance.alta} onChange={v => updateDraft('relevance', { ...cfg.relevance, alta: v })} />
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Relevância indicada</span>
                            <Badge variant="outline" className="text-[10px]">
                              <ScoreInput value={cfg.relevance.indicada} onChange={v => updateDraft('relevance', { ...cfg.relevance, indicada: v })} />
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Mensagem não lida</span>
                            <Badge variant="outline" className="text-[10px]">
                              <ScoreInput value={cfg.unread.base} onChange={v => updateDraft('unread', { ...cfg.unread, base: v })} />
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Ciência registrada + não lida</span>
                            <Badge variant="outline" className="text-[10px]">
                              <ScoreInput value={cfg.unread.ciencia} onChange={v => updateDraft('unread', { ...cfg.unread, ciencia: v })} />
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Não lida + prazo urgente</span>
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                              <ScoreInput value={cfg.unread.prazoUrgente} onChange={v => updateDraft('unread', { ...cfg.unread, prazoUrgente: v })} />
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Palavras-chave */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Palavras-Chave</h4>
                    <div className="space-y-3">
                      {(['criticas', 'medias', 'baixas'] as const).map(cat => {
                        const style = KW_STYLES[cat]!
                        const KwIcon = style.icon
                        const catCfg = cfg.keywords[cat]
                        return (
                          <div key={cat} className={cn('rounded-lg border p-3', style.border)}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <KwIcon className={cn('h-3.5 w-3.5', style.text)} />
                                <span className={cn('text-xs font-semibold', style.text)}>{style.label}</span>
                              </div>
                              <Badge variant="outline" className={cn('text-[10px]', style.bg, style.text, style.border)}>
                                {configEditing ? (
                                  <div className="flex items-center gap-1">
                                    <span>+</span>
                                    <Input type="number" value={catCfg.peso} onChange={e => updateDraft('keywords', { ...cfg.keywords, [cat]: { ...catCfg, peso: Number(e.target.value) } })} className="h-5 w-12 text-[10px] text-center px-1" />
                                    <span>pts</span>
                                  </div>
                                ) : (
                                  <span>+{catCfg.peso} pts</span>
                                )}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {catCfg.palavras.map(kw => (
                                <span key={kw} className={cn('inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-mono', style.bg, style.border, style.text)}>
                                  {kw}
                                  {configEditing && (
                                    <button onClick={() => removeKeyword(cat, kw)} className="ml-0.5 hover:opacity-70">
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                            {configEditing && (
                              <div className="flex items-center gap-1.5 mt-2">
                                <Input
                                  value={kwInput[cat] || ''}
                                  onChange={e => setKwInput(prev => ({ ...prev, [cat]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(cat) } }}
                                  placeholder="Nova palavra-chave..."
                                  className="h-7 text-[11px] flex-1"
                                />
                                <Button variant="outline" size="sm" onClick={() => addKeyword(cat)} className="h-7 text-[11px] px-2 gap-1">
                                  <Plus className="h-3 w-3" />Adicionar
                                </Button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Ações recomendadas */}
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Ações Recomendadas por Prioridade</h4>
                    <div className="space-y-2">
                      {([
                        { key: 'P0' as const, color: 'bg-red-50 text-red-700 border-red-200' },
                        { key: 'P1' as const, color: 'bg-orange-50 text-orange-700 border-orange-200' },
                        { key: 'P2' as const, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                        { key: 'P3' as const, color: '' },
                      ]).map(item => (
                        <div key={item.key} className="flex items-start gap-2 text-[11px]">
                          <Badge variant="outline" className={cn('text-[10px] shrink-0 mt-0.5', item.color)}>{item.key}</Badge>
                          {configEditing ? (
                            <Input
                              value={cfg.acoesRecomendadas[item.key]}
                              onChange={e => updateDraft('acoesRecomendadas', { ...cfg.acoesRecomendadas, [item.key]: e.target.value })}
                              className="h-7 text-[11px] flex-1"
                            />
                          ) : (
                            <span className="text-muted-foreground">{cfg.acoesRecomendadas[item.key]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )
      })()}

      {/* Regras personalizadas */}
      <div className="flex items-center gap-2 mt-2">
        <h3 className="text-sm font-semibold">Regras Personalizadas</h3>
        <Badge variant="outline" className="text-[10px]">{regras.length}</Badge>
      </div>

      {/* Tabela */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">Ord.</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-[100px]">Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Condições</TableHead>
              <TableHead className="hidden lg:table-cell">Ações Auto</TableHead>
              <TableHead className="w-[60px] text-center">Ativo</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : !regras.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhuma regra cadastrada. Clique em "Nova Regra" para começar.
              </TableCell></TableRow>
            ) : regras.map(r => {
              const tipo = TIPO_LABELS[r.tipo] || TIPO_LABELS.PRIORIDADE!
              const condicoes = [r.palavrasChave && 'Palavras-chave', r.origemContem && 'Origem', r.assuntoContem && 'Assunto', r.codigoSistema && 'Sistema'].filter((x): x is string => !!x)
              const acoes = [r.autoNotificar && 'Notif.', r.autoNotificarLider && 'Líder', r.autoNotificarGerente && 'Gerente', r.autoCriarTarefa && 'Tarefa', r.autoMarcarLida && 'Auto-lida'].filter((x): x is string => !!x)

              return (
                <TableRow key={r.id} className={cn(!r.ativo && 'opacity-50')}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{r.ordem}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{r.nome}</p>
                    {r.descricao && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.descricao}</p>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', tipo.color)}>{tipo.label}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {condicoes.length === 0 && <span className="text-[10px] text-muted-foreground">Todas</span>}
                      {condicoes.map(c => <Badge key={c} variant="outline" className="text-[9px]">{c}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {acoes.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                      {acoes.map(a => <Badge key={a} variant="outline" className="text-[9px] bg-sky-50 text-sky-700 border-sky-200">{a}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <button onClick={() => handleToggleAtivo(r)} className={cn('h-4 w-4 rounded-full border-2 transition-colors', r.ativo ? 'bg-emerald-500 border-emerald-500' : 'bg-transparent border-gray-300')} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="soft" size="icon-sm" onClick={() => handleEditar(r)} title="Editar"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleExcluir(r.id)} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
