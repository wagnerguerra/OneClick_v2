'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X, ExternalLink } from 'lucide-react'
import { Button, Input, Label, Badge, cn } from '@saas/ui'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Faixa { min: number; max: number | null; pontos: number }
interface RegrasPeso {
  faixasChars: Faixa[]
  faixasAnexos: Faixa[]
  bonusCategoria: number
  pesosTipo: Record<string, number>
}

interface AiConfig {
  enabled: boolean
  capUsdMensal: number | string
  minCharsDescricao: number
  maxCharsDescricao: number
  scoreThreshold: number
  regrasPeso: RegrasPeso | null
  gastoUsdMesAtual: number
}

const DEFAULT_REGRAS: RegrasPeso = {
  faixasChars: [
    { min: 0,    max: 50,    pontos: 0  },
    { min: 50,   max: 200,   pontos: 10 },
    { min: 200,  max: 1000,  pontos: 20 },
    { min: 1000, max: null,  pontos: 15 },
  ],
  faixasAnexos: [
    { min: 0, max: 0,    pontos: 0  },
    { min: 1, max: 1,    pontos: 10 },
    { min: 2, max: null, pontos: 15 },
  ],
  bonusCategoria: 5,
  pesosTipo: { DUVIDA: 15, INCIDENTE: 10, REQUISICAO: 10, MELHORIA: 0 },
}

const TIPOS_TICKET = ['DUVIDA', 'INCIDENTE', 'REQUISICAO', 'MELHORIA'] as const

interface DecisaoRow {
  id: string
  modelo: string
  complexidade: string
  tokensInput: number | null
  tokensOutput: number | null
  custoUsd: string | number | null
  duracaoMs: number | null
  createdAt: string
  ticket: { id: string; numero: number; titulo: string } | null
}

interface EstatMensal {
  mes: string
  totalUsd: number
  tickets: number
  planos: number
  complexos: number
  erros: number
}

/**
 * Seção de configuração da Triagem IA do Helpdesk. Reusada em:
 *  - /configuracoes/helpdesk-ia (página dedicada)
 *  - tab "Triagem IA" dentro da pill Helpdesk em /configuracoes
 *
 * Restrita ao master (router valida).
 */
export function HelpdeskIaSection() {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [regras, setRegras] = useState<RegrasPeso>(DEFAULT_REGRAS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [estatisticas, setEstatisticas] = useState<EstatMensal[]>([])
  const [historico, setHistorico] = useState<{ data: DecisaoRow[]; total: number; totalPages: number } | null>(null)
  const [histPage, setHistPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).aiConfigGet.query()
      .then((r: AiConfig) => {
        if (cancelled) return
        setCfg(r)
        // regrasPeso null → usa defaults
        setRegras(r.regrasPeso ?? DEFAULT_REGRAS)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Estatísticas + histórico carregam em paralelo (não bloqueiam o resto da tela)
  useEffect(() => {
    ;(trpc.helpdesk as any).aiEstatisticasMensais.query({ meses: 6 })
      .then((r: EstatMensal[]) => setEstatisticas(r))
      .catch(() => setEstatisticas([]))
  }, [])

  useEffect(() => {
    ;(trpc.helpdesk as any).aiHistorico.query({ page: histPage, limit: 20 })
      .then((r: { data: DecisaoRow[]; total: number; totalPages: number }) => setHistorico(r))
      .catch(() => setHistorico({ data: [], total: 0, totalPages: 1 }))
  }, [histPage])

  async function salvar() {
    if (!cfg) return
    setSaving(true)
    try {
      await (trpc.helpdesk as any).aiConfigUpdate.mutate({
        enabled: cfg.enabled,
        capUsdMensal: Number(cfg.capUsdMensal),
        minCharsDescricao: cfg.minCharsDescricao,
        maxCharsDescricao: cfg.maxCharsDescricao,
        scoreThreshold: cfg.scoreThreshold,
        regrasPeso: regras,
      })
      alerts.success('Salvo', 'Configuração da IA atualizada.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function atualizarFaixa(tipo: 'faixasChars' | 'faixasAnexos', idx: number, campo: keyof Faixa, valor: string) {
    const arr = [...regras[tipo]]
    const num = valor === '' ? null : Number(valor)
    arr[idx] = { ...arr[idx], [campo]: num }
    setRegras({ ...regras, [tipo]: arr })
  }

  function adicionarFaixa(tipo: 'faixasChars' | 'faixasAnexos') {
    const ultima = regras[tipo][regras[tipo].length - 1]
    const novaMin = ultima ? (ultima.max ?? ultima.min + 1) + 1 : 0
    setRegras({ ...regras, [tipo]: [...regras[tipo], { min: novaMin, max: null, pontos: 0 }] })
  }

  function removerFaixa(tipo: 'faixasChars' | 'faixasAnexos', idx: number) {
    setRegras({ ...regras, [tipo]: regras[tipo].filter((_, i) => i !== idx) })
  }

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
      </div>
    )
  }

  const cap = Number(cfg.capUsdMensal)
  const pct = cap > 0 ? Math.min(100, (cfg.gastoUsdMesAtual / cap) * 100) : 0
  const cor = pct < 60 ? 'bg-emerald-500' : pct < 90 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end -mt-1">
        <Button variant="success" size="sm" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {/* Consumo do mês */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[13px] font-semibold">Consumo do mês</Label>
            <p className="text-[11px] text-muted-foreground">Soma dos custos das triagens executadas neste mês corrente</p>
          </div>
          <p className="text-sm font-mono tabular-nums">
            US$ {cfg.gastoUsdMesAtual.toFixed(4)} {cap > 0 && <span className="text-muted-foreground">/ US$ {cap.toFixed(2)}</span>}
          </p>
        </div>
        {cap > 0 && (
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </section>

      {/* Switch on/off */}
      <section className="flex items-center justify-between pt-3 border-t border-border">
        <div>
          <Label className="text-[13px] font-semibold">Triagem IA ativa</Label>
          <p className="text-[11px] text-muted-foreground">
            Desligue pra pausar imediatamente — tickets novos vão direto pra coluna &quot;Novo&quot; sem passar pela IA.
          </p>
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-muted-foreground/30 peer-checked:bg-emerald-500 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:bg-white after:rounded-full after:h-5 after:w-5 after:top-0.5 after:left-0.5 after:transition-all relative" />
        </label>
      </section>

      {/* Cap mensal */}
      <section className="space-y-1.5 pt-3 border-t border-border">
        <Label className="text-[13px] font-semibold">Limite mensal de gasto (USD)</Label>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-muted-foreground">US$</span>
          <Input
            type="number"
            min={0}
            max={10000}
            step={0.01}
            value={cfg.capUsdMensal}
            onChange={e => setCfg({ ...cfg, capUsdMensal: e.target.value })}
            className="h-9 text-sm w-32"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Quando a soma dos custos do mês ultrapassar este valor, a triagem é pausada até o início do próximo mês. Use <strong>0</strong> pra desativar o limite (não recomendado).
        </p>
      </section>

      {/* Min/max chars */}
      <section className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Tamanho mínimo da descrição</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={1000}
              value={cfg.minCharsDescricao}
              onChange={e => setCfg({ ...cfg, minCharsDescricao: Number(e.target.value) })}
              className="h-9 text-sm w-24"
            />
            <span className="text-sm text-muted-foreground">caracteres</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Descrições menores são puladas (provável lixo).</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Tamanho máximo da descrição</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={100}
              max={100000}
              value={cfg.maxCharsDescricao}
              onChange={e => setCfg({ ...cfg, maxCharsDescricao: Number(e.target.value) })}
              className="h-9 text-sm w-28"
            />
            <span className="text-sm text-muted-foreground">caracteres</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Descrições maiores são puladas (custo alto + exige humano).</p>
        </div>
      </section>

      {/* ────────────────────────────────────────────────────────── */}
      {/* Critérios de elegibilidade (#HLP0083)                       */}
      {/* ────────────────────────────────────────────────────────── */}
      <section className="pt-4 border-t border-border space-y-4">
        <div>
          <Label className="text-[13px] font-semibold">Critérios de elegibilidade para IA</Label>
          <p className="text-[11px] text-muted-foreground">
            Cada ticket recebe um <strong>score</strong> baseado nas regras abaixo. Tickets com score abaixo do <strong>threshold</strong> NÃO consomem crédito da API — são marcados como não-elegíveis localmente.
          </p>
        </div>

        {/* Threshold */}
        <div className="flex items-center gap-3 max-w-md">
          <Label className="text-[12px] font-medium w-44 shrink-0">Score mínimo (threshold)</Label>
          <Input
            type="number"
            min={0}
            max={500}
            value={cfg.scoreThreshold}
            onChange={e => setCfg({ ...cfg, scoreThreshold: Number(e.target.value) })}
            className="h-9 text-sm w-24"
          />
          <span className="text-[11px] text-muted-foreground">pontos</span>
        </div>

        {/* Faixas chars */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[12px] font-medium">Faixas por nº de caracteres da descrição</Label>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => adicionarFaixa('faixasChars')}>
              <Plus className="h-3 w-3" /> Faixa
            </Button>
          </div>
          <FaixaTable
            faixas={regras.faixasChars}
            onChange={(idx, campo, valor) => atualizarFaixa('faixasChars', idx, campo, valor)}
            onRemove={(idx) => removerFaixa('faixasChars', idx)}
            unidadeMin="chars"
            unidadeMax="chars"
          />
        </div>

        {/* Faixas anexos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[12px] font-medium">Faixas por nº de anexos</Label>
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => adicionarFaixa('faixasAnexos')}>
              <Plus className="h-3 w-3" /> Faixa
            </Button>
          </div>
          <FaixaTable
            faixas={regras.faixasAnexos}
            onChange={(idx, campo, valor) => atualizarFaixa('faixasAnexos', idx, campo, valor)}
            onRemove={(idx) => removerFaixa('faixasAnexos', idx)}
            unidadeMin=""
            unidadeMax=""
          />
        </div>

        {/* Bônus categoria */}
        <div className="flex items-center gap-3 max-w-md">
          <Label className="text-[12px] font-medium w-44 shrink-0">Bônus se categoria preenchida</Label>
          <Input
            type="number"
            min={-100}
            max={100}
            value={regras.bonusCategoria}
            onChange={e => setRegras({ ...regras, bonusCategoria: Number(e.target.value) })}
            className="h-9 text-sm w-24"
          />
          <span className="text-[11px] text-muted-foreground">pontos</span>
        </div>

        {/* Pesos por tipo */}
        <div className="space-y-2">
          <Label className="text-[12px] font-medium">Pesos por tipo de ticket</Label>
          <div className="grid grid-cols-4 gap-2">
            {TIPOS_TICKET.map(tipo => (
              <div key={tipo} className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tipo}</p>
                <Input
                  type="number"
                  min={-100}
                  max={100}
                  value={regras.pesosTipo[tipo] ?? 0}
                  onChange={e => setRegras({
                    ...regras,
                    pesosTipo: { ...regras.pesosTipo, [tipo]: Number(e.target.value) },
                  })}
                  className="h-9 text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Regras automáticas */}
      <section className="pt-3 border-t border-border">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regras automáticas (sempre ativas)</p>
        <ul className="text-[12px] text-muted-foreground space-y-1">
          <li>• Tickets já processados não são reprocessados (idempotente)</li>
          <li>• Tickets já fora do status &quot;Novo&quot; também não são processados</li>
          <li>• Cap mensal pausa a triagem até o início do próximo mês</li>
        </ul>
      </section>

      {/* ────────────────────────────────────────────────────────── */}
      {/* Custos & uso (#HLP0083)                                     */}
      {/* ────────────────────────────────────────────────────────── */}
      <section className="pt-4 border-t border-border space-y-4">
        <div>
          <Label className="text-[13px] font-semibold">Custos & uso</Label>
          <p className="text-[11px] text-muted-foreground">
            Onde o crédito da Anthropic está indo. Cada barra mostra o gasto do mês em USD e o nº de tickets processados.
          </p>
        </div>

        {/* Gráfico mensal */}
        {estatisticas.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-[12px] text-muted-foreground">
            Sem decisões registradas ainda.
          </div>
        ) : (
          <div className="rounded-lg border border-border p-3 bg-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={estatisticas}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toFixed(2)}`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'totalUsd') return [`US$ ${value.toFixed(4)}`, 'Gasto']
                    if (name === 'tickets') return [value, 'Tickets']
                    return [value, name]
                  }}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar yAxisId="left" dataKey="totalUsd" fill="#8b5cf6" name="totalUsd" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="tickets" fill="#06b6d4" name="tickets" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground justify-center">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-500" /> Custo USD</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-cyan-500" /> Tickets processados</span>
            </div>
          </div>
        )}

        {/* Tabela de histórico */}
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Data</th>
                <th className="text-left px-3 py-2 font-medium">Ticket</th>
                <th className="text-left px-3 py-2 font-medium">Resultado</th>
                <th className="text-right px-3 py-2 font-medium">Tokens in/out</th>
                <th className="text-right px-3 py-2 font-medium">Custo</th>
                <th className="text-right px-3 py-2 font-medium">Latência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {!historico ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin mr-1" /> Carregando…</td></tr>
              ) : historico.data.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Nenhuma decisão registrada</td></tr>
              ) : historico.data.map(d => (
                <tr key={d.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono tabular-nums">{new Date(d.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-3 py-2">
                    {d.ticket ? (
                      <a href={`/helpdesk/${d.ticket.id}`} target="_blank" rel="noreferrer" className="text-sky-600 hover:underline inline-flex items-center gap-1">
                        #HLP{String(d.ticket.numero).padStart(4, '0')}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] h-5',
                        d.complexidade === 'plano' && 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/30 dark:text-violet-300',
                        d.complexidade === 'complexo' && 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300',
                        d.complexidade === 'erro' && 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/30 dark:text-rose-300',
                      )}
                    >
                      {d.complexidade}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{d.tokensInput ?? 0} / {d.tokensOutput ?? 0}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">US$ {Number(d.custoUsd ?? 0).toFixed(4)}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{d.duracaoMs ?? 0}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          {historico && historico.totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-muted/30 text-[11px]">
              <span className="text-muted-foreground">{historico.total} decisões · página {histPage} de {historico.totalPages}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={histPage >= historico.totalPages} onClick={() => setHistPage(p => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function FaixaTable({ faixas, onChange, onRemove, unidadeMin, unidadeMax }: {
  faixas: Faixa[]
  onChange: (idx: number, campo: keyof Faixa, valor: string) => void
  onRemove: (idx: number) => void
  unidadeMin: string
  unidadeMax: string
}) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">Mín {unidadeMin && `(${unidadeMin})`}</th>
            <th className="text-left px-2 py-1.5 font-medium">Máx {unidadeMax && `(${unidadeMax})`} <span className="text-[9px]">(vazio = ∞)</span></th>
            <th className="text-left px-2 py-1.5 font-medium">Pontos</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {faixas.map((f, idx) => (
            <tr key={idx}>
              <td className="px-2 py-1">
                <Input
                  type="number"
                  value={f.min}
                  onChange={e => onChange(idx, 'min', e.target.value)}
                  className="h-7 text-xs"
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  type="number"
                  value={f.max ?? ''}
                  placeholder="∞"
                  onChange={e => onChange(idx, 'max', e.target.value)}
                  className="h-7 text-xs"
                />
              </td>
              <td className="px-2 py-1">
                <Input
                  type="number"
                  value={f.pontos}
                  onChange={e => onChange(idx, 'pontos', e.target.value)}
                  className="h-7 text-xs"
                />
              </td>
              <td className="px-1 py-1 text-right">
                <button
                  type="button"
                  onClick={() => onRemove(idx)}
                  className="text-muted-foreground hover:text-rose-600 p-1"
                  title="Remover faixa"
                >
                  <X className="h-3 w-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
