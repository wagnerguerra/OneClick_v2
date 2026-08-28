'use client'

/**
 * Aba Rodadas — o vaivém entre quem produz e quem aponta.
 *
 * O ciclo real do time: a TI entrega uma rodada, os envolvidos apontam o que
 * falta, a TI corrige e entrega a seguinte. Cada rodada guarda seus próprios
 * apontamentos, conversa e arquivos, com autor e data — então dá para responder
 * a pergunta que antes só existia na memória de alguém: "o que ficou pendente
 * da rodada 3, e por que ela travou?".
 *
 * Um apontamento pode ser IMPEDITIVO: não é "falta ajustar", é "não dá para
 * continuar". Enquanto houver um em aberto, a rodada aparece travada — o
 * backend manda essa conclusão pronta, a tela só a exibe.
 *
 * O autor pode ser digitado à mão — o analista do cliente nem sempre tem login,
 * e perder o nome de quem apontou esvaziaria o registro.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Check, X, Trash2, MessageSquarePlus, PackageCheck, Undo2, ChevronDown, Layers,
  MessageSquare, Paperclip, Download, FileText, Image as ImageIcon, Send, AlertOctagon, Gauge,
} from 'lucide-react'
import {
  Button, Input, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Label,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { AnexosDropzone, type AnexoStaged } from '../../../helpdesk/_components/anexos-dropzone'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fmtDateBR } from '@/lib/date'

type Pessoa = { id: string; name: string; image: string | null }

type Apontamento = {
  id: string
  texto: string
  situacao: 'ABERTO' | 'RESOLVIDO' | 'DESCARTADO'
  impeditivo: boolean
  autorNome: string | null
  autor: Pessoa | null
  criadoEm: string
  resolvidoEm: string | null
  resolvidoPorUsuario: Pessoa | null
}

type MensagemRodada = {
  id: string
  texto: string
  autorNome: string | null
  autor: Pessoa | null
  criadoEm: string
}

type ArquivoRodada = {
  id: string
  nome: string
  url: string
  mimeType: string | null
  tamanho: number
  criadoEm: string
  enviadoPorUsuario: Pessoa | null
}

type Rodada = {
  id: string
  numero: number
  titulo: string | null
  descricao: string | null
  entregueEm: string | null
  criadoEm: string
  criadoPorUsuario: Pessoa | null
  abertos: number
  /** Impeditivos em aberto — vem calculado do backend. */
  impedimentos: number
  travada: boolean
  apontamentos: Apontamento[]
  mensagens: MensagemRodada[]
  arquivos: ArquivoRodada[]
}

type SubAba = 'apontamentos' | 'mensagens' | 'arquivos'

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

const CORES_SITUACAO: Record<Apontamento['situacao'], string> = {
  ABERTO: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  RESOLVIDO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  DESCARTADO: 'bg-muted text-muted-foreground',
}

type ExecucaoRef = { id: string; titulo: string | null; progresso: number; cliente: { razaoSocial: string; nomeFantasia: string | null } | null }

export function ProjetoTabRodadas({ projetoId, canWrite, canDelete, corProjeto, execucaoInicial }: {
  projetoId: string; canWrite: boolean; canDelete: boolean; corProjeto: string
  /** Frente vinda do card da aba Envolvidos — abre já selecionada. */
  execucaoInicial?: string | null
}) {
  // As rodadas pertencem a uma EXECUÇÃO, não ao projeto: cada frente tem seu
  // próprio ciclo, e a de número 1 de uma nada tem a ver com a da outra.
  const [execucoes, setExecucoes] = useState<ExecucaoRef[]>([])
  const [execucaoId, setExecucaoId] = useState<string>('')
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [modalRodada, setModalRodada] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [formTitulo, setFormTitulo] = useState('')
  const [formEntrega, setFormEntrega] = useState('')
  // Rascunho do apontamento por rodada — cada uma tem a sua caixa de texto.
  const [rascunho, setRascunho] = useState<Record<string, { texto: string; autorNome: string; impeditivo: boolean }>>({})
  // Rascunho da conversa, também por rodada.
  const [conversa, setConversa] = useState<Record<string, { texto: string; autorNome: string }>>({})
  // Sub-aba escolhida dentro de cada rodada; apontamentos é o padrão.
  const [subAba, setSubAba] = useState<Record<string, SubAba>>({})
  const [staged, setStaged] = useState<Record<string, AnexoStaged[]>>({})
  const [modalProgresso, setModalProgresso] = useState(false)
  const [formProgresso, setFormProgresso] = useState(0)

  const carregar = useCallback(async () => {
    if (!execucaoId) { setRodadas([]); setCarregando(false); return }
    setCarregando(true)
    try {
      const r = await (trpc.projetos as never as {
        listRodadas: { query: (i: { execucaoId: string }) => Promise<Rodada[]> }
      }).listRodadas.query({ execucaoId })
      setRodadas(r)
      // A rodada mais recente já abre expandida: é onde o trabalho está.
      if (r.length > 0 && abertas.size === 0) setAbertas(new Set([r[0]!.id]))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setCarregando(false) }
  // `abertas` de propósito fora: recarregar não deve fechar o que o usuário abriu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [execucaoId])

  // Lista de frentes; a primeira já vem selecionada.
  useEffect(() => {
    void (async () => {
      try {
        const r = await (trpc.projetos as never as {
          listExecucoes: { query: (i: { projetoId: string }) => Promise<ExecucaoRef[]> }
        }).listExecucoes.query({ projetoId })
        setExecucoes(r)
        if (r.length > 0) setExecucaoId(atual => atual || r[0]!.id)
        else setCarregando(false)

      } catch (e) { alerts.error('Erro', (e as Error).message); setCarregando(false) }
    })()
  }, [projetoId])

  // Quem chegou pelo card de uma frente já cai nela, mesmo trocando de aba
  // e voltando: o pedido vem no prop e vence a seleção anterior.
  useEffect(() => { if (execucaoInicial) setExecucaoId(execucaoInicial) }, [execucaoInicial])

  useEffect(() => { void carregar() }, [carregar])

  // Arquivo que chegou a `ready` já subiu para o servidor; falta amarrá-lo à
  // rodada. Mesmo desenho dos anexos do projeto.
  useEffect(() => {
    const pendente = Object.entries(staged).find(([, lista]) => lista.some(a => a.status === 'ready'))
    if (!pendente) return
    const [rodadaId, lista] = pendente
    const prontos = lista.filter(a => a.status === 'ready')
    void (async () => {
      try {
        for (const a of prontos) {
          await (trpc.projetos as never as {
            addRodadaArquivo: { mutate: (i: { rodadaId: string; nome: string; url: string; tamanho: number; mimeType?: string | null }) => Promise<unknown> }
          }).addRodadaArquivo.mutate({
            rodadaId, nome: a.fileName, url: a.fileUrl, tamanho: a.tamanho, mimeType: a.mimeType ?? null,
          })
        }
        setStaged(st => ({ ...st, [rodadaId]: [] }))
        await carregar()
      } catch (e) { alerts.error('Erro ao anexar', (e as Error).message) }
    })()
  }, [staged, carregar])

  function alternar(id: string) {
    setAbertas(atual => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  async function criarRodada() {
    setSalvando(true)
    try {
      await (trpc.projetos as never as {
        createRodada: { mutate: (i: { execucaoId: string; titulo?: string | null; entregueEm?: string | null }) => Promise<unknown> }
      }).createRodada.mutate({ execucaoId, titulo: formTitulo.trim() || null, entregueEm: formEntrega || null })
      setModalRodada(false)
      setFormTitulo(''); setFormEntrega('')
      await carregar()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function adicionarApontamento(rodadaId: string) {
    const draft = rascunho[rodadaId]
    if (!draft?.texto.trim()) return
    try {
      await (trpc.projetos as never as {
        createApontamento: { mutate: (i: { rodadaId: string; texto: string; autorNome?: string | null; impeditivo?: boolean }) => Promise<unknown> }
      }).createApontamento.mutate({
        rodadaId,
        texto: draft.texto.trim(),
        autorNome: draft.autorNome.trim() || null,
        impeditivo: draft.impeditivo,
      })
      // O nome de quem aponta se repete numa sequência; o texto e a marca de
      // impedimento, não.
      setRascunho(r => ({ ...r, [rodadaId]: { texto: '', autorNome: draft.autorNome, impeditivo: false } }))
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function alternarImpeditivo(a: Apontamento) {
    try {
      await (trpc.projetos as never as {
        updateApontamento: { mutate: (i: { id: string; data: { impeditivo: boolean } }) => Promise<unknown> }
      }).updateApontamento.mutate({ id: a.id, data: { impeditivo: !a.impeditivo } })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function enviarMensagem(rodadaId: string) {
    const draft = conversa[rodadaId]
    if (!draft?.texto.trim()) return
    try {
      await (trpc.projetos as never as {
        createRodadaMensagem: { mutate: (i: { rodadaId: string; texto: string; autorNome?: string | null }) => Promise<unknown> }
      }).createRodadaMensagem.mutate({
        rodadaId,
        texto: draft.texto.trim(),
        autorNome: draft.autorNome.trim() || null,
      })
      setConversa(c => ({ ...c, [rodadaId]: { texto: '', autorNome: draft.autorNome } }))
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluirMensagem(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir mensagem?', text: 'Não dá para desfazer.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.projetos as never as { deleteRodadaMensagem: { mutate: (i: { id: string }) => Promise<unknown> } })
        .deleteRodadaMensagem.mutate({ id })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluirArquivo(id: string) {
    const ok = await alerts.confirm({ title: 'Remover arquivo?', text: 'Ele será desvinculado da rodada.', confirmText: 'Remover' })
    if (!ok) return
    try {
      await (trpc.projetos as never as { removerRodadaArquivo: { mutate: (i: { id: string }) => Promise<unknown> } })
        .removerRodadaArquivo.mutate({ id })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function salvarProgresso() {
    setSalvando(true)
    try {
      await (trpc.projetos as never as {
        updateExecucao: { mutate: (i: { id: string; data: { progresso: number } }) => Promise<unknown> }
      }).updateExecucao.mutate({ id: execucaoId, data: { progresso: formProgresso } })
      setExecucoes(es => es.map(e => e.id === execucaoId ? { ...e, progresso: formProgresso } : e))
      setModalProgresso(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function mudarSituacao(id: string, situacao: Apontamento['situacao']) {
    try {
      await (trpc.projetos as never as {
        updateApontamento: { mutate: (i: { id: string; data: { situacao: string } }) => Promise<unknown> }
      }).updateApontamento.mutate({ id, data: { situacao } })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluirApontamento(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir apontamento?', text: 'Não dá para desfazer.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.projetos as never as { deleteApontamento: { mutate: (i: { id: string }) => Promise<unknown> } })
        .deleteApontamento.mutate({ id })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function excluirRodada(r: Rodada) {
    const ok = await alerts.confirm({
      title: `Excluir a rodada ${r.numero}?`,
      text: r.apontamentos.length > 0
        ? `Os ${r.apontamentos.length} apontamento(s) dela vão junto.`
        : 'Não dá para desfazer.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.projetos as never as { deleteRodada: { mutate: (i: { id: string }) => Promise<unknown> } })
        .deleteRodada.mutate({ id: r.id })
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalAbertos = rodadas.reduce((n, r) => n + r.abertos, 0)
  const totalTravadas = rodadas.filter(r => r.travada).length
  const execucaoAtual = execucoes.find(e => e.id === execucaoId) ?? null

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Rodadas e apontamentos</h2>
          <p className="text-xs text-muted-foreground">
            {rodadas.length === 0
              ? 'Cada entrega vira uma rodada; o que os envolvidos apontam fica registrado nela.'
              : <>
                  {rodadas.length} rodada(s) · {totalAbertos} apontamento(s) em aberto
                  {totalTravadas > 0 && <> · <span className="font-semibold text-rose-600 dark:text-rose-400">{totalTravadas} travada(s)</span></>}
                </>}
          </p>
        </div>
        {canWrite && execucoes.length > 0 && (
          <Button variant="success" size="sm" className="gap-1.5" onClick={() => setModalRodada(true)}>
            <Plus className="h-4 w-4" /> Nova rodada
          </Button>
        )}
      </div>

      {/* Seletor de frente — sem escolher uma, não há rodada que faça sentido */}
      {execucoes.length > 0 && (
        <div className="nice-scrollbar mb-4 flex gap-1.5 overflow-x-auto pb-1">
          {execucoes.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => setExecucaoId(e.id)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                execucaoId === e.id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              {e.titulo || e.cliente?.nomeFantasia || e.cliente?.razaoSocial || 'Sem nome'}
            </button>
          ))}
        </div>
      )}

      {/* Quanto da frente já está pronto. É informado, não deduzido: rodada
          entregue não quer dizer etapa concluída. */}
      {execucaoAtual && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-2.5">
          <Gauge className="h-4 w-4 shrink-0" style={{ color: corProjeto }} />
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Conclusão desta frente
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-foreground">{execucaoAtual.progresso}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{ width: `${execucaoAtual.progresso}%`, backgroundColor: corProjeto }}
              />
            </div>
          </div>
          {canWrite && (
            <Button
              variant="outline" size="sm" className="shrink-0"
              onClick={() => { setFormProgresso(execucaoAtual.progresso); setModalProgresso(true) }}
            >
              Informar
            </Button>
          )}
        </div>
      )}

      {execucoes.length === 0 && !carregando && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Layers className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Crie uma execução na aba Envolvidos — as rodadas pertencem a uma frente de trabalho.
          </p>
        </div>
      )}

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {!carregando && execucoes.length > 0 && rodadas.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <PackageCheck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhuma rodada ainda.{canWrite ? ' Crie a primeira quando entregar algo para avaliação.' : ''}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {rodadas.map(r => {
          const aberta = abertas.has(r.id)
          const aba = subAba[r.id] ?? 'apontamentos'
          const draft = rascunho[r.id] ?? { texto: '', autorNome: '', impeditivo: false }
          const fala = conversa[r.id] ?? { texto: '', autorNome: '' }
          return (
            <div key={r.id} className="rounded-xl border border-border">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <button type="button" onClick={() => alternar(r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !aberta && '-rotate-90')} />
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                    style={{ backgroundColor: corProjeto }}
                  >
                    Rodada {r.numero}
                  </span>
                  {r.titulo && <span className="truncate text-[13px] font-medium text-foreground">{r.titulo}</span>}
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {r.entregueEm ? `entregue em ${fmtDateBR(r.entregueEm)}` : 'em produção'}
                  </span>
                  {r.abertos > 0 && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">{r.abertos} em aberto</Badge>
                  )}
                  {r.travada && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-500/15 dark:text-rose-300">
                      <AlertOctagon className="h-3 w-3" />
                      Travada
                    </span>
                  )}
                </button>
                {canDelete && (
                  <Button variant="soft-destructive" size="icon-sm" onClick={() => void excluirRodada(r)} title="Excluir rodada">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {aberta && (
                <div className="border-t border-border">
                  {/* Três coisas convivem numa rodada: o que foi apontado, o que
                      se conversou e o que foi trocado de arquivo. Separadas em
                      sub-abas, cada uma se lê inteira. */}
                  <div className="flex items-center gap-1 border-b border-border px-3 py-2">
                    {([
                      { chave: 'apontamentos' as SubAba, rotulo: 'Apontamentos', n: r.apontamentos.length, Icone: MessageSquarePlus },
                      { chave: 'mensagens' as SubAba, rotulo: 'Mensagens', n: r.mensagens.length, Icone: MessageSquare },
                      { chave: 'arquivos' as SubAba, rotulo: 'Arquivos', n: r.arquivos.length, Icone: Paperclip },
                    ]).map(({ chave, rotulo, n, Icone }) => (
                      <button
                        key={chave}
                        type="button"
                        onClick={() => setSubAba(sa => ({ ...sa, [r.id]: chave }))}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          aba === chave ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <Icone className="h-3.5 w-3.5" />
                        {rotulo}
                        {n > 0 && <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums">{n}</span>}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 px-4 py-3">
                    {/* ── Apontamentos ── */}
                    {aba === 'apontamentos' && (
                      <>
                        {r.apontamentos.length === 0 && (
                          <p className="py-1 text-xs italic text-muted-foreground">Nenhum apontamento nesta rodada.</p>
                        )}

                        {r.apontamentos.map(a => (
                          <div
                            key={a.id}
                            className={cn(
                              'rounded-lg border px-3 py-2',
                              a.impeditivo && a.situacao === 'ABERTO'
                                ? 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10'
                                : 'border-border bg-muted/20',
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn('min-w-0 whitespace-pre-wrap text-sm', a.situacao !== 'ABERTO' && 'text-muted-foreground line-through')}>
                                {a.texto}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                {a.impeditivo && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
                                    <AlertOctagon className="h-3 w-3" /> Impeditivo
                                  </span>
                                )}
                                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', CORES_SITUACAO[a.situacao])}>
                                  {a.situacao === 'ABERTO' ? 'Aberto' : a.situacao === 'RESOLVIDO' ? 'Resolvido' : 'Descartado'}
                                </span>
                              </div>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[11px] text-muted-foreground">
                                {a.autor?.name || a.autorNome || 'Autor não informado'} · {fmtDateBR(a.criadoEm)}
                                {a.situacao === 'RESOLVIDO' && a.resolvidoEm && (
                                  <> · resolvido por {a.resolvidoPorUsuario?.name ?? 'alguém'} em {fmtDateBR(a.resolvidoEm)}</>
                                )}
                              </p>
                              {canWrite && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant={a.impeditivo ? 'soft-destructive' : 'outline'} size="icon-sm"
                                    title={a.impeditivo ? 'Deixar de ser impeditivo' : 'Marcar como impeditivo'}
                                    onClick={() => void alternarImpeditivo(a)}
                                  >
                                    <AlertOctagon className="h-4 w-4" />
                                  </Button>
                                  {a.situacao === 'ABERTO' ? (
                                    <>
                                      <Button variant="soft" size="icon-sm" title="Marcar como resolvido" onClick={() => void mudarSituacao(a.id, 'RESOLVIDO')}>
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button variant="outline" size="icon-sm" title="Descartar" onClick={() => void mudarSituacao(a.id, 'DESCARTADO')}>
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </>
                                  ) : (
                                    <Button variant="outline" size="icon-sm" title="Reabrir" onClick={() => void mudarSituacao(a.id, 'ABERTO')}>
                                      <Undo2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button variant="soft-destructive" size="icon-sm" title="Excluir" onClick={() => void excluirApontamento(a.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        {canWrite && (
                          <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
                            <textarea
                              value={draft.texto}
                              onChange={e => setRascunho(st => ({ ...st, [r.id]: { ...draft, texto: e.target.value } }))}
                              placeholder="O que foi apontado nesta rodada?"
                              className="min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={draft.autorNome}
                                onChange={e => setRascunho(st => ({ ...st, [r.id]: { ...draft, autorNome: e.target.value } }))}
                                placeholder="Quem apontou (vazio = você)"
                                className="h-9 max-w-[260px] text-sm"
                              />
                              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={draft.impeditivo}
                                  onChange={e => setRascunho(st => ({ ...st, [r.id]: { ...draft, impeditivo: e.target.checked } }))}
                                  className="h-3.5 w-3.5 accent-rose-600"
                                />
                                Impediu a rodada
                              </label>
                              <Button size="sm" className="gap-1.5" disabled={!draft.texto.trim()} onClick={() => void adicionarApontamento(r.id)}>
                                <MessageSquarePlus className="h-4 w-4" /> Registrar
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Mensagens ── */}
                    {aba === 'mensagens' && (
                      <>
                        {r.mensagens.length === 0 && (
                          <p className="py-1 text-xs italic text-muted-foreground">Nenhuma mensagem nesta rodada.</p>
                        )}

                        {r.mensagens.map(m => (
                          <div key={m.id} className="group/msg rounded-lg border border-border bg-muted/20 px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 whitespace-pre-wrap text-sm text-foreground">{m.texto}</p>
                              {canDelete && (
                                <button
                                  type="button" title="Excluir mensagem" onClick={() => void excluirMensagem(m.id)}
                                  className="hidden shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive group-hover/msg:block"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {m.autor?.name || m.autorNome || 'Autor não informado'} · {fmtDateBR(m.criadoEm)}
                            </p>
                          </div>
                        ))}

                        {canWrite && (
                          <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
                            <textarea
                              value={fala.texto}
                              onChange={e => setConversa(st => ({ ...st, [r.id]: { ...fala, texto: e.target.value } }))}
                              placeholder="Escreva uma mensagem sobre esta rodada…"
                              className="min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                value={fala.autorNome}
                                onChange={e => setConversa(st => ({ ...st, [r.id]: { ...fala, autorNome: e.target.value } }))}
                                placeholder="Quem falou (vazio = você)"
                                className="h-9 max-w-[260px] text-sm"
                              />
                              <Button size="sm" className="gap-1.5" disabled={!fala.texto.trim()} onClick={() => void enviarMensagem(r.id)}>
                                <Send className="h-4 w-4" /> Enviar
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* ── Arquivos ── */}
                    {aba === 'arquivos' && (
                      <>
                        {r.arquivos.length === 0 && (
                          <p className="py-1 text-xs italic text-muted-foreground">Nenhum arquivo nesta rodada.</p>
                        )}

                        {r.arquivos.map(f => {
                          const ehImagem = (f.mimeType ?? '').startsWith('image/')
                          return (
                            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted">
                                {ehImagem
                                  ? <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                  : <FileText className="h-4 w-4 text-muted-foreground" />}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium text-foreground">{f.nome}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {fmtBytes(f.tamanho)} · {f.enviadoPorUsuario?.name ?? 'alguém'} · {fmtDateBR(f.criadoEm)}
                                </p>
                              </div>
                              <a
                                href={f.url} download={f.nome} target="_blank" rel="noopener noreferrer"
                                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title="Baixar"
                              >
                                <Download className="h-4 w-4" />
                              </a>
                              {canDelete && (
                                <button
                                  type="button" title="Remover" onClick={() => void excluirArquivo(f.id)}
                                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )
                        })}

                        {canWrite && (
                          <AnexosDropzone
                            value={staged[r.id] ?? []}
                            onChange={lista => setStaged(st => ({ ...st, [r.id]: lista }))}
                            compact
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Percentual da frente — informado à mão, de propósito */}
      <Dialog open={modalProgresso} onOpenChange={setModalProgresso}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeaderIcon icon={Gauge} color="sky">
            <DialogTitle>Conclusão da frente</DialogTitle>
            <DialogDescription>
              Quanto desta execução já está pronto, na avaliação de quem a conduz.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="range" min={0} max={100} step={5}
                value={formProgresso}
                onChange={e => setFormProgresso(Number(e.target.value))}
                className="h-2 flex-1 cursor-pointer accent-current"
                style={{ color: corProjeto }}
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number" min={0} max={100}
                  value={formProgresso}
                  onChange={e => setFormProgresso(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                  className="h-9 w-[74px] text-sm tabular-nums"
                />
                <span className="text-sm font-semibold text-muted-foreground">%</span>
              </div>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${formProgresso}%`, backgroundColor: corProjeto }} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalProgresso(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => void salvarProgresso()} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalRodada} onOpenChange={setModalRodada}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Nova rodada</DialogTitle>
            <DialogDescription>
              O número é sequencial e vem sozinho. A data de entrega pode ficar em branco enquanto a rodada está em produção.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Título</Label>
              <Input
                value={formTitulo}
                onChange={e => setFormTitulo(e.target.value)}
                placeholder="Ex.: Apuração de ICMS — primeira versão"
                className="h-9 text-sm"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Entregue em</Label>
              <Input type="date" value={formEntrega} onChange={e => setFormEntrega(e.target.value)} className="h-9 max-w-[200px] text-sm" />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalRodada(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => void criarRodada()} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar rodada
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
