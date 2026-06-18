'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Settings2, Loader2, Save, Clock, Hash, Mail, FileText, Users, Bell, Sparkles, Plus, Pencil, Trash2 } from 'lucide-react'
import { Button, Card, Input, RichEditor, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Switch, Badge, Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription } from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface ConfigState {
  solicitanteResponsavel: boolean
  diasEnviar: number
  diasAprovar: number
  diasRevisar: number
  validadeDias: number
  numeroInicial: number
  emailNovo: string
  emailComercial: string
  emailFinanceiro: string
  textoPadrao: string
  textoApresentacao: string
}

const DEFAULT_CONFIG: ConfigState = {
  solicitanteResponsavel: false,
  diasEnviar: 7,
  diasAprovar: 15,
  diasRevisar: 7,
  validadeDias: 90,
  numeroInicial: 1,
  emailNovo: '',
  emailComercial: '',
  emailFinanceiro: '',
  textoPadrao: '',
  textoApresentacao: '',
}

type TabKey = 'prazos' | 'numeracao' | 'emails' | 'textos' | 'areas' | 'modelos'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Clock }> = [
  { key: 'prazos', label: 'Prazos do workflow', icon: Clock },
  { key: 'numeracao', label: 'Numeração', icon: Hash },
  { key: 'emails', label: 'Notificações', icon: Mail },
  { key: 'textos', label: 'Textos padrão', icon: FileText },
  { key: 'areas', label: 'Áreas (detalhamento)', icon: Users },
  { key: 'modelos', label: 'Modelos de proposta (IA)', icon: Sparkles },
]

export default function OrcamentosConfiguracoesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG)
  const [activeTab, setActiveTab] = useState<TabKey>('prazos')

  // Acesso: master/empresa-master OU sub-permissão 'acessar_configuracoes'.
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const orcSubPerms = (permissions.find(p => p.moduleSlug === 'orcamentos')?.subPermissions ?? {}) as Record<string, boolean>
  const podeConfig = isMaster || isEmpresaMaster || orcSubPerms.acessar_configuracoes === true
  const podeGerirModelos = isMaster || isEmpresaMaster || orcSubPerms.gerir_modelos_proposta === true
  const visibleTabs = TABS.filter(t => t.key !== 'modelos' || podeGerirModelos)
  useEffect(() => {
    if (!permsLoading && !podeConfig) router.replace('/orcamentos')
  }, [permsLoading, podeConfig, router])

  useEffect(() => {
    (async () => {
      try {
        const data = await (trpc.orcamento as any).getConfig.query()
        setConfig({ ...DEFAULT_CONFIG, ...data })
      } catch {
        alerts.error('Erro', 'Falha ao carregar configurações')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await (trpc.orcamento as any).saveConfig.mutate({
        solicitante_responsavel: config.solicitanteResponsavel ? '1' : '0',
        dias_enviar: String(config.diasEnviar),
        dias_aprovar: String(config.diasAprovar),
        dias_revisar: String(config.diasRevisar),
        validade_dias: String(config.validadeDias),
        numero_inicial: String(config.numeroInicial),
        email_novo: config.emailNovo,
        email_comercial: config.emailComercial,
        email_financeiro: config.emailFinanceiro,
        texto_padrao: config.textoPadrao,
        texto_apresentacao: config.textoApresentacao,
      })
      alerts.success('Salvo', 'Configurações atualizadas')
    } catch {
      alerts.error('Erro', 'Falha ao salvar configurações')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Settings2 className="h-6 w-6" />
          </div>
          <div>
            <h1>Configurações de Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Defina prazos, numeração, e-mails e textos padrão</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab !== 'areas' && activeTab !== 'modelos' && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          )}
          <BackButton href="/orcamentos" />
        </div>
      </div>

      {/* Card único com pills laterais */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h5 className="text-[13px] font-semibold text-foreground">Parâmetros do módulo</h5>
        </div>
        <div className="flex flex-col sm:flex-row min-h-[450px]">
          {/* Pills laterais */}
          <div className="sm:w-[200px] shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-muted/40 p-3 flex sm:flex-col gap-1 overflow-x-auto">
            {visibleTabs.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium text-left transition-all whitespace-nowrap',
                    active
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-white/60 dark:hover:bg-white/5 hover:text-foreground',
                  )}
                  style={active ? { backgroundColor: MODULE_COLOR } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="flex-1 min-w-0" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {/* Título interno full-width */}
            <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
              <h4 className="text-[13px] font-semibold text-foreground">
                {visibleTabs.find(t => t.key === activeTab)?.label}
              </h4>
            </div>

            {/* Body */}
            <div className="p-5">
              {activeTab === 'prazos' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="solicitanteResp"
                      checked={config.solicitanteResponsavel}
                      onChange={e => setConfig(c => ({ ...c, solicitanteResponsavel: e.target.checked }))}
                      className="h-4 w-4 rounded border-border"
                    />
                    <label htmlFor="solicitanteResp" className="text-sm cursor-pointer">
                      Usar solicitante como responsável automaticamente
                    </label>
                  </div>

                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 sm:col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground block">Limite para envio</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={config.diasEnviar} onChange={e => setConfig(c => ({ ...c, diasEnviar: parseInt(e.target.value) || 0 }))} className="h-9 text-sm flex-1" />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    </div>
                    <div className="col-span-12 sm:col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground block">Limite para aprovação</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={config.diasAprovar} onChange={e => setConfig(c => ({ ...c, diasAprovar: parseInt(e.target.value) || 0 }))} className="h-9 text-sm flex-1" />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    </div>
                    <div className="col-span-12 sm:col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground block">Limite para revisão</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={config.diasRevisar} onChange={e => setConfig(c => ({ ...c, diasRevisar: parseInt(e.target.value) || 0 }))} className="h-9 text-sm flex-1" />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    </div>
                    <div className="col-span-12 sm:col-span-3 space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground block">Validade padrão</label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={config.validadeDias} onChange={e => setConfig(c => ({ ...c, validadeDias: parseInt(e.target.value) || 0 }))} className="h-9 text-sm flex-1" />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'numeracao' && (
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">Iniciar próximos orçamentos no número</label>
                    <Input
                      type="number"
                      min={1}
                      value={config.numeroInicial}
                      onChange={e => setConfig(c => ({ ...c, numeroInicial: parseInt(e.target.value) || 1 }))}
                      className="h-9 text-sm"
                      placeholder="1"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      O próximo orçamento criado terá no mínimo este número. Se já houver orçamentos com número maior, o sistema continua incrementando a partir do último (não regride).
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'emails' && (
                <div className="space-y-4 max-w-2xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">Notificar novos orçamentos para</label>
                    <Input value={config.emailNovo} onChange={e => setConfig(c => ({ ...c, emailNovo: e.target.value }))} placeholder="emails separados por vírgula" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">E-mail da área comercial</label>
                    <Input value={config.emailComercial} onChange={e => setConfig(c => ({ ...c, emailComercial: e.target.value }))} placeholder="emails separados por vírgula" className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">E-mail da área financeira</label>
                    <Input value={config.emailFinanceiro} onChange={e => setConfig(c => ({ ...c, emailFinanceiro: e.target.value }))} placeholder="emails separados por vírgula" className="h-9 text-sm" />
                  </div>
                </div>
              )}

              {activeTab === 'textos' && (
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">Detalhamento para impressão</label>
                    <p className="text-[11px] text-muted-foreground">Texto exibido na impressão/PDF do orçamento</p>
                    <RichEditor value={config.textoPadrao} onChange={v => setConfig(c => ({ ...c, textoPadrao: v }))} placeholder="Texto padrão..." />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground block">Apresentação no e-mail ao cliente</label>
                    <p className="text-[11px] text-muted-foreground">Mensagem que acompanha o e-mail enviado ao cliente</p>
                    <RichEditor value={config.textoApresentacao} onChange={v => setConfig(c => ({ ...c, textoApresentacao: v }))} placeholder="Apresentação..." />
                  </div>
                </div>
              )}

              {activeTab === 'areas' && <AreasConfigTab />}
              {activeTab === 'modelos' && <ModelosPropostaTab />}
            </div>
          </div>
        </div>
      </Card>

    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Aba "Áreas (detalhamento)" — quais áreas ficam disponíveis pra seleção em
// novos orçamentos, substituto de cada uma, canais de notificação e prazo.
// ────────────────────────────────────────────────────────────────────
interface AreaDisp { id: string; nome: string; leaderId: string | null; leaderNome: string | null }
interface AreaHabil { areaId: string; nome: string; leaderId: string | null; leaderNome: string | null; substitutoId: string | null }

function AreasConfigTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disp, setDisp] = useState<AreaDisp[]>([])
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string }>>([])
  // areaId -> substitutoId (presença na Map = habilitada)
  const [sel, setSel] = useState<Map<string, string | null>>(new Map())
  const [prazoDias, setPrazoDias] = useState(2)
  const [prazoUteis, setPrazoUteis] = useState(true)
  const [canais, setCanais] = useState({ sino: true, email: true, push: false })
  const [avisarComercial, setAvisarComercial] = useState(true)
  const [areaComercialId, setAreaComercialId] = useState<string>('')

  useEffect(() => {
    (async () => {
      try {
        const [cfg, users] = await Promise.all([
          (trpc.orcamento as any).getConfigAreas.query(),
          (trpc.orcamento as any).listUsuarios.query().catch(() => []),
        ])
        setDisp(cfg.areasDisponiveis)
        setUsuarios(users as Array<{ id: string; name: string }>)
        setPrazoDias(cfg.config.prazoRespostaDias)
        setPrazoUteis(cfg.config.prazoEmDiasUteis)
        setCanais({ sino: cfg.config.canais?.sino ?? true, email: cfg.config.canais?.email ?? true, push: cfg.config.canais?.push ?? false })
        setAvisarComercial(cfg.config.avisarComercialAtraso)
        setAreaComercialId(cfg.config.areaComercialId ?? '')
        const m = new Map<string, string | null>()
        for (const h of cfg.habilitadas as AreaHabil[]) m.set(h.areaId, h.substitutoId)
        setSel(m)
      } catch { /* sem permissão / erro */ }
      finally { setLoading(false) }
    })()
  }, [])

  function toggle(areaId: string) {
    setSel(prev => { const m = new Map(prev); if (m.has(areaId)) m.delete(areaId); else m.set(areaId, null); return m })
  }
  function setSubstituto(areaId: string, uid: string | null) {
    setSel(prev => { const m = new Map(prev); m.set(areaId, uid); return m })
  }

  async function salvar() {
    setSaving(true)
    try {
      await (trpc.orcamento as any).saveConfigAreas.mutate({
        config: { prazoRespostaDias: prazoDias, prazoEmDiasUteis: prazoUteis, canais, avisarComercialAtraso: avisarComercial, areaComercialId: areaComercialId || null },
        areas: [...sel.entries()].map(([areaId, substitutoId]) => ({ areaId, substitutoId })),
      })
      alerts.success('Configuração salva', 'Áreas e prazos de detalhamento atualizados.')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>

  return (
    <div className="space-y-5">
      {/* Prazo + canais */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 sm:col-span-4 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Prazo para detalhar</label>
          <div className="flex items-center gap-2">
            <Input type="number" min={1} value={prazoDias} onChange={e => setPrazoDias(parseInt(e.target.value) || 1)} className="h-9 text-sm w-20" />
            <Select value={prazoUteis ? 'uteis' : 'corridos'} onValueChange={v => setPrazoUteis(v === 'uteis')}>
              <SelectTrigger className="h-9 text-sm flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="uteis">dias úteis</SelectItem>
                <SelectItem value="corridos">dias corridos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="col-span-12 sm:col-span-8 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" />Canais de notificação</label>
          <div className="flex items-center gap-4 h-9">
            {([['sino', 'Sino'], ['email', 'E-mail'], ['push', 'Push (em breve)']] as const).map(([k, label]) => (
              <label key={k} className={cn('flex items-center gap-1.5 text-sm', k === 'push' && 'opacity-50')}>
                <input type="checkbox" disabled={k === 'push'} checked={(canais as any)[k]} onChange={e => setCanais(c => ({ ...c, [k]: e.target.checked }))} className="h-4 w-4 rounded border-border" />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Atraso → comercial */}
      <div className="grid grid-cols-12 gap-3 items-end">
        <div className="col-span-12 sm:col-span-5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={avisarComercial} onChange={e => setAvisarComercial(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Avisar o comercial quando uma área atrasar
          </label>
        </div>
        <div className="col-span-12 sm:col-span-7 space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground block">Área Comercial (recebe os avisos de atraso)</label>
          <Select value={areaComercialId || 'none'} onValueChange={v => setAreaComercialId(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a área comercial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— (avisa o solicitante)</SelectItem>
              {disp.map(a => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista de áreas habilitáveis */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground block">Áreas disponíveis para seleção em novos orçamentos</label>
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {disp.length === 0 && <p className="text-sm text-muted-foreground italic px-4 py-6 text-center">Nenhuma área cadastrada. Cadastre em Cadastros → Áreas.</p>}
          {disp.map(a => {
            const on = sel.has(a.id)
            return (
              <div key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 hover:bg-muted/30">
                <label className="flex items-center gap-2 flex-1 cursor-pointer min-w-0">
                  <input type="checkbox" checked={on} onChange={() => toggle(a.id)} className="h-4 w-4 rounded border-border shrink-0" />
                  <span className="text-sm font-medium truncate">{a.nome}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{a.leaderNome ? `líder: ${a.leaderNome}` : 'sem líder'}</span>
                </label>
                {on && (
                  <div className="sm:w-[260px] shrink-0">
                    <Select value={sel.get(a.id) || 'none'} onValueChange={v => setSubstituto(a.id, v === 'none' ? null : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Substituto / contato" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{a.leaderNome ? 'Sem substituto' : 'Definir contato…'}</SelectItem>
                        {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">Áreas sem líder precisam de um contato indicado (substituto) para receber as notificações.</p>
      </div>

      <div className="flex justify-end pt-2">
        <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar áreas
        </Button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Aba "Modelos de proposta (IA)" — biblioteca curada de textos de proposta
// (texto p/ cliente) que servem de referência de estilo pro assistente de IA.
// ────────────────────────────────────────────────────────────────────
interface ModeloProposta {
  id: string; titulo: string; conteudo: string; tipo: string | null
  segmento: string | null; ativo: boolean; ordem: number
}

const TIPO_MODELO_LABEL: Record<string, string> = { SERVICO_MENSAL: 'Mensal', SERVICO_EXTRA: 'Avulso/Extra' }

function stripTagsModelo(html: string): string {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()
}

function ModelosPropostaTab() {
  const [loading, setLoading] = useState(true)
  const [modelos, setModelos] = useState<ModeloProposta[]>([])
  const [edit, setEdit] = useState<(Partial<ModeloProposta> & { _new?: boolean }) | null>(null)
  const [saving, setSaving] = useState(false)

  const carregar = () => {
    setLoading(true)
    ;(trpc.orcamento as any).modelosProposta.query()
      .then((r: ModeloProposta[]) => setModelos(r || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { carregar() }, [])

  async function salvar() {
    if (!edit?.titulo?.trim()) { alerts.error('Título obrigatório', 'Dê um nome ao modelo.'); return }
    if (!edit?.conteudo?.trim()) { alerts.error('Conteúdo obrigatório', 'Escreva o texto do modelo.'); return }
    setSaving(true)
    try {
      const payload = {
        titulo: edit.titulo, conteudo: edit.conteudo,
        tipo: edit.tipo || null, segmento: edit.segmento || null,
        ativo: edit.ativo ?? true, ordem: edit.ordem ?? 0,
      }
      if (edit._new) await (trpc.orcamento as any).criarModeloProposta.mutate(payload)
      else await (trpc.orcamento as any).atualizarModeloProposta.mutate({ id: edit.id, ...payload })
      setEdit(null); carregar()
      alerts.success('Salvo', 'Modelo salvo com sucesso.')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  async function remover(m: ModeloProposta) {
    const ok = await alerts.confirm({ title: 'Excluir modelo', text: `Excluir o modelo "${m.titulo}"?`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try { await (trpc.orcamento as any).excluirModeloProposta.mutate({ id: m.id }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] text-muted-foreground max-w-xl">
          Cadastre modelos de proposta (o texto que vai ao cliente). O assistente de IA usa os modelos <strong>ativos</strong> como referência de estilo, tom e estrutura ao redigir. Sem nenhum modelo ativo, a IA aprende com as propostas já enviadas.
        </p>
        <Button size="sm" onClick={() => setEdit({ _new: true, ativo: true })} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5 shrink-0">
          <Plus className="h-4 w-4" /> Novo modelo
        </Button>
      </div>

      <div className="border rounded-lg divide-y">
        {modelos.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">Nenhum modelo cadastrado ainda.</p>}
        {modelos.map(m => (
          <div key={m.id} className={cn('flex items-center gap-3 p-3', !m.ativo && 'opacity-60')}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">{m.titulo}</p>
                {m.tipo && <Badge variant="secondary" className="text-[10px]">{TIPO_MODELO_LABEL[m.tipo] || m.tipo}</Badge>}
                {!m.ativo && <Badge variant="outline" className="text-[10px] text-muted-foreground">inativo</Badge>}
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{stripTagsModelo(m.conteudo).slice(0, 120) || '—'}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setEdit({ ...m })}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive" onClick={() => remover(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Sparkles} color="rose">
            <DialogTitle>{edit?._new ? 'Novo modelo de proposta' : 'Editar modelo'}</DialogTitle>
            <DialogDescription>Texto de referência que a IA usa pra aprender o padrão das propostas.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-8 space-y-1.5">
                <label className="text-[13px] font-semibold">Título *</label>
                <Input className="h-9 text-sm" value={edit?.titulo ?? ''} onChange={e => setEdit(s => ({ ...s, titulo: e.target.value }))} placeholder="Ex.: Proposta padrão — Contabilidade mensal" />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <label className="text-[13px] font-semibold">Tipo</label>
                <Select value={edit?.tipo ?? '__any'} onValueChange={v => setEdit(s => ({ ...s, tipo: v === '__any' ? null : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any">Qualquer</SelectItem>
                    <SelectItem value="SERVICO_MENSAL">Mensal</SelectItem>
                    <SelectItem value="SERVICO_EXTRA">Avulso/Extra</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold">Texto do modelo *</label>
              <RichEditor value={edit?.conteudo ?? ''} onChange={v => setEdit(s => ({ ...s, conteudo: v }))} placeholder="Cole/escreva aqui uma proposta-modelo (o texto que vai ao cliente)…" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={edit?.ativo ?? true} onCheckedChange={v => setEdit(s => ({ ...s, ativo: v }))} />
              <label className="text-[13px]">Ativo (usado como referência pela IA)</label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
