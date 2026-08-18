'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  GraduationCap, Loader2, Check, Ban, Send, X, Users, Info, History,
  ClipboardCheck, AlertTriangle, Paperclip, Download,
} from 'lucide-react'
import {
  Button, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { UserMultiPicker } from '@/components/user-multi-picker'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { CAPACITACAO_STATUS_LABEL, CAPACITACAO_AMBITO_LABEL } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { STATUS_COLORS } from '../page'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Participante {
  id: string; usuarioId: string | null; nome: string | null
  confirmado: boolean; confirmadoEm: string | null
}
interface Anexo { id: string; descricao: string | null; arquivoPath: string; arquivoNome: string | null }
interface Log { id: string; evento: string; detalhe: string | null; criadoEm: string }
interface Capacitacao {
  id: string; legacyId: number | null; titulo: string; ambito: string; status: string
  metodo: { id: string; nome: string } | null
  instrutor: string | null; organizacao: string | null; local: string | null
  dataInicio: string; dataFim: string | null; horaInicio: string | null; horaFim: string | null
  cargaHoraria: number | null; custo: number | null; descricao: string | null
  solicitanteId: string | null; solicitadaEm: string | null
  autorizadaEm: string | null; autorizadaPorId: string | null
  prazoAvaliacao: string | null
  avaliadaEm: string | null; avaliadorId: string | null
  avaliacaoForma: string | null; avaliacaoEvidencia: string | null; avaliacaoAcoes: string | null
  objetivosAtingidos: boolean | null
  participantes: Participante[]
  anexos: Anexo[]
  logs: Log[]
}
interface Usuario { id: string; name: string; email: string | null; image: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const brl = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const EVENTO_LABEL: Record<string, string> = {
  CAPACITACAO_CRIADA: 'Capacitação solicitada',
  CAPACITACAO_EDITADA: 'Dados alterados',
  ENVIADA_PARA_AUTORIZACAO: 'Enviada para autorização',
  AUTORIZADA: 'Autorizada',
  AUTORIZACAO_RECUSADA: 'Autorização recusada',
  AVALIADA: 'Eficácia avaliada',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  PRESENCA_CONFIRMADA: 'Presença confirmada',
  PRESENCA_DESFEITA: 'Presença desfeita',
}

export default function CapacitacaoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { profile } = useCurrentUserProfile()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'capacitacoes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true
  const podeAutorizar = isMaster || isEmpresaMaster || subs.autorizar === true
  const podeAvaliar = isMaster || isEmpresaMaster || subs.avaliar === true

  const [c, setC] = useState<Capacitacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [avaliando, setAvaliando] = useState(false)
  const [atingiu, setAtingiu] = useState(true)
  const [avForma, setAvForma] = useState('')
  const [avEvidencia, setAvEvidencia] = useState('')
  const [avAcoes, setAvAcoes] = useState('')
  const [editandoParticipantes, setEditandoParticipantes] = useState(false)
  const [novosParticipantes, setNovosParticipantes] = useState<string[]>([])

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.capacitacao as any).getById.query({ id: params.id })
      .then((d: Capacitacao) => setC(d))
      .catch(() => setC(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.capacitacao as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); alerts.success('Pronto', msg); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  function nomeDe(p: Participante) {
    if (p.nome) return p.nome
    return usuarios.find((u) => u.id === p.usuarioId)?.name ?? 'Colaborador'
  }

  async function salvarParticipantes() {
    await acao(
      () => (trpc.capacitacao as any).atualizar.mutate({ id: c!.id, participantesIds: novosParticipantes }),
      'Participantes atualizados.',
    )
    setEditandoParticipantes(false)
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!c) return <div className="py-12 text-center text-muted-foreground">Capacitação não encontrada</div>

  const souParticipante = c.participantes.find((p) => p.usuarioId && p.usuarioId === profile?.id)
  const confirmados = c.participantes.filter((p) => p.confirmado).length
  const vencida = Boolean(c.prazoAvaliacao && !c.avaliadaEm && new Date(c.prazoAvaliacao) < new Date()
    && c.status !== 'CANCELADA' && c.status !== 'FINALIZADA')

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <GraduationCap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate">{c.titulo}</h1>
              <Badge variant="outline" className={cn('text-[11px]', STATUS_COLORS[c.status])}>
                {CAPACITACAO_STATUS_LABEL[c.status as keyof typeof CAPACITACAO_STATUS_LABEL] ?? c.status}
              </Badge>
              {vencida && (
                <Badge variant="outline" className="text-[11px] bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800">
                  <AlertTriangle className="h-3 w-3 mr-0.5" />Avaliação vencida
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {[CAPACITACAO_AMBITO_LABEL[c.ambito as keyof typeof CAPACITACAO_AMBITO_LABEL], c.metodo?.nome, dataBR(c.dataInicio)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {podeGerenciar && c.status === 'SOLICITADA' && (
            <Button size="sm" variant="outline" disabled={acting}
              onClick={() => acao(() => (trpc.capacitacao as any).solicitarAutorizacao.mutate({ id: c.id }), 'Enviada para autorização.')}>
              <Send className="h-4 w-4" />Enviar p/ autorização
            </Button>
          )}
          {podeAutorizar && c.status === 'AGUARDANDO_AUTORIZACAO' && (<>
            <Button variant="success" size="sm" disabled={acting}
              onClick={() => acao(() => (trpc.capacitacao as any).autorizar.mutate({ id: c.id, autorizar: true }), 'Autorizada.')}>
              <Check className="h-4 w-4" />Autorizar
            </Button>
            <Button variant="destructive" size="sm" disabled={acting} onClick={() => { setMotivo(''); setRecusando(true) }}>
              <Ban className="h-4 w-4" />Recusar
            </Button>
          </>)}
          {podeAvaliar && (c.status === 'AUTORIZADA' || c.status === 'AVALIADA') && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              onClick={() => {
                setAtingiu(c.objetivosAtingidos ?? true)
                setAvForma(c.avaliacaoForma ?? '')
                setAvEvidencia(c.avaliacaoEvidencia ?? '')
                setAvAcoes(c.avaliacaoAcoes ?? '')
                setAvaliando(true)
              }}>
              <ClipboardCheck className="h-4 w-4" />{c.status === 'AVALIADA' ? 'Rever avaliação' : 'Avaliar eficácia'}
            </Button>
          )}
          {podeGerenciar && c.status === 'AVALIADA' && (
            <Button variant="outline" size="sm" disabled={acting}
              onClick={() => acao(() => (trpc.capacitacao as any).finalizar.mutate({ id: c.id }), 'Finalizada.')}>
              <Check className="h-4 w-4" />Finalizar
            </Button>
          )}
          <BackButton href="/capacitacoes" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* ── Participantes ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">
                  Participantes <span className="text-muted-foreground font-normal">({confirmados} de {c.participantes.length} confirmaram)</span>
                </h4>
              </div>
              {podeGerenciar && !editandoParticipantes && (
                <Button variant="outline" size="xs" onClick={() => {
                  setNovosParticipantes(c.participantes.filter((p) => p.usuarioId).map((p) => p.usuarioId!))
                  setEditandoParticipantes(true)
                }}>Editar</Button>
              )}
            </div>

            {editandoParticipantes ? (
              <div className="space-y-3">
                <UserMultiPicker users={usuarios} value={novosParticipantes} onChange={setNovosParticipantes}
                  placeholder="Escolha os participantes" accentClass="bg-amber-500 border-amber-500" />
                {/* Quem já confirmou não sai por edição — a confirmação é um
                    fato, e apagá-la reescreveria a história da capacitação. */}
                <p className="text-[11px] text-muted-foreground">
                  Quem já confirmou presença e os participantes que vieram do sistema antigo (só com nome) permanecem, mesmo que saiam da lista.
                </p>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditandoParticipantes(false)}><X className="h-4 w-4" />Cancelar</Button>
                  <Button variant="success" size="sm" onClick={salvarParticipantes} disabled={acting}>
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                  </Button>
                </div>
              </div>
            ) : c.participantes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém inscrito ainda.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {c.participantes.map((p) => {
                  const euMesmo = p.usuarioId && p.usuarioId === profile?.id
                  return (
                    <div key={p.id} className={cn(
                      'flex items-center gap-2 rounded-md border p-2 text-xs',
                      p.confirmado ? 'border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/10' : 'border-border bg-muted/20',
                    )}>
                      <span className="flex-1 truncate">
                        {nomeDe(p)}
                        {!p.usuarioId && <span className="text-muted-foreground"> · do sistema antigo</span>}
                      </span>
                      {p.confirmado ? (
                        <span className="text-emerald-700 dark:text-emerald-400 shrink-0" title={`Confirmou em ${dataBR(p.confirmadoEm)}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : (euMesmo || podeGerenciar) && p.usuarioId ? (
                        <Button size="xs" variant="outline" className="shrink-0" disabled={acting}
                          onClick={() => acao(
                            () => (trpc.capacitacao as any).confirmarPresenca.mutate({ capacitacaoId: c.id, usuarioId: p.usuarioId, confirmado: true }),
                            'Presença confirmada.')}>
                          Confirmar
                        </Button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
            {souParticipante && !souParticipante.confirmado && (
              <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-400">
                Você está inscrito nesta capacitação e ainda não confirmou presença.
              </p>
            )}
          </Card>

          {/* ── Avaliação de eficácia ── */}
          {(c.avaliadaEm || c.avaliacaoForma) && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
                <ClipboardCheck className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Avaliação de eficácia</h4>
                {c.objetivosAtingidos != null && (
                  <Badge variant="outline" className={cn('text-[10px]',
                    c.objetivosAtingidos
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800')}>
                    {c.objetivosAtingidos ? 'Objetivos atingidos' : 'Objetivos não atingidos'}
                  </Badge>
                )}
              </div>
              <dl className="space-y-3 text-sm">
                {c.avaliacaoForma && (<div><dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Forma de avaliação</dt>
                  <dd><RichContent className="text-sm [&_p]:my-1" html={c.avaliacaoForma} /></dd></div>)}
                {c.avaliacaoEvidencia && (<div><dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Evidência / justificativa</dt>
                  <dd><RichContent className="text-sm [&_p]:my-1" html={c.avaliacaoEvidencia} /></dd></div>)}
                {c.avaliacaoAcoes && (<div><dt className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ações de seguimento</dt>
                  <dd><RichContent className="text-sm [&_p]:my-1" html={c.avaliacaoAcoes} /></dd></div>)}
                {c.avaliadaEm && <p className="text-[11px] text-muted-foreground">Avaliada em {dataBR(c.avaliadaEm)}</p>}
              </dl>
            </Card>
          )}

          {c.descricao && (
            <Card className="p-5">
              <h4 className="text-[13px] font-semibold text-foreground mb-3 pb-2.5 -mx-5 px-5 border-b border-border">Detalhamento</h4>
              <RichContent className="text-sm [&_p]:my-1" html={c.descricao} />
            </Card>
          )}
        </div>

        {/* ── Coluna lateral ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Dados</h4>
            </div>
            <dl className="space-y-2 text-xs">
              {[
                ['Método', c.metodo?.nome],
                ['Aplicado por', c.instrutor],
                ['Organização', c.organizacao],
                ['Local', c.local],
                ['Data', dataBR(c.dataInicio)],
                ['Horário', [c.horaInicio, c.horaFim].filter(Boolean).join(' às ') || null],
                ['Horas por colaborador', c.cargaHoraria != null ? String(c.cargaHoraria) : null],
                ['Investimento', c.custo != null ? brl(c.custo) : null],
                ['Prazo de avaliação', dataBR(c.prazoAvaliacao)],
                ['Solicitada em', dataBR(c.solicitadaEm)],
                ['Autorizada em', dataBR(c.autorizadaEm)],
              ].filter(([, v]) => v && v !== '—').map(([rot, v]) => (
                <div key={rot as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground shrink-0">{rot}</dt>
                  <dd className="text-right truncate">{v}</dd>
                </div>
              ))}
            </dl>
            {c.legacyId != null && (
              <p className="text-[11px] text-muted-foreground pt-3">Nº {c.legacyId} no sistema antigo</p>
            )}
          </Card>

          {c.anexos.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-sm font-semibold">Anexos</h4>
              </div>
              <div className="space-y-2">
                {c.anexos.map((a) => (
                  <a key={a.id} href={`${getApiUrl()}${a.arquivoPath}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.descricao || a.arquivoNome}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Atividades</h4>
            </div>
            {c.logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem registros.</p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto nice-scrollbar">
                {c.logs.map((l) => (
                  <div key={l.id} className="text-xs border-l-2 border-border pl-2.5 py-0.5">
                    <p className="font-medium">{EVENTO_LABEL[l.evento] ?? l.evento}</p>
                    {l.detalhe && <p className="text-muted-foreground">{l.detalhe}</p>}
                    <p className="text-[10px] text-muted-foreground">{dataHoraBR(l.criadoEm)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Modal: recusar autorização ── */}
      <Dialog open={recusando} onOpenChange={(o) => { if (!o) setRecusando(false) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Ban} color="rose">
            <DialogTitle>Recusar a capacitação</DialogTitle>
            <DialogDescription>
              A solicitação volta para quem pediu ajustar. O motivo fica no histórico.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <Label className="text-[13px] font-semibold">Motivo</Label>
            <div className="mt-1.5"><RichEditor value={motivo} onChange={setMotivo} placeholder="O que precisa ser ajustado..." /></div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRecusando(false)}><X className="h-4 w-4" />Cancelar</Button>
            <Button variant="destructive" size="sm" disabled={acting || !motivo.replace(/<[^>]*>/g, '').trim()}
              onClick={() => {
                setRecusando(false)
                acao(() => (trpc.capacitacao as any).autorizar.mutate({ id: c.id, autorizar: false, observacao: motivo }), 'Recusada.')
              }}>
              <Ban className="h-4 w-4" />Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: avaliar eficácia ── */}
      <Dialog open={avaliando} onOpenChange={(o) => { if (!acting) setAvaliando(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={ClipboardCheck} color="emerald">
            <DialogTitle>Avaliar a eficácia</DialogTitle>
            <DialogDescription>
              É o passo que fecha o ciclo — e o que o sistema antigo mais deixava pela metade.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Os objetivos foram atingidos?</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Button type="button" size="sm" variant={atingiu ? 'success' : 'outline'} onClick={() => setAtingiu(true)}>
                  <Check className="h-4 w-4" />Sim
                </Button>
                <Button type="button" size="sm" variant={!atingiu ? 'destructive' : 'outline'} onClick={() => setAtingiu(false)}>
                  <Ban className="h-4 w-4" />Não
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Forma de avaliação</Label>
              <div className="mt-1.5"><RichEditor value={avForma} onChange={setAvForma} placeholder="Como a eficácia foi verificada..." /></div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Evidência / justificativa</Label>
              <div className="mt-1.5"><RichEditor value={avEvidencia} onChange={setAvEvidencia} placeholder="O que comprova o resultado..." /></div>
            </div>
            {/* Só aparece quando não atingiu — é o que o formulário do v1 pedia,
                e o backend exige nesse caso. */}
            {!atingiu && (
              <div>
                <Label className="text-[13px] font-semibold">Ações de seguimento</Label>
                <div className="mt-1.5"><RichEditor value={avAcoes} onChange={setAvAcoes} placeholder="O que será feito já que os objetivos não foram atingidos..." /></div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvaliando(false)} disabled={acting}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              disabled={acting || !avForma.replace(/<[^>]*>/g, '').trim() || (!atingiu && !avAcoes.replace(/<[^>]*>/g, '').trim())}
              onClick={() => {
                setAvaliando(false)
                acao(() => (trpc.capacitacao as any).avaliar.mutate({
                  id: c.id, objetivosAtingidos: atingiu, avaliacaoForma: avForma,
                  avaliacaoEvidencia: avEvidencia || undefined, avaliacaoAcoes: avAcoes || undefined,
                }), 'Eficácia avaliada.')
              }}>
              <ClipboardCheck className="h-4 w-4" />Salvar avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
