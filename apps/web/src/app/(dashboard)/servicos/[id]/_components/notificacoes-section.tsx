'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell, Repeat, Trash2, Save, Loader2, Mail, Power, X,
} from 'lucide-react'
import {
  Button, Input, Label, Card, CardHeader, CardContent, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor, cn,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  RECORRENCIA_FREQUENCIA, RECORRENCIA_FREQUENCIA_LABELS,
  RECORRENCIA_ANCORAGEM, RECORRENCIA_ANCORAGEM_LABELS,
  RECORRENCIA_PRESETS, RECORRENCIA_ULTIMO_DIA,
  AJUSTE_VENCIMENTO, AJUSTE_VENCIMENTO_LABELS, AJUSTE_VENCIMENTO_HINTS,
  NOTIFICACAO_EVENTO, NOTIFICACAO_EVENTO_LABELS,
  NOTIFICACAO_DESTINATARIO, NOTIFICACAO_DESTINATARIO_LABELS,
  NOTIFICACAO_VARIAVEIS,
  NOTIFICACAO_TEMPLATES_PADRAO,
} from '@saas/types'

type Recorrencia = {
  id: string
  servicoId: string
  ativa: boolean
  frequencia: string
  ancoragem: string
  valorAncoragem: number
  competenciaOffset: number
  responsavelPadrao: string | null
  ultimaExecucao: string | null
  proximaExecucao: string | null
  modoPersonalizado?: boolean
  diasDoMes?: number[]
  mesesDoAno?: number[]
} | null

type Regra = {
  id: string
  servicoId: string
  ativa: boolean
  evento: string
  canal: string
  destinatariosTipo: string
  destinatariosCustom: string[]
  assunto: string
  corpoHtml: string
  antecedenciaHoras: number | null
}

export function NotificacoesSection({
  servicoId,
  categoriaServico,
  modo,
}: {
  servicoId: string
  /** Recorrência só faz sentido em serviços MENSAL (executados periodicamente).
   *  EXTRA = pontual, FLUXO = item interno — nenhum dos dois agenda. */
  categoriaServico?: 'MENSAL' | 'EXTRA' | 'FLUXO'
  /** Quando definido, renderiza apenas o conteúdo do modo (sem sidebar de pills).
   *  Usado pelas abas "Recorrência" e "Notificações" do detalhe do serviço. */
  modo?: 'recorrencia' | 'regras'
}) {
  const recorrenciaDisponivel = categoriaServico === 'MENSAL'
  // Pill ativa — default = regras (sempre faz sentido); recorrência só se aplicável.
  // Quando `modo` é passado, força o pill correspondente.
  const [activePill, setActivePill] = useState<'recorrencia' | 'regras'>(
    modo ?? (recorrenciaDisponivel ? 'recorrencia' : 'regras'),
  )
  // Quando montado via aba dedicada, esconde a sidebar de pills.
  const standalone = modo === undefined
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(null)
  const [recAtiva, setRecAtiva] = useState(false)
  const [recFreq, setRecFreq] = useState<string>('MENSAL')
  const [recAncoragem, setRecAncoragem] = useState<string>('DIA_DO_MES')
  const [recValor, setRecValor] = useState<number>(20)
  const [recOffset, setRecOffset] = useState<number>(1)
  const [savingRec, setSavingRec] = useState(false)
  // Regra composta / personalizada — toggle e listas de dias/meses.
  const [recPersonalizado, setRecPersonalizado] = useState<boolean>(false)
  const [recDiasDoMes, setRecDiasDoMes] = useState<number[]>([])
  const [recMesesDoAno, setRecMesesDoAno] = useState<number[]>([])
  // Ajuste quando data calculada cai em FDS/feriado nacional.
  const [recAjuste, setRecAjuste] = useState<'MANTER' | 'ANTECIPAR' | 'POSTERGAR'>('MANTER')
  // Preview de próximas N execuções, calculado server-side.
  const [previewDatas, setPreviewDatas] = useState<string[]>([])

  const [regras, setRegras] = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEvento, setEditEvento] = useState<string>('ATRASADA')
  const [editDestinatario, setEditDestinatario] = useState<string>('RESPONSAVEL')
  const [editCustom, setEditCustom] = useState<string>('')
  const [editAssunto, setEditAssunto] = useState<string>('Execução atrasada — {{servico.nome}}')
  const [editCorpo, setEditCorpo] = useState<string>(
    '<p>Olá {{responsavel.name}},</p><p>A execução do serviço <strong>{{servico.nome}}</strong> para o cliente <strong>{{cliente.razaoSocial}}</strong> teve o prazo vencido em <strong>{{prazo.data}}</strong>.</p><p><a href="{{link.execucao}}">Abrir execução</a></p>',
  )
  const [editAntecedencia, setEditAntecedencia] = useState<number>(24)
  const [editAtiva, setEditAtiva] = useState<boolean>(true)
  const [savingRegra, setSavingRegra] = useState(false)
  const [testandoEnvio, setTestandoEnvio] = useState(false)
  const [testEmail, setTestEmail] = useState('')

  const fetchTudo = useCallback(async () => {
    setLoading(true)
    try {
      // Carrega só o que o modo da aba precisa — evita fetch redundante quando
      // o componente é renderizado duas vezes (uma por aba). Sem `modo`, busca
      // ambos como antes.
      const carregarRec = modo === undefined || modo === 'recorrencia'
      const carregarRegras = modo === undefined || modo === 'regras'
      const [rec, list] = await Promise.all([
        carregarRec ? (trpc as any).notificacao.getRecorrencia.query({ servicoId }) : Promise.resolve(null),
        carregarRegras ? (trpc as any).notificacao.listRegras.query({ servicoId }) : Promise.resolve([]),
      ])
      if (carregarRec) {
        setRecorrencia(rec)
        if (rec) {
          setRecAtiva(rec.ativa)
          setRecFreq(rec.frequencia)
          setRecAncoragem(rec.ancoragem)
          setRecValor(rec.valorAncoragem)
          setRecOffset(rec.competenciaOffset)
          setRecPersonalizado(Boolean(rec.modoPersonalizado))
          setRecDiasDoMes(Array.isArray(rec.diasDoMes) ? rec.diasDoMes : [])
          setRecMesesDoAno(Array.isArray(rec.mesesDoAno) ? rec.mesesDoAno : [])
          setRecAjuste((rec as any).ajusteVencimento || 'MANTER')
        }
      }
      if (carregarRegras) setRegras(list)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [servicoId, modo])

  useEffect(() => { void fetchTudo() }, [fetchTudo])

  async function salvarRecorrencia() {
    // Validação client-side: modo personalizado exige ao menos 1 dia selecionado.
    if (recPersonalizado && recDiasDoMes.length === 0) {
      alerts.error('Regra inválida', 'Selecione ao menos um dia do mês para o modo personalizado.')
      return
    }
    setSavingRec(true)
    try {
      const r = await (trpc as any).notificacao.upsertRecorrencia.mutate({
        servicoId,
        ativa: recAtiva,
        frequencia: recFreq,
        ancoragem: recAncoragem,
        valorAncoragem: recValor,
        competenciaOffset: recOffset,
        modoPersonalizado: recPersonalizado,
        diasDoMes: recDiasDoMes,
        mesesDoAno: recMesesDoAno,
        ajusteVencimento: recAjuste,
      })
      setRecorrencia(r)
      await alerts.success('Salvo', 'Regra de recorrência atualizada.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingRec(false)
    }
  }

  // Recalcula preview server-side sempre que campos relevantes mudam — debounce
  // implícito via dependency-array do useEffect (React agenda em micro-tasks).
  useEffect(() => {
    if (!recorrenciaDisponivel) return
    if (recPersonalizado && recDiasDoMes.length === 0) {
      setPreviewDatas([])
      return
    }
    let cancelado = false
    ;(async () => {
      try {
        const r = await (trpc as any).notificacao.previewRecorrencia.query({
          frequencia: recFreq,
          ancoragem: recAncoragem,
          valorAncoragem: recValor,
          competenciaOffset: recOffset,
          modoPersonalizado: recPersonalizado,
          diasDoMes: recDiasDoMes,
          mesesDoAno: recMesesDoAno,
          ajusteVencimento: recAjuste,
          quantidade: 5,
          ativa: true,
        })
        if (!cancelado) setPreviewDatas(r.datas)
      } catch {
        if (!cancelado) setPreviewDatas([])
      }
    })()
    return () => { cancelado = true }
  }, [recorrenciaDisponivel, recPersonalizado, recDiasDoMes, recMesesDoAno, recFreq, recAncoragem, recValor, recOffset, recAjuste])

  // Helpers de toggle em chips
  const toggleDia = (dia: number) => {
    setRecDiasDoMes(prev => prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia].sort((a, b) => a - b))
  }
  const toggleMes = (mes: number) => {
    setRecMesesDoAno(prev => prev.includes(mes) ? prev.filter(m => m !== mes) : [...prev, mes].sort((a, b) => a - b))
  }
  const aplicarPreset = (preset: typeof RECORRENCIA_PRESETS[number]) => {
    setRecPersonalizado(true)
    setRecDiasDoMes(preset.diasDoMes)
    setRecMesesDoAno(preset.mesesDoAno)
  }

  async function removerRecorrencia() {
    const ok = await alerts.confirm({
      title: 'Desativar recorrência',
      text: 'O serviço deixará de ser disparado automaticamente. Execuções já criadas não são afetadas.',
      confirmText: 'Desativar',
    })
    if (!ok) return
    try {
      await (trpc as any).notificacao.deleteRecorrencia.mutate({ servicoId })
      setRecorrencia(null)
      await alerts.success('Removida', 'Recorrência desativada.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  function resetForm() {
    setEditingId(null)
    setEditEvento('ATRASADA')
    setEditDestinatario('RESPONSAVEL')
    setEditCustom('')
    setEditAssunto('Execução atrasada — {{servico.nome}}')
    setEditCorpo('<p>Olá {{responsavel.name}},</p><p>A execução do serviço <strong>{{servico.nome}}</strong> para o cliente <strong>{{cliente.razaoSocial}}</strong> teve o prazo vencido em <strong>{{prazo.data}}</strong>.</p><p><a href="{{link.execucao}}">Abrir execução</a></p>')
    setEditAntecedencia(24)
    setEditAtiva(true)
  }

  function editarRegra(r: Regra) {
    setEditingId(r.id)
    setEditEvento(r.evento)
    setEditDestinatario(r.destinatariosTipo)
    setEditCustom(r.destinatariosCustom.join(', '))
    setEditAssunto(r.assunto)
    setEditCorpo(r.corpoHtml)
    setEditAntecedencia(r.antecedenciaHoras ?? 24)
    setEditAtiva(r.ativa)
  }

  async function salvarRegra() {
    setSavingRegra(true)
    try {
      const customList = editCustom
        .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean)
      const payload = {
        servicoId,
        ativa: editAtiva,
        evento: editEvento,
        canal: 'EMAIL',
        destinatariosTipo: editDestinatario,
        destinatariosCustom: editDestinatario === 'CUSTOM' ? customList : [],
        assunto: editAssunto,
        corpoHtml: editCorpo,
        antecedenciaHoras: editEvento === 'PRAZO_PROXIMO' ? editAntecedencia : null,
      }
      if (editingId) {
        await (trpc as any).notificacao.updateRegra.mutate({ id: editingId, ...payload })
      } else {
        await (trpc as any).notificacao.createRegra.mutate(payload)
      }
      await alerts.success('Salvo', editingId ? 'Regra atualizada.' : 'Regra criada.')
      resetForm()
      void fetchTudo()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingRegra(false)
    }
  }

  async function enviarTeste() {
    if (!testEmail.trim()) { alerts.error('Erro', 'Informe o e-mail de destino.'); return }
    setTestandoEnvio(true)
    try {
      const r = await (trpc as any).notificacao.testarEnvio.mutate({
        para: testEmail.trim(),
        assunto: editAssunto,
        corpoHtml: editCorpo,
      })
      if (r.ok) {
        await alerts.success('Enviado', `E-mail de teste enviado para ${testEmail}.`)
      } else {
        alerts.error('Falha', 'Verifique as configurações de e-mail do sistema.')
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setTestandoEnvio(false)
    }
  }

  async function deletarRegra(id: string) {
    const ok = await alerts.confirm({
      title: 'Remover regra',
      text: 'Esta regra de notificação será excluída. Logs históricos ficam preservados.',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc as any).notificacao.deleteRegra.mutate({ id })
      await alerts.success('Removida', 'Regra excluída.')
      void fetchTudo()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  const proxFmt = recorrencia?.proximaExecucao
    ? new Date(recorrencia.proximaExecucao).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short',
      })
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Lista de pills disponíveis. Recorrência aparece sempre, mas em serviços
  // não-recorrentes vira só uma página explicativa "indisponível".
  const pills: Array<{ id: 'recorrencia' | 'regras'; label: string; icon: typeof Repeat; badge?: string }> = [
    { id: 'recorrencia', label: 'Recorrência', icon: Repeat },
    { id: 'regras', label: 'Regras de e-mail', icon: Bell, badge: regras.length > 0 ? String(regras.length) : undefined },
  ]

  // Título do card varia conforme o modo da aba (ou modo combinado, no legado).
  const headerInfo = modo === 'recorrencia'
    ? { titulo: 'Recorrência automática', Icon: Repeat }
    : modo === 'regras'
      ? { titulo: 'Regras de notificação', Icon: Bell }
      : { titulo: 'Notificações & Recorrência', Icon: Bell }

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <headerInfo.Icon className="h-4 w-4 text-muted-foreground" /> {headerInfo.titulo}
        </h5>
      </CardHeader>
      <div className="flex min-h-[500px]">
        {/* Pills verticais à esquerda — só no modo standalone (compat legado). */}
        {standalone && (
          <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
            <div className="space-y-1">
              {pills.map(p => {
                const Icon = p.icon
                const active = activePill === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => setActivePill(p.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      active
                        ? 'text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-white hover:text-foreground',
                    )}
                    style={active ? { backgroundColor: '#10b981' } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">{p.label}</span>
                    {p.badge && (
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full tabular-nums',
                          active ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700',
                        )}
                      >
                        {p.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Conteúdo das pills */}
        <div
          key={activePill}
          className="flex-1 overflow-y-auto"
          style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
        >
          {/* ── PILL: Recorrência ───────────────────────────── */}
          {activePill === 'recorrencia' && (
            <div>
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-foreground">Recorrência automática</h4>
                {recorrenciaDisponivel && recorrencia && (
                  <Badge
                    variant="outline"
                    className={`ml-auto text-[10px] ${recAtiva ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}
                  >
                    <Power className="h-2.5 w-2.5 mr-1" />
                    {recAtiva ? 'Ativa' : 'Desativada'}
                  </Badge>
                )}
              </div>

              {!recorrenciaDisponivel ? (
                <div className="p-5">
                  <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 p-4 flex items-start gap-3">
                    <Repeat className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                        Recorrência indisponível
                      </p>
                      <p className="text-[12px] text-amber-800 dark:text-amber-300">
                        Disparo periódico só faz sentido em serviços do tipo <strong>Mensal</strong>.{' '}
                        Este serviço é <strong>
                          {categoriaServico === 'EXTRA' ? 'Extra (pontual)' : 'Item de fluxo interno'}
                        </strong> — para habilitar a recorrência, altere a categoria do serviço na aba <strong>Visão geral</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 space-y-4">
                  <p className="text-[12px] text-muted-foreground">
                    Configure o disparo automático de execuções deste serviço. O scheduler roda
                    diariamente às 6h e cria uma execução por cliente com contrato vigente vinculado a esse serviço.
                  </p>

                  {/* Toggle: modo simples vs personalizado (composto) */}
                  <div className="flex items-center gap-2 p-3 rounded border bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={recPersonalizado}
                        onChange={e => setRecPersonalizado(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="text-[12.5px] font-semibold">Modo personalizado</span>
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Habilite para múltiplos disparos no mesmo mês (ex.: dias 5 e 20) ou filtrar por meses específicos.
                    </span>
                  </div>

                  {!recPersonalizado ? (
                    /* ── Modo simples: frequência + ancoragem ───────── */
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-3 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Frequência</Label>
                        <Select value={recFreq} onValueChange={setRecFreq}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RECORRENCIA_FREQUENCIA.map(f => (
                              <SelectItem key={f} value={f}>{RECORRENCIA_FREQUENCIA_LABELS[f]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-12 md:col-span-4 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Ancoragem</Label>
                        <Select value={recAncoragem} onValueChange={setRecAncoragem}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {RECORRENCIA_ANCORAGEM.map(a => (
                              <SelectItem key={a} value={a}>{RECORRENCIA_ANCORAGEM_LABELS[a]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-6 md:col-span-2 space-y-1.5">
                        <Label className="text-[13px] font-semibold">
                          {recAncoragem === 'DIA_DO_MES' ? 'Dia (1-28)'
                            : recAncoragem === 'DIA_UTIL' ? 'Nº dia útil'
                            : 'Dias após'}
                        </Label>
                        <Input
                          type="number" min={1} max={31}
                          value={recValor}
                          onChange={e => setRecValor(Number(e.target.value) || 1)}
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="col-span-6 md:col-span-3 space-y-1.5">
                        <Label className="text-[13px] font-semibold">Competência (mês offset)</Label>
                        <Input
                          type="number" min={0} max={12}
                          value={recOffset}
                          onChange={e => setRecOffset(Number(e.target.value) || 0)}
                          className="h-9 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">1 = mês anterior (típico fiscal)</p>
                      </div>
                    </div>
                  ) : (
                    /* ── Modo personalizado: chips de dias + meses ───── */
                    <div className="space-y-4">
                      {/* Presets */}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">Atalhos comuns</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {RECORRENCIA_PRESETS.map(p => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => aplicarPreset(p)}
                              title={p.descricao}
                              className="px-2.5 py-1 rounded-full text-[11px] border bg-card hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Chips de dias do mês */}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">
                          Dias do mês <span className="text-muted-foreground font-normal">— selecione 1 ou mais</span>
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {Array.from({ length: 30 }, (_, i) => i + 1).map(d => {
                            const ativo = recDiasDoMes.includes(d)
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => toggleDia(d)}
                                className={cn(
                                  'w-8 h-8 rounded text-[11px] font-medium border transition-colors tabular-nums',
                                  ativo
                                    ? 'text-white border-transparent shadow-sm'
                                    : 'bg-card hover:bg-muted text-foreground',
                                )}
                                style={ativo ? { backgroundColor: '#10b981' } : undefined}
                              >
                                {d}
                              </button>
                            )
                          })}
                          {/* Pill especial "Último dia" */}
                          {(() => {
                            const ativo = recDiasDoMes.includes(RECORRENCIA_ULTIMO_DIA)
                            return (
                              <button
                                type="button"
                                onClick={() => toggleDia(RECORRENCIA_ULTIMO_DIA)}
                                className={cn(
                                  'px-2.5 h-8 rounded text-[11px] font-medium border transition-colors',
                                  ativo
                                    ? 'text-white border-transparent shadow-sm'
                                    : 'bg-card hover:bg-muted text-foreground',
                                )}
                                style={ativo ? { backgroundColor: '#10b981' } : undefined}
                                title="Sempre o último dia do mês (28/29/30/31 conforme o mês)"
                              >
                                Último
                              </button>
                            )
                          })()}
                        </div>
                      </div>

                      {/* Chips de meses do ano */}
                      <div className="space-y-1.5">
                        <Label className="text-[13px] font-semibold">
                          Meses do ano <span className="text-muted-foreground font-normal">— vazio = todos os meses</span>
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((label, idx) => {
                            const mes = idx + 1
                            const ativo = recMesesDoAno.includes(mes)
                            return (
                              <button
                                key={mes}
                                type="button"
                                onClick={() => toggleMes(mes)}
                                className={cn(
                                  'px-2.5 h-8 rounded text-[11px] font-medium border transition-colors min-w-[44px]',
                                  ativo
                                    ? 'text-white border-transparent shadow-sm'
                                    : 'bg-card hover:bg-muted text-foreground',
                                )}
                                style={ativo ? { backgroundColor: '#10b981' } : undefined}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ajuste quando data cai em FDS/feriado */}
                  <div className="rounded border bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900 p-3 space-y-1.5">
                    <Label className="text-[13px] font-semibold flex items-center gap-1.5">
                      Ajuste de vencimento
                      <span className="text-[10px] font-normal text-muted-foreground">— quando cair em final de semana ou feriado nacional</span>
                    </Label>
                    <Select value={recAjuste} onValueChange={(v) => setRecAjuste(v as typeof recAjuste)}>
                      <SelectTrigger className="h-9 text-sm bg-card max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AJUSTE_VENCIMENTO.map((v) => (
                          <SelectItem key={v} value={v}>
                            {AJUSTE_VENCIMENTO_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {AJUSTE_VENCIMENTO_HINTS[recAjuste]}
                    </p>
                  </div>

                  {/* Preview de próximas execuções */}
                  {previewDatas.length > 0 && (
                    <div className="rounded border bg-muted/30 p-3">
                      <Label className="text-[12px] font-semibold mb-1.5 block">
                        Próximas execuções (preview)
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {previewDatas.map((iso, i) => {
                          const d = new Date(iso)
                          const label = d.toLocaleDateString('pt-BR', {
                            day: '2-digit', month: 'short', year: 'numeric', weekday: 'short',
                          })
                          return (
                            <Badge
                              key={iso + i}
                              variant="outline"
                              className={cn(
                                'text-[10.5px]',
                                i === 0 ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : '',
                              )}
                            >
                              {label}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-4 pt-3 border-t">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={recAtiva}
                        onChange={e => setRecAtiva(e.target.checked)}
                        className="h-4 w-4"
                      />
                      <span className="font-medium">Ativa</span>
                    </label>
                    {proxFmt && (
                      <span className="text-[12px] text-muted-foreground">
                        Próxima execução: <strong>{proxFmt}</strong>
                      </span>
                    )}
                    <div className="ml-auto flex gap-2">
                      {recorrencia && (
                        <Button variant="outline" size="sm" onClick={removerRecorrencia} className="gap-1.5 text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" /> Remover
                        </Button>
                      )}
                      <Button size="sm" onClick={salvarRecorrencia} disabled={savingRec} className="gap-1.5" style={{ backgroundColor: '#10b981' }}>
                        {savingRec ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PILL: Regras de e-mail ──────────────────────── */}
          {activePill === 'regras' && (
            <div>
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-foreground">Regras de notificação</h4>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {regras.length} regra{regras.length === 1 ? '' : 's'}
                </Badge>
              </div>
              <div className="p-5">

          {regras.length === 0 ? (
            <div className="py-3">
              <p className="text-[12px] text-muted-foreground mb-3">
                Nenhuma regra cadastrada. Comece por um dos templates prontos abaixo (você pode editar antes de salvar):
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {NOTIFICACAO_TEMPLATES_PADRAO.map(tpl => (
                  <button
                    key={tpl.nome}
                    type="button"
                    onClick={() => {
                      setEditingId(null)
                      setEditEvento(tpl.evento)
                      setEditDestinatario(tpl.destinatariosTipo)
                      setEditCustom('')
                      setEditAssunto(tpl.assunto)
                      setEditCorpo(tpl.corpoHtml)
                      setEditAntecedencia(tpl.antecedenciaHoras ?? 24)
                      setEditAtiva(true)
                      // Scroll suave pro form (lá embaixo)
                      setTimeout(() => {
                        document.querySelector('[data-form-regra]')?.scrollIntoView({ behavior: 'smooth' })
                      }, 50)
                    }}
                    className="text-left p-3 rounded border bg-card hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-300 transition-colors"
                  >
                    <div className="text-[12.5px] font-semibold mb-0.5">{tpl.nome}</div>
                    <div className="text-[11px] text-muted-foreground">{tpl.descricao}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 mb-4">
              {regras.map(r => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 p-2.5 rounded border bg-card hover:bg-muted/30 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[10px] h-5">
                        {NOTIFICACAO_EVENTO_LABELS[r.evento as keyof typeof NOTIFICACAO_EVENTO_LABELS] ?? r.evento}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">→</span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {NOTIFICACAO_DESTINATARIO_LABELS[r.destinatariosTipo as keyof typeof NOTIFICACAO_DESTINATARIO_LABELS] ?? r.destinatariosTipo}
                      </Badge>
                      {!r.ativa && (
                        <Badge variant="outline" className="text-[10px] h-5 bg-gray-50 border-gray-200 text-gray-600">
                          Desativada
                        </Badge>
                      )}
                    </div>
                    <p className="text-[12px] truncate mt-0.5" title={r.assunto}>{r.assunto}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => editarRegra(r)} className="h-7 text-xs">
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deletarRegra(r.id)} className="h-7 text-xs text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Form de criação/edição ───────────────────────── */}
          <div data-form-regra className="border-t pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-[13px] font-semibold">
                {editingId ? 'Editar regra' : 'Nova regra'}
              </h4>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={resetForm} className="h-6 text-xs ml-auto">
                  <X className="h-3 w-3 mr-1" /> Cancelar edição
                </Button>
              )}
            </div>

            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Evento</Label>
                <Select value={editEvento} onValueChange={setEditEvento}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFICACAO_EVENTO.map(e => (
                      <SelectItem key={e} value={e}>{NOTIFICACAO_EVENTO_LABELS[e]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 md:col-span-6 space-y-1.5">
                <Label className="text-[13px] font-semibold">Destinatário</Label>
                <Select value={editDestinatario} onValueChange={setEditDestinatario}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NOTIFICACAO_DESTINATARIO.map(d => (
                      <SelectItem key={d} value={d}>{NOTIFICACAO_DESTINATARIO_LABELS[d]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editDestinatario === 'CUSTOM' && (
                <div className="col-span-12 space-y-1.5">
                  <Label className="text-[13px] font-semibold">E-mails (separados por vírgula)</Label>
                  <Input
                    value={editCustom}
                    onChange={e => setEditCustom(e.target.value)}
                    placeholder="ex: gerente@empresa.com, fiscal@empresa.com"
                    className="h-9 text-sm"
                  />
                </div>
              )}
              {editEvento === 'PRAZO_PROXIMO' && (
                <div className="col-span-12 md:col-span-3 space-y-1.5">
                  <Label className="text-[13px] font-semibold">Antecedência (horas)</Label>
                  <Input
                    type="number" min={1} max={720}
                    value={editAntecedencia}
                    onChange={e => setEditAntecedencia(Number(e.target.value) || 24)}
                    className="h-9 text-sm"
                  />
                </div>
              )}
              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Assunto *</Label>
                <Input
                  value={editAssunto}
                  onChange={e => setEditAssunto(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="col-span-12 md:col-span-8 space-y-1.5">
                <Label className="text-[13px] font-semibold">Corpo do e-mail *</Label>
                <RichEditor
                  value={editCorpo}
                  onChange={setEditCorpo}
                  placeholder="Conteúdo do e-mail (HTML enriquecido)"
                />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Variáveis disponíveis</Label>
                <p className="text-[10.5px] text-muted-foreground">Clique para copiar e cole no editor.</p>
                <div className="border rounded bg-muted/30 max-h-[260px] overflow-y-auto p-1.5 space-y-0.5">
                  {NOTIFICACAO_VARIAVEIS.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(v.key)
                        void alerts.success('Copiado', `${v.key} copiado para a área de transferência`)
                      }}
                      className="block w-full text-left px-2 py-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950/50 text-[10.5px] font-mono"
                      title={v.label}
                    >
                      {v.key}
                      <div className="text-[9.5px] font-sans text-muted-foreground">{v.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <label className="col-span-12 flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editAtiva}
                  onChange={e => setEditAtiva(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="font-medium">Ativa</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 flex-wrap pt-2 border-t">
              <Input
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                placeholder="seu@email.com (pra testar)"
                type="email"
                className="h-8 text-xs max-w-[200px]"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={enviarTeste}
                disabled={testandoEnvio || !testEmail.trim()}
                className="gap-1.5"
              >
                {testandoEnvio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                Enviar teste
              </Button>
              <Button size="sm" onClick={salvarRegra} disabled={savingRegra} className="gap-1.5" style={{ backgroundColor: '#10b981' }}>
                {savingRegra ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editingId ? 'Atualizar regra' : 'Criar regra'}
              </Button>
            </div>
          </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
