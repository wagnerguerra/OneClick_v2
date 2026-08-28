'use client'

/**
 * Aba Envolvidos — as frentes de trabalho do projeto, em fluxograma.
 *
 * Um projeto roda VÁRIAS execuções ao mesmo tempo: a ferramenta é a mesma, mas
 * cada cliente tem seu ciclo e seu time. Por isso o ramo começa no cliente:
 *
 *     CLIENTE → responsável da execução → executantes → colaboradores
 *
 * O responsável da execução é outra pessoa que o responsável do projeto — um
 * responde pela frente, o outro pelo todo. O do projeto fica no hero, acima.
 *
 * Tudo se edita aqui: o + de cada faixa inclui, o × na caixa remove.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Building2, Users, UserCog, Handshake, X, Plus, Loader2, Search, Check,
  Layers, Trash2, Pencil,
} from 'lucide-react'
import {
  Button, Card, Input, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Label,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { resolveAssetUrl } from '@/lib/api-url'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Papel = 'EXECUTANTE' | 'COLABORADOR'
type Pessoa = { id: string; name: string; image: string | null; papel?: string }
type ClienteRef = { id: string; razaoSocial: string; nomeFantasia: string | null }

type Execucao = {
  id: string
  titulo: string | null
  ativa: boolean
  cliente: ClienteRef | null
  responsavel: { id: string; name: string; image: string | null } | null
  participantes: Pessoa[]
  _count: { rodadas: number }
}

function Avatar({ nome, image }: { nome: string; image: string | null }) {
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveAssetUrl(image)} alt={nome} className="h-9 w-9 shrink-0 rounded-full border border-background object-cover" />
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#5ea3cb] text-xs font-bold text-white">
      {iniciais || '?'}
    </span>
  )
}

function Caixa({ children, destaque, cor, aoRemover, titulo }: {
  children: React.ReactNode; destaque?: boolean; cor?: string; aoRemover?: () => void; titulo?: string
}) {
  return (
    <div
      className={cn(
        'group/caixa relative flex min-w-[186px] max-w-[240px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm',
        destaque ? 'border-transparent' : 'border-border',
      )}
      style={destaque && cor ? { boxShadow: `0 0 0 2px ${cor}` } : undefined}
      title={titulo}
    >
      {children}
      {aoRemover && (
        <button
          type="button" onClick={aoRemover} title="Remover"
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-rose-500 hover:text-white group-hover/caixa:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/** Um degrau do fluxograma: haste, faixa com o nome e as caixas. */
function Degrau({ titulo, icone: Icone, cor, vazio, quantidade, aoAdicionar, children }: {
  titulo: string; icone: typeof Users; cor: string; vazio: string; quantidade: number
  aoAdicionar?: () => void; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="h-4 w-px bg-border" />
      <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5">
        <Icone className="h-3 w-3" style={{ color: cor }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">{titulo}</span>
        <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{quantidade}</span>
        {aoAdicionar && (
          <button type="button" onClick={aoAdicionar} title={`Adicionar em ${titulo}`}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {quantidade === 0
        ? <p className="pb-0.5 text-xs italic text-muted-foreground">{vazio}</p>
        : <div className="flex flex-wrap justify-center gap-2.5">{children}</div>}
    </div>
  )
}

/**
 * A busca é do SERVIDOR, não da lista em memória: são mais de mil clientes
 * mensais e a rota devolve os primeiros 50. Filtrar só o que já chegou fazia
 * o cliente da letra G sumir — ele nunca esteve na página carregada.
 */
function ModalEscolha({ open, onOpenChange, titulo, descricao, opcoes, jaDentro, aoConfirmar, aoBuscar, buscando, salvando, unico }: {
  open: boolean; onOpenChange: (o: boolean) => void
  titulo: string; descricao: string
  opcoes: Array<{ id: string; rotulo: string; complemento?: string }>
  jaDentro: Set<string>
  aoConfirmar: (ids: string[]) => void
  aoBuscar: (termo: string) => void
  buscando: boolean
  salvando: boolean
  unico?: boolean
}) {
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>([])
  useEffect(() => { if (!open) { setBusca(''); setMarcados([]) } }, [open])

  const termo = busca.trim()

  // Ao abrir, carrega a primeira página; digitando, consulta com 350ms de folga.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => aoBuscar(termo), termo ? 350 : 0)
    return () => clearTimeout(t)
  }, [open, termo, aoBuscar])

  const candidatos = opcoes.filter(o => !jaDentro.has(o.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeaderIcon icon={Plus} color="emerald">
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar…" className="h-9 pl-8 text-sm" />
          </div>
          <div className="nice-scrollbar max-h-[280px] space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
            {buscando && (
              <p className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…
              </p>
            )}
            {!buscando && candidatos.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {termo
                  ? `Nada encontrado para “${termo}”.`
                  : opcoes.length === 0 ? 'Nada disponível.' : 'Todos já estão aqui.'}
              </p>
            )}
            {candidatos.map(o => {
              const marcado = marcados.includes(o.id)
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-muted/60">
                  <input
                    type={unico ? 'radio' : 'checkbox'}
                    name={unico ? 'escolha-unica' : undefined}
                    checked={marcado}
                    onChange={() => setMarcados(a => unico ? [o.id] : marcado ? a.filter(i => i !== o.id) : [...a, o.id])}
                    className="h-3.5 w-3.5 accent-current"
                  />
                  <span className="min-w-0 truncate">{o.rotulo}</span>
                  {o.complemento && <span className="truncate text-[11px] text-muted-foreground">{o.complemento}</span>}
                </label>
              )
            })}
          </div>
          {!termo && (
            <p className="text-[11px] text-muted-foreground">
              Lista parcial — digite para buscar em toda a base.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" disabled={marcados.length === 0 || salvando} onClick={() => aoConfirmar(marcados)}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar {!unico && marcados.length > 0 && `(${marcados.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjetoTabEnvolvidos({ projetoId, corProjeto, canWrite, canDelete }: {
  projetoId: string; corProjeto: string; canWrite: boolean; canDelete: boolean
}) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [pessoas, setPessoas] = useState<Array<{ id: string; name: string; image: string | null }>>([])
  const [clientes, setClientes] = useState<ClienteRef[]>([])
  const [escolha, setEscolha] = useState<{ tipo: Papel | 'CLIENTE' | 'RESPONSAVEL'; execucaoId: string } | null>(null)
  const [modalNova, setModalNova] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await (trpc.projetos as never as {
        listExecucoes: { query: (i: { projetoId: string }) => Promise<Execucao[]> }
      }).listExecucoes.query({ projetoId })
      setExecucoes(r)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setCarregando(false) }
  }, [projetoId])

  useEffect(() => { void carregar() }, [carregar])

  // Cada modal busca a sua lista no servidor — ver o comentário do ModalEscolha.
  const buscarPessoas = useCallback(async (termo: string) => {
    setBuscando(true)
    try {
      const ps = await (trpc.projetos as never as {
        listPessoas: { query: (i?: { busca?: string }) => Promise<Array<{ id: string; name: string; image: string | null }>> }
      }).listPessoas.query(termo ? { busca: termo } : undefined)
      setPessoas(ps)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setBuscando(false) }
  }, [])

  const buscarClientes = useCallback(async (termo: string) => {
    setBuscando(true)
    try {
      const cs = await (trpc.projetos as never as {
        listClientesVinculaveis: { query: (i?: { busca?: string }) => Promise<ClienteRef[]> }
      }).listClientesVinculaveis.query(termo ? { busca: termo } : undefined)
      setClientes(cs)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setBuscando(false) }
  }, [])

  function abrir(tipo: Papel | 'CLIENTE' | 'RESPONSAVEL', execucaoId: string) {
    setEscolha({ tipo, execucaoId })
  }

  async function salvarExecucao(id: string, dados: Record<string, unknown>) {
    setSalvando(true)
    try {
      await (trpc.projetos as never as {
        updateExecucao: { mutate: (i: { id: string; data: Record<string, unknown> }) => Promise<unknown> }
      }).updateExecucao.mutate({ id, data: dados })
      setEscolha(null)
      await carregar()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function criarExecucao() {
    setSalvando(true)
    try {
      await (trpc.projetos as never as {
        createExecucao: { mutate: (i: { projetoId: string; titulo?: string | null }) => Promise<unknown> }
      }).createExecucao.mutate({ projetoId, titulo: novoTitulo.trim() || null })
      setModalNova(false); setNovoTitulo('')
      await carregar()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function excluirExecucao(e: Execucao) {
    const ok = await alerts.confirm({
      title: 'Excluir esta execução?',
      text: e._count.rodadas > 0
        ? `As ${e._count.rodadas} rodada(s) dela e os apontamentos vão junto.`
        : 'Não dá para desfazer.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.projetos as never as { deleteExecucao: { mutate: (i: { id: string }) => Promise<unknown> } })
        .deleteExecucao.mutate({ id: e.id })
      await carregar()
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const listaTime = (e: Execucao): Array<{ userId: string; papel: Papel }> =>
    e.participantes.map(p => ({ userId: p.id, papel: (p.papel === 'COLABORADOR' ? 'COLABORADOR' : 'EXECUTANTE') as Papel }))

  const execucaoAtual = execucoes.find(e => e.id === escolha?.execucaoId) ?? null

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Execuções e envolvidos</h2>
          <p className="text-xs text-muted-foreground">
            Cada frente tem seu cliente, seu responsável e seu time — e roda em paralelo às outras.
            {canWrite && ' O + de cada faixa inclui; o × na caixa remove.'}
          </p>
        </div>
        {canWrite && (
          <Button variant="success" size="sm" className="gap-1.5" onClick={() => setModalNova(true)}>
            <Plus className="h-4 w-4" /> Nova execução
          </Button>
        )}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {!carregando && execucoes.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Layers className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Nenhuma execução ainda.{canWrite ? ' Crie uma por cliente atendido.' : ''}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {execucoes.map(e => {
          const executantes = e.participantes.filter(p => (p.papel ?? 'EXECUTANTE') === 'EXECUTANTE')
          const colaboradores = e.participantes.filter(p => p.papel === 'COLABORADOR')
          return (
            <div key={e.id} className="rounded-xl border border-border p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-semibold text-foreground">
                  {e.titulo || e.cliente?.nomeFantasia || e.cliente?.razaoSocial || 'Execução sem nome'}
                  {e._count.rodadas > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {e._count.rodadas} rodada{e._count.rodadas === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
                {canDelete && (
                  <Button variant="soft-destructive" size="icon-sm" title="Excluir execução" onClick={() => void excluirExecucao(e)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex flex-col items-center">
                {/* 1 — o cliente encabeça o ramo */}
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-0.5">
                  <Building2 className="h-3 w-3" style={{ color: corProjeto }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground">Cliente</span>
                  {canWrite && (
                    <button type="button" onClick={() => abrir('CLIENTE', e.id)} title="Definir cliente"
                      className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
                {e.cliente ? (
                  <Caixa destaque cor={corProjeto} titulo={e.cliente.razaoSocial}
                    aoRemover={canWrite ? () => void salvarExecucao(e.id, { clienteId: null }) : undefined}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-foreground">{e.cliente.nomeFantasia || e.cliente.razaoSocial}</p>
                      {e.cliente.nomeFantasia && <p className="truncate text-[11px] text-muted-foreground">{e.cliente.razaoSocial}</p>}
                    </div>
                  </Caixa>
                ) : (
                  <button type="button" disabled={!canWrite} onClick={() => abrir('CLIENTE', e.id)}
                    className="flex min-w-[186px] items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs italic text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-default">
                    <Building2 className="h-4 w-4" /> Sem cliente definido
                  </button>
                )}

                {/* 2 — responsável DESTA execução */}
                <Degrau
                  titulo="Responsável da execução" icone={UserCog} cor={corProjeto}
                  quantidade={e.responsavel ? 1 : 0} vazio="Sem responsável nesta frente"
                  aoAdicionar={canWrite ? () => abrir('RESPONSAVEL', e.id) : undefined}
                >
                  {e.responsavel && (
                    <Caixa aoRemover={canWrite ? () => void salvarExecucao(e.id, { responsavelId: null }) : undefined}>
                      <Avatar nome={e.responsavel.name} image={e.responsavel.image} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-foreground">{e.responsavel.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">Responde por esta frente</p>
                      </div>
                    </Caixa>
                  )}
                </Degrau>

                {/* 3 — executantes */}
                <Degrau
                  titulo="Executantes" icone={Users} cor={corProjeto}
                  quantidade={executantes.length} vazio="Ninguém executando ainda"
                  aoAdicionar={canWrite ? () => abrir('EXECUTANTE', e.id) : undefined}
                >
                  {executantes.map(p => (
                    <Caixa key={p.id} aoRemover={canWrite ? () => void salvarExecucao(e.id, { participantes: listaTime(e).filter(x => x.userId !== p.id) }) : undefined}>
                      <Avatar nome={p.name} image={p.image} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                        {canWrite ? (
                          <button type="button"
                            onClick={() => void salvarExecucao(e.id, { participantes: listaTime(e).map(x => x.userId === p.id ? { ...x, papel: 'COLABORADOR' } : x) })}
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                            mover para colaboradores
                          </button>
                        ) : <p className="text-[11px] text-muted-foreground">Executa</p>}
                      </div>
                    </Caixa>
                  ))}
                </Degrau>

                {/* 4 — colaboradores: os analistas que apontam */}
                <Degrau
                  titulo="Colaboradores" icone={Handshake} cor={corProjeto}
                  quantidade={colaboradores.length} vazio="Nenhum analista acompanhando"
                  aoAdicionar={canWrite ? () => abrir('COLABORADOR', e.id) : undefined}
                >
                  {colaboradores.map(p => (
                    <Caixa key={p.id} aoRemover={canWrite ? () => void salvarExecucao(e.id, { participantes: listaTime(e).filter(x => x.userId !== p.id) }) : undefined}>
                      <Avatar nome={p.name} image={p.image} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                        {canWrite ? (
                          <button type="button"
                            onClick={() => void salvarExecucao(e.id, { participantes: listaTime(e).map(x => x.userId === p.id ? { ...x, papel: 'EXECUTANTE' } : x) })}
                            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                            mover para executantes
                          </button>
                        ) : <p className="text-[11px] text-muted-foreground">Aponta e valida</p>}
                      </div>
                    </Caixa>
                  ))}
                </Degrau>
              </div>
            </div>
          )
        })}
      </div>

      {/* Escolha de pessoas */}
      <ModalEscolha
        open={!!escolha && escolha.tipo !== 'CLIENTE'}
        onOpenChange={(o) => !o && setEscolha(null)}
        unico={escolha?.tipo === 'RESPONSAVEL'}
        titulo={escolha?.tipo === 'RESPONSAVEL' ? 'Responsável da execução'
          : escolha?.tipo === 'COLABORADOR' ? 'Adicionar colaboradores' : 'Adicionar executantes'}
        descricao={escolha?.tipo === 'RESPONSAVEL'
          ? 'É um só por frente, e não precisa ser o mesmo do projeto.'
          : 'Quem já está nesta execução não aparece na lista.'}
        opcoes={pessoas.map(u => ({ id: u.id, rotulo: u.name }))}
        aoBuscar={buscarPessoas}
        buscando={buscando}
        jaDentro={new Set(
          escolha?.tipo === 'RESPONSAVEL'
            ? (execucaoAtual?.responsavel ? [execucaoAtual.responsavel.id] : [])
            : [
                ...(execucaoAtual?.participantes.map(p => p.id) ?? []),
                ...(execucaoAtual?.responsavel ? [execucaoAtual.responsavel.id] : []),
              ],
        )}
        salvando={salvando}
        aoConfirmar={(ids) => {
          if (!escolha || !execucaoAtual) return
          if (escolha.tipo === 'RESPONSAVEL') {
            const novo = ids[0]
            if (!novo) return
            // Quem assume a frente sai do time: o mesmo nome em dois degraus do
            // fluxograma não diz nada a mais.
            void salvarExecucao(escolha.execucaoId, {
              responsavelId: novo,
              participantes: listaTime(execucaoAtual).filter(p => p.userId !== novo),
            })
            return
          }
          const papel: Papel = escolha.tipo === 'COLABORADOR' ? 'COLABORADOR' : 'EXECUTANTE'
          void salvarExecucao(escolha.execucaoId, {
            participantes: [...listaTime(execucaoAtual), ...ids.map(userId => ({ userId, papel }))],
          })
        }}
      />

      {/* Escolha de cliente — um por execução */}
      <ModalEscolha
        open={escolha?.tipo === 'CLIENTE'}
        onOpenChange={(o) => !o && setEscolha(null)}
        unico
        titulo="Cliente desta execução"
        descricao="Só clientes mensais e ativos. Cada frente atende um cliente."
        opcoes={clientes.map(c => ({ id: c.id, rotulo: c.nomeFantasia || c.razaoSocial, complemento: c.nomeFantasia ? c.razaoSocial : undefined }))}
        aoBuscar={buscarClientes}
        buscando={buscando}
        jaDentro={new Set(execucaoAtual?.cliente ? [execucaoAtual.cliente.id] : [])}
        salvando={salvando}
        aoConfirmar={(ids) => {
          if (!escolha || !ids[0]) return
          void salvarExecucao(escolha.execucaoId, { clienteId: ids[0] })
        }}
      />

      {/* Nova execução */}
      <Dialog open={modalNova} onOpenChange={setModalNova}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Layers} color="emerald">
            <DialogTitle>Nova execução</DialogTitle>
            <DialogDescription>
              Uma frente de trabalho do projeto. Cliente, responsável e time se definem em seguida, no fluxograma.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Nome da frente</Label>
            <Input
              value={novoTitulo}
              onChange={e => setNovoTitulo(e.target.value)}
              placeholder="Opcional — vazio, mostra o nome do cliente"
              className="h-9 text-sm"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalNova(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => void criarExecucao()} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
