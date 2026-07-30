'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, ArrowLeft, Mail, Loader2, Bell, Clock, Inbox, Users, AlertTriangle,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Switch,
} from '@saas/ui'
import { EmailChipsInput } from '@/components/ui/email-chips-input'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

interface Config {
  slaPorPrioridade: { BAIXA: number; MEDIA: number; ALTA: number; URGENTE: number }
  autoFechamentoDias: number
  inboundEmail: string
  notificarTodosAgentes: boolean
  destinatarios: string[]
  temAgentes: boolean
}

export default function HelpdeskConfiguracoesPage() {
  const router = useRouter()
  const { isMaster, permissions } = useUserPermissions()
  const helpdeskPerm = permissions.find((p) => p.moduleSlug === 'helpdesk')
  const canWrite = isMaster || helpdeskPerm?.canWrite === true

  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  // Chips guardam os e-mails como string "a@b; c@d" (formato do EmailChipsInput).
  const [destinatarios, setDestinatarios] = useState('')
  const [notificarTodos, setNotificarTodos] = useState(false)
  const [autoFechamentoDias, setAutoFechamentoDias] = useState('3')
  const [inboundEmail, setInboundEmail] = useState('')
  const [savingField, setSavingField] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const c = await trpc.helpdesk.getConfig.query()
      setConfig(c as unknown as Config)
      setDestinatarios((c.destinatarios ?? []).join('; '))
      setNotificarTodos(!!c.notificarTodosAgentes)
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

  // Salva os destinatários (string de chips → array). Cada add/remove de chip é
  // uma ação deliberada, então persiste na hora; ignora se não mudou.
  async function salvarDestinatarios(next: string) {
    setDestinatarios(next)
    const arr = next.split(/[,;]/).map(s => s.trim()).filter(Boolean)
    const atual = (config?.destinatarios ?? [])
    if (arr.join('|') === atual.join('|')) return
    await saveField('destinatarios', { destinatarios: arr } as Partial<Config>)
  }

  async function alternarNotificarTodos(v: boolean) {
    setNotificarTodos(v)
    await saveField('notificarTodos', { notificarTodosAgentes: v } as Partial<Config>)
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
          {/* Card: Notificação de novos tickets */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}
              >
                <Bell className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Notificação de novos tickets</h3>
                <p className="text-[12px] text-muted-foreground">
                  Como os agentes ficam sabendo quando um ticket é aberto (sino no app + e-mail).
                </p>
              </div>
            </div>

            {/* Aviso: sem agentes = ninguém é notificado nem pode atender */}
            {config && !config.temAgentes && (
              <div className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Nenhum usuário é agente do HelpDesk.</strong> Isso significa que ninguém será
                  notificado de novos tickets nem poderá atendê-los. Defina agentes nas permissões do
                  módulo (sub-permissão "Atuar como agente" ou lotando usuários numa área de TI).
                </span>
              </div>
            )}

            {/* Toggle: notificar todos os agentes */}
            <div className="p-4 flex items-start justify-between gap-4 border-b border-border/60">
              <div className="min-w-0">
                <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Notificar todos os agentes
                </Label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {notificarTodos
                    ? 'Ligado: todo novo ticket avisa (sino + e-mail) TODOS os agentes do HelpDesk, além dos destinatários adicionais abaixo.'
                    : 'Desligado: novo ticket avisa (sino + e-mail) os membros da área do ticket. Sem área, cai nos destinatários abaixo.'}
                </p>
              </div>
              <Switch checked={notificarTodos} onCheckedChange={alternarNotificarTodos} disabled={!canWrite} />
            </div>

            {/* Lista de e-mails (rótulo/texto mudam conforme o toggle) */}
            <div className="p-4 space-y-1.5">
              <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                <Mail className="h-3 w-3" /> {notificarTodos ? 'Destinatários adicionais' : 'Destinatários'}
                {savingField === 'destinatarios' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </Label>
              <EmailChipsInput
                value={destinatarios}
                onChange={salvarDestinatarios}
                disabled={!canWrite}
                placeholder="Digite um e-mail e pressione Enter"
              />
              <p className="text-[11px] text-muted-foreground">
                {notificarTodos
                  ? 'E-mails que também recebem o aviso de novos tickets, além de todos os agentes. Útil pra caixas de grupo (ex: ti@).'
                  : 'E-mails avisados por e-mail quando um ticket é aberto SEM área definida (ex: via balão "Fale com a TI"). Tickets com área vão para os membros da área.'}
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
