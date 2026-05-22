'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Settings2, Loader2, Save, Clock, Hash, Mail, FileText } from 'lucide-react'
import { Button, Card, Input, RichEditor } from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

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

type TabKey = 'prazos' | 'numeracao' | 'emails' | 'textos'

const TABS: Array<{ key: TabKey; label: string; icon: typeof Clock }> = [
  { key: 'prazos', label: 'Prazos do workflow', icon: Clock },
  { key: 'numeracao', label: 'Numeração', icon: Hash },
  { key: 'emails', label: 'Notificações', icon: Mail },
  { key: 'textos', label: 'Textos padrão', icon: FileText },
]

export default function OrcamentosConfiguracoesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<ConfigState>(DEFAULT_CONFIG)
  const [activeTab, setActiveTab] = useState<TabKey>('prazos')

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
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => router.push('/orcamentos')} title="Voltar" className="bg-white dark:bg-card hover:bg-white/90 dark:hover:bg-card/90">
            <ArrowLeft className="h-4 w-4" />
          </Button>
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
            {TABS.map(tab => {
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
                {TABS.find(t => t.key === activeTab)?.label}
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
            </div>
          </div>
        </div>
      </Card>

    </div>
  )
}
