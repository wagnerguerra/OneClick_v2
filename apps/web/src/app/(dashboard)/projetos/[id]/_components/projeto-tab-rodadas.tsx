'use client'

/**
 * Aba Rodadas — o vaivém entre quem produz e quem aponta.
 *
 * O ciclo real do time: a TI entrega uma rodada, os envolvidos apontam o que
 * falta, a TI corrige e entrega a seguinte. Cada rodada guarda seus próprios
 * apontamentos, com autor e situação, então dá para responder a pergunta que
 * antes só existia na memória de alguém: "o que ficou pendente da rodada 3?".
 *
 * O autor do apontamento pode ser digitado à mão — o analista do cliente nem
 * sempre tem login, e perder o nome de quem apontou esvaziaria o registro.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Check, X, Trash2, MessageSquarePlus, PackageCheck, Undo2, ChevronDown,
} from 'lucide-react'
import {
  Button, Input, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Label,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fmtDateBR } from '@/lib/date'

type Pessoa = { id: string; name: string; image: string | null }

type Apontamento = {
  id: string
  texto: string
  situacao: 'ABERTO' | 'RESOLVIDO' | 'DESCARTADO'
  autorNome: string | null
  autor: Pessoa | null
  criadoEm: string
  resolvidoEm: string | null
  resolvidoPorUsuario: Pessoa | null
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
  apontamentos: Apontamento[]
}

const CORES_SITUACAO: Record<Apontamento['situacao'], string> = {
  ABERTO: 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  RESOLVIDO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  DESCARTADO: 'bg-muted text-muted-foreground',
}

export function ProjetoTabRodadas({ projetoId, canWrite, canDelete, corProjeto }: {
  projetoId: string; canWrite: boolean; canDelete: boolean; corProjeto: string
}) {
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [modalRodada, setModalRodada] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [formTitulo, setFormTitulo] = useState('')
  const [formEntrega, setFormEntrega] = useState('')
  // Rascunho do apontamento por rodada — cada uma tem a sua caixa de texto.
  const [rascunho, setRascunho] = useState<Record<string, { texto: string; autorNome: string }>>({})

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await (trpc.projetos as never as {
        listRodadas: { query: (i: { projetoId: string }) => Promise<Rodada[]> }
      }).listRodadas.query({ projetoId })
      setRodadas(r)
      // A rodada mais recente já abre expandida: é onde o trabalho está.
      if (r.length > 0 && abertas.size === 0) setAbertas(new Set([r[0]!.id]))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setCarregando(false) }
  // `abertas` de propósito fora: recarregar não deve fechar o que o usuário abriu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId])

  useEffect(() => { void carregar() }, [carregar])

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
        createRodada: { mutate: (i: { projetoId: string; titulo?: string | null; entregueEm?: string | null }) => Promise<unknown> }
      }).createRodada.mutate({ projetoId, titulo: formTitulo.trim() || null, entregueEm: formEntrega || null })
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
        createApontamento: { mutate: (i: { rodadaId: string; texto: string; autorNome?: string | null }) => Promise<unknown> }
      }).createApontamento.mutate({
        rodadaId,
        texto: draft.texto.trim(),
        autorNome: draft.autorNome.trim() || null,
      })
      setRascunho(r => ({ ...r, [rodadaId]: { texto: '', autorNome: draft.autorNome } }))
      await carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
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

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Rodadas e apontamentos</h2>
          <p className="text-xs text-muted-foreground">
            {rodadas.length === 0
              ? 'Cada entrega vira uma rodada; o que os envolvidos apontam fica registrado nela.'
              : <>{rodadas.length} rodada(s) · {totalAbertos} apontamento(s) em aberto</>}
          </p>
        </div>
        {canWrite && (
          <Button variant="success" size="sm" className="gap-1.5" onClick={() => setModalRodada(true)}>
            <Plus className="h-4 w-4" /> Nova rodada
          </Button>
        )}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {!carregando && rodadas.length === 0 && (
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
          const draft = rascunho[r.id] ?? { texto: '', autorNome: '' }
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
                </button>
                {canDelete && (
                  <Button variant="soft-destructive" size="icon-sm" onClick={() => void excluirRodada(r)} title="Excluir rodada">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {aberta && (
                <div className="space-y-2 border-t border-border px-4 py-3">
                  {r.apontamentos.length === 0 && (
                    <p className="py-1 text-xs italic text-muted-foreground">Nenhum apontamento nesta rodada.</p>
                  )}

                  {r.apontamentos.map(a => (
                    <div key={a.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('min-w-0 whitespace-pre-wrap text-sm', a.situacao !== 'ABERTO' && 'text-muted-foreground line-through')}>
                          {a.texto}
                        </p>
                        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', CORES_SITUACAO[a.situacao])}>
                          {a.situacao === 'ABERTO' ? 'Aberto' : a.situacao === 'RESOLVIDO' ? 'Resolvido' : 'Descartado'}
                        </span>
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
                        onChange={e => setRascunho(s => ({ ...s, [r.id]: { ...draft, texto: e.target.value } }))}
                        placeholder="O que foi apontado nesta rodada?"
                        className="min-h-[60px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={draft.autorNome}
                          onChange={e => setRascunho(s => ({ ...s, [r.id]: { ...draft, autorNome: e.target.value } }))}
                          placeholder="Quem apontou (vazio = você)"
                          className="h-9 max-w-[260px] text-sm"
                        />
                        <Button size="sm" className="gap-1.5" disabled={!draft.texto.trim()} onClick={() => void adicionarApontamento(r.id)}>
                          <MessageSquarePlus className="h-4 w-4" /> Registrar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

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
