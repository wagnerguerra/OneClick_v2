'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Search, Plus, Loader2, Check, X, ClipboardList, Info, RotateCcw, Trash2,
  ThumbsUp, ThumbsDown, CalendarClock,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  ANALISE_CONTEXTO_ANALISE_LABEL, ANALISE_CONTEXTO_TIPO_LABEL,
  ANALISE_CONTEXTO_ACAO_TIPO_LABEL, TIPOS_POR_ANALISE,
} from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { MODULE_COLOR, ANALISE_BADGE, TIPO_BADGE, riscoClasse, dataBR } from '../shared'

interface Acao {
  id: string
  tipo: string
  descricao: string
  prazo: string | null
  concluida: boolean
  finalizadoEm: string | null
  finalizadoPorNome: string | null
  observacao: string | null
  responsavelNomeResolvido: string | null
}
interface Registro {
  id: string
  legacyId: number | null
  analise: string
  tipo: string
  identificacao: string
  processo: string | null
  parteInteressada: string | null
  gravidade: number | null
  probabilidade: number | null
  grauRisco: number | null
  responsavelId: string | null
  responsavelNomeResolvido: string | null
  prazo: string | null
  avaliado: boolean
  avaliacao: string | null
  eficaz: boolean | null
  avaliadoEm: string | null
  avaliadoPorNomeResolvido: string | null
  acoes: Acao[]
}
interface Usuario { id: string; name: string }

const hoje = () => new Date().toISOString().slice(0, 10)

export default function AnaliseContextoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'analise-contexto')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [r, setR] = useState<Registro | null>(null)
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [acting, setActing] = useState(false)

  // Cabeçalho editável (sidebar)
  const [fAnalise, setFAnalise] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fIdentificacao, setFIdentificacao] = useState('')
  const [fProcesso, setFProcesso] = useState('')
  const [fParte, setFParte] = useState('')
  const [fGravidade, setFGravidade] = useState('')
  const [fProbabilidade, setFProbabilidade] = useState('')
  const [fResponsavel, setFResponsavel] = useState('')
  const [fPrazo, setFPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal nova/editar ação
  const [acaoAberta, setAcaoAberta] = useState(false)
  const [acaoEditando, setAcaoEditando] = useState<Acao | null>(null)
  const [aTipo, setATipo] = useState('CORRETIVA')
  const [aDescricao, setADescricao] = useState('')
  const [aResponsavel, setAResponsavel] = useState('')
  const [aPrazo, setAPrazo] = useState('')
  const [salvandoAcao, setSalvandoAcao] = useState(false)

  // Modal avaliação de eficácia
  const [avAberta, setAvAberta] = useState(false)
  const [avTexto, setAvTexto] = useState('')
  const [avEficaz, setAvEficaz] = useState<boolean | null>(null)
  const [avData, setAvData] = useState(hoje())
  const [salvandoAv, setSalvandoAv] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.analiseContexto as any).getById.query({ id: params.id })
      .then((reg: Registro) => {
        setR(reg)
        setFAnalise(reg.analise); setFTipo(reg.tipo)
        setFIdentificacao(reg.identificacao); setFProcesso(reg.processo ?? '')
        setFParte(reg.parteInteressada ?? '')
        setFGravidade(reg.gravidade != null ? String(reg.gravidade) : '')
        setFProbabilidade(reg.probabilidade != null ? String(reg.probabilidade) : '')
        setFResponsavel(reg.responsavelId ?? '')
        setFPrazo(reg.prazo ? reg.prazo.slice(0, 10) : '')
      })
      .catch(() => setR(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.analiseContexto as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function salvarCabecalho() {
    setSalvando(true)
    try {
      await (trpc.analiseContexto as any).atualizar.mutate({
        id: r!.id,
        analise: fAnalise, tipo: fTipo,
        identificacao: fIdentificacao,
        processo: fProcesso || null,
        parteInteressada: fParte || null,
        gravidade: fGravidade ? Number(fGravidade) : null,
        probabilidade: fProbabilidade ? Number(fProbabilidade) : null,
        responsavelId: fResponsavel || null,
        prazo: fPrazo || null,
      })
      alerts.success('Salvo', 'Registro atualizado.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  function abrirNovaAcao() {
    setAcaoEditando(null); setATipo('CORRETIVA'); setADescricao(''); setAResponsavel(''); setAPrazo('')
    setAcaoAberta(true)
  }
  function abrirEditarAcao(a: Acao) {
    setAcaoEditando(a); setATipo(a.tipo); setADescricao(a.descricao)
    setAResponsavel('')
    setAPrazo(a.prazo ? a.prazo.slice(0, 10) : '')
    setAcaoAberta(true)
  }

  async function salvarAcao() {
    const semTags = aDescricao.replace(/<[^>]*>/g, '').trim()
    if (!semTags) { alerts.error('Falta a descrição', 'Descreva a ação.'); return }
    setSalvandoAcao(true)
    try {
      if (acaoEditando) {
        await (trpc.analiseContexto as any).atualizarAcao.mutate({
          id: acaoEditando.id, tipo: aTipo, descricao: aDescricao,
          ...(aResponsavel ? { responsavelId: aResponsavel } : {}),
          prazo: aPrazo || null,
        })
      } else {
        await (trpc.analiseContexto as any).criarAcao.mutate({
          analiseId: r!.id, tipo: aTipo, descricao: aDescricao,
          responsavelId: aResponsavel || null, prazo: aPrazo || null,
        })
      }
      alerts.success('Salvo', acaoEditando ? 'Ação atualizada.' : 'Ação incluída no plano.')
      setAcaoAberta(false)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoAcao(false) }
  }

  async function toggleAcao(a: Acao) {
    setActing(true)
    try {
      await (trpc.analiseContexto as any).concluirAcao.mutate({ id: a.id, concluida: !a.concluida })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  async function excluirAcao(a: Acao) {
    const ok = await alerts.confirm({ title: 'Excluir a ação?', text: 'A ação sai do plano.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.analiseContexto as any).excluirAcao.mutate({ id: a.id })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function salvarAvaliacao() {
    const semTags = avTexto.replace(/<[^>]*>/g, '').trim()
    if (!semTags) { alerts.error('Falta a avaliação', 'Descreva o resultado observado.'); return }
    if (avEficaz === null) { alerts.error('Falta o veredito', 'Diga se o tratamento foi eficaz.'); return }
    setSalvandoAv(true)
    try {
      await (trpc.analiseContexto as any).avaliar.mutate({
        id: r!.id, avaliacao: avTexto, eficaz: avEficaz, avaliadoEm: avData,
      })
      alerts.success('Avaliação registrada', '')
      setAvAberta(false)
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoAv(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!r) return <div className="py-12 text-center text-muted-foreground">Registro não encontrado</div>

  const tiposDoForm = fAnalise ? TIPOS_POR_ANALISE[fAnalise] ?? [] : []

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <Search className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate">{r.identificacao}</h1>
              <Badge variant="outline" className={cn('text-[11px]', ANALISE_BADGE[r.analise])}>
                {ANALISE_CONTEXTO_ANALISE_LABEL[r.analise] ?? r.analise}
              </Badge>
              <Badge variant="outline" className={cn('text-[11px]', TIPO_BADGE[r.tipo])}>
                {ANALISE_CONTEXTO_TIPO_LABEL[r.tipo] ?? r.tipo}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {r.processo ?? 'Sem processo'} · Risco {r.grauRisco ?? '—'} · {r.acoes.length} {r.acoes.length === 1 ? 'ação' : 'ações'} no plano
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {podeEscrever && !r.avaliado && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              onClick={() => { setAvTexto(r.avaliacao ?? ''); setAvEficaz(r.eficaz); setAvData(hoje()); setAvAberta(true) }}>
              <Check className="h-4 w-4" />Registrar avaliação
            </Button>
          )}
          <BackButton href="/analise-contexto" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* ── Plano de ação ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Plano de ação</h4>
              </div>
              {podeEscrever && (
                <Button variant="outline" size="xs" onClick={abrirNovaAcao}>
                  <Plus className="h-3.5 w-3.5" />Nova ação
                </Button>
              )}
            </div>

            {r.acoes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhuma ação no plano ainda.</p>
            ) : (
              <div className="space-y-2">
                {r.acoes.map((a) => (
                  <div key={a.id} className={cn(
                    'rounded-md border px-3 py-2.5',
                    a.concluida ? 'border-border bg-muted/20 opacity-80' : 'border-border bg-card',
                  )}>
                    <div className="flex items-start gap-2">
                      {podeEscrever ? (
                        <button type="button" disabled={acting} onClick={() => toggleAcao(a)}
                          title={a.concluida ? 'Reabrir' : 'Concluir'} className="mt-0.5 shrink-0">
                          {a.concluida
                            ? <Check className="h-4 w-4 text-emerald-500" />
                            : <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 transition-colors" />}
                        </button>
                      ) : (
                        a.concluida ? <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/40 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{ANALISE_CONTEXTO_ACAO_TIPO_LABEL[a.tipo] ?? a.tipo}</Badge>
                          {a.prazo && (
                            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                              <CalendarClock className="h-3 w-3" />{dataBR(a.prazo)}
                            </span>
                          )}
                          {a.responsavelNomeResolvido && (
                            <span className="text-[11px] text-muted-foreground truncate">Resp.: {a.responsavelNomeResolvido}</span>
                          )}
                        </div>
                        <RichContent className={cn('text-sm mt-1 [&_p]:my-0.5', a.concluida && 'text-muted-foreground')} html={a.descricao} />
                        {a.concluida && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                            Concluída{a.finalizadoPorNome ? ` por ${a.finalizadoPorNome}` : ''}{a.finalizadoEm ? ` em ${dataBR(a.finalizadoEm)}` : ''}
                          </p>
                        )}
                      </div>
                      {podeEscrever && (
                        <div className="flex items-center gap-1 shrink-0">
                          {!a.concluida && (
                            <Button variant="soft-info" size="icon-sm" onClick={() => abrirEditarAcao(a)} title="Editar">
                              <ClipboardList className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {a.concluida && (
                            <Button variant="ghost" size="icon-sm" disabled={acting} onClick={() => toggleAcao(a)} title="Reabrir">
                              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirAcao(a)} title="Excluir">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Avaliação de eficácia ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                {r.avaliado
                  ? (r.eficaz ? <ThumbsUp className="h-4 w-4 text-emerald-500" /> : <ThumbsDown className="h-4 w-4 text-rose-500" />)
                  : <Check className="h-4 w-4" style={{ color: MODULE_COLOR }} />}
                <h4 className="text-[13px] font-semibold text-foreground">Avaliação de eficácia</h4>
              </div>
              {podeEscrever && r.avaliado && (
                <Button variant="outline" size="xs"
                  onClick={() => { setAvTexto(r.avaliacao ?? ''); setAvEficaz(r.eficaz); setAvData(hoje()); setAvAberta(true) }}>
                  Reavaliar
                </Button>
              )}
            </div>
            {r.avaliado ? (
              <div className="space-y-2">
                <Badge variant="outline" className={cn('text-[11px]', r.eficaz
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800')}>
                  {r.eficaz ? 'Tratamento eficaz' : 'Tratamento não eficaz'}
                </Badge>
                {r.avaliacao && <RichContent className="text-sm [&_p]:my-1" html={r.avaliacao} />}
                <p className="text-[11px] text-muted-foreground">
                  Avaliado{r.avaliadoPorNomeResolvido ? ` por ${r.avaliadoPorNomeResolvido}` : ''} em {dataBR(r.avaliadoEm)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Ainda sem avaliação — registre quando o plano de ação tiver surtido (ou não) efeito.
              </p>
            )}
          </Card>
        </div>

        {/* ── Sidebar: dados do registro ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Dados do registro</h4>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[13px] font-semibold">Análise</Label>
                  <Select value={fAnalise} onValueChange={(v) => { setFAnalise(v); setFTipo(TIPOS_POR_ANALISE[v]?.[0] ?? '') }} disabled={!podeEscrever}>
                    <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXTERNA">Externa</SelectItem>
                      <SelectItem value="INTERNA">Interna</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold">Tipo</Label>
                  <Select value={fTipo} onValueChange={setFTipo} disabled={!podeEscrever}>
                    <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tiposDoForm.map((t) => <SelectItem key={t} value={t}>{ANALISE_CONTEXTO_TIPO_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Identificação</Label>
                <Input value={fIdentificacao} onChange={(e) => setFIdentificacao(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Processo</Label>
                <Input value={fProcesso} onChange={(e) => setFProcesso(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[13px] font-semibold">Grav./benefício</Label>
                  <Select value={fGravidade || '__none__'} onValueChange={(v) => setFGravidade(v === '__none__' ? '' : v)} disabled={!podeEscrever}>
                    <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="1">1 - Baixo</SelectItem>
                      <SelectItem value="2">2 - Médio</SelectItem>
                      <SelectItem value="3">3 - Alto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold">Probabilidade</Label>
                  <Select value={fProbabilidade || '__none__'} onValueChange={(v) => setFProbabilidade(v === '__none__' ? '' : v)} disabled={!podeEscrever}>
                    <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      <SelectItem value="1">1 - Baixa</SelectItem>
                      <SelectItem value="2">2 - Média</SelectItem>
                      <SelectItem value="3">3 - Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                <span className="text-xs text-muted-foreground">Grau de risco</span>
                <span className={cn('inline-flex h-6 min-w-[28px] items-center justify-center rounded px-2 text-sm font-bold tabular-nums', riscoClasse(r.grauRisco))}>
                  {r.grauRisco ?? '—'}
                </span>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Responsável</Label>
                <Select value={fResponsavel || '__none__'} onValueChange={(v) => setFResponsavel(v === '__none__' ? '' : v)} disabled={!podeEscrever}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder={r.responsavelNomeResolvido ?? 'Sem responsável'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável</SelectItem>
                    {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!r.responsavelId && r.responsavelNomeResolvido && (
                  <p className="text-[11px] text-muted-foreground mt-1">No sistema antigo: {r.responsavelNomeResolvido}</p>
                )}
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Prazo</Label>
                <Input type="date" value={fPrazo} onChange={(e) => setFPrazo(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Partes interessadas</Label>
                <div className="mt-1.5">
                  {podeEscrever
                    ? <RichEditor value={fParte} onChange={setFParte} placeholder="Clientes, colaboradores..." />
                    : (fParte ? <RichContent className="text-sm [&_p]:my-1" html={fParte} /> : <p className="text-xs text-muted-foreground italic">—</p>)}
                </div>
              </div>
              {podeEscrever && (
                <Button variant="success" size="sm" className="w-full" onClick={salvarCabecalho} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
              {r.legacyId != null && (
                <p className="text-[11px] text-muted-foreground pt-1">Nº {r.legacyId} no sistema antigo</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Modal: nova/editar ação ── */}
      <Dialog open={acaoAberta} onOpenChange={(o) => { if (!salvandoAcao) setAcaoAberta(o) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={acaoEditando ? ClipboardList : Plus} color={acaoEditando ? 'sky' : 'emerald'}>
            <DialogTitle>{acaoEditando ? 'Editar ação' : 'Nova ação do plano'}</DialogTitle>
            <DialogDescription>O que será feito para tratar este item do contexto.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Tipo</Label>
                <Select value={aTipo} onValueChange={setATipo}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ANALISE_CONTEXTO_ACAO_TIPO_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Prazo</Label>
                <Input type="date" value={aPrazo} onChange={(e) => setAPrazo(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Responsável</Label>
                <Select value={aResponsavel || '__none__'} onValueChange={(v) => setAResponsavel(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5">
                    <SelectValue placeholder={acaoEditando?.responsavelNomeResolvido ?? 'Sem responsável'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{acaoEditando ? 'Manter atual' : 'Sem responsável'}</SelectItem>
                    {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <div className="mt-1.5">
                  <RichEditor value={aDescricao} onChange={setADescricao} placeholder="O que fazer..." />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAcaoAberta(false)} disabled={salvandoAcao}><X className="h-4 w-4" />Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarAcao} disabled={salvandoAcao}>
              {salvandoAcao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: avaliação de eficácia ── */}
      <Dialog open={avAberta} onOpenChange={(o) => { if (!salvandoAv) setAvAberta(o) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Check} color="emerald">
            <DialogTitle>Avaliação de eficácia</DialogTitle>
            <DialogDescription>O tratamento deste item do contexto surtiu o efeito esperado?</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setAvEficaz(true)}
                className={cn('flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                  avEficaz === true
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'border-border text-muted-foreground hover:text-foreground')}>
                <ThumbsUp className="h-4 w-4" />Eficaz
              </button>
              <button type="button" onClick={() => setAvEficaz(false)}
                className={cn('flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                  avEficaz === false
                    ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                    : 'border-border text-muted-foreground hover:text-foreground')}>
                <ThumbsDown className="h-4 w-4" />Não eficaz
              </button>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Data da avaliação</Label>
              <Input type="date" value={avData} onChange={(e) => setAvData(e.target.value)} className="h-9 text-sm mt-1.5 w-[180px]" />
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Avaliação</Label>
              <div className="mt-1.5">
                <RichEditor value={avTexto} onChange={setAvTexto} placeholder="O que foi observado após o plano de ação..." />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvAberta(false)} disabled={salvandoAv}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarAvaliacao} disabled={salvandoAv}>
              {salvandoAv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
