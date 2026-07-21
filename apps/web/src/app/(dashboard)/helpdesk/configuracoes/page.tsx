'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, ArrowLeft, Mail, Loader2, Bell, Clock, Inbox,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
} from '@saas/ui'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

interface Config {
  slaPorPrioridade: { BAIXA: number; MEDIA: number; ALTA: number; URGENTE: number }
  autoFechamentoDias: number
  inboundEmail: string
  emailNotificacao: string
}

export default function HelpdeskConfiguracoesPage() {
  const router = useRouter()
  const { isMaster, permissions } = useUserPermissions()
  const helpdeskPerm = permissions.find((p) => p.moduleSlug === 'helpdesk')
  const canWrite = isMaster || helpdeskPerm?.canWrite === true

  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailNotificacao, setEmailNotificacao] = useState('')
  const [autoFechamentoDias, setAutoFechamentoDias] = useState('3')
  const [inboundEmail, setInboundEmail] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const c = await trpc.helpdesk.getConfig.query()
      setConfig(c as unknown as Config)
      setEmailNotificacao(c.emailNotificacao ?? '')
      setAutoFechamentoDias(c.autoFechamentoDias.toString())
      setInboundEmail(c.inboundEmail ?? '')
    } catch (e) {
      // Sem permissão → redireciona pra listagem
      const msg = (e as Error).message
      if (/FORBIDDEN|UNAUTHORIZED|permiss/i.test(msg)) {
        alerts.error('Acesso negado', 'Apenas a TI pode acessar as configurações do HelpDesk.')
        router.replace('/helpdesk')
        return
      }
      alerts.error('Erro ao carregar config: ' + msg)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  async function saveField(campo: string, patch: Partial<Config>) {
    setSavingField(campo)
    try {
      await trpc.helpdesk.updateConfig.mutate(patch as never)
      await fetchConfig()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSavingField(null)
    }
  }

  async function handleBlurEmailNotificacao() {
    const v = emailNotificacao.trim()
    if (!v) { setEmailNotificacao(config?.emailNotificacao ?? ''); return }
    if (v === config?.emailNotificacao) return
    await saveField('emailNotificacao', { emailNotificacao: v })
  }

  async function handleBlurAutoFechamento() {
    const n = Number(autoFechamentoDias)
    if (!n || n < 1) { setAutoFechamentoDias(config?.autoFechamentoDias.toString() ?? '3'); return }
    if (n === config?.autoFechamentoDias) return
    await saveField('autoFechamentoDias', { autoFechamentoDias: n })
  }

  async function handleBlurInbound() {
    const v = inboundEmail.trim()
    if (v === (config?.inboundEmail ?? '')) return
    await saveField('inboundEmail', { inboundEmail: v })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="ti" icon={Settings} />
          <div>
            <h1>Configurações do HelpDesk</h1>
            <p className="text-sm text-muted-foreground">Notificações, SLA padrão e inbound de e-mail</p>
          </div>
        </div>
        <Button
          variant="outline" size="icon"
          onClick={() => router.push('/helpdesk')}
          title="Voltar pra HelpDesk"
          className="h-9 w-9"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : (
        <>
          {/* Card: Email de notificação */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}
              >
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Email de notificação de tickets</h3>
                <p className="text-[12px] text-muted-foreground">
                  Quando um ticket é criado <strong>sem categoria/área</strong> (ex: via balão "Fale com a TI"),
                  enviamos o resumo do ticket pra esse email.
                </p>
              </div>
            </div>
            <div className="p-4 space-y-1.5">
              <Label htmlFor="email-not" className="text-[13px] font-semibold flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Destinatário
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email-not"
                  type="email"
                  value={emailNotificacao}
                  onChange={(e) => setEmailNotificacao(e.target.value)}
                  onBlur={handleBlurEmailNotificacao}
                  disabled={!canWrite}
                  placeholder="ti@central-rnc.com.br"
                  className="h-9 text-sm max-w-md"
                />
                {savingField === 'emailNotificacao' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Recomenda-se um endereço de grupo (ex: <code className="bg-muted px-1 rounded">ti@</code>) pra
                garantir que alguém leia. Tickets COM categoria definida continuam indo pros agentes da área.
              </p>
            </div>
          </Card>

          {/* Card: Auto-fechamento */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}
              >
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Auto-fechamento</h3>
                <p className="text-[12px] text-muted-foreground">
                  Tickets com status <strong>Aguardando avaliação</strong> que não receberem avaliação CSAT após X dias
                  são automaticamente fechados (status <strong>Concluído</strong>), sem registrar nota.
                </p>
              </div>
            </div>
            <div className="p-4 space-y-1.5">
              <Label htmlFor="auto-dias" className="text-[13px] font-semibold">Dias após resolução</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="auto-dias"
                  type="number" min={1} max={30}
                  value={autoFechamentoDias}
                  onChange={(e) => setAutoFechamentoDias(e.target.value)}
                  onBlur={handleBlurAutoFechamento}
                  disabled={!canWrite}
                  className="h-9 w-28 text-sm"
                />
                <span className="text-[13px] text-muted-foreground">dias</span>
                {savingField === 'autoFechamentoDias' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            </div>
          </Card>

          {/* Card: Inbound email */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}
              >
                <Inbox className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Inbound de e-mail</h3>
                <p className="text-[12px] text-muted-foreground">
                  Endereço que recebe e-mails externos e converte em tickets (via Resend Inbound).
                </p>
              </div>
            </div>
            <div className="p-4 space-y-1.5">
              <Label htmlFor="inbound" className="text-[13px] font-semibold flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> Endereço inbound
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="inbound"
                  type="email"
                  value={inboundEmail}
                  onChange={(e) => setInboundEmail(e.target.value)}
                  onBlur={handleBlurInbound}
                  disabled={!canWrite}
                  placeholder="suporte@oneclick.central-rnc.com.br"
                  className="h-9 text-sm max-w-md"
                />
                {savingField === 'inboundEmail' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Deixe em branco se não usar inbound. Requer config no painel do Resend.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
