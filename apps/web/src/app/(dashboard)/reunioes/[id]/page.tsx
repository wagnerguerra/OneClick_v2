'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2, Check, X, Users, Info, History, ListTodo, Plus, Pencil,
  Paperclip, Download, RotateCcw, FileText, MessageSquare, Send,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Participante {
  id: string; usuarioId: string | null; nome: string | null; presente: boolean
  usuario: { id: string; name: string; image: string | null } | null
}
interface Acao {
  id: string; descricao: string; status: string
  responsavelId: string | null; responsavelNome: string | null
  responsavel: { id: string; name: string; image: string | null } | null
  prazo: string | null; concluidoEm: string | null; observacao: string | null
}
interface Anexo { id: string; nome: string; arquivoPath: string }
interface Mensagem { id: string; autorId: string | null; texto: string; criadoEm: string }
interface Log { id: string; evento: string; detalhe: string | null; criadoEm: string }
interface Reuniao {
  id: string; numero: number | null; titulo: string
  tipo: { id: string; nome: string } | null
  cliente: { id: string; razaoSocial: string } | null
  area: { id: string; name: string } | null
  autor: { id: string; name: string; image: string | null } | null
  data: string; horaInicio: string | null; horaFim: string | null; local: string | null
  pauta: string | null; ata: string | null
  participantes: Participante[]
  acoes: Acao[]
  arquivos: Anexo[]
  mensagens: Mensagem[]
  logs: Log[]
}
interface Usuario { id: string; name: string; email: string | null; image: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const EVENTO_LABEL: Record<string, string> = {
  REUNIAO_CRIADA: 'Reunião registrada',
  REUNIAO_EDITADA: 'Ata alterada',
  ACAO_CRIADA: 'Ação criada',
  ACAO_EDITADA: 'Ação alterada',
  ACAO_CONCLUIDA: 'Ação concluída',
  ACAO_REABERTA: 'Ação reaberta',
  ACAO_EXCLUIDA: 'Ação excluída',
}

const richVazio = (v: string) => !v || v.replace(/<[^>]*>/g, '').trim() === ''

export default function ReuniaoDetalhePage() {
  const params = useParams<{ id: string }>()
  const { profile } = useCurrentUserProfile()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'reunioes')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciarAcoes = isMaster || isEmpresaMaster || subs.gerenciar_acoes === true

  const [r, setR] = useState<Reuniao | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Edição da ata (pauta + ata juntas: são o corpo do registro)
  const [editandoAta, setEditandoAta] = useState(false)
  const [pauta, setPauta] = useState('')
  const [ata, setAta] = useState('')

  // Modal de ação (criar/editar)
  const [acaoAberta, setAcaoAberta] = useState(false)
  const [acaoEditando, setAcaoEditando] = useState<Acao | null>(null)
  const [acaoDescricao, setAcaoDescricao] = useState('')
  const [acaoResponsavelId, setAcaoResponsavelId] = useState('')
  const [acaoPrazo, setAcaoPrazo] = useState('')

  // Mensagem nova
  const [msgTexto, setMsgTexto] = useState('')
  const [enviandoMsg, setEnviandoMsg] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.reuniao as any).getById.query({ id: params.id })
      .then((d: Reuniao) => { setR(d); setPauta(d.pauta ?? ''); setAta(d.ata ?? '') })
      .catch(() => setR(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    ;(trpc.reuniao as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); alerts.success('Pronto', msg); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  async function salvarAta() {
    await acao(
      () => (trpc.reuniao as any).atualizar.mutate({ id: r!.id, pauta: pauta || null, ata: ata || null }),
      'Ata atualizada.',
    )
    setEditandoAta(false)
  }

  function abrirNovaAcao() {
    setAcaoEditando(null); setAcaoDescricao(''); setAcaoResponsavelId(''); setAcaoPrazo('')
    setAcaoAberta(true)
  }
  function abrirEdicaoAcao(a: Acao) {
    setAcaoEditando(a); setAcaoDescricao(a.descricao)
    setAcaoResponsavelId(a.responsavelId ?? ''); setAcaoPrazo(a.prazo ? a.prazo.slice(0, 10) : '')
    setAcaoAberta(true)
  }

  async function salvarAcao() {
    if (acaoDescricao.trim().length < 3) { alerts.error('Falta a descrição', 'Descreva a ação.'); return }
    const payload = {
      descricao: acaoDescricao.trim(),
      responsavelId: acaoResponsavelId || null,
      prazo: acaoPrazo || null,
    }
    setAcaoAberta(false)
    if (acaoEditando) {
      await acao(() => (trpc.reuniao as any).atualizarAcao.mutate({ id: acaoEditando.id, ...payload }), 'Ação atualizada.')
    } else {
      await acao(() => (trpc.reuniao as any).criarAcao.mutate({ reuniaoId: r!.id, ...payload }), 'Ação criada.')
    }
  }

  async function enviarMensagem() {
    if (!msgTexto.trim()) return
    setEnviandoMsg(true)
    try {
      await (trpc.reuniao as any).adicionarMensagem.mutate({ id: r!.id, texto: msgTexto.trim() })
      setMsgTexto(''); carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviandoMsg(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!r) return <div className="py-12 text-center text-muted-foreground">Reunião não encontrada</div>

  const hoje = new Date().toISOString().slice(0, 10)
  const pendentes = r.acoes.filter((a) => a.status === 'PENDENTE')
  const nomeDe = (p: Participante) => p.usuario?.name ?? p.nome ?? 'Participante'
  const nomeResp = (a: Acao) => a.responsavel?.name ?? a.responsavelNome ?? '—'
  const souAutorMsg = (m: Mensagem) => m.autorId && m.autorId === profile?.id
  const nomeAutorMsg = (m: Mensagem) => usuarios.find((u) => u.id === m.autorId)?.name ?? 'Usuário'

  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {!editandoAta && (
            <Button variant="outline" size="sm" onClick={() => setEditandoAta(true)}>
              <Pencil className="h-4 w-4" />Editar ata
            </Button>
          )}
          <BackButton href="/reunioes" label="Voltar" />
      </>}>
        <h1 className="truncate">{r.titulo}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Reuniões</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <div className="min-w-0">
              {pendentes.length > 0 && (
                <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  {pendentes.length} ação{pendentes.length === 1 ? '' : 'ões'} pendente{pendentes.length === 1 ? '' : 's'}
                </Badge>
              )}
            <p className="text-sm text-muted-foreground">
              {[r.tipo?.nome, dataBR(r.data), r.cliente?.razaoSocial].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </PageHeaderBar>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* ── Pauta e ata ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
              <FileText className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Pauta e ata</h4>
            </div>
            {editandoAta ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-[13px] font-semibold">Pauta</Label>
                  <div className="mt-1.5"><RichEditor value={pauta} onChange={setPauta} placeholder="O que foi discutido..." /></div>
                </div>
                <div>
                  <Label className="text-[13px] font-semibold">Ata</Label>
                  <div className="mt-1.5"><RichEditor value={ata} onChange={setAta} placeholder="O que foi decidido..." /></div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setPauta(r.pauta ?? ''); setAta(r.ata ?? ''); setEditandoAta(false) }}>
                    <X className="h-4 w-4" />Cancelar
                  </Button>
                  <Button variant="success" size="sm" onClick={salvarAta} disabled={acting}>
                    {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {!richVazio(r.pauta ?? '') && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Pauta</p>
                    <RichContent className="text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1" html={r.pauta!} />
                  </div>
                )}
                {!richVazio(r.ata ?? '') && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Ata</p>
                    <RichContent className="text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1" html={r.ata!} />
                  </div>
                )}
                {richVazio(r.pauta ?? '') && richVazio(r.ata ?? '') && (
                  <p className="text-xs text-muted-foreground">Sem pauta ou ata registrada.</p>
                )}
              </div>
            )}
          </Card>

          {/* ── Plano de ação ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Plano de ação</h4>
              </div>
              {podeGerenciarAcoes && (
                <Button variant="outline" size="xs" onClick={abrirNovaAcao}><Plus className="h-3.5 w-3.5" />Nova ação</Button>
              )}
            </div>
            {r.acoes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma ação registrada nesta reunião.</p>
            ) : (
              <div className="space-y-2">
                {r.acoes.map((a) => {
                  const vencida = a.status === 'PENDENTE' && a.prazo && a.prazo.slice(0, 10) < hoje
                  const minha = a.responsavelId && a.responsavelId === profile?.id
                  return (
                    <div key={a.id} className={cn(
                      'rounded-md border p-3 text-sm',
                      a.status === 'CONCLUIDA'
                        ? 'border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/10'
                        : vencida
                          ? 'border-rose-300/60 bg-rose-50/40 dark:border-rose-800/50 dark:bg-rose-950/10'
                          : 'border-border bg-muted/20',
                    )}>
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('flex-1', a.status === 'CONCLUIDA' && 'line-through text-muted-foreground')}>{a.descricao}</p>
                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                          {a.status === 'PENDENTE' && (minha || podeGerenciarAcoes) && (
                            <Button size="xs" variant="success" disabled={acting}
                              onClick={() => acao(() => (trpc.reuniao as any).concluirAcao.mutate({ id: a.id, concluida: true }), 'Ação concluída.')}>
                              <Check className="h-3.5 w-3.5" />Concluir
                            </Button>
                          )}
                          {a.status === 'CONCLUIDA' && podeGerenciarAcoes && (
                            <Button size="xs" variant="outline" disabled={acting} title="Reabrir"
                              onClick={() => acao(() => (trpc.reuniao as any).concluirAcao.mutate({ id: a.id, concluida: false }), 'Ação reaberta.')}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {podeGerenciarAcoes && a.status === 'PENDENTE' && (
                            <Button size="icon-sm" variant="soft-info" title="Editar" onClick={() => abrirEdicaoAcao(a)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {nomeResp(a)}
                        {a.prazo && <> · prazo {dataBR(a.prazo)}{vencida && <span className={cn(TEXT.rose, 'font-semibold')}> (vencido)</span>}</>}
                        {a.concluidoEm && <> · concluída em {dataBR(a.concluidoEm)}</>}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* ── Mensagens ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
              <MessageSquare className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Mensagens</h4>
            </div>
            <div className="flex items-start gap-2 mb-4">
              <textarea value={msgTexto} onChange={(e) => setMsgTexto(e.target.value)} rows={2}
                placeholder="Escreva uma interação..."
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
              <Button type="button" size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5 mt-0.5"
                disabled={enviandoMsg || !msgTexto.trim()} onClick={enviarMensagem}>
                {enviandoMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar
              </Button>
            </div>
            {r.mensagens.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma interação registrada.</p>
            ) : (
              <div className="space-y-3">
                {r.mensagens.map((m) => (
                  <div key={m.id} className="rounded-lg border border-border p-3 group">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13px] font-semibold">{nomeAutorMsg(m)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{dataHoraBR(m.criadoEm)}</span>
                        {souAutorMsg(m) && (
                          <button type="button" title="Excluir"
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                            onClick={() => acao(() => (trpc.reuniao as any).excluirMensagem.mutate({ id: m.id }), 'Mensagem excluída.')}>
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
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
                ['Tipo', r.tipo?.nome],
                ['Cliente', r.cliente?.razaoSocial],
                ['Área', r.area?.name],
                ['Data', dataBR(r.data)],
                ['Horário', [r.horaInicio, r.horaFim].filter(Boolean).join(' às ') || null],
                ['Local', r.local],
                ['Registrada por', r.autor?.name],
              ].filter(([, v]) => v && v !== '—').map(([rot, v]) => (
                <div key={rot as string} className="flex justify-between gap-2">
                  <dt className="text-muted-foreground shrink-0">{rot}</dt>
                  <dd className="text-right truncate">{v}</dd>
                </div>
              ))}
            </dl>
            {r.numero != null && (
              <p className="text-[11px] text-muted-foreground pt-3">Nº {r.numero} no sistema antigo</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Participantes ({r.participantes.length})</h4>
            </div>
            {r.participantes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguém registrado.</p>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto nice-scrollbar">
                {r.participantes.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 p-2 text-xs">
                    <span className="flex-1 truncate">{nomeDe(p)}</span>
                    {!p.usuarioId && <span className="text-[10px] text-muted-foreground shrink-0">externo</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {r.arquivos.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-sm font-semibold">Anexos</h4>
              </div>
              <div className="space-y-2">
                {r.arquivos.map((a) => (
                  <a key={a.id} href={`${getApiUrl()}${a.arquivoPath}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 text-xs hover:border-amber-300 dark:hover:border-amber-800 transition-colors">
                    <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{a.nome}</span>
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
            {r.logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem registros.</p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto nice-scrollbar">
                {r.logs.map((l) => (
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

      {/* ── Modal: ação ── */}
      <Dialog open={acaoAberta} onOpenChange={(o) => { if (!acting) setAcaoAberta(o) }}>
        <DialogContent>
          <DialogHeaderIcon icon={ListTodo} color={acaoEditando ? 'sky' : 'emerald'}>
            <DialogTitle>{acaoEditando ? 'Editar ação' : 'Nova ação'}</DialogTitle>
            <DialogDescription>
              {acaoEditando ? 'Ajuste a descrição, o responsável ou o prazo.' : 'O que ficou combinado, com quem e para quando.'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <Input value={acaoDescricao} onChange={(e) => setAcaoDescricao(e.target.value)} className="h-9 text-sm mt-1.5"
                placeholder="Ex.: Revisar o procedimento de aquisição" />
            </div>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Responsável</Label>
                <select value={acaoResponsavelId} onChange={(e) => setAcaoResponsavelId(e.target.value)}
                  className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                  <option value="">Sem responsável</option>
                  {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Prazo</Label>
                <Input type="date" value={acaoPrazo} onChange={(e) => setAcaoPrazo(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAcaoAberta(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarAcao} disabled={acting || acaoDescricao.trim().length < 3}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
