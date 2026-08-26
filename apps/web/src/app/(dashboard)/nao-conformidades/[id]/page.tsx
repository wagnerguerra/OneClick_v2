'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle, Plus, Loader2, Check, X, ClipboardList, Info, RotateCcw, Trash2,
  ThumbsUp, ThumbsDown, CalendarClock, MessageSquare, Paperclip, History, Ban, Download,
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
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { NC_SITUACAO_LABEL, NC_ACAO_TIPO_LABEL, NC_ACAO_TIPOS } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { MODULE_COLOR, NC_SITUACAO_BADGE, dataBR, dataHoraBR } from '../shared'

interface Acao {
  id: string; tipo: string; descricao: string; prazo: string | null
  concluida: boolean; finalizadoEm: string | null; finalizadoPorNome: string | null
  observacao: string | null; responsavelNomeResolvido: string | null
}
interface Mensagem { id: string; texto: string; criadoEm: string; autorNomeResolvido: string | null }
interface Arquivo { id: string; nome: string; path: string; criadoEm: string }
interface Log { id: string; evento: string; criadoEm: string; usuarioNomeResolvido: string | null }
interface Nc {
  id: string; legacyId: number | null; situacao: string; tipo: string
  detalhamento: string; registradoEm: string; prazo: string | null
  reincidencia: boolean
  cliente: { id: string; razaoSocial: string } | null
  area: { id: string; name: string } | null
  areaNome: string | null
  processoId: string | null
  origem: { id: string; nome: string } | null
  registradoPorNomeResolvido: string | null
  responsavelId: string | null
  responsavelNomeResolvido: string | null
  ncSimilar: { id: string; legacyId: number | null; detalhamento: string } | null
  ncSimilarTexto: string | null
  ncAnterior: { id: string; legacyId: number | null; detalhamento: string } | null
  reincidencias: Array<{ id: string; legacyId: number | null; situacao: string }>
  causa: string | null; causaEm: string | null; causaPorNome: string | null
  eficaciaRegistrada: boolean; eficaciaDetalhes: string | null; eficaciaPrazo: string | null; eficaciaResponsavelNome: string | null
  avaliacao: string | null; eficaz: boolean | null; avaliadoEm: string | null; avaliadoPorNomeResolvido: string | null
  atualizaSwot: boolean | null; atualizaSwotDesc: string | null
  atualizaRevisao: boolean | null; atualizaRevisaoDesc: string | null
  acoes: Acao[]; mensagens: Mensagem[]; arquivos: Arquivo[]; logs: Log[]
}
interface Usuario { id: string; name: string }

/** Rótulos humanos dos eventos do log (os do v1 chegam como frase pronta). */
const EVENTO_LABEL: Record<string, string> = {
  NC_REGISTRADA: 'Não conformidade registrada',
  NC_REGISTRADA_POR_REINCIDENCIA: 'Registrada por reincidência (tratamento anterior não eficaz)',
  NC_EDITADA: 'Dados editados',
  NC_EXCLUIDA: 'Excluída',
  CAUSA_REGISTRADA: 'Análise da causa registrada',
  FORMA_AVALIACAO_REGISTRADA: 'Forma de avaliação da eficácia registrada',
  ATUALIZACAO_SISTEMA_REGISTRADA: 'Atualização do sistema da qualidade registrada',
  AVALIADA_EFICAZ: 'Avaliada: tratamento eficaz',
  AVALIADA_NAO_EFICAZ: 'Avaliada: tratamento NÃO eficaz',
  ACAO_REGISTRADA: 'Nova ação no plano',
  ACAO_EDITADA: 'Ação editada',
  ACAO_CONCLUIDA: 'Ação concluída',
  ACAO_REABERTA: 'Ação reaberta',
  ACAO_EXCLUIDA: 'Ação excluída',
}

export default function NaoConformidadeDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'nao-conformidades')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [nc, setNc] = useState<Nc | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  // Modais do fluxo
  const [causaAberta, setCausaAberta] = useState(false)
  const [causaTexto, setCausaTexto] = useState('')
  const [formaAberta, setFormaAberta] = useState(false)
  const [formaTexto, setFormaTexto] = useState('')
  const [formaPrazo, setFormaPrazo] = useState('')
  const [avAberta, setAvAberta] = useState(false)
  const [avTexto, setAvTexto] = useState('')
  const [avEficaz, setAvEficaz] = useState<boolean | null>(null)
  const [cancelAberta, setCancelAberta] = useState(false)
  const [cancelMotivo, setCancelMotivo] = useState('')

  // Ação
  const [acaoAberta, setAcaoAberta] = useState(false)
  const [acaoEditando, setAcaoEditando] = useState<Acao | null>(null)
  const [aTipo, setATipo] = useState('CORRETIVA')
  const [aDescricao, setADescricao] = useState('')
  const [aResponsavel, setAResponsavel] = useState('')
  const [aPrazo, setAPrazo] = useState('')

  // Mensagem
  const [msgTexto, setMsgTexto] = useState('')
  const [msgEnviando, setMsgEnviando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.naoConformidade as any).getById.query({ id: params.id })
      .then(setNc)
      .catch(() => setNc(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    ;(trpc.naoConformidade as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function rodar(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); if (msg) alerts.success('Pronto', msg); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  const richVazio = (h: string) => !h.replace(/<[^>]*>/g, '').trim()

  async function salvarCausa() {
    if (richVazio(causaTexto)) { alerts.error('Falta a causa', 'Descreva a análise da causa.'); return }
    setCausaAberta(false)
    await rodar(() => (trpc.naoConformidade as any).registrarCausa.mutate({ id: nc!.id, causa: causaTexto }), 'Causa registrada.')
  }

  async function salvarForma() {
    if (richVazio(formaTexto)) { alerts.error('Faltou descrever', 'Como a eficácia será avaliada?'); return }
    setFormaAberta(false)
    await rodar(() => (trpc.naoConformidade as any).registrarFormaAvaliacao.mutate({
      id: nc!.id, eficaciaDetalhes: formaTexto, eficaciaPrazo: formaPrazo || null,
    }), 'Forma de avaliação registrada.')
  }

  async function salvarAvaliacao() {
    if (richVazio(avTexto)) { alerts.error('Falta a avaliação', 'Descreva o resultado observado.'); return }
    if (avEficaz === null) { alerts.error('Falta o veredito', 'Diga se o tratamento foi eficaz.'); return }
    setAvAberta(false)
    setActing(true)
    try {
      const r = await (trpc.naoConformidade as any).avaliar.mutate({ id: nc!.id, avaliacao: avTexto, eficaz: avEficaz })
      if (r.reincidenciaId) {
        await alerts.success('Avaliada como NÃO eficaz', 'Uma nova NC foi aberta automaticamente por reincidência.')
        router.push(`/nao-conformidades/${r.reincidenciaId}`)
        return
      }
      alerts.success('Avaliada', 'Não conformidade finalizada.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setActing(false) }
  }

  async function salvarCancelamento() {
    if (cancelMotivo.replace(/<[^>]*>/g, ' ').trim().length < 3) { alerts.error('Falta o motivo', ''); return }
    setCancelAberta(false)
    await rodar(() => (trpc.naoConformidade as any).cancelar.mutate({
      id: nc!.id, motivo: cancelMotivo.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    }), 'Não conformidade cancelada.')
  }

  function abrirNovaAcao() {
    setAcaoEditando(null); setATipo('CORRETIVA'); setADescricao(''); setAResponsavel(''); setAPrazo('')
    setAcaoAberta(true)
  }
  function abrirEditarAcao(a: Acao) {
    setAcaoEditando(a); setATipo(a.tipo); setADescricao(a.descricao); setAResponsavel(''); setAPrazo(a.prazo ? a.prazo.slice(0, 10) : '')
    setAcaoAberta(true)
  }
  async function salvarAcao() {
    if (richVazio(aDescricao)) { alerts.error('Falta a descrição', 'Descreva a ação.'); return }
    setAcaoAberta(false)
    if (acaoEditando) {
      await rodar(() => (trpc.naoConformidade as any).atualizarAcao.mutate({
        id: acaoEditando.id, tipo: aTipo, descricao: aDescricao,
        ...(aResponsavel ? { responsavelId: aResponsavel } : {}),
        prazo: aPrazo || null,
      }), 'Ação atualizada.')
    } else {
      await rodar(() => (trpc.naoConformidade as any).criarAcao.mutate({
        ncId: nc!.id, tipo: aTipo, descricao: aDescricao,
        responsavelId: aResponsavel || null, prazo: aPrazo || null,
      }), 'Ação incluída no plano.')
    }
  }

  async function enviarMensagem() {
    if (richVazio(msgTexto)) return
    setMsgEnviando(true)
    try {
      await (trpc.naoConformidade as any).criarMensagem.mutate({ ncId: nc!.id, texto: msgTexto })
      setMsgTexto('')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setMsgEnviando(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!nc) return <div className="py-12 text-center text-muted-foreground">Não conformidade não encontrada</div>

  const encerrada = nc.situacao === 'FINALIZADA' || nc.situacao === 'CANCELADA'
  const podeAvaliar = podeEscrever && !encerrada && nc.situacao === 'AGUARDANDO_CONCLUSAO'

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="truncate">NC {nc.legacyId ? `#${nc.legacyId}` : ''}</h1>
              <Badge variant="outline" className={cn('text-[11px]', NC_SITUACAO_BADGE[nc.situacao])}>
                {NC_SITUACAO_LABEL[nc.situacao] ?? nc.situacao}
              </Badge>
              {nc.reincidencia && (
                <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800">
                  <RotateCcw className="h-3 w-3 mr-1" />Reincidência
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {nc.cliente?.razaoSocial ?? 'Sem cliente'} · {(nc.area?.name ?? nc.areaNome) || 'Sem área'} · Registro: {dataBR(nc.registradoEm)}{nc.prazo ? ` · Prazo: ${dataBR(nc.prazo)}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 flex-wrap justify-end">
          {podeEscrever && !encerrada && nc.situacao === 'AGUARDANDO_CAUSA' && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              onClick={() => { setCausaTexto(nc.causa ?? ''); setCausaAberta(true) }}>
              <Check className="h-4 w-4" />Registrar causa
            </Button>
          )}
          {podeAvaliar && (
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white"
              onClick={() => { setAvTexto(''); setAvEficaz(null); setAvAberta(true) }}>
              <Check className="h-4 w-4" />Avaliar eficácia
            </Button>
          )}
          {podeEscrever && !encerrada && (
            <Button variant="outline" size="sm" onClick={() => { setCancelMotivo(''); setCancelAberta(true) }}>
              <Ban className="h-4 w-4" />Cancelar NC
            </Button>
          )}
          <BackButton href="/nao-conformidades" label="Voltar" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* ── Fato gerador + causa ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Fato gerador</h4>
            </div>
            <RichContent className="text-sm [&_p]:my-1" html={nc.detalhamento} />
            {(nc.ncSimilar || nc.ncSimilarTexto) && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                NC similar: {nc.ncSimilar ? `#${nc.ncSimilar.legacyId ?? ''}` : ''} {nc.ncSimilarTexto ?? ''}
              </p>
            )}
            {nc.ncAnterior && (
              <button type="button" onClick={() => router.push(`/nao-conformidades/${nc.ncAnterior!.id}`)}
                className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 underline decoration-dotted">
                Reincidência da NC #{nc.ncAnterior.legacyId ?? ''} — abrir a anterior
              </button>
            )}

            <div className="flex items-center justify-between gap-2 mt-5 mb-3 pb-2.5 -mx-5 px-5 border-b border-border">
              <h4 className="text-[13px] font-semibold text-foreground">Análise da causa</h4>
              {podeEscrever && !encerrada && nc.causa && (
                <Button variant="outline" size="xs" onClick={() => { setCausaTexto(nc.causa ?? ''); setCausaAberta(true) }}>Editar</Button>
              )}
            </div>
            {nc.causa ? (
              <>
                <RichContent className="text-sm [&_p]:my-1" html={nc.causa} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Registrada{nc.causaPorNome ? ` por ${nc.causaPorNome}` : ''}{nc.causaEm ? ` em ${dataBR(nc.causaEm)}` : ''}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic">Causa ainda não registrada.</p>
            )}
          </Card>

          {/* ── Plano de ação ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Plano de ação</h4>
              </div>
              {podeEscrever && !encerrada && (
                <Button variant="outline" size="xs" onClick={abrirNovaAcao}><Plus className="h-3.5 w-3.5" />Nova ação</Button>
              )}
            </div>
            {nc.acoes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Nenhuma ação no plano ainda.</p>
            ) : (
              <div className="space-y-2">
                {nc.acoes.map((a) => (
                  <div key={a.id} className={cn('rounded-md border px-3 py-2.5', a.concluida ? 'border-border bg-muted/20 opacity-80' : 'border-border bg-card')}>
                    <div className="flex items-start gap-2">
                      {podeEscrever && !encerrada ? (
                        <button type="button" disabled={acting} title={a.concluida ? 'Reabrir' : 'Concluir'} className="mt-0.5 shrink-0"
                          onClick={() => rodar(() => (trpc.naoConformidade as any).concluirAcao.mutate({ id: a.id, concluida: !a.concluida }), '')}>
                          {a.concluida
                            ? <Check className="h-4 w-4 text-emerald-500" />
                            : <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 transition-colors" />}
                        </button>
                      ) : (
                        a.concluida ? <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> : <span className="block h-4 w-4 rounded-full border-2 border-muted-foreground/40 mt-0.5 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{NC_ACAO_TIPO_LABEL[a.tipo] ?? a.tipo}</Badge>
                          {a.prazo && <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{dataBR(a.prazo)}</span>}
                          {a.responsavelNomeResolvido && <span className="text-[11px] text-muted-foreground truncate">Resp.: {a.responsavelNomeResolvido}</span>}
                        </div>
                        <RichContent className={cn('text-sm mt-1 [&_p]:my-0.5', a.concluida && 'text-muted-foreground')} html={a.descricao} />
                        {a.concluida && (
                          <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                            Concluída{a.finalizadoPorNome ? ` por ${a.finalizadoPorNome}` : ''}{a.finalizadoEm ? ` em ${dataBR(a.finalizadoEm)}` : ''}
                          </p>
                        )}
                      </div>
                      {podeEscrever && !encerrada && (
                        <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
                          {!a.concluida && (
                            <Button variant="soft-info" size="icon-sm" onClick={() => abrirEditarAcao(a)} title="Editar">
                              <ClipboardList className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {podeExcluir && (
                            <Button variant="soft-destructive" size="icon-sm" title="Excluir"
                              onClick={async () => {
                                const ok = await alerts.confirm({ title: 'Excluir a ação?', text: '', icon: 'warning', confirmText: 'Excluir' })
                                if (ok) rodar(() => (trpc.naoConformidade as any).excluirAcao.mutate({ id: a.id }), '')
                              }}>
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

          {/* ── Eficácia: forma + avaliação final ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                {nc.eficaz != null
                  ? (nc.eficaz ? <ThumbsUp className="h-4 w-4 text-emerald-500" /> : <ThumbsDown className="h-4 w-4 text-rose-500" />)
                  : <Check className="h-4 w-4" style={{ color: MODULE_COLOR }} />}
                <h4 className="text-[13px] font-semibold text-foreground">Avaliação de eficácia</h4>
              </div>
              {podeEscrever && !encerrada && (
                <Button variant="outline" size="xs"
                  onClick={() => { setFormaTexto(nc.eficaciaDetalhes ?? ''); setFormaPrazo(nc.eficaciaPrazo ? nc.eficaciaPrazo.slice(0, 10) : ''); setFormaAberta(true) }}>
                  {nc.eficaciaRegistrada ? 'Editar forma de avaliação' : 'Registrar forma de avaliação'}
                </Button>
              )}
            </div>

            {nc.eficaciaRegistrada && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Como será avaliada</p>
                {nc.eficaciaDetalhes && <RichContent className="text-sm [&_p]:my-1" html={nc.eficaciaDetalhes} />}
                <p className="text-[11px] text-muted-foreground mt-1">
                  {nc.eficaciaResponsavelNome ? `Definida por ${nc.eficaciaResponsavelNome}` : ''}{nc.eficaciaPrazo ? ` · Avaliar até ${dataBR(nc.eficaciaPrazo)}` : ''}
                </p>
              </div>
            )}

            {nc.eficaz != null ? (
              <div className="space-y-2">
                <Badge variant="outline" className={cn('text-[11px]', nc.eficaz
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800')}>
                  {nc.eficaz ? 'Tratamento eficaz' : 'Tratamento não eficaz'}
                </Badge>
                {nc.avaliacao && <RichContent className="text-sm [&_p]:my-1" html={nc.avaliacao} />}
                <p className="text-[11px] text-muted-foreground">
                  Avaliada{nc.avaliadoPorNomeResolvido ? ` por ${nc.avaliadoPorNomeResolvido}` : ''} em {dataBR(nc.avaliadoEm)}
                </p>
                {nc.reincidencias.length > 0 && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Gerou reincidência:{' '}
                    {nc.reincidencias.map((r, i) => (
                      <button key={r.id} type="button" className="underline decoration-dotted" onClick={() => router.push(`/nao-conformidades/${r.id}`)}>
                        {i > 0 ? ', ' : ''}NC #{r.legacyId ?? '(nova)'}
                      </button>
                    ))}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                {nc.situacao === 'AGUARDANDO_CONCLUSAO'
                  ? 'Plano concluído — registre a avaliação final pelo botão no topo.'
                  : 'A avaliação final libera quando o plano de ação estiver concluído e a forma de avaliação registrada.'}
              </p>
            )}

            {/* Pós-avaliação: atualização do sistema da qualidade */}
            {nc.eficaz != null && (
              <div className="mt-4 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Atualização do sistema da qualidade</p>
                  {podeEscrever && nc.atualizaSwot == null && (
                    <AtualizacaoSistemaButton ncId={nc.id} onDone={carregar} />
                  )}
                </div>
                {nc.atualizaSwot == null ? (
                  <p className="text-xs text-muted-foreground italic">Ainda não informado se o fechamento pede atualização da SWOT ou revisão de documentos.</p>
                ) : (
                  <div className="space-y-1 text-xs">
                    <p>SWOT: <span className="font-medium">{nc.atualizaSwot ? 'Atualizar' : 'Sem atualização'}</span>{nc.atualizaSwotDesc ? ` — ${nc.atualizaSwotDesc}` : ''}</p>
                    <p>Revisão de documentos: <span className="font-medium">{nc.atualizaRevisao ? 'Necessária' : 'Sem revisão'}</span>{nc.atualizaRevisaoDesc ? ` — ${nc.atualizaRevisaoDesc}` : ''}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Mensagens ── */}
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <MessageSquare className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Mensagens</h4>
            </div>
            {podeEscrever && (
              <div className="mb-3 space-y-2">
                <RichEditor value={msgTexto} onChange={setMsgTexto} placeholder="Escreva uma mensagem..." />
                <div className="flex justify-end">
                  <Button variant="success" size="xs" onClick={enviarMensagem} disabled={msgEnviando || richVazio(msgTexto)}>
                    {msgEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Enviar
                  </Button>
                </div>
              </div>
            )}
            {nc.mensagens.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Sem mensagens.</p>
            ) : (
              <div className="space-y-2">
                {nc.mensagens.map((m) => (
                  <div key={m.id} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <RichContent className="text-sm [&_p]:my-0.5" html={m.texto} />
                    <p className="text-[10px] text-muted-foreground mt-1">{m.autorNomeResolvido ?? '—'} · {dataHoraBR(m.criadoEm)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">
          <Card className="p-5">
            <h4 className="text-sm font-semibold mb-3">Dados do registro</h4>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Origem</dt><dd className="font-medium text-right">{nc.origem?.nome ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Registrada por</dt><dd className="font-medium text-right">{nc.registradoPorNomeResolvido ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Responsável</dt><dd className="font-medium text-right">{nc.responsavelNomeResolvido ?? '—'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Registro</dt><dd className="font-medium text-right tabular-nums">{dataBR(nc.registradoEm)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Prazo</dt><dd className="font-medium text-right tabular-nums">{dataBR(nc.prazo)}</dd></div>
            </dl>
            {nc.legacyId != null && (
              <p className="text-[11px] text-muted-foreground pt-2">Nº {nc.legacyId} no sistema antigo</p>
            )}
          </Card>

          {nc.arquivos.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-sm font-semibold">Arquivos</h4>
              </div>
              <div className="space-y-1.5">
                {nc.arquivos.map((a) => (
                  <a key={a.id} href={`${getApiUrl()}${a.path}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs hover:bg-muted/50 transition-colors">
                    <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{a.nome}</span>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Histórico</h4>
            </div>
            {nc.logs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem registros.</p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto nice-scrollbar">
                {nc.logs.map((l) => (
                  <div key={l.id} className="text-xs border-l-2 border-border pl-2.5 py-0.5">
                    <p className="font-medium">{EVENTO_LABEL[l.evento] ?? l.evento}</p>
                    <p className="text-[10px] text-muted-foreground">{l.usuarioNomeResolvido ?? '—'} · {dataHoraBR(l.criadoEm)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Modais do fluxo ── */}
      <Dialog open={causaAberta} onOpenChange={setCausaAberta}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Check} color="sky">
            <DialogTitle>Análise da causa</DialogTitle>
            <DialogDescription>Por que a não conformidade aconteceu (causa raiz).</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <RichEditor value={causaTexto} onChange={setCausaTexto} placeholder="Análise da causa..." />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCausaAberta(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarCausa} disabled={acting}><Check className="h-4 w-4" />Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={formaAberta} onOpenChange={setFormaAberta}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={ClipboardList} color="violet">
            <DialogTitle>Forma de avaliação da eficácia</DialogTitle>
            <DialogDescription>Como (e até quando) será verificado se o tratamento funcionou.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">Avaliar até</Label>
              <Input type="date" value={formaPrazo} onChange={(e) => setFormaPrazo(e.target.value)} className="h-9 text-sm mt-1.5 w-[180px]" />
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Como será avaliada</Label>
              <div className="mt-1.5"><RichEditor value={formaTexto} onChange={setFormaTexto} placeholder="Indicadores, evidências, verificação..." /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setFormaAberta(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarForma} disabled={acting}><Check className="h-4 w-4" />Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={avAberta} onOpenChange={setAvAberta}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Check} color="emerald">
            <DialogTitle>Avaliação de eficácia</DialogTitle>
            <DialogDescription>
              Tratamento NÃO eficaz abre automaticamente uma nova NC por reincidência — como no fluxo original.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="flex gap-2">
              <button type="button" onClick={() => setAvEficaz(true)}
                className={cn('flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                  avEficaz === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border-border text-muted-foreground hover:text-foreground')}>
                <ThumbsUp className="h-4 w-4" />Eficaz
              </button>
              <button type="button" onClick={() => setAvEficaz(false)}
                className={cn('flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5',
                  avEficaz === false ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400' : 'border-border text-muted-foreground hover:text-foreground')}>
                <ThumbsDown className="h-4 w-4" />Não eficaz
              </button>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Avaliação</Label>
              <div className="mt-1.5"><RichEditor value={avTexto} onChange={setAvTexto} placeholder="O que foi observado após o plano de ação..." /></div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvAberta(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarAvaliacao} disabled={acting}><Check className="h-4 w-4" />Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelAberta} onOpenChange={setCancelAberta}>
        <DialogContent>
          <DialogHeaderIcon icon={Ban} color="rose">
            <DialogTitle>Cancelar a não conformidade</DialogTitle>
            <DialogDescription>O motivo fica no histórico.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <RichEditor value={cancelMotivo} onChange={setCancelMotivo} placeholder="Por que está sendo cancelada..." />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCancelAberta(false)}><X className="h-4 w-4" />Voltar</Button>
            <Button variant="destructive" size="sm" onClick={salvarCancelamento} disabled={acting}><Ban className="h-4 w-4" />Cancelar NC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={acaoAberta} onOpenChange={setAcaoAberta}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={acaoEditando ? ClipboardList : Plus} color={acaoEditando ? 'sky' : 'emerald'}>
            <DialogTitle>{acaoEditando ? 'Editar ação' : 'Nova ação do plano'}</DialogTitle>
            <DialogDescription>O que será feito para tratar a não conformidade.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-6">
                <Label className="text-[13px] font-semibold">Tipo</Label>
                <Select value={aTipo} onValueChange={setATipo}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NC_ACAO_TIPOS.map((t) => <SelectItem key={t} value={t}>{NC_ACAO_TIPO_LABEL[t]}</SelectItem>)}
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
                <div className="mt-1.5"><RichEditor value={aDescricao} onChange={setADescricao} placeholder="O que fazer..." /></div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAcaoAberta(false)}><X className="h-4 w-4" />Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarAcao} disabled={acting}><Check className="h-4 w-4" />Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Botão + modal da atualização do sistema (SWOT / revisão de documentos). */
function AtualizacaoSistemaButton({ ncId, onDone }: { ncId: string; onDone: () => void }) {
  const [aberta, setAberta] = useState(false)
  const [swot, setSwot] = useState<boolean | null>(null)
  const [swotDesc, setSwotDesc] = useState('')
  const [rev, setRev] = useState<boolean | null>(null)
  const [revDesc, setRevDesc] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (swot === null || rev === null) { alerts.error('Responda as duas perguntas', ''); return }
    setSalvando(true)
    try {
      await (trpc.naoConformidade as any).registrarAtualizacaoSistema.mutate({
        id: ncId, atualizaSwot: swot, atualizaSwotDesc: swotDesc || null,
        atualizaRevisao: rev, atualizaRevisaoDesc: revDesc || null,
      })
      setAberta(false)
      onDone()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  const SimNao = ({ valor, onChange }: { valor: boolean | null; onChange: (v: boolean) => void }) => (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)}
        className={cn('rounded-md border px-3 py-1 text-xs font-medium', valor === true ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' : 'border-border text-muted-foreground')}>Sim</button>
      <button type="button" onClick={() => onChange(false)}
        className={cn('rounded-md border px-3 py-1 text-xs font-medium', valor === false ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400' : 'border-border text-muted-foreground')}>Não</button>
    </div>
  )

  return (
    <>
      <Button variant="outline" size="xs" onClick={() => setAberta(true)}>Registrar</Button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={ClipboardList} color="violet">
            <DialogTitle>Atualização do sistema da qualidade</DialogTitle>
            <DialogDescription>O fechamento desta NC pede alguma atualização?</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Atualizar a Análise de Contexto (SWOT)?</Label>
              <SimNao valor={swot} onChange={setSwot} />
              {swot && <Input value={swotDesc} onChange={(e) => setSwotDesc(e.target.value)} placeholder="O que atualizar..." className="h-9 text-sm" />}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Revisar algum documento?</Label>
              <SimNao valor={rev} onChange={setRev} />
              {rev && <Input value={revDesc} onChange={(e) => setRevDesc(e.target.value)} placeholder="Qual documento..." className="h-9 text-sm" />}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
