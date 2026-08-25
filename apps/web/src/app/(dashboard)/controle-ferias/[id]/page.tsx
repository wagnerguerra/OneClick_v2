'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  CalendarDays, Plus, Loader2, Check, Trash2, Info, Paperclip, Upload, Download, History,
  ChevronRight, ExternalLink,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { corSaldo, corSaldoTexto } from '../_lib/cores'

const MODULE_COLOR = 'var(--mod-trabalhista, #a3e635)'

interface Evento {
  id: string; ordem: number; dataInicio: string; dataFim: string
  descricao: string | null; dias: number; registradoPorNome: string | null; registradoEm: string
}
interface Arquivo { id: string; nome: string; path: string; criadoEm: string }
interface Periodo {
  id: string; legacyId: number | null
  colaboradorNomeResolvido: string | null
  periodoInicial: number; periodoFinal: number
  descricao: string | null
  saldoAnterior: number; dias: number; gozados: number; saldo: number
  previsao: string | null
  pagamento1: string | null; pagamento2: string | null; pagamento3: string | null
  pago: boolean; historico: boolean
  eventos: Evento[]; arquivos: Arquivo[]
  /** Demais períodos do mesmo colaborador — a lista mostra só o mais recente. */
  historicoColaborador: Array<{
    id: string; periodoInicial: number; periodoFinal: number; descricao: string | null
    dias: number; saldoAnterior: number; gozados: number; saldo: number
    previsao: string | null; pago: boolean; historico: boolean
    eventosTotal: number; arquivosTotal: number
    /** Conteúdo do período, para a linha expandir sem nova consulta. */
    gozos: Array<{ id: string; dataInicio: string; dataFim: string; dias: number; descricao: string | null }>
    arquivos: Arquivo[]
  }>
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const isoDe = (v: string | null) => (v ? v.slice(0, 10) : '')

export default function ControleFeriasDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'controle-ferias')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [p, setP] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  /** Períodos do histórico abertos na tabela — o conteúdo já veio no payload. */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  // Sidebar editável
  const [fDescricao, setFDescricao] = useState('')
  const [fDias, setFDias] = useState('30')
  const [fSaldoAnt, setFSaldoAnt] = useState('0')
  const [fPrevisao, setFPrevisao] = useState('')
  const [fPag1, setFPag1] = useState('')
  const [fPag2, setFPag2] = useState('')
  const [fPag3, setFPag3] = useState('')

  // Modal novo gozo
  const [gozoAberto, setGozoAberto] = useState(false)
  const [gInicio, setGInicio] = useState('')
  const [gFim, setGFim] = useState('')
  const [gDescricao, setGDescricao] = useState('gozo de férias')
  const [salvandoGozo, setSalvandoGozo] = useState(false)

  // Upload de recibo
  const [enviandoArq, setEnviandoArq] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Clique na linha do histórico abre/fecha o período; vários podem ficar abertos. */
  function alternarExpandido(id: string) {
    setExpandidos((prev) => {
      const nova = new Set(prev)
      if (nova.has(id)) nova.delete(id); else nova.add(id)
      return nova
    })
  }

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.controleFerias as any).getById.query({ id: params.id })
      .then((per: Periodo) => {
        setP(per)
        setFDescricao(per.descricao ?? '')
        setFDias(String(per.dias)); setFSaldoAnt(String(per.saldoAnterior))
        setFPrevisao(isoDe(per.previsao))
        setFPag1(isoDe(per.pagamento1)); setFPag2(isoDe(per.pagamento2)); setFPag3(isoDe(per.pagamento3))
      })
      .catch(() => setP(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  async function salvarDados() {
    setSalvando(true)
    try {
      await (trpc.controleFerias as any).atualizar.mutate({
        id: p!.id,
        descricao: fDescricao || null,
        dias: Number(fDias) || 0,
        saldoAnterior: Number(fSaldoAnt) || 0,
        previsao: fPrevisao || null,
        pagamento1: fPag1 || null,
        pagamento2: fPag2 || null,
        pagamento3: fPag3 || null,
        pago: !!(fPag1 || fPag2 || fPag3),
      })
      alerts.success('Salvo', 'Período atualizado.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function alternarHistorico() {
    try {
      await (trpc.controleFerias as any).atualizar.mutate({ id: p!.id, historico: !p!.historico })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function salvarGozo() {
    if (!gInicio || !gFim) { alerts.error('Faltam as datas', 'Informe início e fim do gozo.'); return }
    setSalvandoGozo(true)
    try {
      await (trpc.controleFerias as any).criarEvento.mutate({
        periodoId: p!.id, dataInicio: gInicio, dataFim: gFim, descricao: gDescricao || null,
      })
      alerts.success('Lançado', 'Gozo registrado no período.')
      setGozoAberto(false); setGInicio(''); setGFim('')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoGozo(false) }
  }

  async function excluirGozo(e: Evento) {
    const ok = await alerts.confirm({ title: 'Excluir o gozo?', text: `${dataBR(e.dataInicio)} a ${dataBR(e.dataFim)} (${e.dias} dias)`, icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluirEvento.mutate({ id: e.id })
      carregar()
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  async function enviarArquivo(file: File) {
    setEnviandoArq(true)
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const { url } = await res.json() as { url: string }
      await (trpc.controleFerias as any).criarArquivo.mutate({ periodoId: p!.id, nome: file.name, path: url })
      alerts.success('Anexado', '')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviandoArq(false) }
  }

  async function excluirArquivo(a: Arquivo) {
    const ok = await alerts.confirm({ title: `Excluir "${a.nome}"?`, text: '', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluirArquivo.mutate({ id: a.id })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!p) return <div className="py-12 text-center text-muted-foreground">Período não encontrado</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <CalendarDays className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate">{p.colaboradorNomeResolvido ?? 'Colaborador'}</h1>
              <Badge variant="secondary" className="text-[11px] tabular-nums">{p.periodoInicial}/{p.periodoFinal}</Badge>
              {p.historico && <Badge variant="outline" className="text-[11px]">Histórico</Badge>}
              {p.pago && (
                <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                  <Check className="h-3 w-3 mr-0.5" />Pago
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {p.dias + p.saldoAnterior} dias no período · {p.gozados} gozados · saldo {p.saldo}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {podeEscrever && (
            <>
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={() => setGozoAberto(true)}>
                <Plus className="h-4 w-4" />Lançar gozo
              </Button>
              <Button variant="outline" size="sm" onClick={alternarHistorico}>
                {p.historico ? 'Reabrir período' : 'Mover para o histórico'}
              </Button>
            </>
          )}
          <BackButton href="/controle-ferias" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* ── Gozos ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <CalendarDays className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Gozos do período</h4>
            </div>
            {p.eventos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Nenhum gozo lançado ainda.</p>
            ) : (
              <div className="space-y-2">
                {p.eventos.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      {dataBR(e.dataInicio)} → {dataBR(e.dataFim)}
                    </span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">{e.dias} {e.dias === 1 ? 'dia' : 'dias'}</Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1">{e.descricao ?? ''}</span>
                    {e.registradoPorNome && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">por {e.registradoPorNome}</span>
                    )}
                    {podeExcluir && (
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirGozo(e)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Saldo do período</span>
              <span className={cn('font-bold tabular-nums text-sm', corSaldoTexto(p.saldo))}>
                {p.saldo} {Math.abs(p.saldo) === 1 ? 'dia' : 'dias'}
              </span>
            </div>
          </Card>

          {/* ── Recibos / avisos ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Recibos e avisos</h4>
              </div>
              {podeEscrever && (
                <>
                  <Button variant="outline" size="xs" onClick={() => fileRef.current?.click()} disabled={enviandoArq}>
                    {enviandoArq ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Anexar
                  </Button>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = '' }} />
                </>
              )}
            </div>
            {p.arquivos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum arquivo anexado.</p>
            ) : (
              <div className="space-y-1.5">
                {p.arquivos.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
                    <a href={`${getApiUrl()}${a.path}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs hover:underline truncate flex-1">
                      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{a.nome}</span>
                    </a>
                    <span className="text-[10px] text-muted-foreground shrink-0">{dataBR(a.criadoEm)}</span>
                    {podeExcluir && (
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirArquivo(a)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ── Períodos anteriores do colaborador (histórico interno) ── */}
          {(p.historicoColaborador?.length ?? 0) > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
                <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Períodos anteriores</h4>
                <Badge variant="secondary" className="text-[10px]">{p.historicoColaborador.length}</Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {expandidos.size > 0 && (
                    <button type="button" onClick={() => setExpandidos(new Set())} className="mr-2 underline underline-offset-2 hover:text-foreground">
                      recolher todos
                    </button>
                  )}
                  Histórico de {p.colaboradorNomeResolvido ?? 'colaborador'}
                </span>
              </div>
              <div className="overflow-x-auto nice-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:whitespace-nowrap [&_th]:py-1.5 [&_th]:font-semibold">
                      <th className="text-left">Período</th>
                      <th className="text-center">Dias</th>
                      <th className="text-center">Gozados</th>
                      <th className="text-center">Saldo</th>
                      <th className="text-left">Previsão</th>
                      <th className="text-left">Situação</th>
                      <th className="text-right">Anexos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.historicoColaborador.map((h) => {
                      const aberto = expandidos.has(h.id)
                      return (
                      <Fragment key={h.id}>
                      <tr
                        onClick={() => alternarExpandido(h.id)}
                        className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40 [&_td]:whitespace-nowrap [&_td]:py-2"
                      >
                        <td className="font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                            {h.periodoInicial}/{h.periodoFinal}
                          </span>
                        </td>
                        <td className="text-center tabular-nums">{h.dias + h.saldoAnterior}</td>
                        <td className="text-center tabular-nums">{h.gozados}</td>
                        <td className="text-center">
                          <span className={cn('inline-flex h-5 min-w-[26px] items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums', corSaldo(h.saldo))}>
                            {h.saldo}
                          </span>
                        </td>
                        <td className="text-muted-foreground tabular-nums">{dataBR(h.previsao)}</td>
                        <td>
                          <span className="flex items-center gap-1">
                            {h.pago && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">Pago</Badge>}
                            {h.historico && <Badge variant="outline" className="text-[10px]">Histórico</Badge>}
                          </span>
                        </td>
                        <td className="text-right text-muted-foreground tabular-nums">{h.eventosTotal} gozo(s) · {h.arquivosTotal} anexo(s)</td>
                      </tr>
                      {aberto && (
                        <tr className="border-b border-border/40 bg-muted/20">
                          <td colSpan={7} className="px-0 py-3">
                            <div className="space-y-3 px-3">
                              <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gozos do período</p>
                                {h.gozos.length === 0 ? (
                                  <p className="text-xs italic text-muted-foreground">Nenhum gozo lançado neste período.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {h.gozos.map((g) => (
                                      <div key={g.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-2.5 py-1.5">
                                        <span className="shrink-0 text-xs font-medium tabular-nums">{dataBR(g.dataInicio)} → {dataBR(g.dataFim)}</span>
                                        <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">{g.dias} {g.dias === 1 ? 'dia' : 'dias'}</Badge>
                                        <span className="flex-1 truncate text-[11px] text-muted-foreground">{g.descricao ?? ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {h.arquivos.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recibos e avisos</p>
                                  <div className="space-y-1.5">
                                    {h.arquivos.map((a) => (
                                      <a
                                        key={a.id}
                                        href={`${getApiUrl()}${a.path}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted/40"
                                      >
                                        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="flex-1 truncate">{a.nome}</span>
                                        <span className="shrink-0 text-[10px] text-muted-foreground">{dataBR(a.criadoEm)}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-end">
                                <Button variant="outline" size="xs" className="gap-1" onClick={(e) => { e.stopPropagation(); router.push(`/controle-ferias/${h.id}`) }}>
                                  <ExternalLink className="h-3.5 w-3.5" />Abrir período
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Dados do período</h4>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" maxLength={200} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[13px] font-semibold">Dias</Label>
                  <Input type="number" value={fDias} onChange={(e) => setFDias(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" min="0" max="60" />
                </div>
                <div>
                  <Label className="text-[13px] font-semibold">Saldo anterior</Label>
                  <Input type="number" value={fSaldoAnt} onChange={(e) => setFSaldoAnt(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
                </div>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Previsão de gozo</Label>
                <Input type="date" value={fPrevisao} onChange={(e) => setFPrevisao(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" />
              </div>
              {/* Até três pagamentos, como o v1 — gozo fracionado paga fracionado. */}
              <div>
                <Label className="text-[13px] font-semibold">Pagamentos</Label>
                <div className="grid grid-cols-1 gap-2 mt-1.5">
                  <Input type="date" value={fPag1} onChange={(e) => setFPag1(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
                  <Input type="date" value={fPag2} onChange={(e) => setFPag2(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
                  <Input type="date" value={fPag3} onChange={(e) => setFPag3(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Qualquer data preenchida marca o período como pago.</p>
              </div>
              {podeEscrever && (
                <Button variant="success" size="sm" className="w-full" onClick={salvarDados} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
              {p.legacyId != null && (
                <p className="text-[11px] text-muted-foreground pt-1">Nº {p.legacyId} no sistema antigo</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Modal: lançar gozo ── */}
      <Dialog open={gozoAberto} onOpenChange={(o) => { if (!salvandoGozo) setGozoAberto(o) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Lançar gozo</DialogTitle>
            <DialogDescription>O saldo do período é recalculado na hora.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px] font-semibold">Início</Label>
                <Input type="date" value={gInicio} onChange={(e) => setGInicio(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Fim</Label>
                <Input type="date" value={gFim} onChange={(e) => setGFim(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <Input value={gDescricao} onChange={(e) => setGDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={200} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGozoAberto(false)} disabled={salvandoGozo}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarGozo} disabled={salvandoGozo}>
              {salvandoGozo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
