'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Save, Copy, ExternalLink, Flame, Thermometer, Snowflake, Plus, Trash2, Megaphone } from 'lucide-react'
import { Button, Card, Input, Label, Switch, Badge, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { masks } from '@/lib/masks'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'

type LeadOutputs = inferRouterOutputs<AppRouter>['lead']
type Sessao = LeadOutputs['listSessoes'][number]
type ReportFunil = LeadOutputs['reportFunil']

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface Cfg {
  id: string | null
  slug: string; nome: string | null; ativo: boolean; trilhaPrompt: string; rubrica: string
  limiarMedio: number; limiarAlto: number
  mensagemBoasVindas: string | null; avisoLgpd: string | null; whatsappComercial: string | null
  tipoEventoReuniaoId: string | null; corPrimaria: string | null; regrasFinalizacao: string | null
  roteador?: boolean; descricaoRoteamento?: string | null
  _total?: number; _registrados?: number
}

const TEMP_META: Record<string, { label: string; icon: typeof Flame; cor: string }> = {
  quente: { label: 'Quente', icon: Flame, cor: '#ef4444' },
  morno: { label: 'Morno', icon: Thermometer, cor: '#f59e0b' },
  frio: { label: 'Frio', icon: Snowflake, cor: '#38bdf8' },
}

const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export default function CrmFunilPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const crmPerms = (permissions.find(p => p.moduleSlug === 'crm')?.subPermissions ?? {}) as Record<string, boolean>
  // Acessar a tela: sub-permissão de acesso (configurar implica acessar).
  const pode = isMaster || isEmpresaMaster || crmPerms.acessar_funil_lead === true || crmPerms.gerir_funil_lead === true
  // Editar (criar/salvar/excluir campanhas): sub-permissão de configuração.
  const podeGerir = isMaster || isEmpresaMaster || crmPerms.gerir_funil_lead === true

  const [campanhas, setCampanhas] = useState<Cfg[]>([])
  const [cfg, setCfg] = useState<Cfg | null>(null)   // campanha em edição (clone)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [report, setReport] = useState<ReportFunil | null>(null)
  const [tipos, setTipos] = useState<Array<{ id: string; nome: string }>>([])

  useEffect(() => { trpc.agenda.listTipos.query().then(t => setTipos((t ?? []).map(x => ({ id: x.id, nome: x.nome })))).catch(() => {}) }, [])
  useEffect(() => { if (!permsLoading && !pode) router.replace('/crm') }, [permsLoading, pode, router])

  const carregar = useCallback((selecionarSlug?: string) => {
    setLoading(true)
    Promise.all([
      trpc.lead.listConfigs.query().catch(() => []),
      trpc.lead.listSessoes.query().catch(() => [] as Sessao[]),
      trpc.lead.reportFunil.query({ dias: 30 }).catch(() => null),
    ]).then(([lista, s, r]) => {
      const arr = (lista || []) as unknown as Cfg[]
      setCampanhas(arr)
      setSessoes(s || []); setReport(r)
      setCfg(prev => {
        const alvo = selecionarSlug ? arr.find(c => c.slug === selecionarSlug) : (prev?.id ? arr.find(c => c.id === prev.id) : null) ?? arr[0]
        return alvo ? { ...alvo } : arr[0] ? { ...arr[0] } : null
      })
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const upd = (patch: Partial<Cfg>) => setCfg(c => c ? { ...c, ...patch } : c)

  function novaCampanha() {
    const base = campanhas[0]
    setCfg({
      id: null, slug: '', nome: '', ativo: true,
      trilhaPrompt: base?.trilhaPrompt ?? '', rubrica: base?.rubrica ?? '',
      limiarMedio: base?.limiarMedio ?? 40, limiarAlto: base?.limiarAlto ?? 70,
      mensagemBoasVindas: base?.mensagemBoasVindas ?? null, avisoLgpd: base?.avisoLgpd ?? null,
      whatsappComercial: base?.whatsappComercial ?? null, tipoEventoReuniaoId: base?.tipoEventoReuniaoId ?? null,
      corPrimaria: base?.corPrimaria ?? '#10b981', regrasFinalizacao: base?.regrasFinalizacao ?? null,
      roteador: false, descricaoRoteamento: null,
    })
  }

  async function salvar() {
    if (!cfg) return
    if (!/^[a-z0-9-]{2,}$/.test(cfg.slug)) { alerts.error('Slug inválido', 'Use apenas letras minúsculas, números e hífen (mín. 2).'); return }
    if (!cfg.nome?.trim()) { alerts.error('Nome obrigatório', 'Dê um nome à campanha.'); return }
    setSaving(true)
    try {
      await trpc.lead.saveConfig.mutate({
        id: cfg.id, slug: cfg.slug, nome: cfg.nome, ativo: cfg.ativo, trilhaPrompt: cfg.trilhaPrompt, rubrica: cfg.rubrica,
        limiarMedio: cfg.limiarMedio, limiarAlto: cfg.limiarAlto,
        mensagemBoasVindas: cfg.mensagemBoasVindas, avisoLgpd: cfg.avisoLgpd,
        whatsappComercial: cfg.whatsappComercial, tipoEventoReuniaoId: cfg.tipoEventoReuniaoId,
        corPrimaria: cfg.corPrimaria || null, regrasFinalizacao: cfg.regrasFinalizacao || null,
        roteador: cfg.roteador ?? false, descricaoRoteamento: cfg.descricaoRoteamento || null,
      })
      alerts.success('Salvo', 'Campanha atualizada.')
      carregar(cfg.slug)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSaving(false) }
  }

  async function excluir() {
    if (!cfg?.id) return
    const ok = await alerts.confirm({ title: 'Excluir campanha', text: `Excluir "${cfg.nome || cfg.slug}"? Esta ação não pode ser desfeita.`, confirmText: 'Excluir', icon: 'warning' })
    if (!ok) return
    try {
      await trpc.lead.deleteConfig.mutate({ id: cfg.id })
      alerts.success('Excluída', 'Campanha removida.')
      setCfg(null); carregar()
    } catch (e) { alerts.error('Não foi possível excluir', (e as Error).message) }
  }

  const linkPublico = cfg?.slug ? `${(process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')}/atendimento/${cfg.slug}` : ''
  async function copiarLink() { try { await navigator.clipboard.writeText(linkPublico); alerts.success('Copiado', 'Link da campanha copiado.') } catch { /* */ } }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-5">
      {/* Header — padrão inline de /orcamentos e /crm (ícone gradiente + h1 + descrição) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1>Campanhas de captação (IA)</h1>
            <p className="text-sm text-muted-foreground">Cada campanha tem seu próprio link e conduz a IA focada no assunto; os leads caem no CRM marcados pela campanha</p>
          </div>
        </div>
        {/* Ações à direita — botão Voltar sempre à direita (último) */}
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/crm" label="Voltar" />
        </div>
      </div>

      {/* Indicadores (últimos 30 dias, todas as campanhas) */}
      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4"><p className="text-xs text-muted-foreground">Sessões (30d)</p><p className="text-2xl font-bold">{report.total}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Registrados no CRM</p><p className="text-2xl font-bold">{report.registrados}</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Conversão</p><p className="text-2xl font-bold">{report.taxaConversao}%</p></Card>
          <Card className="p-4"><p className="text-xs text-muted-foreground">Quente / Morno / Frio</p><p className="text-sm font-semibold mt-1">{report.porTemperatura?.quente ?? 0} · {report.porTemperatura?.morno ?? 0} · {report.porTemperatura?.frio ?? 0}</p></Card>
        </div>
      )}

      {/* Comparativo por campanha (30d) */}
      {report?.porCampanha?.length > 0 && (
        <Card className="p-5 space-y-3">
          <h4 className="text-sm font-semibold">Comparativo por campanha (30 dias)</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-semibold">Campanha</th>
                  <th className="py-2 px-3 font-semibold text-right">Sessões</th>
                  <th className="py-2 px-3 font-semibold text-right">No CRM</th>
                  <th className="py-2 px-3 font-semibold text-right">Conversão</th>
                  <th className="py-2 pl-3 font-semibold text-right">🔥 / 🌡️ / ❄️</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {report.porCampanha.map((c) => (
                  <tr key={c.slug} className="hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-[11px] text-muted-foreground font-mono ml-1.5">/{c.slug}</span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{c.total}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{c.registrados}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{c.taxaConversao}%</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted-foreground">{c.porTemperatura?.quente ?? 0} · {c.porTemperatura?.morno ?? 0} · {c.porTemperatura?.frio ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Master-detail: lista de campanhas + editor */}
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row">
          {/* LISTA */}
          <div className="md:w-[260px] shrink-0 md:border-r border-b md:border-b-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campanhas</h4>
              {podeGerir && <Button variant="success" size="sm" className="h-7 gap-1 text-xs" onClick={novaCampanha}><Plus className="h-3.5 w-3.5" /> Nova</Button>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-[520px]">
              {campanhas.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nenhuma campanha.</p>}
              {campanhas.map(c => {
                const ativa = cfg?.id === c.id && cfg?.id !== null
                return (
                  <button key={c.id ?? c.slug} type="button" onClick={() => setCfg({ ...c })}
                    className={cn('w-full text-left rounded-md border px-2.5 py-2 transition-colors hover:bg-muted/50', ativa && 'ring-2 ring-rose-400 bg-rose-50/50 dark:bg-rose-950/20')}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Megaphone className="h-3.5 w-3.5 shrink-0" style={{ color: c.corPrimaria || '#10b981' }} />
                      <span className="text-sm font-medium truncate flex-1">{c.nome || c.slug}</span>
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', c.ativo ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono truncate pl-5">/{c.slug}</p>
                    <p className="text-[10px] text-muted-foreground pl-5">{c._registrados ?? 0} no CRM · {c._total ?? 0} sessões</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* EDITOR */}
          <div className="flex-1 min-w-0 p-5">
            {!cfg ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center gap-2 text-muted-foreground">
                <Megaphone className="h-9 w-9 opacity-30" />
                <p className="text-sm max-w-[260px]">Selecione uma campanha à esquerda ou clique em <span className="font-medium">Nova</span> para criar.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{!podeGerir ? 'Detalhes da campanha' : cfg.id ? 'Editar campanha' : 'Nova campanha'}</h3>
                  {podeGerir && (
                    <div className="flex items-center gap-2">
                      {cfg.id && <Button variant="soft-destructive" size="sm" className="text-xs gap-1.5" onClick={excluir}><Trash2 className="h-3.5 w-3.5" /> Excluir</Button>}
                      <Button variant="success" size="sm" onClick={salvar} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                      </Button>
                    </div>
                  )}
                </div>

                <fieldset disabled={!podeGerir} className="space-y-4 border-0 m-0 p-0 min-w-0 disabled:opacity-100">
                {/* Identidade */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-5 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Nome da campanha *</Label>
                    <Input className="h-9 text-sm" value={cfg.nome ?? ''} placeholder="Ex: Benefícios Fiscais"
                      onChange={e => upd(cfg.id ? { nome: e.target.value } : { nome: e.target.value, slug: slugify(e.target.value) })} />
                  </div>
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Slug (URL)</Label>
                    <Input className="h-9 text-sm font-mono" value={cfg.slug} onChange={e => upd({ slug: e.target.value })} placeholder="beneficios-fiscais" />
                  </div>
                  <div className="col-span-12 sm:col-span-3 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Cor do chat</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cfg.corPrimaria ?? '') ? cfg.corPrimaria! : '#10b981'}
                        onChange={e => upd({ corPrimaria: e.target.value })}
                        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5" />
                      <Input className="h-9 text-sm font-mono" value={cfg.corPrimaria ?? ''} onChange={e => upd({ corPrimaria: e.target.value })} placeholder="#10b981" />
                    </div>
                  </div>
                </div>

                {/* Link público */}
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <Label className="text-[12px] font-semibold">Link da campanha</Label>
                  <p className="text-[11px] text-muted-foreground">Use este link no anúncio/landing desta campanha (pode acrescentar <code>?origem=instagram</code> para rastrear a fonte).</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="h-9 text-sm font-mono flex-1 min-w-[240px]" value={linkPublico} readOnly onFocus={e => e.currentTarget.select()} placeholder="Salve a campanha para gerar o link" />
                    <Button variant="outline" size="sm" onClick={copiarLink} disabled={!cfg.slug} className="gap-1.5"><Copy className="h-4 w-4" /> Copiar</Button>
                    {linkPublico && <a href={linkPublico} target="_blank" rel="noreferrer"><Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="h-4 w-4" /> Abrir</Button></a>}
                    <label className="flex items-center gap-1.5 text-xs ml-2"><Switch checked={cfg.ativo} onCheckedChange={v => upd({ ativo: v })} /> Ativa</label>
                    <label className="flex items-center gap-1.5 text-xs ml-2" title="A IA identifica a intenção e encaminha para a trilha certa (chat único no site)."><Switch checked={!!cfg.roteador} onCheckedChange={v => upd({ roteador: v })} /> Recepção (roteia)</label>
                  </div>
                </div>

                {cfg.roteador && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3 text-[12px] text-emerald-800 dark:text-emerald-300">
                    <strong>Modo Recepção.</strong> Esta campanha é o ponto de entrada único (ex.: o chat do site). A IA faz a triagem, identifica a intenção e <strong>encaminha o lead para a trilha certa</strong> (usando a &quot;descrição de roteamento&quot; de cada trilha), ou trata como fora de escopo (currículo/suporte/spam). A trilha e a rubrica abaixo <em>não</em> são usadas neste modo.
                  </div>
                )}

                {!cfg.roteador && (
                  <div className="space-y-1.5">
                    <Label className="text-[13px] font-semibold">Quando encaminhar para esta trilha (usado pela Recepção)</Label>
                    <p className="text-[11px] text-muted-foreground">Uma frase-gatilho pra IA da Recepção reconhecer e rotear pra cá. Ex.: &quot;Empresa querendo economizar com benefícios/incentivos fiscais (ICMS, créditos).&quot;</p>
                    <textarea className="w-full min-h-[60px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.descricaoRoteamento ?? ''} onChange={e => upd({ descricaoRoteamento: e.target.value })} placeholder="Deixe em branco se esta trilha não deve receber leads pela Recepção." />
                  </div>
                )}

                {/* Condução da IA */}
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Trilha de atendimento (foco desta campanha)</Label>
                  <p className="text-[11px] text-muted-foreground">O que a IA deve descobrir e como conduzir, voltado ao tema da campanha. Ex.: "Foque em recuperação de créditos e incentivos fiscais; descubra regime tributário, faturamento e se já houve apuração."</p>
                  <textarea className="w-full min-h-[140px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.trilhaPrompt} onChange={e => upd({ trilhaPrompt: e.target.value })} placeholder="Deixe em branco para usar a trilha padrão." />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Rubrica de pontuação (pesos)</Label>
                  <p className="text-[11px] text-muted-foreground">Critérios e pesos (0–100 total) para qualificar o lead desta campanha.</p>
                  <textarea className="w-full min-h-[100px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.rubrica} onChange={e => upd({ rubrica: e.target.value })} placeholder="Deixe em branco para usar a rubrica padrão." />
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
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">WhatsApp do comercial</Label>
                    <Input className="h-9 text-sm" value={cfg.whatsappComercial ?? ''} onChange={e => upd({ whatsappComercial: masks.telefone(e.target.value) })} placeholder="(27) 99999-9999" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Regras de finalização</Label>
                  <p className="text-[11px] text-muted-foreground">Como a IA encerra conforme a temperatura. Ex.: "Quente → convide para agendar; morno → ofereça WhatsApp; frio → agradeça."</p>
                  <textarea className="w-full min-h-[100px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.regrasFinalizacao ?? ''} onChange={e => upd({ regrasFinalizacao: e.target.value })} placeholder="Deixe em branco para usar o padrão." />
                </div>

                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-[13px] font-semibold">Tipo de evento da reunião</Label>
                    <Select value={cfg.tipoEventoReuniaoId ?? '__default__'} onValueChange={v => upd({ tipoEventoReuniaoId: v === '__default__' ? null : v })}>
                      <SelectTrigger className="h-9 text-sm bg-card"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default__">Padrão (Reunião com Lead)</SelectItem>
                        {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Mensagem de boas-vindas</Label>
                  <textarea className="w-full min-h-[60px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.mensagemBoasVindas ?? ''} onChange={e => upd({ mensagemBoasVindas: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-semibold">Aviso de privacidade (LGPD)</Label>
                  <textarea className="w-full min-h-[50px] rounded-md border border-input bg-card px-3 py-2 text-sm" value={cfg.avisoLgpd ?? ''} onChange={e => upd({ avisoLgpd: e.target.value })} />
                </div>
                </fieldset>
              </div>
            )}
          </div>
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
              const camp = campanhas.find(c => c.slug === s.slug)
              return (
                <div key={s.id} className="flex items-center gap-3 p-2.5 text-xs">
                  <span className="flex-1 min-w-0 truncate"><span className="font-medium">{nome}</span> <span className="text-muted-foreground">· {camp?.nome || s.slug || 'campanha'}{s.origem ? ` · ${s.origem}` : ''}</span></span>
                  {t && <Badge variant="outline" className="text-[10px] gap-1" style={{ color: t.cor, borderColor: t.cor + '55' }}><t.icon className="h-3 w-3" /> {t.label}{s.score != null ? ` ${s.score}` : ''}</Badge>}
                  <Badge variant={s.status === 'registrado' ? 'secondary' : 'outline'} className="text-[10px]">{s.status === 'registrado' ? 'no CRM' : s.status}</Badge>
                  {s.oportunidadeId && <a href={`/crm?op=${s.oportunidadeId}&tab=conversa`} title="Abrir conversa no CRM" className="text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
