'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Gift, Loader2, Save, Plus, Settings2, FileSpreadsheet, Mail, Lock, Unlock, ArrowLeft, Trash2, CreditCard, Printer, BellRing, CheckCheck } from 'lucide-react'
import { Button, Card, Input, Label, Switch } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { BackButton } from '@/components/ui/back-button'

const COR = 'var(--mod-trabalhista, #a3e635)'
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const brl = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Empresa = { id: string; razaoSocial: string; nomeFantasia: string | null }

export default function BeneficiosPage() {
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const perms = (permissions.find(p => p.moduleSlug === 'beneficios')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerir = isMaster || isEmpresaMaster || perms.gerir_beneficios === true

  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresaId, setEmpresaId] = useState<string>('')
  const [view, setView] = useState<'competencias' | 'config'>('competencias')
  const [competencias, setCompetencias] = useState<any[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const router = useRouter()
  const compParam = searchParams?.get('competencia') || null

  useEffect(() => {
    (trpc.beneficios as any).listEmpresas.query()
      .then((e: Empresa[]) => { setEmpresas(e || []); if (e?.[0]) setEmpresaId(e[0].id) })
      .catch(() => {})
  }, [])

  // Deep-link: abre direto a competência (notificação/e-mail dos líderes).
  useEffect(() => {
    if (compParam) { setSelId(compParam); router.replace('/beneficios', { scroll: false }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compParam])

  const carregarComps = useCallback(() => {
    if (!empresaId) return
    setLoading(true)
    ;(trpc.beneficios as any).listCompetencias.query({ empresaId })
      .then((c: any[]) => setCompetencias(c || []))
      .catch(() => setCompetencias([]))
      .finally(() => setLoading(false))
  }, [empresaId])
  useEffect(() => { carregarComps() }, [carregarComps])

  if (permsLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="trabalhista" icon={Gift} />
          <div>
            <h1>Benefícios</h1>
            <p className="text-sm text-muted-foreground">Controle mensal de Vale-Transporte, Vale-Alimentação e Mobilidade</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={empresaId} onChange={e => { setEmpresaId(e.target.value); setSelId(null) }}>
            {empresas.map(e => <option key={e.id} value={e.id}>{e.nomeFantasia || e.razaoSocial}</option>)}
          </select>
          {podeGerir && (
            <Button variant={view === 'config' ? 'success' : 'outline'} size="sm" className="gap-1.5" onClick={() => { setView(view === 'config' ? 'competencias' : 'config'); setSelId(null) }}>
              <Settings2 className="h-4 w-4" /> Configurações
            </Button>
          )}
          <BackButton href="/dashboard" label="Voltar" />
        </div>
      </div>

      {!empresaId ? <p className="text-sm text-muted-foreground">Nenhuma empresa disponível.</p>
        : view === 'config' && podeGerir ? <ConfigView empresaId={empresaId} />
        : selId ? <CompetenciaDetail id={selId} podeGerir={podeGerir} onBack={() => { setSelId(null); carregarComps() }} />
        : <CompetenciasList competencias={competencias} loading={loading} empresaId={empresaId} podeGerir={podeGerir} onOpen={setSelId} onReload={carregarComps} />}
    </div>
  )
}

// ── Lista de competências ──────────────────────────────────────────────
function CompetenciasList({ competencias, loading, empresaId, podeGerir, onOpen, onReload }: {
  competencias: any[]; loading: boolean; empresaId: string; podeGerir: boolean; onOpen: (id: string) => void; onReload: () => void
}) {
  const [abrindo, setAbrindo] = useState(false)
  const now = new Date()
  const [form, setForm] = useState({ ano: now.getFullYear(), mes: now.getMonth() + 1, diasUteis: 22, diariaVA: 0, diariaVT: 10.2, vtDiasDescontoSaldo: 7 })

  useEffect(() => {
    (trpc.beneficios as any).getConfig.query({ empresaId }).then((c: any) => {
      setForm(f => ({ ...f, diariaVA: Number(c.diariaVA) || 0, diariaVT: Number(c.diariaVT) || 10.2, vtDiasDescontoSaldo: c.vtDiasDescontoSaldo ?? 7 }))
    }).catch(() => {})
  }, [empresaId])

  async function abrir() {
    setAbrindo(true)
    try {
      await (trpc.beneficios as any).abrirCompetencia.mutate({ empresaId, ...form })
      alerts.success('Aberta', 'Competência criada.')
      onReload()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setAbrindo(false) }
  }

  const STATUS: Record<string, { label: string; cls: string }> = {
    ABERTA: { label: 'Aberta', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
    EM_APONTAMENTO: { label: 'Em apontamento', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    FECHADA: { label: 'Fechada', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  }

  const aberta = competencias.find(c => c.status === 'ABERTA' || c.status === 'EM_APONTAMENTO')

  return (
    <div className="space-y-4">
      {aberta && (
        <button onClick={() => onOpen(aberta.id)} className="w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors hover:bg-muted/40" style={{ borderColor: COR, background: `color-mix(in srgb, ${'var(--mod-trabalhista, #a3e635)'} 8%, transparent)` }}>
          <span className="inline-flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4" style={{ color: COR }} /> Meus apontamentos do mês — {MESES[aberta.mes - 1]}/{aberta.ano}</span>
          <span className="text-[11px] text-muted-foreground">Lançar / revisar →</span>
        </button>
      )}
      {podeGerir && (
        <Card className="p-4">
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Mês</Label>
              <select className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" value={form.mes} onChange={e => setForm(f => ({ ...f, mes: +e.target.value }))}>{MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></div>
            <div className="col-span-6 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Ano</Label><Input type="number" className="h-9 text-sm" value={form.ano} onChange={e => setForm(f => ({ ...f, ano: +e.target.value }))} /></div>
            <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Dias úteis</Label><Input type="number" className="h-9 text-sm" value={form.diasUteis} onChange={e => setForm(f => ({ ...f, diasUteis: +e.target.value }))} /></div>
            <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Diária VA</Label><Input type="number" step="0.01" className="h-9 text-sm" value={form.diariaVA} onChange={e => setForm(f => ({ ...f, diariaVA: +e.target.value }))} /></div>
            <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Diária VT</Label><Input type="number" step="0.01" className="h-9 text-sm" value={form.diariaVT} onChange={e => setForm(f => ({ ...f, diariaVT: +e.target.value }))} /></div>
            <div className="col-span-12 sm:col-span-2"><Button size="sm" className="w-full gap-1.5 text-white" style={{ background: COR }} onClick={abrir} disabled={abrindo}>{abrindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Abrir competência</Button></div>
          </div>
        </Card>
      )}

      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : competencias.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">Nenhuma competência ainda.</p>
        : <div className="border rounded-lg divide-y">
            {competencias.map(c => {
              const s = STATUS[c.status] || { label: c.status, cls: 'bg-muted text-muted-foreground' }
              return (
                <button key={c.id} onClick={() => onOpen(c.id)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">{MESES[c.mes - 1]}/{c.ano}</span>
                    <span className="text-[11px] text-muted-foreground">{c.diasUteis} dias úteis · VA {brl(Number(c.diariaVA))}/dia · VT {brl(Number(c.diariaVT))}/dia</span>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
                </button>
              )
            })}
          </div>}
    </div>
  )
}

// ── Config (diárias + fichas) ───────────────────────────────────────────
function ConfigView({ empresaId }: { empresaId: string }) {
  const [cfg, setCfg] = useState<any>(null)
  const [fichas, setFichas] = useState<any[]>([])
  const [cartoes, setCartoes] = useState<any[]>([])
  const [novoCartao, setNovoCartao] = useState({ nome: '', valorVA: 0, valorVT: 0, valorMobilidade: 0 })
  const [saving, setSaving] = useState(false)

  const carregar = useCallback(() => {
    Promise.all([
      (trpc.beneficios as any).getConfig.query({ empresaId }),
      (trpc.beneficios as any).listFichas.query({ empresaId }).catch(() => []),
      (trpc.beneficios as any).listCartoes.query({ empresaId }).catch(() => []),
    ]).then(([c, f, ca]: [any, any[], any[]]) => { setCfg({ ...c, diariaVA: Number(c.diariaVA), diariaVT: Number(c.diariaVT) }); setFichas(f || []); setCartoes(ca || []) })
  }, [empresaId])
  useEffect(() => { carregar() }, [carregar])

  async function addCartao() {
    if (!novoCartao.nome.trim()) return
    try { await (trpc.beneficios as any).saveCartao.mutate({ empresaId, ...novoCartao }); setNovoCartao({ nome: '', valorVA: 0, valorVT: 0, valorMobilidade: 0 }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function delCartao(id: string) {
    try { await (trpc.beneficios as any).deleteCartao.mutate({ id }); carregar() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function salvarCfg() {
    setSaving(true)
    try { await (trpc.beneficios as any).saveConfig.mutate({ empresaId, diariaVA: cfg.diariaVA, diariaVT: cfg.diariaVT, vtDiasDescontoSaldo: cfg.vtDiasDescontoSaldo, notificarAuto: !!cfg.notificarAuto, diaNotificacao: cfg.notificarAuto ? (Number(cfg.diaNotificacao) || 1) : null, diaCobranca: cfg.notificarAuto && cfg.diaCobranca ? Number(cfg.diaCobranca) : null }); alerts.success('Salvo', 'Configuração atualizada.') }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSaving(false) }
  }

  async function salvarFicha(f: any, patch: any) {
    const novo = { ...f, ...patch }
    setFichas(fs => fs.map(x => x.colaboradorId === f.colaboradorId ? novo : x))
    try {
      await (trpc.beneficios as any).saveFicha.mutate({
        colaboradorId: f.colaboradorId, empresaId, recebeVA: novo.recebeVA, recebeVT: novo.recebeVT,
        recebeMobilidade: novo.recebeMobilidade, valorMobilidade: Number(novo.valorMobilidade) || 0,
      })
    } catch (e) { alerts.error('Erro', (e as Error).message); carregar() }
  }

  if (!cfg) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Valores padrão</h3>
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-4 space-y-1"><Label className="text-[12px] font-semibold">Diária VA (R$)</Label><Input type="number" step="0.01" className="h-9 text-sm" value={cfg.diariaVA} onChange={e => setCfg({ ...cfg, diariaVA: +e.target.value })} /></div>
          <div className="col-span-4 space-y-1"><Label className="text-[12px] font-semibold">Diária VT (R$)</Label><Input type="number" step="0.01" className="h-9 text-sm" value={cfg.diariaVT} onChange={e => setCfg({ ...cfg, diariaVT: +e.target.value })} /></div>
          <div className="col-span-4 space-y-1"><Label className="text-[12px] font-semibold">Dias p/ desconto do saldo VT</Label><Input type="number" className="h-9 text-sm" value={cfg.vtDiasDescontoSaldo} onChange={e => setCfg({ ...cfg, vtDiasDescontoSaldo: +e.target.value })} /></div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-[13px] font-semibold">Alerta automático aos líderes</Label>
              <p className="text-[11px] text-muted-foreground">Todo mês, no dia escolhido, os líderes recebem e-mail + notificação para lançar os apontamentos do seu setor (na competência aberta do mês).</p>
            </div>
            <Switch checked={!!cfg.notificarAuto} onCheckedChange={(v: boolean) => setCfg({ ...cfg, notificarAuto: v })} />
          </div>
          {cfg.notificarAuto && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <Label className="text-[12px] font-semibold">Alertar no dia</Label>
              <Input type="number" min={1} max={28} className="h-9 w-20 text-sm" value={cfg.diaNotificacao ?? 1} onChange={e => setCfg({ ...cfg, diaNotificacao: +e.target.value })} />
              <Label className="text-[12px] font-semibold ml-3">Cobrar pendentes no dia</Label>
              <Input type="number" min={1} max={28} className="h-9 w-20 text-sm" placeholder="—" value={cfg.diaCobranca ?? ''} onChange={e => setCfg({ ...cfg, diaCobranca: e.target.value ? +e.target.value : null })} />
              <span className="text-[11px] text-muted-foreground w-full">Dias do mês (1–28), às 08:00. Deixe a cobrança em branco para não cobrar automaticamente.</span>
            </div>
          )}
        </div>

        <Button size="sm" className="gap-1.5 text-white" style={{ background: COR }} onClick={salvarCfg} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar</Button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b"><h3 className="text-sm font-semibold">Fichas de benefício por colaborador</h3></div>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0"><tr>
              <th className="text-left px-4 py-2 font-semibold">Colaborador</th><th className="text-left px-2 py-2 font-semibold">Setor</th>
              <th className="text-center px-2 py-2 font-semibold">VA</th><th className="text-center px-2 py-2 font-semibold">VT</th>
              <th className="text-center px-2 py-2 font-semibold">Mobilidade</th><th className="text-right px-4 py-2 font-semibold">Valor Mob.</th>
            </tr></thead>
            <tbody className="divide-y">
              {fichas.map(f => (
                <tr key={f.colaboradorId} className="hover:bg-muted/30">
                  <td className="px-4 py-1.5">{f.nome}</td>
                  <td className="px-2 py-1.5 text-muted-foreground text-xs">{f.setor ?? '—'}</td>
                  <td className="px-2 py-1.5 text-center"><Switch checked={f.recebeVA} onCheckedChange={(v: boolean) => salvarFicha(f, { recebeVA: v })} /></td>
                  <td className="px-2 py-1.5 text-center"><Switch checked={f.recebeVT} onCheckedChange={(v: boolean) => salvarFicha(f, { recebeVT: v })} /></td>
                  <td className="px-2 py-1.5 text-center"><Switch checked={f.recebeMobilidade} onCheckedChange={(v: boolean) => salvarFicha(f, { recebeMobilidade: v })} /></td>
                  <td className="px-4 py-1.5 text-right">
                    <Input type="number" step="0.01" className="h-8 w-24 text-sm text-right ml-auto" value={f.valorMobilidade} disabled={!f.recebeMobilidade}
                      onChange={e => setFichas(fs => fs.map(x => x.colaboradorId === f.colaboradorId ? { ...x, valorMobilidade: e.target.value } : x))}
                      onBlur={e => salvarFicha(f, { valorMobilidade: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2"><CreditCard className="h-4 w-4" style={{ color: COR }} /><h3 className="text-sm font-semibold">Cartões avulsos (ESCRITÓRIO / RESERVA)</h3></div>
        <p className="text-[11px] text-muted-foreground">Cartões não vinculados a colaborador, com valores fixos somados ao fechamento.</p>
        <div className="border rounded-lg divide-y">
          {cartoes.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-medium flex-1 truncate">{c.nome}</span>
              <span className="text-xs text-muted-foreground">VA {brl(c.valorVA)} · VT {brl(c.valorVT)} · Mob {brl(c.valorMobilidade)}</span>
              <button onClick={() => delCartao(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {cartoes.length === 0 && <p className="text-xs text-muted-foreground italic px-3 py-2">Nenhum cartão avulso.</p>}
        </div>
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-12 sm:col-span-4 space-y-1"><Label className="text-[12px] font-semibold">Nome</Label><Input className="h-9 text-sm" value={novoCartao.nome} onChange={e => setNovoCartao(c => ({ ...c, nome: e.target.value }))} placeholder="Cartão Escritório" /></div>
          <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">VA</Label><Input type="number" step="0.01" className="h-9 text-sm" value={novoCartao.valorVA} onChange={e => setNovoCartao(c => ({ ...c, valorVA: +e.target.value }))} /></div>
          <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">VT</Label><Input type="number" step="0.01" className="h-9 text-sm" value={novoCartao.valorVT} onChange={e => setNovoCartao(c => ({ ...c, valorVT: +e.target.value }))} /></div>
          <div className="col-span-4 sm:col-span-2 space-y-1"><Label className="text-[12px] font-semibold">Mobilidade</Label><Input type="number" step="0.01" className="h-9 text-sm" value={novoCartao.valorMobilidade} onChange={e => setNovoCartao(c => ({ ...c, valorMobilidade: +e.target.value }))} /></div>
          <div className="col-span-12 sm:col-span-2"><Button size="sm" className="w-full gap-1.5 text-white" style={{ background: COR }} onClick={addCartao}><Plus className="h-4 w-4" /> Adicionar</Button></div>
        </div>
      </Card>
    </div>
  )
}

// ── Detalhe da competência (apontamentos / saldo VT / fechamento) ───────
function CompetenciaDetail({ id, podeGerir, onBack }: { id: string; podeGerir: boolean; onBack: () => void }) {
  const [comp, setComp] = useState<any>(null)
  const [tab, setTab] = useState<'apontamentos' | 'saldo' | 'fechamento'>('apontamentos')
  const [itens, setItens] = useState<any[]>([])
  const [recargas, setRecargas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [acao, setAcao] = useState(false)
  const [filtroSetor, setFiltroSetor] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    Promise.all([
      (trpc.beneficios as any).getCompetencia.query({ id }),
      (trpc.beneficios as any).listApontamentos.query({ competenciaId: id }).then((r: any) => r.itens).catch(() => []),
    ]).then(([c, it]: [any, any[]]) => { setComp(c); setItens(it || []) }).finally(() => setLoading(false))
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (tab === 'fechamento' && podeGerir) (trpc.beneficios as any).calcularRecargas.query({ competenciaId: id }).then((r: any) => setRecargas(r.itens || [])).catch(() => setRecargas([]))
  }, [tab, id, podeGerir])

  async function salvarApont(it: any, patch: any) {
    const novo = { ...it, ...patch }
    setItens(xs => xs.map(x => x.colaboradorId === it.colaboradorId ? novo : x))
    try {
      await (trpc.beneficios as any).upsertApontamento.mutate({
        competenciaId: id, colaboradorId: it.colaboradorId,
        diasFerias: +novo.diasFerias || 0, diasLicenca: +novo.diasLicenca || 0, diasAusencia: +novo.diasAusencia || 0,
        faltas: +novo.faltas || 0, plantoes: +novo.plantoes || 0,
      })
    } catch (e) { alerts.error('Erro', (e as Error).message); carregar() }
  }
  async function salvarSaldo(it: any, valor: string) {
    setItens(xs => xs.map(x => x.colaboradorId === it.colaboradorId ? { ...x, vtSaldoCartao: valor } : x))
    try { await (trpc.beneficios as any).setVtSaldo.mutate({ competenciaId: id, colaboradorId: it.colaboradorId, vtSaldoCartao: +valor || 0 }) }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function notificar() {
    setAcao(true)
    try { const r = await (trpc.beneficios as any).notificarLideres.mutate({ id }); alerts.success('Enviado', `${r.notificados} líder(es) notificado(s).`); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }
  async function confirmarSetor() {
    const ok = await alerts.confirm({ title: 'Confirmar sem alterações?', text: 'Marca todos os colaboradores ainda pendentes do seu setor como revisados (nada a reportar).', confirmText: 'Confirmar', icon: 'question' })
    if (!ok) return
    setAcao(true)
    try { const r = await (trpc.beneficios as any).confirmarSetor.mutate({ competenciaId: id }); alerts.success('Confirmado', `${r.confirmados} colaborador(es) marcados como revisados.`); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }
  async function cobrar() {
    setAcao(true)
    try { const r = await (trpc.beneficios as any).cobrarPendentes.mutate({ id }); alerts.success('Cobrança enviada', r.cobrados ? `${r.cobrados} líder(es) com pendência avisado(s).` : 'Nenhuma pendência — todos lançaram. 🎉') }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }
  async function fechar() {
    const ok = await alerts.confirm({ title: 'Fechar competência?', text: 'As recargas serão congeladas. Você poderá reabrir depois.', confirmText: 'Fechar' })
    if (!ok) return
    setAcao(true)
    try { await (trpc.beneficios as any).fecharCompetencia.mutate({ id }); alerts.success('Fechada', 'Recargas geradas.'); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }
  async function reabrir() {
    setAcao(true)
    try { await (trpc.beneficios as any).reabrirCompetencia.mutate({ id }); alerts.success('Reaberta', 'Competência reaberta.'); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }
  function exportar() { window.open(`${getApiUrl()}/api/beneficios/competencias/${id}/export.xlsx`, '_blank') }

  async function imprimir() {
    setAcao(true)
    try {
      const r = await (trpc.beneficios as any).calcularRecargas.query({ competenciaId: id })
      const its: any[] = r.itens || []
      const mesRef = `${MESES[comp.mes - 1]}/${comp.ano}`
      const tot = (k: string) => its.reduce((s, i) => s + (i[k] || 0), 0)
      const linhas = its.map(i => `<tr><td>${i.nome}</td><td>${i.setor ?? '—'}</td><td class="r">${brl(i.valorVA)}</td><td class="r">${brl(i.valorVT)}</td><td class="r">${brl(i.valorMobilidade)}</td><td class="r b">${brl(i.total)}</td></tr>`).join('')
      const w = window.open('', '_blank'); if (!w) { setAcao(false); return }
      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Benefícios ${mesRef}</title>
        <style>body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:24px}h1{font-size:18px;margin:0 0 2px}p{margin:0 0 16px;color:#64748b;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left}
        th{background:#f1f5f9;text-transform:uppercase;font-size:10px;color:#475569}.r{text-align:right}.b{font-weight:700}tfoot td{font-weight:700;border-top:2px solid #cbd5e1}
        @media print{body{padding:0}}</style></head><body>
        <h1>Fechamento de Benefícios — ${mesRef}</h1><p>${comp.diasUteis} dias úteis · ${its.length} linha(s)</p>
        <table><thead><tr><th>Colaborador</th><th>Setor</th><th class="r">VA</th><th class="r">VT</th><th class="r">Mobilidade</th><th class="r">Total</th></tr></thead>
        <tbody>${linhas}</tbody>
        <tfoot><tr><td colspan="2">TOTAL</td><td class="r">${brl(tot('valorVA'))}</td><td class="r">${brl(tot('valorVT'))}</td><td class="r">${brl(tot('valorMobilidade'))}</td><td class="r">${brl(tot('total'))}</td></tr></tfoot>
        </table></body></html>`)
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setAcao(false) }
  }

  if (loading || !comp) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  const fechada = comp.status === 'FECHADA'
  const numInput = (val: any, on: (v: string) => void, disabled = false) => <Input type="number" min={0} className="h-8 w-14 text-sm text-center px-1" value={val ?? 0} disabled={disabled} onChange={e => on(e.target.value)} />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {MESES[comp.mes - 1]}/{comp.ano} · {comp.diasUteis} dias úteis</button>
        {podeGerir && (
          <div className="flex items-center gap-2">
            {!fechada && <Button variant="outline" size="sm" className="gap-1.5" onClick={notificar} disabled={acao}><Mail className="h-4 w-4" /> Notificar líderes</Button>}
            {!fechada && <Button variant="outline" size="sm" className="gap-1.5" onClick={cobrar} disabled={acao}><BellRing className="h-4 w-4" /> Cobrar pendentes</Button>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportar}><FileSpreadsheet className="h-4 w-4" /> Exportar XLSX</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={imprimir} disabled={acao}><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
            {fechada ? <Button variant="outline" size="sm" className="gap-1.5" onClick={reabrir} disabled={acao}><Unlock className="h-4 w-4" /> Reabrir</Button>
              : <Button size="sm" className="gap-1.5 text-white" style={{ background: COR }} onClick={fechar} disabled={acao}>{acao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Fechar</Button>}
          </div>
        )}
      </div>

      <div className="flex gap-4 border-b">
        {([['apontamentos', 'Apontamentos'], ...(podeGerir ? [['saldo', 'Saldo VT'], ['fechamento', 'Fechamento']] : [])] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-1 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === k ? 'text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`} style={tab === k ? { borderBottomColor: COR } : undefined}>{l}</button>
        ))}
      </div>

      {tab === 'apontamentos' && (() => {
        const setores = [...new Set(itens.map(i => i.setor).filter(Boolean))].sort() as string[]
        const visiveis = filtroSetor ? itens.filter(i => i.setor === filtroSetor) : itens
        return (
        <div className="space-y-2">
          {!fechada && itens.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {setores.length > 1 ? (
                <select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
                  <option value="">Todos os setores ({itens.length})</option>
                  {setores.map(s => <option key={s} value={s}>{s} ({itens.filter(i => i.setor === s).length})</option>)}
                </select>
              ) : <span />}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={confirmarSetor} disabled={acao}><CheckCheck className="h-4 w-4" /> Confirmar setor sem alterações</Button>
            </div>
          )}
          <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0"><tr>
                <th className="text-left px-3 py-2 font-semibold">Colaborador</th><th className="text-left px-2 py-2 font-semibold">Setor</th>
                <th className="px-1 py-2 font-semibold">Férias</th><th className="px-1 py-2 font-semibold">Licença</th><th className="px-1 py-2 font-semibold">Ausência</th>
                <th className="px-1 py-2 font-semibold">Faltas</th><th className="px-1 py-2 font-semibold">Plantões</th>
              </tr></thead>
              <tbody className="divide-y">
                {visiveis.map(it => (
                  <tr key={it.colaboradorId} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 whitespace-nowrap">{it.nome}</td>
                    <td className="px-2 py-1.5 text-muted-foreground text-xs whitespace-nowrap">{it.setor ?? '—'}</td>
                    <td className="px-1 py-1 text-center">{numInput(it.diasFerias, v => salvarApont(it, { diasFerias: v }), fechada)}</td>
                    <td className="px-1 py-1 text-center">{numInput(it.diasLicenca, v => salvarApont(it, { diasLicenca: v }), fechada)}</td>
                    <td className="px-1 py-1 text-center">{numInput(it.diasAusencia, v => salvarApont(it, { diasAusencia: v }), fechada)}</td>
                    <td className="px-1 py-1 text-center">{it.recebeVT ? numInput(it.faltas, v => salvarApont(it, { faltas: v }), fechada) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-1 py-1 text-center">{it.recebeVT ? numInput(it.plantoes, v => salvarApont(it, { plantoes: v }), fechada) : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
                {visiveis.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-8 text-xs italic">Nenhum colaborador no seu escopo.</td></tr>}
              </tbody>
            </table>
          </div>
          </Card>
        </div>
        )
      })()}

      {tab === 'saldo' && podeGerir && (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b text-[11px] text-muted-foreground">Saldo restante no cartão de VT (do extrato do operador). Reduz a recarga (complemento).</div>
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0"><tr><th className="text-left px-3 py-2 font-semibold">Colaborador (VT)</th><th className="text-left px-2 py-2 font-semibold">Setor</th><th className="text-right px-4 py-2 font-semibold">Saldo cartão</th></tr></thead>
              <tbody className="divide-y">
                {itens.filter(it => it.recebeVT).map(it => (
                  <tr key={it.colaboradorId} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5">{it.nome}</td><td className="px-2 py-1.5 text-muted-foreground text-xs">{it.setor ?? '—'}</td>
                    <td className="px-4 py-1 text-right"><Input type="number" step="0.01" className="h-8 w-28 text-sm text-right ml-auto" value={it.vtSaldoCartao ?? 0} disabled={fechada}
                      onChange={e => setItens(xs => xs.map(x => x.colaboradorId === it.colaboradorId ? { ...x, vtSaldoCartao: e.target.value } : x))}
                      onBlur={e => salvarSaldo(it, e.target.value)} /></td>
                  </tr>
                ))}
                {itens.filter(it => it.recebeVT).length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-8 text-xs italic">Nenhum colaborador recebe VT.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'fechamento' && podeGerir && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground sticky top-0"><tr>
                <th className="text-left px-3 py-2 font-semibold">Colaborador</th><th className="text-left px-2 py-2 font-semibold">Setor</th>
                <th className="text-right px-3 py-2 font-semibold">VA</th><th className="text-right px-3 py-2 font-semibold">VT</th><th className="text-right px-3 py-2 font-semibold">Mobilidade</th><th className="text-right px-4 py-2 font-semibold">Total</th>
              </tr></thead>
              <tbody className="divide-y">
                {recargas.map(r => (
                  <tr key={r.colaboradorId} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.nome}</td><td className="px-2 py-1.5 text-muted-foreground text-xs">{r.setor ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right">{brl(r.valorVA)}</td><td className="px-3 py-1.5 text-right">{brl(r.valorVT)}</td><td className="px-3 py-1.5 text-right">{brl(r.valorMobilidade)}</td>
                    <td className="px-4 py-1.5 text-right font-semibold">{brl(r.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 font-semibold text-sm"><tr>
                <td className="px-3 py-2" colSpan={2}>Total ({recargas.length})</td>
                <td className="px-3 py-2 text-right">{brl(recargas.reduce((s, r) => s + r.valorVA, 0))}</td>
                <td className="px-3 py-2 text-right">{brl(recargas.reduce((s, r) => s + r.valorVT, 0))}</td>
                <td className="px-3 py-2 text-right">{brl(recargas.reduce((s, r) => s + r.valorMobilidade, 0))}</td>
                <td className="px-4 py-2 text-right" style={{ color: COR }}>{brl(recargas.reduce((s, r) => s + r.total, 0))}</td>
              </tr></tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
