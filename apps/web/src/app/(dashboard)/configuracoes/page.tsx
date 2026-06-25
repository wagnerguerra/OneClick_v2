'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Settings, Save, Eye, EyeOff, HelpCircle, X, Loader2,
  Shield, Database, Server, Mail, CreditCard, HardDrive,
  Landmark, Globe, MessageSquare, Bot, Brain, Calendar,
  Key, Clock, type LucideIcon, Zap, CheckCircle2, XCircle,
  Play, Terminal, Bookmark, FolderOpen, Trash2, ChevronDown, Search, Pencil, Check, Maximize2, Minimize2,
  FileSignature, Bell, Lock, Unlock, Headphones, FolderKanban, HardDriveDownload,
} from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useRouter } from 'next/navigation'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { CalendarioSection } from './_components/calendario-section'
import { GruposObrigacaoSection } from './_components/grupos-obrigacao-section'
import { GoogleBackupSection } from './_components/google-backup-section'
import { HelpdeskIaSection } from './_components/helpdesk-ia-section'

interface ConfigField {
  key: string; label: string; group: string; type: string
  required?: boolean; placeholder?: string; help?: string; secret?: boolean; default?: string
  subgroup?: string; colSpan?: number
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  'Armazenamento (S3)': HardDrive,
  'Autenticação': Shield,
  'Banco de Dados': Database,
  'Carimbo de Tempo (TSA)': Clock,
  'E-mail (SMTP)': Mail,
  'Google': Calendar,
  'Google Calendar': Calendar,
  'gov.br Assinatura': FileSignature,
  'SERPRO Neo iD': FileSignature,
  'Omie ERP': Globe,
  'OpenAI (ChatGPT)': Brain,
  'SERPRO': Key,
  'Servidor': Server,
  'Stripe': CreditCard,
  'WhatsApp': MessageSquare,
  'Captcha': Bot,
  'Abas': Bookmark,
  'Notificações': Bell,
  'Helpdesk': Headphones,
  'Acessórias': Zap,
  'Calendário': Calendar,
  'Templates de Obrigações': FolderKanban,
}

// Pill especial — não tem campos cadastrados via getCampos, é injetada
// no fim da lista de groups e tratada com renderer próprio.
const NOTIFICATIONS_GROUP = 'Notificações'
const HELPDESK_GROUP = 'Helpdesk'
const CALENDARIO_GROUP = 'Calendário'
const GRUPOS_OBRIGACAO_GROUP = 'Templates de Obrigações'

interface OrigemNotif {
  origem: string
  label: string
  descricao: string
  modulo: string
  removivelPadrao: boolean
  removivelAtual: boolean
  ativos: number
  conhecida: boolean
}

/* Sub-abas do grupo Banco de Dados */
const DB_SUBTABS = [
  { key: 'postgresql', label: 'PostgreSQL', icon: Database },
  { key: 'oneclick_v2', label: 'OneClick v2', icon: Database },
  { key: 'oneclick_v1', label: 'OneClick v1', icon: Server },
  { key: 'firebird', label: 'ERP SCI (Firebird)', icon: Landmark },
]

/* Sub-abas do grupo Google */
const GOOGLE_SUBTABS = [
  { key: 'oauth', label: 'OAuth Principal', icon: Key },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'drive', label: 'Drive (XML)', icon: HardDriveDownload },
  { key: 'backup', label: 'Backup DB', icon: HardDrive },
]

type TestResult = { ok: boolean; message: string; details?: string } | null
type SqlResult = { ok: boolean; columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }
type SavedQueryItem = { id: string; name: string; sql: string; dbType: string; createdAt: string; updatedAt: string }

export default function ConfiguracoesPage() {
  // Guard de acesso: configurações administrativas (Stripe, SMTP, S3, etc.)
  // só são acessíveis a master/empresa-master. Demais usuários são redirecionados.
  const router = useRouter()
  const { profile, loading: profileLoading } = useCurrentUserProfile()
  // Config de SISTEMA (integrações de plataforma, SQL, backups): só master global.
  // isEmpresaMaster (admin de tenant) NÃO acessa — F-009.
  const isAdmin = !!profile?.isMaster
  useEffect(() => {
    if (!profileLoading && profile && !isAdmin) {
      router.replace('/dashboard')
    }
  }, [profileLoading, profile, isAdmin, router])

  const [fields, setFields] = useState<ConfigField[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeGroup, setActiveGroup] = useState('')
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})

  // Sub-aba banco de dados
  const [dbSubtab, setDbSubtab] = useState('postgresql')

  // Sub-aba Google
  const [googleSubtab, setGoogleSubtab] = useState('oauth')

  // Testes de conexão
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  // Teste SMTP
  const [smtpTestEmail, setSmtpTestEmail] = useState('')
  const [smtpTesting, setSmtpTesting] = useState(false)

  // Teste Acessórias
  const [acessTesting, setAcessTesting] = useState(false)
  const [acessResult, setAcessResult] = useState<{
    ok: boolean; status: number; error?: string;
    empresasCount?: number; baseUrl: string; rateLimitRemaining?: number
  } | null>(null)

  // Console SQL
  const [sqlQuery, setSqlQuery] = useState<Record<string, string>>({})
  const [sqlRunning, setSqlRunning] = useState<Record<string, boolean>>({})
  const [sqlResult, setSqlResult] = useState<Record<string, SqlResult | null>>({})
  const [showConsole, setShowConsole] = useState<Record<string, boolean>>({})
  const [expandedConsole, setExpandedConsole] = useState(false)

  // Consultas salvas
  const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState<Record<string, boolean>>({})
  const [saveQueryName, setSaveQueryName] = useState<Record<string, string>>({})
  const [savingQuery, setSavingQuery] = useState(false)
  const [showSavedList, setShowSavedList] = useState<Record<string, boolean>>({})

  // Filtro de resultados SQL
  const [sqlFilter, setSqlFilter] = useState<Record<string, string>>({})

  // Edição de nome de consulta salva
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null)
  const [editingQueryName, setEditingQueryName] = useState('')

  // Pill especial — Notificações: catálogo de origens + toggles de remoção
  const [notifOrigens, setNotifOrigens] = useState<OrigemNotif[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifDirty, setNotifDirty] = useState(false)

  const loadNotifOrigens = async () => {
    setNotifLoading(true)
    try {
      const list = await (trpc.notification as any).listarOrigens.query() as OrigemNotif[]
      setNotifOrigens(list)
      setNotifDirty(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setNotifLoading(false)
    }
  }

  function toggleNotifOrigem(origem: string) {
    setNotifOrigens(prev => prev.map(o =>
      o.origem === origem ? { ...o, removivelAtual: !o.removivelAtual } : o
    ))
    setNotifDirty(true)
  }

  function resetNotifOrigem(origem: string) {
    setNotifOrigens(prev => prev.map(o =>
      o.origem === origem ? { ...o, removivelAtual: o.removivelPadrao } : o
    ))
    setNotifDirty(true)
  }

  async function handleSaveNotif() {
    setNotifSaving(true)
    try {
      const removable: Record<string, boolean> = {}
      for (const o of notifOrigens) removable[o.origem] = o.removivelAtual
      await (trpc.notification as any).setRemovableConfig.mutate({ removable })
      await alerts.success('Configurações salvas', 'Regras de remoção atualizadas.')
      setNotifDirty(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setNotifSaving(false)
    }
  }

  // Pill especial — Helpdesk: SLA por prioridade, auto-fechamento, inbound e-mail
  type HelpdeskCfg = {
    slaPorPrioridade: { BAIXA: number; MEDIA: number; ALTA: number; URGENTE: number }
    autoFechamentoDias: number
    inboundEmail: string
  }
  const [hdCfg, setHdCfg] = useState<HelpdeskCfg | null>(null)
  const [hdLoading, setHdLoading] = useState(false)
  const [hdSaving, setHdSaving] = useState(false)
  const [hdDirty, setHdDirty] = useState(false)
  // Sub-aba dentro da pill Helpdesk: 'geral' (SLA/inbound) | 'ia' (triagem IA)
  const [hdSubtab, setHdSubtab] = useState<'geral' | 'ia'>('geral')

  const loadHdCfg = async () => {
    setHdLoading(true)
    try {
      const c = await (trpc.helpdesk as any).getConfig.query() as HelpdeskCfg
      setHdCfg(c)
      setHdDirty(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setHdLoading(false)
    }
  }

  function updateHd<K extends keyof HelpdeskCfg>(key: K, value: HelpdeskCfg[K]) {
    setHdCfg(prev => prev ? { ...prev, [key]: value } : prev)
    setHdDirty(true)
  }
  function updateHdSla(p: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE', horas: number) {
    setHdCfg(prev => prev ? { ...prev, slaPorPrioridade: { ...prev.slaPorPrioridade, [p]: horas } } : prev)
    setHdDirty(true)
  }

  async function handleSaveHd() {
    if (!hdCfg) return
    setHdSaving(true)
    try {
      await (trpc.helpdesk as any).updateConfig.mutate({
        slaPorPrioridade: hdCfg.slaPorPrioridade,
        autoFechamentoDias: hdCfg.autoFechamentoDias,
        inboundEmail: hdCfg.inboundEmail,
      })
      await alerts.success('Configurações salvas', 'Helpdesk atualizado.')
      setHdDirty(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setHdSaving(false)
    }
  }

  // Template ativo (consulta carregada com variáveis)
  const [activeTemplate, setActiveTemplate] = useState<Record<string, SavedQueryItem | null>>({})
  const [templateVars, setTemplateVars] = useState<Record<string, Record<string, string>>>({})

  async function loadSavedQueries() {
    try {
      const list = await trpc.admin.listSavedQueries.query({}) as SavedQueryItem[]
      setSavedQueries(list)
    } catch { /* silencioso */ }
  }

  useEffect(() => {
    // Não carrega configs se não for admin — evita chamadas trpc que retornariam 403.
    // Espera o profile carregar antes (isAdmin definitivo só após profileLoading=false).
    if (profileLoading || !isAdmin) return
    Promise.all([
      trpc.admin.getCampos.query(),
      trpc.admin.getConfigs.query(),
    ]).then(([campos, configs]) => {
      setFields(campos.fields as ConfigField[])
      // Adiciona pill virtual "Notificações" no fim — não tem campos via getCampos,
      // é tratada com renderer próprio (toggles por origem).
      const allGroups = [...(campos.groups as string[]), NOTIFICATIONS_GROUP, HELPDESK_GROUP, CALENDARIO_GROUP, GRUPOS_OBRIGACAO_GROUP]
        .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }))
      setGroups(allGroups)
      const v: Record<string, string> = {}
      for (const c of configs as Array<{ key: string; value: string }>) v[c.key] = c.value
      setValues(v)
      if (allGroups.length > 0) setActiveGroup(allGroups[0]!)
    }).finally(() => setLoading(false))
    loadSavedQueries()
  }, [profileLoading, isAdmin])

  // Carrega catálogo de origens quando a pill "Notificações" fica ativa
  useEffect(() => {
    if (activeGroup === NOTIFICATIONS_GROUP && notifOrigens.length === 0 && !notifLoading) {
      loadNotifOrigens()
    }
    if (activeGroup === HELPDESK_GROUP && !hdCfg && !hdLoading) {
      loadHdCfg()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup])

  const activeFields = useMemo(() => {
    if (activeGroup === 'Banco de Dados') {
      return fields.filter(f => f.group === 'Banco de Dados' && f.subgroup === dbSubtab)
    }
    if (activeGroup === 'Google') {
      return fields.filter(f => f.group === 'Google' && f.subgroup === googleSubtab)
    }
    return fields.filter(f => f.group === activeGroup)
  }, [fields, activeGroup, dbSubtab, googleSubtab])

  /* Campos de todo o grupo "Banco de Dados" (todas sub-abas) para o save */
  const allDbFields = useMemo(() =>
    fields.filter(f => f.group === 'Banco de Dados'),
    [fields]
  )

  /* Campos de todo o grupo "Google" (todas sub-abas) para o save */
  const allGoogleFields = useMemo(() =>
    fields.filter(f => f.group === 'Google'),
    [fields]
  )

  async function handleSave() {
    setSaving(true)
    try {
      const fieldsToSave = activeGroup === 'Banco de Dados'
        ? allDbFields
        : activeGroup === 'Google'
          ? allGoogleFields
          : activeFields
      const items: Record<string, string> = {}
      for (const f of fieldsToSave) {
        items[f.key] = values[f.key] || ''
      }
      const result = await trpc.admin.saveConfigs.mutate({ group: activeGroup, items })
      await alerts.success('Configurações salvas', `${result.saved} campo(s) atualizado(s).`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  function handleClear(key: string) {
    setValues(prev => ({ ...prev, [key]: '__CLEAR__' }))
  }

  async function handleTestConnection(dbType: string) {
    setTesting(prev => ({ ...prev, [dbType]: true }))
    setTestResults(prev => ({ ...prev, [dbType]: null }))
    try {
      let result: TestResult = null
      if (dbType === 'postgresql') result = await trpc.admin.testPostgresql.mutate() as TestResult
      else if (dbType === 'oneclick_v2') result = await trpc.admin.testMysql.mutate() as TestResult
      else if (dbType === 'oneclick_v1') result = await trpc.admin.testOneclickV1.mutate() as TestResult
      else if (dbType === 'firebird') result = await trpc.admin.testFirebird.mutate() as TestResult
      setTestResults(prev => ({ ...prev, [dbType]: result }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [dbType]: { ok: false, message: (e as Error).message } }))
    } finally {
      setTesting(prev => ({ ...prev, [dbType]: false }))
    }
  }

  async function handleExecSql(dbType: string) {
    let query = (sqlQuery[dbType] || '').trim()
    if (!query) return
    // Resolve variáveis do template ativo
    if (activeTemplate[dbType] && templateVars[dbType]) {
      query = resolveTemplate(query, templateVars[dbType]!)
      // Verifica se sobrou alguma variável não preenchida
      const remaining = extractVars(query)
      if (remaining.length > 0) {
        alerts.error('Variáveis pendentes', `Preencha: ${remaining.map(v => `{{${v}}}`).join(', ')}`)
        return
      }
    }
    setSqlRunning(prev => ({ ...prev, [dbType]: true }))
    setSqlResult(prev => ({ ...prev, [dbType]: null }))
    setSqlFilter(prev => ({ ...prev, [dbType]: '' }))
    try {
      let result: SqlResult | null = null
      if (dbType === 'postgresql') result = await trpc.admin.execSqlPostgresql.mutate({ sql: query }) as SqlResult
      else if (dbType === 'oneclick_v2') result = await trpc.admin.execSqlMysql.mutate({ sql: query }) as SqlResult
      else if (dbType === 'oneclick_v1') result = await trpc.admin.execSqlOneclickV1.mutate({ sql: query }) as SqlResult
      else if (dbType === 'firebird') result = await trpc.admin.execSqlFirebird.mutate({ sql: query }) as SqlResult
      setSqlResult(prev => ({ ...prev, [dbType]: result }))
    } catch (e) {
      setSqlResult(prev => ({ ...prev, [dbType]: { ok: false, columns: [], rows: [], rowCount: 0, ms: 0, error: (e as Error).message } }))
    } finally {
      setSqlRunning(prev => ({ ...prev, [dbType]: false }))
    }
  }

  async function handleSaveQuery(dbType: string) {
    const name = (saveQueryName[dbType] || '').trim()
    const sql = (sqlQuery[dbType] || '').trim()
    if (!name || !sql) return
    setSavingQuery(true)
    try {
      await trpc.admin.saveQuery.mutate({ name, sql, dbType })
      await loadSavedQueries()
      setShowSaveDialog(prev => ({ ...prev, [dbType]: false }))
      setSaveQueryName(prev => ({ ...prev, [dbType]: '' }))
      alerts.success('Consulta salva', `"${name}" foi salva com sucesso.`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingQuery(false) }
  }

  async function handleDeleteSavedQuery(id: string) {
    try {
      await trpc.admin.deleteSavedQuery.mutate({ id })
      setSavedQueries(prev => prev.filter(q => q.id !== id))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleRenameQuery(id: string) {
    const newName = editingQueryName.trim()
    if (!newName) return
    try {
      await trpc.admin.updateSavedQuery.mutate({ id, name: newName })
      setSavedQueries(prev => prev.map(q => q.id === id ? { ...q, name: newName } : q))
      setEditingQueryId(null)
      setEditingQueryName('')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  /** Extrai variáveis {{nome}} de um SQL */
  function extractVars(sql: string): string[] {
    const matches = sql.match(/\{\{(\w+)\}\}/g)
    if (!matches) return []
    return [...new Set(matches.map(m => m.slice(2, -2)))]
  }

  /** Resolve variáveis no SQL template */
  function resolveTemplate(sql: string, vars: Record<string, string>): string {
    return sql.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] || `{{${name}}}`)
  }

  function handleLoadSavedQuery(query: SavedQueryItem) {
    const vars = extractVars(query.sql)
    const db = query.dbType

    if (vars.length > 0) {
      // Tem variáveis — ativa modo template
      setActiveTemplate(prev => ({ ...prev, [db]: query }))
      // Preserva valores já preenchidos para as mesmas variáveis
      const prevVars = templateVars[db] || {}
      const newVars: Record<string, string> = {}
      for (const v of vars) newVars[v] = prevVars[v] || ''
      setTemplateVars(prev => ({ ...prev, [db]: newVars }))
      // Coloca o SQL original no textarea
      setSqlQuery(prev => ({ ...prev, [db]: query.sql }))
    } else {
      // Sem variáveis — carrega direto
      setActiveTemplate(prev => ({ ...prev, [db]: null }))
      setTemplateVars(prev => ({ ...prev, [db]: {} }))
      setSqlQuery(prev => ({ ...prev, [db]: query.sql }))
    }
    setShowSavedList(prev => ({ ...prev, [db]: false }))
  }

  /** Limpa template ao editar manualmente o textarea */
  function handleSqlChange(dbType: string, value: string) {
    setSqlQuery(prev => ({ ...prev, [dbType]: value }))
    // Se editou manualmente, desvincula do template
    if (activeTemplate[dbType]) {
      const tpl = activeTemplate[dbType]!
      if (value !== tpl.sql && value !== resolveTemplate(tpl.sql, templateVars[dbType] || {})) {
        setActiveTemplate(prev => ({ ...prev, [dbType]: null }))
      }
    }
  }

  /* Consultas salvas filtradas pelo dbType ativo */
  const filteredSavedQueries = savedQueries.filter(q => q.dbType === dbSubtab)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  /* Renderizador de campo (reutilizado) */
  function renderField(field: ConfigField) {
    return (
      <div key={field.key} className={cn(
        'space-y-1.5',
        field.type === 'textarea' ? 'col-span-12'
          : field.colSpan ? `col-span-12 ${({ 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4', 6: 'md:col-span-6', 8: 'md:col-span-8', 12: 'md:col-span-12' } as Record<number, string>)[field.colSpan] || 'md:col-span-6'}`
          : 'col-span-12 md:col-span-6'
      )}>
        <div className="flex items-center gap-1.5">
          <Label>{field.label}</Label>
          {field.help && (
            <span title={field.help} className="cursor-help">
              <HelpCircle className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
        </div>
        <div className="flex" style={{ borderRadius: '0.25rem', overflow: 'hidden' }}>
          {field.type === 'textarea' ? (
            <textarea
              className="w-full min-h-[80px] rounded border border-[#ced4da] bg-white px-3 py-2 text-xs placeholder:text-[#878a99] focus:border-[#5ea3cb] focus:outline-none"
              placeholder={field.placeholder || field.key}
              value={values[field.key] === '__CLEAR__' ? '' : (values[field.key] || '')}
              onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
            />
          ) : (
            <>
              <Input
                type={field.secret && !showSecret[field.key] ? 'password' : (field.type === 'number' ? 'number' : 'text')}
                placeholder={field.secret && !values[field.key] ? 'mantido (deixe em branco para não alterar)' : (field.placeholder || field.key)}
                value={values[field.key] === '__CLEAR__' ? '' : (values[field.key] || '')}
                onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                style={field.secret ? { borderRadius: '0.25rem 0 0 0.25rem', borderRight: 'none' } : undefined}
              />
              {field.secret && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowSecret(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                    style={{ padding: '0.55rem 0.6rem', backgroundColor: '#fff', color: '#495057', border: '1px solid #ced4da', borderLeft: 'none', cursor: 'pointer' }}
                  >
                    {showSecret[field.key] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClear(field.key)}
                    title="Limpar valor"
                    style={{ padding: '0.55rem 0.6rem', backgroundColor: '#fff', color: '#dc3545', border: '1px solid #ced4da', borderLeft: 'none', borderRadius: '0 0.25rem 0.25rem 0', cursor: 'pointer' }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">{field.key}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-orange-500 text-white shadow-md">
            <Settings className="h-6 w-6" />
          </div>
          <div>
            <h1>Configurações do Sistema</h1>
            <p className="text-sm text-muted-foreground">Gerencie variáveis de ambiente e integrações</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/configuracoes/chat')}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat interno
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/configuracoes/agendamentos')}
            className="gap-1.5"
          >
            <Clock className="h-3.5 w-3.5" />
            Centro de agendamentos
          </Button>
        </div>
      </div>

      {/* Card com abas verticais */}
      <Card>
        <CardHeader>
          <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" /> Configurações do Sistema
          </h5>
        </CardHeader>
        <div className="flex min-h-[500px]">
          {/* Abas verticais (pills) */}
          <div className="w-[200px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {groups.map((group) => {
                const Icon = GROUP_ICONS[group] || Settings
                return (
                  <button
                    key={group}
                    onClick={() => {
                      setActiveGroup(group)
                      if (group === 'Banco de Dados') setDbSubtab('postgresql')
                      if (group === 'Google') setGoogleSubtab('oauth')
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      activeGroup === group
                        ? 'text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-white hover:text-foreground'
                    )}
                    style={activeGroup === group ? { backgroundColor: '#f97316' } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {group}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conteúdo da aba */}
          <div key={activeGroup} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

            {/* ============================================================ */}
            {/* GRUPO ESPECIAL: BANCO DE DADOS (com sub-abas)                */}
            {/* ============================================================ */}
            {activeGroup === 'Banco de Dados' ? (
              <div className="flex flex-col h-full">
                {/* Header com título + salvar */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Banco de Dados</h4>
                  <Button variant="success" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>

                {/* Sub-abas horizontais */}
                <div className="border-b border-[rgba(0,0,0,0.08)] px-5">
                  <div className="flex gap-0">
                    {DB_SUBTABS.map((tab) => {
                      const Icon = tab.icon
                      const result = testResults[tab.key]
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setDbSubtab(tab.key)}
                          className={cn(
                            'px-4 py-2.5 text-xs font-medium transition-all flex items-center gap-2 border-b-2 -mb-px',
                            dbSubtab === tab.key
                              ? 'border-orange-500 text-orange-600'
                              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {tab.label}
                          {result && (
                            result.ok
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              : <XCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Conteúdo da sub-aba */}
                <div key={dbSubtab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                  {/* Campos */}
                  <div className="grid grid-cols-12 gap-3">
                    {activeFields.map(renderField)}
                    {activeFields.length === 0 && (
                      <div className="col-span-12 text-center py-10 text-sm text-muted-foreground">
                        Nenhum campo nesta seção.
                      </div>
                    )}
                  </div>

                  {/* Área de teste de conexão */}
                  <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.08)]">
                    <div className="flex items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testing[dbSubtab]}
                        onClick={() => handleTestConnection(dbSubtab)}
                        className="flex items-center gap-2"
                      >
                        {testing[dbSubtab]
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Zap className="h-3.5 w-3.5" />
                        }
                        {testing[dbSubtab] ? 'Testando...' : 'Testar Conexão'}
                      </Button>

                      {/* Resultado do teste */}
                      {testResults[dbSubtab] && (
                        <div className={cn(
                          'flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium',
                          testResults[dbSubtab]!.ok
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        )}>
                          {testResults[dbSubtab]!.ok
                            ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            : <XCircle className="h-3.5 w-3.5 shrink-0" />
                          }
                          <span>{testResults[dbSubtab]!.message}</span>
                          {testResults[dbSubtab]!.details && (
                            <span className="text-muted-foreground ml-1">({testResults[dbSubtab]!.details})</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Console SQL */}
                  <div className="mt-5 pt-4 border-t border-[rgba(0,0,0,0.08)]">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setShowConsole(prev => ({ ...prev, [dbSubtab]: !prev[dbSubtab] }))}
                        className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                        Console SQL
                        <span className="text-[10px]">{showConsole[dbSubtab] ? '▲' : '▼'}</span>
                      </button>
                      {showConsole[dbSubtab] && (
                        <button
                          type="button"
                          onClick={() => setExpandedConsole(prev => !prev)}
                          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          title={expandedConsole ? 'Minimizar console' : 'Expandir console'}
                        >
                          {expandedConsole
                            ? <><Minimize2 className="h-3.5 w-3.5" /> Minimizar</>
                            : <><Maximize2 className="h-3.5 w-3.5" /> Expandir</>
                          }
                        </button>
                      )}
                    </div>

                    {/* Overlay expandido */}
                    {showConsole[dbSubtab] && expandedConsole && (
                      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm" onClick={() => setExpandedConsole(false)} />
                    )}

                    {showConsole[dbSubtab] && (
                      <div
                        className={cn(
                          'space-y-3',
                          expandedConsole
                            ? 'fixed inset-4 z-[101] bg-white rounded-xl shadow-2xl p-5 overflow-y-auto'
                            : 'mt-3'
                        )}
                        style={{ animation: 'fadeSlideIn 0.2s ease-out' }}
                      >
                        {/* Header do modo expandido */}
                        {expandedConsole && (
                          <div className="flex items-center justify-between pb-3 border-b border-[rgba(0,0,0,0.08)]">
                            <div className="flex items-center gap-2">
                              <Terminal className="h-4 w-4 text-orange-500" />
                              <span className="text-sm font-semibold">Console SQL</span>
                              <span className="text-xs text-muted-foreground">— {DB_SUBTABS.find(t => t.key === dbSubtab)?.label}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setExpandedConsole(false)}
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Minimize2 className="h-4 w-4" />
                              Minimizar
                            </button>
                          </div>
                        )}

                        {/* Painel do template ativo com variáveis */}
                        {activeTemplate[dbSubtab] && Object.keys(templateVars[dbSubtab] || {}).length > 0 && (
                          <div className="rounded border border-orange-200 bg-orange-50/50">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-orange-200/60">
                              <div className="flex items-center gap-2">
                                <Bookmark className="h-3.5 w-3.5 text-orange-500" />
                                <span className="text-xs font-semibold text-orange-700">{activeTemplate[dbSubtab]!.name}</span>
                                <span className="text-[10px] text-orange-500 bg-orange-100 px-1.5 py-0.5 rounded">template</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setActiveTemplate(prev => ({ ...prev, [dbSubtab]: null })); setTemplateVars(prev => ({ ...prev, [dbSubtab]: {} })) }}
                                className="text-orange-400 hover:text-orange-600"
                                title="Desvincular template"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="px-3 py-2.5">
                              <div className="text-[10px] text-orange-600 font-medium mb-2">Variáveis — preencha os valores para execução:</div>
                              <div className="grid grid-cols-12 gap-2">
                                {Object.keys(templateVars[dbSubtab]!).map((varName) => (
                                  <div key={varName} className="col-span-12 md:col-span-4">
                                    <Label className="text-[11px] text-orange-700 font-mono">{`{{${varName}}}`}</Label>
                                    <Input
                                      placeholder={varName.replace(/_/g, ' ')}
                                      value={templateVars[dbSubtab]![varName] || ''}
                                      onChange={(e) => setTemplateVars(prev => ({
                                        ...prev,
                                        [dbSubtab]: { ...prev[dbSubtab], [varName]: e.target.value }
                                      }))}
                                      className="h-7 text-xs mt-0.5"
                                    />
                                  </div>
                                ))}
                              </div>
                              {/* Preview do SQL resolvido */}
                              <div className="mt-2 pt-2 border-t border-orange-200/60">
                                <div className="text-[10px] text-orange-600 font-medium mb-1">Preview:</div>
                                <div className="text-[11px] font-mono text-orange-900 bg-orange-100/60 rounded px-2 py-1.5 max-h-[60px] overflow-auto whitespace-pre-wrap">
                                  {resolveTemplate(activeTemplate[dbSubtab]!.sql, templateVars[dbSubtab]!)}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <textarea
                          className={cn(
                            'w-full rounded border border-[#ced4da] bg-[#1e1e2e] text-[#cdd6f4] px-3 py-2 text-xs font-mono placeholder:text-[#6c7086] focus:border-orange-400 focus:outline-none',
                            expandedConsole ? 'min-h-[200px]' : 'min-h-[120px]'
                          )}
                          placeholder={`Digite sua query SQL aqui...\nEx: SELECT * FROM clientes WHERE id = {{cliente_id}}\nUse {{variavel}} para criar templates reutilizáveis`}
                          value={sqlQuery[dbSubtab] || ''}
                          onChange={(e) => handleSqlChange(dbSubtab, e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault()
                              handleExecSql(dbSubtab)
                            }
                            if (e.key === 'Escape' && expandedConsole) {
                              e.preventDefault()
                              setExpandedConsole(false)
                            }
                          }}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={sqlRunning[dbSubtab] || !(sqlQuery[dbSubtab] || '').trim()}
                            onClick={() => handleExecSql(dbSubtab)}
                            className="flex items-center gap-2"
                          >
                            {sqlRunning[dbSubtab]
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Play className="h-3.5 w-3.5" />
                            }
                            {sqlRunning[dbSubtab] ? 'Executando...' : 'Executar'}
                          </Button>

                          {/* Salvar consulta — aparece após execução */}
                          {sqlResult[dbSubtab] && (sqlQuery[dbSubtab] || '').trim() && (
                            <>
                              {!showSaveDialog[dbSubtab] ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowSaveDialog(prev => ({ ...prev, [dbSubtab]: true }))}
                                  className="flex items-center gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                                >
                                  <Bookmark className="h-3.5 w-3.5" />
                                  Salvar consulta
                                </Button>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Input
                                    placeholder="Nome da consulta..."
                                    value={saveQueryName[dbSubtab] || ''}
                                    onChange={(e) => setSaveQueryName(prev => ({ ...prev, [dbSubtab]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveQuery(dbSubtab) }}
                                    className="h-8 w-[200px] text-xs"
                                  />
                                  <Button
                                    type="button"
                                    variant="success"
                                    size="sm"
                                    disabled={savingQuery || !(saveQueryName[dbSubtab] || '').trim()}
                                    onClick={() => handleSaveQuery(dbSubtab)}
                                    className="flex items-center gap-1.5"
                                  >
                                    {savingQuery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    Salvar
                                  </Button>
                                  <button
                                    type="button"
                                    onClick={() => setShowSaveDialog(prev => ({ ...prev, [dbSubtab]: false }))}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}

                          {/* Consultas salvas */}
                          {filteredSavedQueries.length > 0 && (
                            <div className="relative">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSavedList(prev => ({ ...prev, [dbSubtab]: !prev[dbSubtab] }))}
                                className="flex items-center gap-2"
                              >
                                <FolderOpen className="h-3.5 w-3.5" />
                                Consultas salvas ({filteredSavedQueries.length})
                                <ChevronDown className={cn('h-3 w-3 transition-transform', showSavedList[dbSubtab] && 'rotate-180')} />
                              </Button>

                              {showSavedList[dbSubtab] && (() => {
                                const originals = filteredSavedQueries.filter(q => extractVars(q.sql).length === 0)
                                const templates = filteredSavedQueries.filter(q => extractVars(q.sql).length > 0)

                                function renderQueryItem(q: SavedQueryItem) {
                                  return (
                                    <div
                                      key={q.id}
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 border-b border-border/40 cursor-pointer group"
                                      onClick={() => { if (editingQueryId !== q.id) handleLoadSavedQuery(q) }}
                                    >
                                      <div className="flex-1 min-w-0">
                                        {editingQueryId === q.id ? (
                                          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                            <input
                                              autoFocus
                                              className="flex-1 min-w-0 h-6 px-1.5 text-xs border border-orange-300 rounded bg-white focus:outline-none focus:border-orange-500"
                                              value={editingQueryName}
                                              onChange={(e) => setEditingQueryName(e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRenameQuery(q.id)
                                                if (e.key === 'Escape') { setEditingQueryId(null); setEditingQueryName('') }
                                              }}
                                            />
                                            <button type="button" onClick={() => handleRenameQuery(q.id)} className="text-emerald-500 hover:text-emerald-700 shrink-0" title="Confirmar">
                                              <Check className="h-3.5 w-3.5" />
                                            </button>
                                            <button type="button" onClick={() => { setEditingQueryId(null); setEditingQueryName('') }} className="text-muted-foreground hover:text-foreground shrink-0" title="Cancelar">
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </div>
                                        ) : (
                                          <div className="text-xs font-medium truncate">{q.name}</div>
                                        )}
                                        <div className="text-[10px] text-muted-foreground font-mono truncate">{q.sql}</div>
                                      </div>
                                      {editingQueryId !== q.id && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setEditingQueryId(q.id); setEditingQueryName(q.name) }} className="text-muted-foreground hover:text-orange-600" title="Renomear">
                                            <Pencil className="h-3.5 w-3.5" />
                                          </button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteSavedQuery(q.id) }} className="text-red-400 hover:text-red-600" title="Excluir consulta">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  )
                                }

                                return (
                                  <div className="absolute top-full left-0 mt-1 z-50 w-[350px] bg-white rounded-lg border shadow-lg" style={{ animation: 'fadeSlideIn 0.15s ease-out' }}>
                                    <div className="px-3 py-2 border-b border-[rgba(0,0,0,0.08)] text-xs font-semibold text-muted-foreground">
                                      Consultas salvas — {DB_SUBTABS.find(t => t.key === dbSubtab)?.label}
                                    </div>
                                    <div className="max-h-[300px] overflow-y-auto">
                                      {/* Originais */}
                                      {originals.length > 0 && (
                                        <>
                                          <div className="px-3 py-1.5 bg-muted/40 border-b border-border/60 flex items-center gap-1.5">
                                            <Database className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Originais</span>
                                            <span className="text-[10px] text-muted-foreground">({originals.length})</span>
                                          </div>
                                          {originals.map(renderQueryItem)}
                                        </>
                                      )}
                                      {/* Templates */}
                                      {templates.length > 0 && (
                                        <>
                                          <div className="px-3 py-1.5 bg-orange-50/80 border-b border-orange-100 flex items-center gap-1.5">
                                            <Bookmark className="h-3 w-3 text-orange-500" />
                                            <span className="text-[10px] font-semibold text-orange-600 uppercase tracking-wider">Templates</span>
                                            <span className="text-[10px] text-orange-400">({templates.length})</span>
                                          </div>
                                          {templates.map(renderQueryItem)}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )
                              })()}
                            </div>
                          )}

                          <span className="text-[10px] text-muted-foreground ml-auto">Ctrl+Enter para executar</span>
                          {sqlResult[dbSubtab] && !sqlResult[dbSubtab]!.error && (
                            <span className="text-[10px] text-emerald-600 font-medium">
                              {sqlResult[dbSubtab]!.rowCount} linha(s) · {sqlResult[dbSubtab]!.ms}ms
                            </span>
                          )}
                        </div>

                        {/* Resultado — Erro */}
                        {sqlResult[dbSubtab]?.error && (
                          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-mono whitespace-pre-wrap">
                            {sqlResult[dbSubtab]!.error}
                          </div>
                        )}

                        {/* Resultado — Tabela */}
                        {sqlResult[dbSubtab] && !sqlResult[dbSubtab]!.error && sqlResult[dbSubtab]!.columns.length > 0 && (() => {
                          const filterText = (sqlFilter[dbSubtab] || '').toLowerCase()
                          const allRows = sqlResult[dbSubtab]!.rows
                          const filteredRows = filterText
                            ? allRows.filter(row => (row as (string | null)[]).some(cell => cell !== null && String(cell).toLowerCase().includes(filterText)))
                            : allRows
                          return (
                            <div className="space-y-2">
                              {/* Campo de busca */}
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1 max-w-[300px]">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                  <Input
                                    placeholder="Filtrar resultados..."
                                    value={sqlFilter[dbSubtab] || ''}
                                    onChange={(e) => setSqlFilter(prev => ({ ...prev, [dbSubtab]: e.target.value }))}
                                    className="h-8 pl-8 text-xs"
                                  />
                                  {filterText && (
                                    <button
                                      type="button"
                                      onClick={() => setSqlFilter(prev => ({ ...prev, [dbSubtab]: '' }))}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                  {filterText
                                    ? `${filteredRows.length} de ${allRows.length} linha(s)`
                                    : `${allRows.length} linha(s)`
                                  }
                                </span>
                              </div>

                              {/* Tabela */}
                              <div className={cn('rounded border border-[rgba(0,0,0,0.08)] overflow-auto', expandedConsole ? 'max-h-[calc(100vh-400px)]' : 'max-h-[400px]')}>
                                <table className="w-full text-xs">
                                  <thead className="bg-muted/40 sticky top-0">
                                    <tr>
                                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)] w-[50px]">#</th>
                                      {sqlResult[dbSubtab]!.columns.map((col, i) => (
                                        <th key={i} className="px-3 py-2 text-left font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)] whitespace-nowrap">
                                          {col}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredRows.length === 0 ? (
                                      <tr>
                                        <td colSpan={sqlResult[dbSubtab]!.columns.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                                          Nenhum resultado encontrado para &quot;{sqlFilter[dbSubtab]}&quot;
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredRows.map((row, ri) => (
                                        <tr key={ri} className="hover:bg-muted/40 border-b border-border/40">
                                          <td className="px-3 py-1.5 text-muted-foreground font-mono">{ri + 1}</td>
                                          {(row as (string | null)[]).map((cell, ci) => (
                                            <td key={ci} className="px-3 py-1.5 font-mono whitespace-nowrap max-w-[300px] truncate" title={cell ?? ''}>
                                              {cell === null ? <span className="text-muted-foreground italic">NULL</span> : String(cell)}
                                            </td>
                                          ))}
                                        </tr>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )
                        })()}

                        {/* Resultado — Query sem retorno (INSERT/UPDATE/DELETE) */}
                        {sqlResult[dbSubtab] && !sqlResult[dbSubtab]!.error && sqlResult[dbSubtab]!.columns.length === 0 && (
                          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            ✓ Query executada com sucesso ({sqlResult[dbSubtab]!.ms}ms)
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : activeGroup === 'Google' ? (
              /* ============================================================ */
              /* GRUPO ESPECIAL: GOOGLE (com sub-abas)                        */
              /* ============================================================ */
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Google</h4>
                  <Button variant="success" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>

                {/* Sub-abas horizontais */}
                <div className="border-b border-[rgba(0,0,0,0.08)] px-5">
                  <div className="flex gap-0">
                    {GOOGLE_SUBTABS.map((tab) => {
                      const Icon = tab.icon
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setGoogleSubtab(tab.key)}
                          className={cn(
                            'px-4 py-2.5 text-xs font-medium transition-all flex items-center gap-2 border-b-2 -mb-px',
                            googleSubtab === tab.key
                              ? 'border-orange-500 text-orange-600'
                              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {tab.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div key={googleSubtab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                  {googleSubtab === 'drive' && (
                    <div className="mb-4 rounded border border-sky-200/70 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-900/40 px-3 py-2.5 text-[11px] text-sky-900 dark:text-sky-200 leading-relaxed">
                      <p className="font-semibold mb-1">Como configurar:</p>
                      <p>
                        Rode <code className="bg-sky-100 dark:bg-sky-900/60 px-1 rounded">python scripts/extract-google-refresh-token.py</code> a partir
                        de credentials.json + token.pickle em <code>./google/</code>. O script imprime os valores prontos pra colar abaixo.
                        Detalhes em <code>docs/INTEGRACAO-GOOGLE-DRIVE.md</code>.
                      </p>
                    </div>
                  )}

                  {googleSubtab === 'backup' ? (
                    <GoogleBackupSection />
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {activeFields.map(renderField)}
                      {activeFields.length === 0 && (
                        <div className="col-span-12 text-center py-10 text-sm text-muted-foreground">
                          Nenhum campo nesta seção.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : activeGroup === NOTIFICATIONS_GROUP ? (
              /* ============================================================ */
              /* PILL ESPECIAL: NOTIFICAÇÕES — toggles de remoção por origem  */
              /* ============================================================ */
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                    <Bell className="h-4 w-4 text-orange-500" />
                    Notificações — controle de remoção pelo usuário
                  </h4>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleSaveNotif}
                    disabled={notifSaving || !notifDirty}
                  >
                    {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {notifSaving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>

                <div className="flex-1 p-5 space-y-4" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                  <div className="rounded border border-orange-200/70 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-900/40 px-3 py-2.5 text-[11px] text-orange-900 dark:text-orange-200 leading-relaxed">
                    Por origem, define se o usuário pode remover a notificação manualmente
                    do sino. Origens <strong>não removíveis</strong> ficam no painel até a
                    condição que as gerou ser resolvida pelo sistema (ex: o evento da agenda
                    passar; o certificado ser regularizado).
                  </div>

                  {notifLoading ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando origens…
                    </div>
                  ) : notifOrigens.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      Nenhuma origem cadastrada.
                    </div>
                  ) : (
                    <div className="rounded border border-[rgba(0,0,0,0.08)] overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)]">Origem / Módulo</th>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)]">Descrição</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)] w-[110px]">Ativos</th>
                            <th className="text-center px-3 py-2 font-semibold text-muted-foreground border-b border-[rgba(0,0,0,0.08)] w-[180px]">Removível pelo usuário</th>
                          </tr>
                        </thead>
                        <tbody>
                          {notifOrigens.map(o => {
                            const alterado = o.removivelAtual !== o.removivelPadrao
                            return (
                              <tr key={o.origem} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30">
                                <td className="px-3 py-2.5 align-top">
                                  <div className="flex items-center gap-2">
                                    {o.removivelAtual
                                      ? <Unlock className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                      : <Lock className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                                    <div className="min-w-0">
                                      <div className="font-semibold text-foreground">{o.label}</div>
                                      <div className="text-[10px] text-muted-foreground">
                                        {o.modulo}
                                        {!o.conhecida && (
                                          <span className="ml-1 inline-flex items-center rounded-sm px-1 py-0 text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800">
                                            não mapeada
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">{o.origem}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 align-top text-muted-foreground leading-relaxed">
                                  {o.descricao}
                                </td>
                                <td className="px-3 py-2.5 align-top text-center">
                                  <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 h-5 text-[10px] font-bold tabular-nums">
                                    {o.ativos}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 align-top text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={o.removivelAtual}
                                      onClick={() => toggleNotifOrigem(o.origem)}
                                      className={cn(
                                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
                                        o.removivelAtual ? 'bg-emerald-500' : 'bg-rose-300 dark:bg-rose-900/50',
                                      )}
                                      title={o.removivelAtual ? 'Usuário pode remover' : 'Sistema gerencia (não removível)'}
                                    >
                                      <span
                                        className={cn(
                                          'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                                          o.removivelAtual ? 'translate-x-[18px]' : 'translate-x-0.5',
                                        )}
                                      />
                                    </button>
                                    {alterado && (
                                      <button
                                        type="button"
                                        onClick={() => resetNotifOrigem(o.origem)}
                                        title={`Restaurar padrão (${o.removivelPadrao ? 'removível' : 'não removível'})`}
                                        className="text-[10px] text-orange-600 hover:underline"
                                      >
                                        padrão
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : activeGroup === HELPDESK_GROUP ? (
              /* ============================================================ */
              /* PILL ESPECIAL: HELPDESK — Geral (SLA/inbound) + Triagem IA   */
              /* ============================================================ */
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                    <Headphones className="h-4 w-4 text-cyan-500" />
                    HelpDesk
                  </h4>
                  {hdSubtab === 'geral' && (
                    <Button variant="success" size="sm" onClick={handleSaveHd} disabled={hdSaving || !hdDirty || !hdCfg}>
                      {hdSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {hdSaving ? 'Salvando...' : 'Salvar'}
                    </Button>
                  )}
                </div>
                {/* Sub-abas */}
                <div className="px-5 pt-3 flex items-center gap-1 border-b border-[rgba(0,0,0,0.06)]">
                  <button
                    type="button"
                    onClick={() => setHdSubtab('geral')}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-semibold rounded-t-md transition-colors -mb-px border-b-2',
                      hdSubtab === 'geral' ? 'text-cyan-600 border-cyan-500' : 'text-muted-foreground border-transparent hover:text-foreground',
                    )}
                  >
                    Geral
                  </button>
                  <button
                    type="button"
                    onClick={() => setHdSubtab('ia')}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-semibold rounded-t-md transition-colors -mb-px border-b-2 inline-flex items-center gap-1.5',
                      hdSubtab === 'ia' ? 'text-cyan-600 border-cyan-500' : 'text-muted-foreground border-transparent hover:text-foreground',
                    )}
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Triagem IA
                  </button>
                </div>
                <div className="flex-1 p-5 space-y-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }} key={hdSubtab}>
                  {hdSubtab === 'ia' ? (
                    <HelpdeskIaSection />
                  ) : hdLoading || !hdCfg ? (
                    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando configurações…
                    </div>
                  ) : (
                    <>
                      {/* SLA por prioridade */}
                      <section className="space-y-2">
                        <Label className="text-[13px] font-semibold">SLA padrão por prioridade (horas)</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Tempo total de resolução desde a criação. Pode ser sobrescrito pela categoria.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                          {(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'] as const).map(p => (
                            <div key={p} className="space-y-1">
                              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{p}</Label>
                              <Input
                                type="number"
                                min={1}
                                max={2400}
                                value={hdCfg.slaPorPrioridade[p]}
                                onChange={e => updateHdSla(p, Math.max(1, Number(e.target.value) || 1))}
                                className="h-8 text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Auto-fechamento */}
                      <section className="space-y-2 pt-3 border-t">
                        <Label className="text-[13px] font-semibold">Auto-fechamento de tickets resolvidos sem CSAT</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Tickets em <strong>RESOLVIDO</strong> sem avaliação do solicitante são fechados automaticamente
                          após N dias (nota neutra 3/5).
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={hdCfg.autoFechamentoDias}
                            onChange={e => updateHd('autoFechamentoDias', Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                            className="h-9 w-24 text-sm"
                          />
                          <span className="text-sm text-muted-foreground">dia(s)</span>
                        </div>
                      </section>

                      {/* Inbound */}
                      <section className="space-y-2 pt-3 border-t">
                        <Label className="text-[13px] font-semibold">E-mail inbound (Resend)</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Endereço que recebe e-mails e converte automaticamente em tickets. Configure o domínio
                          no Resend e aponte o webhook para <code className="text-[11px]">/api/helpdesk/inbound</code>.
                        </p>
                        <Input
                          type="email"
                          value={hdCfg.inboundEmail}
                          onChange={e => updateHd('inboundEmail', e.target.value)}
                          placeholder="suporte@central-rnc.com.br"
                          className="h-9 text-sm"
                        />
                      </section>

                      <div className="rounded border border-cyan-200/70 bg-cyan-50/40 dark:bg-cyan-950/20 dark:border-cyan-900/40 px-3 py-2.5 text-[11px] text-cyan-900 dark:text-cyan-200 leading-relaxed">
                        <strong>Próximos passos sugeridos:</strong> CRUD completo de categorias (com SLA por categoria
                        e cor customizável) chegará em uma evolução desta pill. Por enquanto, o catálogo TI inicial
                        é gerenciado via seed (<code className="text-[11px]">seed-helpdesk-ti.ts</code>).
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : activeGroup === CALENDARIO_GROUP ? (
              /* ============================================================ */
              /* PILL ESPECIAL: CALENDÁRIO — feriados estaduais/municipais    */
              /* ============================================================ */
              <CalendarioSection />
            ) : activeGroup === GRUPOS_OBRIGACAO_GROUP ? (
              /* ============================================================ */
              /* PILL ESPECIAL: TEMPLATES DE OBRIGAÇÕES                       */
              /* ============================================================ */
              <GruposObrigacaoSection />
            ) : (
              /* ============================================================ */
              /* GRUPOS NORMAIS (comportamento padrão)                        */
              /* ============================================================ */
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold">{activeGroup}</h4>
                  <Button variant="success" size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>

                <div className="grid grid-cols-12 gap-3">
                  {activeFields.map(renderField)}
                  {activeFields.length === 0 && (
                    <div className="col-span-12 text-center py-10 text-sm text-muted-foreground">
                      Nenhum campo nesta seção.
                    </div>
                  )}
                </div>

                {/* Acessórias — painel de sincronização + teste */}
                {activeGroup === 'Acessórias' && (
                  <div className="mt-6 border-t pt-4 space-y-5">
                    {/* Gestão de Sincronização — link pro painel completo */}
                    <div>
                      <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Gestão de Sincronização</h5>
                      <div className="rounded border border-sky-200/70 bg-sky-50/40 dark:bg-sky-950/20 dark:border-sky-900/40 px-4 py-3">
                        <p className="text-[12px] text-sky-900 dark:text-sky-200 mb-3 leading-relaxed">
                          O painel <strong>Acessórias — Sincronização</strong> reúne todas as operações de integração:
                          mapeamento de empresas (CNPJ ↔ Cliente), <strong>vínculo M:N</strong> de obrigações com serviços,
                          sugestões automáticas por classificador, sincronização de entregas e histórico de execuções.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => router.push('/acessorias')}
                          className="gap-1.5"
                          style={{ backgroundColor: '#0ea5e9' }}
                        >
                          <Zap className="h-3.5 w-3.5" /> Abrir Painel de Sincronização
                        </Button>
                      </div>
                    </div>

                    {/* Teste de conexão (mantido aqui — atalho de saúde da integração) */}
                    <div>
                      <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Testar integração</h5>
                    <div className="rounded border border-emerald-200/70 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 px-3 py-2.5 text-[11px] text-emerald-900 dark:text-emerald-200 leading-relaxed mb-3">
                      Valida que o token funciona batendo em <code className="font-mono">/companies?limit=1</code>. Não cria nem altera nada no Acessórias — só verifica conexão e contabiliza empresas cadastradas. <strong>Salve as configurações antes de testar.</strong>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={acessTesting}
                        onClick={async () => {
                          setAcessTesting(true)
                          setAcessResult(null)
                          try {
                            const r = await (trpc as any).acessorias.testConnection.query() as {
                              ok: boolean; status: number; error?: string; empresasCount?: number; baseUrl: string; rateLimitRemaining?: number
                            }
                            setAcessResult(r)
                            if (r.ok) {
                              alerts.success(
                                'Conexão OK',
                                `Acessórias respondeu em ${r.baseUrl}. ${r.empresasCount != null ? `${r.empresasCount} empresa(s) cadastradas.` : ''}`.trim(),
                              )
                            } else {
                              alerts.error('Falhou', r.error ?? `HTTP ${r.status}`)
                            }
                          } catch (e) {
                            alerts.error('Erro', (e as Error).message)
                          } finally {
                            setAcessTesting(false)
                          }
                        }}
                        className="gap-1.5"
                      >
                        {acessTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                        Testar conexão
                      </Button>
                      {acessResult && (
                        <div className={cn(
                          'flex items-center gap-2 text-xs px-2.5 py-1.5 rounded border',
                          acessResult.ok
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
                        )}>
                          {acessResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          <span className="font-medium">
                            {acessResult.ok
                              ? <>HTTP {acessResult.status} · {acessResult.empresasCount != null ? `${acessResult.empresasCount} empresa(s)` : 'OK'}</>
                              : <>HTTP {acessResult.status || '—'} · {acessResult.error}</>}
                          </span>
                          {acessResult.rateLimitRemaining != null && (
                            <span className="text-muted-foreground">· rate-limit restante: {acessResult.rateLimitRemaining}</span>
                          )}
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                )}

                {/* Teste SMTP */}
                {activeGroup === 'E-mail (SMTP)' && (
                  <div className="mt-6 border-t pt-4">
                    <h5 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Testar envio</h5>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label className="text-xs">E-mail de destino</Label>
                        <Input
                          type="email"
                          placeholder="seu@email.com"
                          value={smtpTestEmail}
                          onChange={e => setSmtpTestEmail(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={smtpTesting || !smtpTestEmail.includes('@')}
                        onClick={async () => {
                          setSmtpTesting(true)
                          try {
                            const r = await trpc.admin.testSmtp.mutate({ destinatario: smtpTestEmail }) as { ok: boolean; message: string }
                            if (r.ok) alerts.success('Sucesso', r.message)
                            else alerts.error('Falha', r.message)
                          } catch (e) {
                            alerts.error('Erro', (e as Error).message)
                          } finally {
                            setSmtpTesting(false)
                          }
                        }}
                        className="gap-1.5 shrink-0"
                      >
                        {smtpTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                        Enviar teste
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
