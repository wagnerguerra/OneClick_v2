'use client'

/**
 * Aba Envolvidos — quem está no projeto, em organograma, e editável ali mesmo.
 *
 * Quatro grupos, de cima para baixo: o RESPONSÁVEL sozinho no topo (é um só, e
 * é quem responde pelo projeto), depois EXECUTANTES e COLABORADORES, e por fim
 * as EMPRESAS-CLIENTE envolvidas.
 *
 * A composição se edita aqui, não num modal da listagem: estando dentro do
 * projeto, voltar à lista só para trocar um executante é atrito puro.
 *
 * O desenho é deliberadamente simples: caixas ligadas por linhas em CSS, sem
 * biblioteca de diagrama. O que importa é ler "quem é quem" de relance.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Building2, Users, UserCog, Handshake, UserPlus, X, Plus, Loader2, Search, Check,
} from 'lucide-react'
import {
  Button, Card, Input, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { resolveAssetUrl } from '@/lib/api-url'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Papel = 'EXECUTANTE' | 'COLABORADOR'
type Pessoa = { id: string; name: string; image: string | null; papel?: string }
type ClienteEnvolvido = { id: string; razaoSocial: string; nomeFantasia: string | null }

type Props = {
  projetoId: string
  responsavel: Pessoa | null
  participantes: Pessoa[]
  clientes: ClienteEnvolvido[]
  corProjeto: string
  canWrite: boolean
  /** Recarrega o projeto na página depois de cada mudança. */
  onChange: () => void
}

function Avatar({ nome, image, tamanho = 'md' }: { nome: string; image: string | null; tamanho?: 'md' | 'lg' }) {
  const dim = tamanho === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveAssetUrl(image)} alt={nome} className={cn('shrink-0 rounded-full border border-background object-cover', dim)} />
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-[#5ea3cb] font-bold text-white', dim)}>
      {iniciais || '?'}
    </span>
  )
}

/** Caixa do organograma. `aoRemover` só é passado quando o usuário pode editar. */
function Caixa({ children, destaque, cor, aoRemover, titulo }: {
  children: React.ReactNode; destaque?: boolean; cor?: string; aoRemover?: () => void; titulo?: string
}) {
  return (
    <div
      className={cn(
        'group/caixa relative flex min-w-[190px] max-w-[240px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm',
        destaque ? 'border-transparent' : 'border-border',
      )}
      style={destaque && cor ? { boxShadow: `0 0 0 2px ${cor}` } : undefined}
      title={titulo}
    >
      {children}
      {aoRemover && (
        <button
          type="button"
          onClick={aoRemover}
          title="Remover do projeto"
          className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-rose-500 hover:text-white group-hover/caixa:flex"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function Grupo({ titulo, icone: Icone, cor, vazio, quantidade, aoAdicionar, children }: {
  titulo: string; icone: typeof Users; cor: string; vazio: string; quantidade: number
  aoAdicionar?: () => void; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="h-5 w-px bg-border" />
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1">
        <Icone className="h-3.5 w-3.5" style={{ color: cor }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{titulo}</span>
        <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {quantidade}
        </span>
        {aoAdicionar && (
          <button type="button" onClick={aoAdicionar} title={`Adicionar em ${titulo}`}
            className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
      {quantidade === 0
        ? <p className="pb-1 text-xs italic text-muted-foreground">{vazio}</p>
        : <div className="flex flex-wrap justify-center gap-2.5">{children}</div>}
    </div>
  )
}

/** Escolha de quem entra: busca + lista de marcar, sobre os candidatos que faltam. */
function ModalEscolha({ open, onOpenChange, titulo, descricao, opcoes, jaDentro, aoConfirmar, salvando }: {
  open: boolean; onOpenChange: (o: boolean) => void
  titulo: string; descricao: string
  opcoes: Array<{ id: string; rotulo: string; complemento?: string }>
  jaDentro: Set<string>
  aoConfirmar: (ids: string[]) => void
  salvando: boolean
}) {
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<string[]>([])
  useEffect(() => { if (!open) { setBusca(''); setMarcados([]) } }, [open])

  const termo = busca.trim().toLowerCase()
  const candidatos = opcoes
    .filter(o => !jaDentro.has(o.id))
    .filter(o => !termo || o.rotulo.toLowerCase().includes(termo) || (o.complemento ?? '').toLowerCase().includes(termo))

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
            {candidatos.length === 0 && (
              <p className="py-3 text-center text-xs text-muted-foreground">
                {opcoes.length === 0 ? 'Nada disponível.' : 'Todos já estão no projeto.'}
              </p>
            )}
            {candidatos.map(o => {
              const marcado = marcados.includes(o.id)
              return (
                <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-muted/60">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => setMarcados(a => marcado ? a.filter(i => i !== o.id) : [...a, o.id])}
                    className="h-3.5 w-3.5 accent-current"
                  />
                  <span className="min-w-0 truncate">{o.rotulo}</span>
                  {o.complemento && <span className="truncate text-[11px] text-muted-foreground">{o.complemento}</span>}
                </label>
              )
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="success" size="sm" className="gap-1.5" disabled={marcados.length === 0 || salvando} onClick={() => aoConfirmar(marcados)}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Adicionar {marcados.length > 0 && `(${marcados.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ProjetoTabEnvolvidos({
  projetoId, responsavel, participantes, clientes, corProjeto, canWrite, onChange,
}: Props) {
  const executantes = participantes.filter(p => (p.papel ?? 'EXECUTANTE') === 'EXECUTANTE')
  const colaboradores = participantes.filter(p => p.papel === 'COLABORADOR')

  const [pessoas, setPessoas] = useState<Array<{ id: string; name: string; image: string | null }>>([])
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteEnvolvido[]>([])
  const [salvando, setSalvando] = useState(false)
  // Qual escolha está aberta: papel do participante, ou cliente, ou responsável.
  const [escolha, setEscolha] = useState<null | Papel | 'CLIENTE' | 'RESPONSAVEL'>(null)

  const carregarOpcoes = useCallback(async () => {
    if (pessoas.length > 0 || clientesDisponiveis.length > 0) return
    try {
      const [ps, cs] = await Promise.all([
        (trpc.projetos as never as { listPessoas: { query: () => Promise<typeof pessoas> } }).listPessoas.query(),
        (trpc.projetos as never as { listClientesVinculaveis: { query: () => Promise<ClienteEnvolvido[]> } }).listClientesVinculaveis.query(),
      ])
      setPessoas(ps)
      setClientesDisponiveis(cs)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }, [pessoas.length, clientesDisponiveis.length])

  function abrir(qual: Papel | 'CLIENTE' | 'RESPONSAVEL') {
    void carregarOpcoes()
    setEscolha(qual)
  }

  /**
   * Toda mudança manda a composição INTEIRA — é o contrato do update, e evita
   * o vaivém de "entrou/saiu" para uma lista de meia dúzia de nomes.
   */
  async function salvar(dados: {
    participantes?: Array<{ userId: string; papel: Papel }>
    clientesIds?: string[]
    responsavelId?: string | null
  }) {
    setSalvando(true)
    try {
      await trpc.projetos.update.mutate({ id: projetoId, data: dados as never })
      setEscolha(null)
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  const listaAtual = (): Array<{ userId: string; papel: Papel }> =>
    participantes.map(p => ({ userId: p.id, papel: (p.papel === 'COLABORADOR' ? 'COLABORADOR' : 'EXECUTANTE') as Papel }))

  function adicionarPessoas(ids: string[], papel: Papel) {
    void salvar({ participantes: [...listaAtual(), ...ids.map(userId => ({ userId, papel }))] })
  }

  function removerPessoa(id: string) {
    void salvar({ participantes: listaAtual().filter(p => p.userId !== id) })
  }

  function trocarPapel(id: string, papel: Papel) {
    void salvar({ participantes: listaAtual().map(p => p.userId === id ? { ...p, papel } : p) })
  }

  const dentroPessoas = new Set([...participantes.map(p => p.id), ...(responsavel ? [responsavel.id] : [])])
  const dentroClientes = new Set(clientes.map(c => c.id))

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-[13px] font-semibold text-foreground">Envolvidos no projeto</h2>
        <p className="text-xs text-muted-foreground">
          Quem responde, quem executa, quem acompanha e para quem o trabalho é feito.
          {canWrite && ' Use o + de cada grupo para incluir e o × na caixa para remover.'}
        </p>
      </div>

      <div className="flex flex-col items-center">
        {/* Topo: o responsável */}
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1">
          <UserCog className="h-3.5 w-3.5" style={{ color: corProjeto }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Responsável</span>
          {canWrite && (
            <button type="button" onClick={() => abrir('RESPONSAVEL')} title="Definir responsável"
              className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground">
              <Plus className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="mt-2">
          {responsavel ? (
            <Caixa destaque cor={corProjeto} aoRemover={canWrite ? () => void salvar({ responsavelId: null }) : undefined}>
              <Avatar nome={responsavel.name} image={responsavel.image} tamanho="lg" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-foreground">{responsavel.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">Responde pelo projeto</p>
              </div>
            </Caixa>
          ) : (
            <button
              type="button"
              onClick={() => canWrite && abrir('RESPONSAVEL')}
              disabled={!canWrite}
              className="flex min-w-[190px] items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs italic text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-default disabled:hover:border-border disabled:hover:text-muted-foreground"
            >
              <UserPlus className="h-4 w-4" /> Sem responsável definido
            </button>
          )}
        </div>

        <span className="h-5 w-px bg-border" />

        <div className="w-full space-y-1">
          <Grupo
            titulo="Executantes" icone={Users} cor={corProjeto}
            quantidade={executantes.length} vazio="Ninguém executando ainda"
            aoAdicionar={canWrite ? () => abrir('EXECUTANTE') : undefined}
          >
            {executantes.map(p => (
              <Caixa key={p.id} aoRemover={canWrite ? () => removerPessoa(p.id) : undefined}>
                <Avatar nome={p.name} image={p.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                  {canWrite ? (
                    <button type="button" onClick={() => trocarPapel(p.id, 'COLABORADOR')}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      mover para colaboradores
                    </button>
                  ) : <p className="text-[11px] text-muted-foreground">Executa</p>}
                </div>
              </Caixa>
            ))}
          </Grupo>

          <Grupo
            titulo="Colaboradores" icone={Handshake} cor={corProjeto}
            quantidade={colaboradores.length} vazio="Nenhum colaborador"
            aoAdicionar={canWrite ? () => abrir('COLABORADOR') : undefined}
          >
            {colaboradores.map(p => (
              <Caixa key={p.id} aoRemover={canWrite ? () => removerPessoa(p.id) : undefined}>
                <Avatar nome={p.name} image={p.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-foreground">{p.name}</p>
                  {canWrite ? (
                    <button type="button" onClick={() => trocarPapel(p.id, 'EXECUTANTE')}
                      className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                      mover para executantes
                    </button>
                  ) : <p className="text-[11px] text-muted-foreground">Apoia e aponta</p>}
                </div>
              </Caixa>
            ))}
          </Grupo>

          <Grupo
            titulo="Clientes envolvidos" icone={Building2} cor={corProjeto}
            quantidade={clientes.length} vazio="Projeto interno, sem cliente"
            aoAdicionar={canWrite ? () => abrir('CLIENTE') : undefined}
          >
            {clientes.map(c => (
              <Caixa
                key={c.id}
                titulo={c.razaoSocial}
                aoRemover={canWrite ? () => void salvar({ clientesIds: clientes.filter(x => x.id !== c.id).map(x => x.id) }) : undefined}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">{c.nomeFantasia || c.razaoSocial}</p>
                  {c.nomeFantasia && <p className="truncate text-[11px] text-muted-foreground">{c.razaoSocial}</p>}
                </div>
              </Caixa>
            ))}
          </Grupo>
        </div>
      </div>

      {/* Escolha de pessoas — para executantes, colaboradores ou responsável */}
      <ModalEscolha
        open={escolha === 'EXECUTANTE' || escolha === 'COLABORADOR' || escolha === 'RESPONSAVEL'}
        onOpenChange={(o) => !o && setEscolha(null)}
        titulo={escolha === 'RESPONSAVEL' ? 'Definir responsável' : escolha === 'COLABORADOR' ? 'Adicionar colaboradores' : 'Adicionar executantes'}
        descricao={escolha === 'RESPONSAVEL'
          ? 'O responsável é um só; marcar alguém substitui quem estiver no posto.'
          : 'Quem já está no projeto não aparece na lista.'}
        opcoes={pessoas.map(u => ({ id: u.id, rotulo: u.name }))}
        jaDentro={escolha === 'RESPONSAVEL' ? new Set(responsavel ? [responsavel.id] : []) : dentroPessoas}
        salvando={salvando}
        aoConfirmar={(ids) => {
          if (escolha === 'RESPONSAVEL') {
            const novo = ids[0]
            if (!novo) return
            // Quem vira responsável sai da lista de participantes: o mesmo nome
            // em duas caixas do organograma não diz nada a mais.
            void salvar({ responsavelId: novo, participantes: listaAtual().filter(p => p.userId !== novo) })
            return
          }
          adicionarPessoas(ids, escolha === 'COLABORADOR' ? 'COLABORADOR' : 'EXECUTANTE')
        }}
      />

      {/* Escolha de clientes */}
      <ModalEscolha
        open={escolha === 'CLIENTE'}
        onOpenChange={(o) => !o && setEscolha(null)}
        titulo="Adicionar clientes envolvidos"
        descricao="Só clientes mensais e ativos. Os que já estão no projeto não aparecem."
        opcoes={clientesDisponiveis.map(c => ({ id: c.id, rotulo: c.nomeFantasia || c.razaoSocial, complemento: c.nomeFantasia ? c.razaoSocial : undefined }))}
        jaDentro={dentroClientes}
        salvando={salvando}
        aoConfirmar={(ids) => void salvar({ clientesIds: [...clientes.map(c => c.id), ...ids] })}
      />
    </Card>
  )
}
