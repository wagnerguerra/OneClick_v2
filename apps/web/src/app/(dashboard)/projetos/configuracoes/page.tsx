'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, ArrowLeft, Archive, Loader2, Play, Check, AlertCircle,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

interface Config {
  id: string
  autoArquivarHabilitado: boolean
  autoArquivarDias: number
  ultimaExecucao: string | Date | null
  ultimoTotalArquivados: number
}

export default function ProjetosConfiguracoesPage() {
  const router = useRouter()
  const { isMaster, permissions } = useUserPermissions()
  const projetosPerm = permissions.find((p) => p.moduleSlug === 'projetos')
  const canWrite = isMaster || projetosPerm?.canWrite === true

  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [habilitado, setHabilitado] = useState(false)
  const [dias, setDias] = useState('90')
  const [saving, setSaving] = useState<null | 'habilitado' | 'dias'>(null)
  const [executando, setExecutando] = useState(false)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    try {
      const c = await trpc.projetos.getConfig.query()
      setConfig(c as unknown as Config)
      setHabilitado(c.autoArquivarHabilitado)
      setDias(c.autoArquivarDias.toString())
    } catch (e) {
      alerts.error('Erro ao carregar config: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfig() }, [fetchConfig])

  async function toggleHabilitado(v: boolean) {
    setHabilitado(v)
    setSaving('habilitado')
    try {
      await trpc.projetos.updateConfig.mutate({ autoArquivarHabilitado: v })
      await fetchConfig()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
      setHabilitado(!v)
    } finally {
      setSaving(null)
    }
  }

  async function handleSaveDias() {
    const n = Number(dias)
    if (!n || n < 1) {
      alerts.error('Informe um valor válido (>= 1)')
      setDias(config?.autoArquivarDias.toString() ?? '90')
      return
    }
    if (n === config?.autoArquivarDias) return
    setSaving('dias')
    try {
      await trpc.projetos.updateConfig.mutate({ autoArquivarDias: n })
      await fetchConfig()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSaving(null)
    }
  }

  async function executarAgora() {
    const ok = await alerts.confirm({
      title: 'Executar agora?',
      text: `Projetos concluídos há mais de ${dias} dias serão arquivados imediatamente.`,
      confirmText: 'Executar',
    })
    if (!ok) return
    setExecutando(true)
    try {
      const r = await trpc.projetos.executarAutoArquivar.mutate() as { ok: boolean; arquivados: number; erro?: string }
      if (r.ok) {
        alerts.success(`${r.arquivados} projeto(s) arquivado(s)`)
        await fetchConfig()
      } else {
        alerts.warning(r.erro || 'Não executou')
      }
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="ti" icon={Settings} />
          <div>
            <h1>Configurações</h1>
            <p className="text-sm text-muted-foreground">Comportamentos automáticos do módulo Projetos</p>
          </div>
        </div>
        <Button
          variant="outline" size="icon"
          onClick={() => router.push('/projetos')}
          title="Voltar pra Projetos"
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
          {/* Card: Auto-arquivar */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-3">
              <div
                className="h-9 w-9 rounded-md flex items-center justify-center"
                style={{ background: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)`, color: MODULE_COLOR }}
              >
                <Archive className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground">Auto-arquivar projetos concluídos</h3>
                <p className="text-[12px] text-muted-foreground">
                  Esconde da lista projetos que ficaram com status <strong>Concluído</strong> por mais de X dias.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={habilitado}
                onClick={() => toggleHabilitado(!habilitado)}
                disabled={!canWrite || saving === 'habilitado'}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  habilitado ? 'bg-emerald-500' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition-transform',
                    habilitado ? 'translate-x-5' : 'translate-x-0',
                  )}
                />
              </button>
            </div>

            <div className={`p-4 space-y-4 ${!habilitado ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dias" className="text-[13px] font-semibold">
                    Arquivar após quantos dias?
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="dias"
                      type="number"
                      min={1}
                      max={3650}
                      value={dias}
                      onChange={(e) => setDias(e.target.value)}
                      onBlur={handleSaveDias}
                      disabled={!canWrite}
                      className="h-9 w-28 text-sm"
                    />
                    <span className="text-[13px] text-muted-foreground">dias após conclusão</span>
                    {saving === 'dias' && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Conta a partir da última atualização do projeto.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Última execução</Label>
                  <div className="text-[13px] text-foreground">
                    {config?.ultimaExecucao ? (
                      <>
                        {new Date(config.ultimaExecucao).toLocaleString('pt-BR')}
                        {config.ultimoTotalArquivados > 0 ? (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                            <Check className="h-3 w-3" /> {config.ultimoTotalArquivados} arquivado(s)
                          </span>
                        ) : (
                          <span className="ml-2 text-[11px] text-muted-foreground">nada a arquivar</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">Nunca executou</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-3 flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 text-[12px] text-muted-foreground">
                  O auto-arquivamento ainda não tem cron diário ativo. Use o botão <strong>Executar agora</strong> pra limpar manualmente sempre que quiser.
                </div>
                <Button
                  size="sm"
                  onClick={executarAgora}
                  disabled={!canWrite || executando}
                  className="gap-1.5 text-white"
                  style={{ background: MODULE_COLOR }}
                >
                  {executando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Executar agora
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
