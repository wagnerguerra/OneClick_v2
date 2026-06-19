'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Save, Copy, ExternalLink, Flame, Thermometer, Snowflake } from 'lucide-react'
import { Button, Card, Input, Label, Switch, Badge } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Cfg {
  slug: string; ativo: boolean; trilhaPrompt: string; rubrica: string
  limiarMedio: number; limiarAlto: number
  mensagemBoasVindas: string | null; avisoLgpd: string | null; whatsappComercial: string | null
  tipoEventoReuniaoId: string | null; corPrimaria: string | null
}

const TEMP_META: Record<string, { label: string; icon: typeof Flame; cor: string }> = {
  quente: { label: 'Quente', icon: Flame, cor: '#ef4444' },
  morno: { label: 'Morno', icon: Thermometer, cor: '#f59e0b' },
  frio: { label: 'Frio', icon: Snowflake, cor: '#38bdf8' },
}

export default function CrmFunilPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const crmPerms = (permissions.find(p => p.moduleSlug === 'crm')?.subPermissions ?? {}) as Record<string, boolean>
  const pode = isMaster || isEmpresaMaster || crmPerms.gerir_funil_lead === true

  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessoes, setSessoes] = useState<any[]>([])
  const [report, setReport] = useState<any | null>(null)
  const [tipos, setTipos] = useState<Array<{ id: string; nome: string }>>([])

  useEffect(() => { (trpc.agenda as any).listTipos.query().then((t: any[]) => setTipos(t || [])).catch(() => {}) }, [])

  useEffect(() => { if (!permsLoading && !pode) router.replace('/crm') }, [permsLoading, pode, router])

  const carregar = useCallback(() => {
    setLoading(true)
    Promise.all([
      (trpc.lead as any).getConfig.query(),
      (trpc.lead as any).listSessoes.query().catch(() => []),
      (trpc.lead as any).reportFunil.query({ dias: 30 }).catch(() => null),
    ]).then(([c, s, r]: [Cfg, any[], any]) => { setCfg(c); setSessoes(s || []); setReport(r) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const upd = (patch: Partial<Cfg>) => setCfg(c => c ? { ...c, ...patch } : c)

  async function salvar() {
    if (!cfg) return
    if (!/^[a-z0-9-]{2,}$/.test(cfg.slug)) { alerts.error('Slug inválido', 'Use apenas letras minúsculas, números e hífen.'); return }
    setSaving(true)
    try {
      await (trpc.lead as any).saveConfig.mutate({
        slug: cfg.slug, ativo: cfg.ativo, trilhaPrompt: cfg.trilhaPrompt, rubrica: cfg.rubrica,
        limiarMedio: cfg.limiarMedio, limiarAlto: cfg.limiarAlto,
        mensagemBoasVindas: cfg.mensagemBoasVindas, avisoLgpd: cfg.avisoLgpd,
        whatsappComercial: cfg.whatsappComercial, tipoEventoReuniaoId: cfg.tipoEventoReuniaoId,
        corPrimaria: cfg.corPrimaria || null,
      })
      alerts.success('Salvo', 'Funil atualizado.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  const linkPublico = cfg ? `${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')}/atendimento/${cfg.slug}` : ''
  async function copiarLink() { try { await navigator.clipboard.writeText(linkPublico); alerts.success('Copiado', 'Link da campanha copiado.') } catch { /* */ } }

  if (loading || !cfg) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton href="/crm" />
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1>Funil de captação (IA)</h1>
            <p className="text-sm text-muted-foreground">Chat público que atende e qualifica leads das campanhas, registrando no CRM</p>
          </div>
        </div>
        <Button size="sm" onClick={salvar} disabled={saving} style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </Button>
      </div>

      {/* Indicadores (últimos 30 dias) */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Sessões (30d)</p><p className="text-2xl font-bold">{report.total}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Registrados no CRM</p><p className="text-2xl font-bold">{report.registrados}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Conversão</p><p className="text-2xl font-bold">{report.taxaConversao}%</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Quente / Morno / Frio</p><p className="text-sm font-semibold mt-1">{report.porTemperatura?.quente ?? 0} · {report.porTemperatura?.morno ?? 0} · {report.porTemperatura?.frio ?? 0}</p></Card>
        </div>
      )}

      {/* Link público */}
      <Card className="p-5 space-y-2">
        <Label className="text-[13px] font-semibold">Link da campanha</Label>
        <p className="text-[11px] text-muted-foreground">Aponte os anúncios do Instagram/Facebook para este link (pode adicionar <code>?origem=instagram</code> para rastrear a fonte).</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 text-sm font-mono flex-1 min-w-[260px]" value={linkPublico} readOnly onFocus={e => e.currentTarget.select()} />
          <Button variant="outline" size="sm" onClick={copiarLink} className="gap-1.5"><Copy className="h-4 w-4" /> Copiar</Button>
          <a href={linkPublico} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Abrir</Button></a>
          <label className="flex items-center gap-1.5 text-xs ml-2"><Switch checked={cfg.ativo} onCheckedChange={v => upd({ ativo: v })} /> Ativo</label>
        </div>
      </Card>

      {/* Configuração */}
      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">Slug (URL)</Label>
            <Input className="h-9 text-sm" value={cfg.slug} onChange={e => upd({ slug: e.target.value })} placeholder="atendimento" />
          </div>
          <div className="col-span-6 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">WhatsApp do comercial</Label>
            <Input className="h-9 text-sm" value={cfg.whatsappComercial ?? ''} onChange={e => upd({ whatsappComercial: e.target.value })} placeholder="55279..." />
          </div>
          <div className="col-span-12 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">Tipo de evento da reunião</Label>
            <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={cfg.tipoEventoReuniaoId ?? ''} onChange={e => upd({ tipoEventoReuniaoId: e.target.value || null })}>
              <option value="">Padrão (primeiro tipo)</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <p className="text-[11px] text-muted-foreground">Usado ao agendar a reunião de um lead quente.</p>
          </div>
          <div className="col-span-12 sm:col-span-4 space-y-1.5">
            <Label className="text-[13px] font-semibold">Cor principal do chat</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.corPrimaria ?? '') ? cfg.corPrimaria! : '#10b981'}
                onChange={e => upd({ corPrimaria: e.target.value })}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
              <Input className="h-9 text-sm font-mono" value={cfg.corPrimaria ?? ''} onChange={e => upd({ corPrimaria: e.target.value })} placeholder="#10b981" />
            </div>
            <p className="text-[11px] text-muted-foreground">Cor da marca aplicada na página pública (balões, botões, header).</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Trilha de atendimento (objetivos + regras)</Label>
          <p className="text-[11px] text-muted-foreground">Descreva o que a IA deve descobrir e como conduzir. Ex.: "Pergunte se tem CNPJ; se sim, confirme o ramo; descubra o serviço de interesse, faturamento e urgência."</p>
          <textarea className="w-full min-h-[140px] rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={cfg.trilhaPrompt} onChange={e => upd({ trilhaPrompt: e.target.value })} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Rubrica de pontuação (pesos)</Label>
          <p className="text-[11px] text-muted-foreground">Critérios e pesos (0–100 total). Ex.: "Tem CNPJ ativo: +30; Faturamento alto: +25; Urgência alta: +25; Serviço premium: +20."</p>
          <textarea className="w-full min-h-[100px] rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={cfg.rubrica} onChange={e => upd({ rubrica: e.target.value })} />
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 sm:col-span-3 space-y-1.5">
            <Label className="text-[13px] font-semibold">Limiar morno (≥)</Label>
            <Input type="number" min={0} max={100} className="h-9 text-sm" value={cfg.limiarMedio} onChange={e => upd({ limiarMedio: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="col-span-6 sm:col-span-3 space-y-1.5">
            <Label className="text-[13px] font-semibold">Limiar quente (≥)</Label>
            <Input type="number" min={0} max={100} className="h-9 text-sm" value={cfg.limiarAlto} onChange={e => upd({ limiarAlto: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="col-span-12 sm:col-span-6 flex items-end"><p className="text-[11px] text-muted-foreground pb-2">Frio &lt; morno &lt; quente. Frio → só registra; morno → oferece WhatsApp; quente → sugere agendar reunião.</p></div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Mensagem de boas-vindas</Label>
          <textarea className="w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={cfg.mensagemBoasVindas ?? ''} onChange={e => upd({ mensagemBoasVindas: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Aviso de privacidade (LGPD)</Label>
          <textarea className="w-full min-h-[50px] rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={cfg.avisoLgpd ?? ''} onChange={e => upd({ avisoLgpd: e.target.value })} />
        </div>
      </Card>

      {/* Sessões recentes */}
      <Card className="p-5 space-y-3">
        <h4 className="text-sm font-semibold">Sessões recentes</h4>
        {sessoes.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma sessão ainda.</p> : (
          <div className="border rounded-lg divide-y max-h-[360px] overflow-y-auto">
            {sessoes.map(s => {
              const t = s.temperatura ? TEMP_META[s.temperatura] : null
              const nome = s.dados?.nome || s.dados?.razaoSocial || '(sem identificação)'
              return (
                <div key={s.id} className="flex items-center gap-3 p-2.5 text-xs">
                  <span className="flex-1 min-w-0 truncate"><span className="font-medium">{nome}</span> <span className="text-muted-foreground">· {s.origem || 'direto'}</span></span>
                  {t && <Badge variant="outline" className="text-[10px] gap-1" style={{ color: t.cor, borderColor: t.cor + '55' }}><t.icon className="h-3 w-3" /> {t.label}{s.score != null ? ` ${s.score}` : ''}</Badge>}
                  <Badge variant={s.status === 'registrado' ? 'secondary' : 'outline'} className="text-[10px]">{s.status === 'registrado' ? 'no CRM' : s.status}</Badge>
                  {s.oportunidadeId && <a href={`/crm/oportunidades/${s.oportunidadeId}`} className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
