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
  Layers, Trash2, Pencil, MoreVertical, PackageCheck, ChevronRight, Palette,
} from 'lucide-react'
import {
  Button, Card, Input, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Label,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'
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
  progresso: number
  /** Cor do cabeçalho; nula herda a do projeto. */
  cor: string | null
  cliente: ClienteRef | null
  responsavel: { id: string; name: string; image: string | null } | null
  participantes: Pessoa[]
  _count: { rodadas: number }
}

/**
 * Sugestões de cor para o cabeçalho da frente. São as mesmas famílias das cores
 * de módulo — assim uma execução colorida à mão não destoa do resto do sistema.
 * Quem quiser outra digita o hex.
 */
const PALETA_FRENTES: Array<{ nome: string; hex: string }> = [
  { nome: 'Esmeralda', hex: '#10b981' },
  { nome: 'Céu', hex: '#0ea5e9' },
  { nome: 'Índigo', hex: '#6366f1' },
  { nome: 'Violeta', hex: '#a78bfa' },
  { nome: 'Fúcsia', hex: '#e879f9' },
  { nome: 'Rosa', hex: '#fb7185' },
  { nome: 'Âmbar', hex: '#f59e0b' },
  { nome: 'Laranja', hex: '#fb923c' },
  { nome: 'Lima', hex: '#a3e635' },
  { nome: 'Petróleo', hex: '#0369a1' },
  { nome: 'Ciano', hex: '#22d3ee' },
  { nome: 'Ardósia', hex: '#64748b' },
]

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
        'group/caixa relative flex w-full items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm',
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

/**
 * Um degrau do fluxograma. A faixa com o nome não flutua acima das caixas: ela
 * é o cabeçalho de um painel que as CONTÉM. Assim se enxerga onde um degrau
 * termina e o outro começa — com três ou quatro caixas soltas numa coluna
 * estreita, a leitura se perdia.
 */
function Degrau({ titulo, icone: Icone, cor, vazio, quantidade, aoAgir, iconeAcao: IconeAcao = Plus, rotuloAcao, primeiro, children }: {
  titulo: string; icone: typeof Users; cor: string; vazio: string; quantidade: number
  aoAgir?: () => void; iconeAcao?: typeof Plus; rotuloAcao?: string
  primeiro?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col items-center">
      {/* haste: liga este degrau ao de cima */}
      {!primeiro && <span className="h-3 w-px bg-border" />}
      <div className="w-full overflow-hidden rounded-xl border border-border bg-muted/20">
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-2.5 py-1.5">
          <Icone className="h-3 w-3 shrink-0" style={{ color: cor }} />
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-foreground">{titulo}</span>
          <span className="shrink-0 rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">{quantidade}</span>
          {aoAgir && (
            <button type="button" onClick={aoAgir} title={rotuloAcao ?? `Adicionar em ${titulo}`}
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
              <IconeAcao className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-2 p-2.5">
          {quantidade === 0
            ? <p className="py-1 text-center text-xs italic text-muted-foreground">{vazio}</p>
            : children}
        </div>
      </div>
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

export function ProjetoTabEnvolvidos({ projetoId, corProjeto, canWrite, canDelete, onVerRodadas }: {
  projetoId: string; corProjeto: string; canWrite: boolean; canDelete: boolean
  /** Leva para a aba Rodadas já apontando para esta frente. */
  onVerRodadas?: (execucaoId: string) => void
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
  // Renomear a frente: o título é o rótulo do card, e nem sempre o nome do
  // cliente serve — duas frentes podem atender o mesmo cliente.
  const [renomeando, setRenomeando] = useState<Execucao | null>(null)
  const [tituloEditado, setTituloEditado] = useState('')
  // Cor do cabeçalho: personalização de master, para distinguir as frentes.
  const { isMaster } = useUserPermissions()
  const [colorindo, setColorindo] = useState<Execucao | null>(null)
  const [corEditada, setCorEditada] = useState('')

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
  // Até quatro colunas cabem lado a lado na largura útil; daí em diante, rola.
  const muitasFrentes = execucoes.length > 4

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Execuções e envolvidos</h2>
          <p className="text-xs text-muted-foreground">
            Cada frente tem seu cliente, seu responsável e seu time — e roda em paralelo às outras.
            {canWrite && ' O + de cada faixa inclui; o × na caixa remove; o ⋮ do cabeçalho traz as opções.'}
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

      {/* Uma coluna por frente, lado a lado: elas rodam em paralelo, e empilhadas
          o paralelismo sumia — cada uma parecia uma etapa da anterior. Passando
          de quatro, a fileira rola na horizontal em vez de espremer as colunas. */}
      <div className={cn('flex gap-4', muitasFrentes ? 'nice-scrollbar overflow-x-auto pb-2' : 'flex-wrap')}>
        {execucoes.map(e => {
          const executantes = e.participantes.filter(p => (p.papel ?? 'EXECUTANTE') === 'EXECUTANTE')
          const colaboradores = e.participantes.filter(p => p.papel === 'COLABORADOR')
          const nome = e.titulo || e.cliente?.nomeFantasia || e.cliente?.razaoSocial || 'Execução sem nome'
          const pessoasNaFrente = (e.responsavel ? 1 : 0) + e.participantes.length
          // Sem cor própria, a frente herda a do projeto.
          const corFrente = e.cor || corProjeto
          return (
            <div
              key={e.id}
              className={cn(
                'flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm',
                muitasFrentes ? 'w-[300px] shrink-0' : 'min-w-0 max-w-[420px] flex-1 basis-[300px]',
              )}
            >
              {/* Cabeçalho na cor do projeto — é o que separa uma frente da outra */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 text-white"
                style={{ background: `linear-gradient(135deg, ${corFrente}, color-mix(in srgb, ${corFrente} 72%, transparent))` }}
              >
                <div className="min-w-0 flex-1">
                  {canWrite ? (
                    <button
                      type="button" title="Renomear frente"
                      onClick={() => { setRenomeando(e); setTituloEditado(e.titulo ?? '') }}
                      className="block w-full truncate text-left text-[13px] font-semibold leading-tight underline-offset-2 hover:underline"
                    >
                      {nome}
                    </button>
                  ) : (
                    <p className="truncate text-[13px] font-semibold leading-tight" title={nome}>{nome}</p>
                  )}
                  <p className="truncate text-[11px] leading-tight text-white/80">
                    {e._count.rodadas} rodada{e._count.rodadas === 1 ? '' : 's'} · {pessoasNaFrente} pessoa{pessoasNaFrente === 1 ? '' : 's'} · {e.progresso}%
                  </p>
                  {/* O quanto já está pronto, informado na aba Rodadas */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-white transition-[width] duration-300" style={{ width: `${e.progresso}%` }} />
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button" title="Opções da execução"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {onVerRodadas && (
                      <DropdownMenuItem onClick={() => onVerRodadas(e.id)}>
                        <PackageCheck className="mr-2 h-4 w-4" /> Ver rodadas desta frente
                      </DropdownMenuItem>
                    )}
                    {canWrite && (
                      <>
                        {onVerRodadas && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={() => { setRenomeando(e); setTituloEditado(e.titulo ?? '') }}>
                          <Pencil className="mr-2 h-4 w-4" /> Renomear frente
                        </DropdownMenuItem>
                        {isMaster && (
                          <DropdownMenuItem onClick={() => { setColorindo(e); setCorEditada(e.cor ?? corProjeto) }}>
                            <Palette className="mr-2 h-4 w-4" /> Cor do cabeçalho
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => abrir('CLIENTE', e.id)}>
                          <Building2 className="mr-2 h-4 w-4" /> {e.cliente ? 'Trocar cliente' : 'Definir cliente'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => abrir('RESPONSAVEL', e.id)}>
                          <UserCog className="mr-2 h-4 w-4" /> {e.responsavel ? 'Trocar responsável' : 'Definir responsável'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => abrir('EXECUTANTE', e.id)}>
                          <Users className="mr-2 h-4 w-4" /> Adicionar executantes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => abrir('COLABORADOR', e.id)}>
                          <Handshake className="mr-2 h-4 w-4" /> Adicionar colaboradores
                        </DropdownMenuItem>
                      </>
                    )}
                    {canDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => void excluirExecucao(e)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Excluir execução
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex flex-1 flex-col items-center p-3">
                {/* 1 — o cliente encabeça o ramo */}
                <Degrau
                  primeiro titulo="Cliente" icone={Building2} cor={corFrente}
                  quantidade={e.cliente ? 1 : 0} vazio="Sem cliente definido"
                  aoAgir={canWrite ? () => abrir('CLIENTE', e.id) : undefined}
                  iconeAcao={e.cliente ? Pencil : Plus}
                  rotuloAcao={e.cliente ? 'Trocar cliente' : 'Definir cliente'}
                >
                  {e.cliente && (
                    <Caixa destaque cor={corFrente} titulo={e.cliente.razaoSocial}
                      aoRemover={canWrite ? () => void salvarExecucao(e.id, { clienteId: null }) : undefined}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-foreground">{e.cliente.nomeFantasia || e.cliente.razaoSocial}</p>
                        {e.cliente.nomeFantasia && <p className="truncate text-[11px] text-muted-foreground">{e.cliente.razaoSocial}</p>}
                      </div>
                    </Caixa>
                  )}
                </Degrau>

                {/* 2 — responsável DESTA execução */}
                <Degrau
                  titulo="Responsável da execução" icone={UserCog} cor={corFrente}
                  quantidade={e.responsavel ? 1 : 0} vazio="Sem responsável nesta frente"
                  aoAgir={canWrite ? () => abrir('RESPONSAVEL', e.id) : undefined}
                  iconeAcao={e.responsavel ? Pencil : Plus}
                  rotuloAcao={e.responsavel ? 'Trocar responsável' : 'Definir responsável'}
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
                  titulo="Executantes" icone={Users} cor={corFrente}
                  quantidade={executantes.length} vazio="Ninguém executando ainda"
                  aoAgir={canWrite ? () => abrir('EXECUTANTE', e.id) : undefined}
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
                  titulo="Colaboradores" icone={Handshake} cor={corFrente}
                  quantidade={colaboradores.length} vazio="Nenhum analista acompanhando"
                  aoAgir={canWrite ? () => abrir('COLABORADOR', e.id) : undefined}
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

                {/* Atalho para o ciclo desta frente — as rodadas são por execução */}
                {onVerRodadas && (
                  <button
                    type="button" onClick={() => onVerRodadas(e.id)}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
                  >
                    <PackageCheck className="h-3.5 w-3.5" />
                    {e._count.rodadas > 0 ? `Ver as ${e._count.rodadas} rodada${e._count.rodadas === 1 ? '' : 's'}` : 'Abrir rodadas'}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
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
          : 'Quem já está neste degrau não aparece na lista.'}
        opcoes={pessoas.map(u => ({ id: u.id, rotulo: u.name }))}
        aoBuscar={buscarPessoas}
        buscando={buscando}
        // Quem responde pela frente continua na lista de executantes: em time
        // pequeno, quem responde também faz. Só não se repete no mesmo degrau.
        jaDentro={new Set(
          escolha?.tipo === 'RESPONSAVEL'
            ? (execucaoAtual?.responsavel ? [execucaoAtual.responsavel.id] : [])
            : (execucaoAtual?.participantes.map(p => p.id) ?? []),
        )}
        salvando={salvando}
        aoConfirmar={(ids) => {
          if (!escolha || !execucaoAtual) return
          if (escolha.tipo === 'RESPONSAVEL') {
            const novo = ids[0]
            if (!novo) return
            // Assumir a frente não tira ninguém do time: responder e executar
            // são coisas distintas, e a mesma pessoa pode fazer as duas.
            void salvarExecucao(escolha.execucaoId, { responsavelId: novo })
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

      {/* Renomear frente */}
      <Dialog open={!!renomeando} onOpenChange={(o) => !o && setRenomeando(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Renomear frente</DialogTitle>
            <DialogDescription>
              Em branco, o card volta a mostrar o nome do cliente da execução.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Nome da frente</Label>
            <Input
              value={tituloEditado}
              onChange={ev => setTituloEditado(ev.target.value)}
              placeholder="Ex.: Apuração fiscal — piloto"
              className="h-9 text-sm"
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenomeando(null)} disabled={salvando}>Cancelar</Button>
            <Button
              variant="success" size="sm" className="gap-1.5" disabled={salvando}
              onClick={() => {
                if (!renomeando) return
                const alvo = renomeando.id
                setRenomeando(null)
                void salvarExecucao(alvo, { titulo: tituloEditado.trim() || null })
              }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cor do cabeçalho — personalização de master */}
      <Dialog open={!!colorindo} onOpenChange={(o) => !o && setColorindo(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeaderIcon icon={Palette} color="violet">
            <DialogTitle>Cor do cabeçalho</DialogTitle>
            <DialogDescription>
              Vale só para esta frente. Sem cor própria, ela volta a herdar a do projeto.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div
              className="flex h-14 items-center px-3 text-[13px] font-semibold text-white"
              style={{ borderRadius: 10, background: `linear-gradient(135deg, ${corEditada}, color-mix(in srgb, ${corEditada} 72%, transparent))` }}
            >
              {colorindo?.titulo || colorindo?.cliente?.nomeFantasia || colorindo?.cliente?.razaoSocial || 'Prévia do cabeçalho'}
            </div>

            <div className="flex flex-wrap gap-2">
              {PALETA_FRENTES.map(c => (
                <button
                  key={c.hex}
                  type="button" title={c.nome}
                  onClick={() => setCorEditada(c.hex)}
                  className={cn(
                    'h-8 w-8 rounded-lg border-2 transition-transform hover:scale-110',
                    corEditada.toLowerCase() === c.hex ? 'border-foreground' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Outra cor (hex)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={corEditada}
                  onChange={ev => setCorEditada(ev.target.value)}
                  placeholder="#10b981"
                  className="h-9 max-w-[140px] text-sm"
                />
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(corEditada) ? corEditada : '#10b981'}
                  onChange={ev => setCorEditada(ev.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-background"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="outline" size="sm" disabled={salvando}
              onClick={() => {
                if (!colorindo) return
                const alvo = colorindo.id
                setColorindo(null)
                void salvarExecucao(alvo, { cor: null })
              }}
            >
              Usar a do projeto
            </Button>
            <Button variant="outline" size="sm" onClick={() => setColorindo(null)} disabled={salvando}>Cancelar</Button>
            <Button
              variant="success" size="sm" className="gap-1.5"
              disabled={salvando || !/^#[0-9a-fA-F]{6}$/.test(corEditada)}
              onClick={() => {
                if (!colorindo) return
                const alvo = colorindo.id
                setColorindo(null)
                void salvarExecucao(alvo, { cor: corEditada })
              }}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
