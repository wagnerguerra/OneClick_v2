'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileSpreadsheet, FileText, FileDown, Search, ChevronDown, Loader2, ArrowLeft, X, GripVertical, Save, Star, Trash2, Users, Lock, Filter, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Input, cn, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'

type Operador = 'igual' | 'diferente' | 'contem' | 'em' | 'maior' | 'menor' | 'entre' | 'vazio' | 'preenchido'

const ROTULO_OPERADOR: Record<Operador, string> = {
  igual: 'é', diferente: 'não é', contem: 'contém', em: 'é um de',
  maior: 'a partir de', menor: 'até', entre: 'entre',
  vazio: 'está vazio', preenchido: 'está preenchido',
}
/** Operadores que dispensam valor — a linha do filtro fica só com a pergunta. */
const SEM_VALOR: Operador[] = ['vazio', 'preenchido']

interface FiltroCampo {
  campo: string
  operador: Operador
  valor?: string | number | boolean | null
  valores?: string[]
  ate?: string | number
}

interface CampoCatalogo {
  chave: string
  rotulo: string
  tipo: string
  padrao: boolean
  opcoes: Array<{ valor: string; rotulo: string }> | null
  operadores: Operador[]
}
interface GrupoCatalogo { grupo: string; campos: CampoCatalogo[] }
interface Salvo {
  id: string
  nome: string
  descricao: string | null
  campos: string[]
  filtros: Record<string, unknown>
  filtrosCampos: FiltroCampo[]
  ordenacao: { campo: string; direcao: 'asc' | 'desc' } | null
  origem: 'SISTEMA' | 'USUARIO'
  visibilidade: 'PRIVADO' | 'EMPRESA'
  meu: boolean
  favorito: boolean
}
interface Previa {
  colunas: Array<{ chave: string; rotulo: string; tipo: string }>
  linhas: Array<Array<string | number | null>>
  total: number
  truncado: boolean
}

/**
 * Uma coluna do relatório, arrastável.
 *
 * A alça é o ícone à esquerda, não a pílula inteira: com o botão de remover
 * dentro dela, arrastar pelo corpo faria o clique de remover disputar com o
 * início do arrasto — e a pessoa apagaria a coluna que queria mover.
 */
/** Resume a condição em poucas palavras, para caber na própria badge. */
function resumoFiltro(f: FiltroCampo, campo: CampoCatalogo): string {
  if (f.operador === 'vazio') return 'vazio'
  if (f.operador === 'preenchido') return 'preenchido'
  if (f.operador === 'em') {
    const rotulos = (f.valores ?? []).map(v => campo.opcoes?.find(o => o.valor === v)?.rotulo ?? v)
    if (!rotulos.length) return ''
    // Três já é lista longa demais para uma pílula; o resto vira contagem.
    return rotulos.length <= 2 ? rotulos.join(', ') : `${rotulos.length} valores`
  }
  if (campo.tipo === 'booleano') return f.valor === true ? 'Sim' : f.valor === false ? 'Não' : ''
  const v = String(f.valor ?? '')
  if (!v) return ''
  const texto = f.operador === 'entre' ? `${v} — ${String(f.ate ?? '')}` : v
  return texto.length > 16 ? texto.slice(0, 15) + '…' : texto
}

/**
 * Uma coluna do relatório: arrasta para reordenar, e filtra ali mesmo.
 *
 * O filtro mora DENTRO da badge em vez de num painel à parte. O painel repetia
 * a lista inteira de colunas só para pendurar um campo em cada — meia tela para
 * dizer "sem filtro" sete vezes. Aqui a condição fica onde a coluna está, e a
 * própria badge mostra o que está filtrando.
 *
 * A alça de arrasto é o ícone à esquerda, não a badge inteira: com dois botões
 * dentro dela, arrastar pelo corpo faria o clique disputar com o arrasto.
 */
function ColunaArrastavel({ chave, campo, filtro, onRemover, onFiltrar }: {
  chave: string
  campo: CampoCatalogo | undefined
  filtro: FiltroCampo | undefined
  onRemover: () => void
  onFiltrar: (mudanca: Partial<FiltroCampo> | null) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chave })
  const rotulo = campo?.rotulo ?? chave
  const podeFiltrar = !!campo?.operadores.length
  const resumo = filtro && campo ? resumoFiltro(filtro, campo) : ''

  return (
    <span
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className={cn(
        'flex items-center gap-1 rounded-full border py-0.5 pl-1 pr-1 text-[11px] transition-colors',
        filtro
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-muted/50',
        isDragging && 'ring-2 ring-primary/40',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arraste para reordenar"
        aria-label={`Reordenar ${rotulo}`}
        className="cursor-grab touch-none rounded px-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {podeFiltrar ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-1 rounded px-0.5" title="Filtrar por este campo">
              {rotulo}
              {filtro
                ? <span className="font-semibold">{resumo ? `: ${resumo}` : ''}</span>
                : <Filter className="h-2.5 w-2.5 opacity-40" />}
            </button>
          </DropdownMenuTrigger>
          {/* Em portal: dentro de uma linha com `flex-wrap` e rolagem, um
              painel posicionado à mão seria cortado pelo primeiro ancestral
              com overflow. */}
          <DropdownMenuContent align="start" className="w-[280px] p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filtrar {rotulo}
            </p>

            <select
              value={filtro?.operador ?? ''}
              onChange={e => onFiltrar(e.target.value
                ? { operador: e.target.value as Operador, valor: undefined, valores: [], ate: undefined }
                : null)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]"
            >
              <option value="">sem filtro</option>
              {campo!.operadores.map(op => (
                <option key={op} value={op}>{ROTULO_OPERADOR[op]}</option>
              ))}
            </select>

            {filtro && !SEM_VALOR.includes(filtro.operador) && (
              <div className="mt-2">
                {campo!.opcoes && filtro.operador === 'em' ? (
                  <div className="flex flex-wrap gap-1">
                    {campo!.opcoes.map(o => {
                      const marcado = (filtro.valores ?? []).includes(o.valor)
                      return (
                        <button
                          key={o.valor}
                          type="button"
                          onClick={() => onFiltrar({
                            valores: marcado
                              ? (filtro.valores ?? []).filter(v => v !== o.valor)
                              : [...(filtro.valores ?? []), o.valor],
                          })}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                            marcado
                              ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                              : 'border-border text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {o.rotulo}
                        </button>
                      )
                    })}
                  </div>
                ) : campo!.tipo === 'booleano' ? (
                  <select
                    value={filtro.valor === true ? 'true' : filtro.valor === false ? 'false' : ''}
                    onChange={e => onFiltrar({ valor: e.target.value === 'true' })}
                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px]"
                  >
                    <option value="">escolha</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type={campo!.tipo === 'data' ? 'date' : campo!.tipo === 'numero' ? 'number' : 'text'}
                      value={String(filtro.valor ?? '')}
                      onChange={e => onFiltrar({ valor: e.target.value })}
                      className="h-8 text-[12.5px]"
                    />
                    {filtro.operador === 'entre' && (
                      <>
                        <span className="text-[11px] text-muted-foreground">e</span>
                        <Input
                          type={campo!.tipo === 'data' ? 'date' : 'number'}
                          value={String(filtro.ate ?? '')}
                          onChange={e => onFiltrar({ ate: e.target.value })}
                          className="h-8 text-[12.5px]"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {filtro && (
              <button type="button" onClick={() => onFiltrar(null)}
                className="mt-2 text-[11px] text-muted-foreground hover:text-foreground">
                Remover filtro
              </button>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="px-0.5">{rotulo}</span>
      )}

      <button
        type="button"
        onClick={onRemover}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Remover coluna"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

/**
 * Construtor de relatórios de clientes.
 *
 * Vive ao lado dos relatórios prontos de /clientes/relatorios (movimentação,
 * por área, por responsável): lá estão os recortes que já sabemos que o
 * escritório usa; aqui, o que ninguém previu.
 *
 * Três painéis, no molde que o HubSpot e o Salesforce consolidaram: escolher os
 * campos à esquerda, ver o resultado à direita, exportar. A prévia é o que
 * separa um construtor usável de um formulário às cegas — ninguém deveria
 * descobrir que escolheu a coluna errada só depois de abrir o arquivo.
 *
 * Os filtros chegam pela URL, vindos da listagem. É o caminho mais comum
 * (filtrar e então querer aquilo em planilha) e não deveria custar um segundo
 * preenchimento. O motor no servidor usa o MESMO `where` da listagem, então o
 * que se vê aqui é exatamente o que se vê lá.
 */
export default function MontarRelatorioPage() {
  const params = useSearchParams()

  const [grupos, setGrupos] = useState<GrupoCatalogo[] | null>(null)
  const [podeMontar, setPodeMontar] = useState(true)
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [salvos, setSalvos] = useState<Salvo[]>([])
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [visibilidade, setVisibilidade] = useState<'PRIVADO' | 'EMPRESA'>('PRIVADO')
  const [modalSalvar, setModalSalvar] = useState(false)
  /** O painel de campos recolhe para a tabela ocupar a largura toda. */
  const [painelCampos, setPainelCampos] = useState(true)
  /** Os filtros do relatório aberto vencem os da URL — foi o que ele salvou. */
  const [filtrosSalvos, setFiltrosSalvos] = useState<Record<string, unknown> | null>(null)
  /** Condições montadas aqui, sobre os campos escolhidos. */
  const [filtrosCampos, setFiltrosCampos] = useState<FiltroCampo[]>([])

  /**
   * Os filtros vieram da listagem — aqui eles são só transportados.
   *
   * Um relatório aberto traz os seus, e eles vencem: foi o recorte que a pessoa
   * salvou. Herdar os da URL por cima mudaria em silêncio o que ela guardou.
   */
  const filtros = useMemo(() => {
    if (filtrosSalvos) return filtrosSalvos
    const bruto = params.get('filtros')
    if (!bruto) return {}
    try { return JSON.parse(bruto) as Record<string, unknown> } catch { return {} }
  }, [params, filtrosSalvos])

  const rotuloFiltros = useMemo(() => {
    const nomes: Record<string, string> = {
      situacao: 'Situação', status: 'Status', tributacao: 'Tributação', grupo: 'Grupo',
      cidade: 'Município', uf: 'Estado', tipoCliente: 'Tipo', atividade: 'Atividade',
      areaContratada: 'Área', comBeneficio: 'Benefício', comServico: 'Serviço',
      numero: 'Nº', search: 'Busca', exCliente: 'Ex-cliente', incluirInativos: 'Inclui inativos',
    }
    return Object.entries(filtros)
      .filter(([, v]) => v !== undefined && v !== '' && v !== false)
      .map(([k, v]) => `${nomes[k] ?? k}: ${String(v).replace('__com__', 'com').replace('__sem__', 'sem')}`)
  }, [filtros])

  // Catálogo — a tela não conhece nenhum campo; desenha o que o servidor
  // declara. Campo que o usuário não pode ver nem chega aqui.
  useEffect(() => {
    ;(trpc.cliente as any).relatorioCatalogo.query()
      .then((r: { grupos: GrupoCatalogo[]; podeMontar: boolean }) => {
        setGrupos(r.grupos)
        setPodeMontar(r.podeMontar)
        setEscolhidos(r.grupos.flatMap(g => g.campos.filter(c => c.padrao).map(c => c.chave)))
      })
      .catch(() => setGrupos([]))
  }, [])

  const carregarSalvos = useCallback(() => {
    ;(trpc.cliente as any).relatoriosSalvos.query()
      .then((r: Salvo[]) => setSalvos(r ?? []))
      .catch(() => setSalvos([]))
  }, [])
  useEffect(() => { carregarSalvos() }, [carregarSalvos])

  const abertoAtual = salvos.find(r => r.id === abertoId)

  /** Volta ao estado de relatório novo, sem herdar o que estava aberto. */
  const limparMontagem = () => {
    setAbertoId(null)
    setFiltrosSalvos(null)
    setFiltrosCampos([])
    setNomeNovo('')
    setVisibilidade('PRIVADO')
  }

  /** Abre um relatório salvo: campos, ordem e filtros dele. */
  const abrir = (r: Salvo) => {
    setEscolhidos(r.campos)
    setFiltrosSalvos(r.filtros ?? {})
    setFiltrosCampos(r.filtrosCampos ?? [])
    setAbertoId(r.origem === 'SISTEMA' ? null : r.id)   // padrão vira cópia ao salvar
    setNomeNovo(r.nome)
    setVisibilidade(r.visibilidade)
  }

  const salvar = async () => {
    if (!nomeNovo.trim() || !escolhidos.length) return
    setSalvando(true)
    try {
      const r = await (trpc.cliente as any).relatorioSalvar.mutate({
        id: abertoId ?? undefined,
        nome: nomeNovo.trim(),
        campos: escolhidos,
        filtros,
        filtrosCampos,
        visibilidade,
      })
      // O relatório recém-salvo passa a ser o ABERTO. Sem isto, o botão
      // continuava dizendo "Salvar relatório" e um segundo clique criava outra
      // cópia com o mesmo nome — quem ajustasse uma coluna e salvasse de novo
      // terminaria com dois relatórios iguais e nenhum aviso.
      if (r?.id) setAbertoId(r.id)
      setModalSalvar(false)
      carregarSalvos()
    } finally {
      setSalvando(false)
    }
  }

  const excluir = async (r: Salvo) => {
    await (trpc.cliente as any).relatorioExcluir.mutate({ id: r.id }).catch(() => {})
    if (abertoId === r.id) setAbertoId(null)
    carregarSalvos()
  }

  const favoritar = async (r: Salvo) => {
    // Otimista: a estrela acende na hora e a lista se reordena depois.
    setSalvos(prev => prev.map(x => x.id === r.id ? { ...x, favorito: !x.favorito } : x))
    await (trpc.cliente as any).relatorioFavoritar.mutate({ id: r.id }).catch(() => {})
    carregarSalvos()
  }

  const buscarPrevia = useCallback(() => {
    if (!escolhidos.length) { setPrevia(null); return }
    setCarregando(true)
    ;(trpc.cliente as any).relatorioPreview
      .query({ campos: escolhidos, filtros, filtrosCampos, limite: 20 })
      .then((r: Previa) => setPrevia(r))
      .catch(() => setPrevia(null))
      .finally(() => setCarregando(false))
  }, [escolhidos, filtros, filtrosCampos])

  useEffect(() => {
    const t = setTimeout(buscarPrevia, 250)   // respira entre cliques rápidos
    return () => clearTimeout(t)
  }, [buscarPrevia])

  const alternar = (chave: string) =>
    setEscolhidos(prev => prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave])

  // 5px antes de começar a arrastar: sem essa folga, um clique no X vira um
  // micro-arrasto e o botão não dispara.
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const aoSoltar = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setEscolhidos(prev => {
      const de = prev.indexOf(String(active.id))
      const para = prev.indexOf(String(over.id))
      return de < 0 || para < 0 ? prev : arrayMove(prev, de, para)
    })
  }

  const campoDe = useMemo(() => {
    const m = new Map<string, CampoCatalogo>()
    for (const g of grupos ?? []) for (const c of g.campos) m.set(c.chave, c)
    return m
  }, [grupos])
  /**
   * Um filtro só existe enquanto o campo dele estiver escolhido.
   *
   * Sem isso, desmarcar "Situação" deixaria a condição pendurada: o relatório
   * continuaria filtrando por uma coluna que ninguém vê mais — o pior tipo de
   * filtro, o invisível.
   */
  useEffect(() => {
    setFiltrosCampos(prev => {
      const vivos = prev.filter(f => escolhidos.includes(f.campo))
      return vivos.length === prev.length ? prev : vivos
    })
  }, [escolhidos])

  const alterarFiltro = (campo: string, mudanca: Partial<FiltroCampo> | null) =>
    setFiltrosCampos(prev => {
      if (mudanca === null) return prev.filter(f => f.campo !== campo)
      const i = prev.findIndex(f => f.campo === campo)
      if (i < 0) {
        const def = campoDe.get(campo)
        const operador = (mudanca.operador ?? def?.operadores[0] ?? 'contem') as Operador
        return [...prev, { campo, operador, ...mudanca }]
      }
      const copia = [...prev]
      copia[i] = { ...copia[i]!, ...mudanca }
      return copia
    })

  /**
   * O download sai por NAVEGAÇÃO, não por fetch.
   *
   * O navegador bloqueia download iniciado por JavaScript em várias situações;
   * abrir a URL com `Content-Disposition` sempre funciona. É o mesmo caminho do
   * relatório de orçamentos.
   */
  const urlArquivo = (formato: 'xlsx' | 'csv' | 'pdf') => {
    const p = new URLSearchParams({ campos: escolhidos.join(','), formato })
    if (Object.keys(filtros).length) p.set('filtros', JSON.stringify(filtros))
    if (filtrosCampos.length) p.set('filtrosCampos', JSON.stringify(filtrosCampos))
    return `${getApiUrl()}/api/cliente-relatorio?${p.toString()}`
  }

  const gruposVisiveis = useMemo(() => {
    if (!grupos) return []
    const termo = busca.trim().toLowerCase()
    if (!termo) return grupos
    return grupos
      .map(g => ({ ...g, campos: g.campos.filter(c => c.rotulo.toLowerCase().includes(termo)) }))
      .filter(g => g.campos.length)
  }, [grupos, busca])

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderBar
        actions={
          <>
            {/* Abrir um relatorio salvo cabe num select: a lista cresce com o
                tempo e uma tira de pilulas ocupava uma faixa inteira da tela
                para uma escolha que se faz uma vez, no comeco. */}
            {salvos.length > 0 && (
              <div className="flex items-center gap-1">
                <select
                  value={abertoId ?? ''}
                  onChange={e => {
                    const r = salvos.find(x => x.id === e.target.value)
                    if (r) abrir(r); else limparMontagem()
                  }}
                  className="h-8 max-w-[240px] rounded-md border border-border bg-background px-2 text-[12.5px]"
                  title="Abrir um relatório salvo"
                >
                  <option value="">Novo relatório</option>
                  {(['meus', 'empresa', 'sistema'] as const).map(secao => {
                    const itens = salvos.filter(r =>
                      secao === 'meus' ? r.meu && r.origem === 'USUARIO'
                      : secao === 'empresa' ? !r.meu && r.origem === 'USUARIO'
                      : r.origem === 'SISTEMA')
                    if (!itens.length) return null
                    return (
                      <optgroup key={secao} label={secao === 'meus' ? 'Meus' : secao === 'empresa' ? 'Da empresa' : 'Do sistema'}>
                        {itens.map(r => (
                          <option key={r.id} value={r.id}>{r.favorito ? '★ ' : ''}{r.nome}</option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>

                {/* Estrela e lixeira agem sobre o relatorio ABERTO. Num select
                    nao cabe botao por item, e sem elas favoritar e excluir
                    sumiriam junto com a tira de pilulas. */}
                {abertoAtual && (
                  <button type="button" onClick={() => favoritar(abertoAtual)}
                    title={abertoAtual.favorito ? 'Desafixar' : 'Fixar no topo'}
                    className={cn('rounded p-1', abertoAtual.favorito ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground')}>
                    <Star className={cn('h-3.5 w-3.5', abertoAtual.favorito && 'fill-current')} />
                  </button>
                )}
                {abertoAtual?.meu && podeMontar && (
                  <button type="button" onClick={() => excluir(abertoAtual)} title="Excluir este relatório"
                    className="rounded p-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {podeMontar && (
              <Button
                size="sm"
                variant="success"
                className="gap-1.5"
                disabled={!escolhidos.length}
                onClick={() => setModalSalvar(true)}
              >
                <Save className="h-3.5 w-3.5" />
                {abertoId ? 'Salvar alterações' : 'Salvar relatório'}
              </Button>
            )}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/clientes/relatorios"><ArrowLeft className="h-3.5 w-3.5" /> Voltar</Link>
            </Button>
          </>
        }
      >
        <h1 className="truncate">Montar relatório</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Escolha os campos, confira a prévia e baixe. Os filtros vêm da listagem de clientes.
        </p>
      </PageHeaderBar>

      {rotuloFiltros.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Filtros da listagem</span>
          {rotuloFiltros.map(f => (
            <span key={f} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px]">{f}</span>
          ))}
          <Link href="/clientes" className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline">
            Ajustar na listagem
          </Link>
        </div>
      )}

      <div className={cn('grid gap-4', painelCampos ? 'lg:grid-cols-[300px_1fr]' : 'lg:grid-cols-[40px_1fr]')}>
        {/* ── Campos ──────────────────────────────────────────────── */}
        {!painelCampos ? (
          // Recolhido vira uma faixa estreita: sumir de vez deixaria o usuario
          // sem pista de como trazer os campos de volta.
          <button
            type="button"
            onClick={() => setPainelCampos(true)}
            title="Mostrar campos"
            className="flex h-full min-h-[120px] w-10 flex-col items-center gap-2 rounded-xl border border-border bg-card py-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
              Campos {escolhidos.length}
            </span>
          </button>
        ) : (
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar campo..."
                className="h-8 pl-8 text-xs"
              />
            </div>
            <button
              type="button"
              onClick={() => setPainelCampos(false)}
              title="Recolher para alargar a tabela"
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          <div className="nice-scrollbar max-h-[520px] overflow-y-auto p-2">
            {grupos === null && (
              <p className="p-3 text-xs text-muted-foreground">Carregando campos...</p>
            )}
            {grupos?.length === 0 && (
              <p className="p-3 text-xs text-muted-foreground">Nenhum campo disponível para o seu acesso.</p>
            )}
            {gruposVisiveis.map(g => {
              const fechado = recolhidos.has(g.grupo) && !busca
              const marcados = g.campos.filter(c => escolhidos.includes(c.chave)).length
              return (
                <div key={g.grupo} className="mb-1">
                  <button
                    type="button"
                    onClick={() => setRecolhidos(prev => {
                      const s = new Set(prev)
                      if (s.has(g.grupo)) s.delete(g.grupo); else s.add(g.grupo)
                      return s
                    })}
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted"
                  >
                    <ChevronDown className={cn('h-3 w-3 transition-transform', fechado && '-rotate-90')} />
                    {g.grupo}
                    {marcados > 0 && (
                      <span className="ml-auto font-normal normal-case tracking-normal">{marcados}</span>
                    )}
                  </button>
                  {!fechado && g.campos.map(c => (
                    <label
                      key={c.chave}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={escolhidos.includes(c.chave)}
                        onChange={() => alternar(c.chave)}
                        className="h-3.5 w-3.5"
                      />
                      {c.rotulo}
                    </label>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
        )}

        {/* ── Ordem, prévia e download ────────────────────────────── */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold">
                Colunas do relatório
                <span className="ml-2 font-normal text-muted-foreground">{escolhidos.length}</span>
                {filtrosCampos.length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    <Filter className="h-2.5 w-2.5" />
                    {filtrosCampos.length} filtro(s)
                  </span>
                )}
              </h2>
              {escolhidos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setEscolhidos([])}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            {escolhidos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Marque os campos à esquerda. Arraste para ordenar as colunas; clique no nome para filtrar.
              </p>
            ) : (
              <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
                <SortableContext items={escolhidos} strategy={horizontalListSortingStrategy}>
                  <div className="flex flex-wrap gap-1.5">
                    {escolhidos.map(chave => (
                      <ColunaArrastavel
                        key={chave}
                        chave={chave}
                        campo={campoDe.get(chave)}
                        filtro={filtrosCampos.find(f => f.campo === chave)}
                        onRemover={() => alternar(chave)}
                        onFiltrar={m => alterarFiltro(chave, m)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                Prévia
                {carregando && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {previa && !carregando && (
                  <span className="font-normal text-muted-foreground">
                    {previa.total.toLocaleString('pt-BR')} cliente(s) · mostrando {previa.linhas.length}
                  </span>
                )}
              </div>
              {/* O botão traz o número: "baixar" sem quantidade esconde
                  justamente a surpresa que o usuário levaria para o arquivo. */}
              <div className="flex items-center gap-1.5">
                <Button asChild size="sm" variant="outline" className={cn('gap-1.5', !escolhidos.length && 'pointer-events-none opacity-40')}>
                  <a href={urlArquivo('xlsx')}>
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Excel{previa ? ` · ${previa.total.toLocaleString('pt-BR')}` : ''}
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline" className={cn('gap-1.5', !escolhidos.length && 'pointer-events-none opacity-40')}>
                  <a href={urlArquivo('csv')}><FileDown className="h-3.5 w-3.5" /> CSV</a>
                </Button>
                <Button asChild size="sm" variant="outline" className={cn('gap-1.5', !escolhidos.length && 'pointer-events-none opacity-40')}>
                  <a href={urlArquivo('pdf')}><FileText className="h-3.5 w-3.5" /> PDF</a>
                </Button>
              </div>
            </div>

            <div className="nice-scrollbar overflow-x-auto">
              {!previa || !previa.colunas.length ? (
                <p className="p-6 text-center text-xs text-muted-foreground">
                  Escolha ao menos um campo para ver a prévia.
                </p>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {previa.colunas.map(c => (
                        <th key={c.chave} className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {c.rotulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previa.linhas.map((l, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        {l.map((v, j) => (
                          <td key={j} className={cn(
                            'whitespace-nowrap px-3 py-1.5',
                            previa.colunas[j]?.tipo === 'numero' && 'text-right tabular-nums',
                          )}>
                            {v === null || v === '' ? <span className="text-muted-foreground">—</span> : String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {modalSalvar && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setModalSalvar(false)}>
              <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={e => e.stopPropagation()}>
                <h3 className="text-[15px] font-semibold">
                  {abertoId ? 'Salvar alterações' : 'Salvar relatório'}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Guarda os {escolhidos.length} campos escolhidos e os filtros atuais. O relatório
                  roda contra os dados de quando for aberto, não contra os de hoje.
                </p>

                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Nome</label>
                <Input value={nomeNovo} onChange={e => setNomeNovo(e.target.value)} autoFocus
                  placeholder="ex: Carteira mensal por tributação" className="mt-1 h-9 text-sm" />

                <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quem enxerga</label>
                <div className="mt-1 inline-flex overflow-hidden rounded-lg border border-border">
                  {(['PRIVADO', 'EMPRESA'] as const).map((v, i) => (
                    <button key={v} type="button" onClick={() => setVisibilidade(v)}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-colors',
                        i > 0 && 'border-l border-border',
                        visibilidade === v ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
                      {v === 'PRIVADO' ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                      {v === 'PRIVADO' ? 'Só eu' : 'Toda a empresa'}
                    </button>
                  ))}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setModalSalvar(false)}>Cancelar</Button>
                  <Button size="sm" variant="success" onClick={salvar} disabled={!nomeNovo.trim() || salvando} className="gap-1.5">
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Salvar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {!podeMontar && grupos !== null && (
            <p className="text-[11px] text-muted-foreground">
              Você pode gerar relatórios com os campos disponíveis. Salvar um relatório próprio
              exige a permissão “Montar e salvar relatórios próprios”.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
