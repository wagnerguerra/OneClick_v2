'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Link from 'next/link'
import { ListChecks, AlertTriangle, Clock, CheckCircle2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { EmptyState } from './empty-state'

interface Stats { emAberto: number; atrasados: number; pausados: number; scope: 'todos' | 'area' | 'proprios' }

interface ExecucaoItem {
  id: string
  servicoNome: string
  clienteNome: string
  categoria: string | null
  prazoLimite: string | Date | null
  iniciadoEm: string | Date
  status: string
  situacao: 'no_prazo' | 'a_vencer' | 'atrasada'
  passoAtual: {
    nome: string
    etapaNome: string | null
    ordem: number
    totalPassos: number
    concluidos: number
  } | null
}

// Cores das situacoes — mesmos hex usados no fluxo-editor pra manter a linguagem visual
const SITUACAO_CORES = {
  atrasada: { dot: '#e11d48', label: 'Atrasada', bg: 'rgba(225,29,72,0.10)', text: '#9f1239' },
  a_vencer: { dot: '#f59e0b', label: 'A vencer', bg: 'rgba(245,158,11,0.10)', text: '#92400e' },
  no_prazo: { dot: '#10b981', label: 'No prazo', bg: 'rgba(16,185,129,0.10)', text: '#065f46' },
} as const

/**
 * Formata o prazo de forma relativa amigavel.
 *  - sem prazo: "Sem prazo"
 *  - atrasada: "Atrasada há 2 dias", "Atrasada há 5h"
 *  - a_vencer: "Vence em 6h", "Vence em 30 min"
 *  - no_prazo: "Vence 15/08" ou "Vence em 3 dias"
 */
function formatarPrazoRelativo(prazo: Date | null, situacao: ExecucaoItem['situacao']): string {
  if (!prazo) return 'Sem prazo'
  const agora = Date.now()
  const diffMs = prazo.getTime() - agora
  const absMs = Math.abs(diffMs)
  const min = Math.floor(absMs / 60_000)
  const horas = Math.floor(absMs / 3_600_000)
  const dias = Math.floor(absMs / 86_400_000)

  if (situacao === 'atrasada') {
    if (dias >= 1) return `Atrasada há ${dias} dia${dias > 1 ? 's' : ''}`
    if (horas >= 1) return `Atrasada há ${horas}h`
    return `Atrasada há ${Math.max(1, min)} min`
  }

  if (situacao === 'a_vencer') {
    if (horas >= 1) return `Vence em ${horas}h`
    return `Vence em ${Math.max(1, min)} min`
  }

  // no_prazo
  if (dias >= 2) {
    // Formato curto pt-BR
    const fmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
    return `Vence ${fmt.format(prazo)}`
  }
  if (dias === 1) return 'Vence amanhã'
  if (horas >= 1) return `Vence em ${horas}h`
  return `Vence em ${Math.max(1, min)} min`
}

/**
 * Hook compartilhado pelos modos inicial e expandido — busca a lista de
 * execucoes em andamento. Retorna estado de carregamento, erro e os items.
 * Mantido em escopo de modulo pra reaproveitar a chamada e nao duplicar logica.
 */
function useExecucoesAndamento() {
  const [items, setItems] = useState<ExecucaoItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const fetchItems = useCallback(() => {
    ;(trpc.servico as any).listServicosAndamentoDashboard.query()
      .then((d: ExecucaoItem[]) => setItems(d ?? []))
      .catch((e: Error) => setErro(e.message))
      .finally(() => setLoaded(true))
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  // SSE — refetch silencioso quando outro cliente cria/conclui/reivindica
  // uma execução. Bom pro claim-first da Legalização: novo serviço aparece
  // em tempo real no widget de todos os candidatos do setor; quando alguém
  // reivindica, o widget dos outros remove o item no próximo refetch.
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false
    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/servicos/execucoes/events`)
        es.onmessage = () => {
          // Backend já valida visibilidade no listServicosAndamentoDashboard
          // (escopo do user). Refetch silencioso pra refletir o estado real.
          fetchItems()
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [fetchItems])

  return { items, loaded, erro }
}

/**
 * Modo expandido — painel acionavel das execucoes em andamento do usuario.
 * Chips clicaveis no topo agrupando por situacao + lista detalhada com passo
 * atual de cada execucao.
 */
function ServicosExpanded({ titulo }: { titulo: string }) {
  const { items, loaded, erro } = useExecucoesAndamento()
  const [filtro, setFiltro] = useState<ExecucaoItem['situacao'] | null>(null)

  const counts = useMemo(() => {
    const c = { atrasada: 0, a_vencer: 0, no_prazo: 0 }
    for (const it of items) c[it.situacao]++
    return c
  }, [items])

  const filtrados = useMemo(() => {
    if (!filtro) return items
    return items.filter(i => i.situacao === filtro)
  }, [items, filtro])

  if (!loaded) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Carregando...
      </div>
    )
  }
  if (erro) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-rose-600">
        Erro: {erro}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/20">
          <CheckCircle2 className="h-7 w-7 text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold">Você está em dia!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum serviço em andamento agora.
          </p>
        </div>
        <Link
          href="/meus-servicos"
          className="text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline mt-1"
        >
          Abrir Meus Serviços
        </Link>
      </div>
    )
  }

  // Chip helper
  function Chip({ k, label, Icon }: { k: ExecucaoItem['situacao']; label: string; Icon: typeof Clock }) {
    const cor = SITUACAO_CORES[k]
    const ativo = filtro === k
    const n = counts[k]
    return (
      <button
        type="button"
        onClick={() => setFiltro(prev => prev === k ? null : k)}
        className="flex-1 min-w-[110px] rounded-lg border px-3 py-2 transition-all hover:shadow-sm text-left"
        style={{
          backgroundColor: ativo ? cor.dot : cor.bg,
          borderColor: ativo ? cor.dot : `${cor.dot}40`,
          color: ativo ? '#fff' : cor.text,
        }}
        title={`Filtrar por ${label.toLowerCase()}`}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider truncate">
            {label}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-2xl font-bold tabular-nums leading-none">{n}</span>
          <span className="text-[10px] opacity-80">
            {n === 1 ? 'execução' : 'execuções'}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header com contagem e link rapido */}
      <div className="shrink-0 mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{items.length}</span>{' '}
          {items.length === 1 ? 'execução ativa' : 'execuções ativas'}
        </p>
        <Link
          href="/meus-servicos"
          className="text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline inline-flex items-center gap-1"
        >
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Chips por situacao */}
      <div className="shrink-0 mb-3 flex flex-wrap gap-2">
        <Chip k="atrasada" label="Atrasadas" Icon={AlertTriangle} />
        <Chip k="a_vencer" label="A vencer (48h)" Icon={Clock} />
        <Chip k="no_prazo" label="No prazo" Icon={CheckCircle2} />
      </div>

      {filtro && (
        <div className="shrink-0 mb-2 text-[11px] text-muted-foreground">
          Filtrando: <strong style={{ color: SITUACAO_CORES[filtro].dot }}>{SITUACAO_CORES[filtro].label}</strong>
          {' · '}
          <button
            type="button"
            onClick={() => setFiltro(null)}
            className="underline hover:text-foreground"
          >
            limpar
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 pr-1">
        {filtrados.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-10">
            Nenhuma execução nessa categoria.
          </p>
        ) : (
          <ul className="space-y-1.5 px-1 max-h-[400px]">
            {filtrados.map(it => {
              const cor = SITUACAO_CORES[it.situacao]
              const prazo = it.prazoLimite ? new Date(it.prazoLimite) : null
              const prazoLabel = formatarPrazoRelativo(prazo, it.situacao)
              return (
                <li key={it.id}>
                  <Link
                    href={`/meus-servicos?exec=${it.id}`}
                    className="block rounded-lg border bg-card px-3 py-2.5 hover:shadow-md transition-all"
                    style={{ borderColor: `${cor.dot}40` }}
                  >
                    {/* Linha 1: bolinha situacao + nome do servico + prazo */}
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: cor.dot }}
                      />
                      <span className="text-[13px] font-semibold truncate flex-1" title={it.servicoNome}>
                        {it.servicoNome}
                      </span>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider shrink-0 px-1.5 py-0.5 rounded"
                        style={{ background: cor.bg, color: cor.text }}
                      >
                        {prazoLabel}
                      </span>
                    </div>

                    {/* Linha 2: cliente */}
                    <div className="ml-4 mt-0.5 text-[11px] text-muted-foreground truncate" title={it.clienteNome}>
                      {it.clienteNome}
                    </div>

                    {/* Linha 3: passo atual com progresso */}
                    {it.passoAtual ? (
                      <div className="ml-4 mt-1.5 flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: cor.dot, opacity: 0.6 }}
                        />
                        <span className="text-[11px] text-foreground/80 truncate flex-1">
                          {it.passoAtual.etapaNome && (
                            <>
                              <span className="text-muted-foreground">Etapa</span>{' '}
                              <span className="font-medium">"{it.passoAtual.etapaNome}"</span>
                              <span className="text-muted-foreground"> → </span>
                            </>
                          )}
                          <span className="text-muted-foreground">Passo</span>{' '}
                          <span className="font-medium">"{it.passoAtual.nome}"</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          ({it.passoAtual.concluidos}/{it.passoAtual.totalPassos})
                        </span>
                      </div>
                    ) : (
                      <div className="ml-4 mt-1.5 text-[11px] text-muted-foreground italic">
                        {it.status === 'AGUARDANDO_RESPOSTA' ? 'Aguardando resposta' : 'Sem passos cadastrados'}
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

// Quantos itens mostrar no modo inicial. Acima disso, exibe "+N · Ver todas"
// abaixo da lista pra indicar o resto. Lista tem scroll interno limitado em
// max-h pra nao estourar o card.
const LIMITE_ITENS_INICIAL = 5

export function ServicosWidget({ title, bloco, expanded }: { canRead?: boolean; title?: string; bloco?: string; expanded?: boolean } = {}) {
  // Modo expandido (modal): paineis acionaveis com execucoes detalhadas.
  // Renderiza cedo pra evitar a chamada extra de getDashboardStats no modo
  // expandido (que ja faz sua propria busca via useExecucoesAndamento).
  if (expanded) {
    const tituloExpanded = title ?? 'Serviços em Andamento'
    return <ServicosExpanded titulo={tituloExpanded} />
  }

  return <ServicosInitial title={title} bloco={bloco} />
}

/**
 * Modo inicial — versao enxuta dos mesmos dados do expandido. Mostra:
 *   - Header com icone, titulo (derivado do scope) e contagem total
 *   - 3 mini-chips com contagem por situacao (atrasada / a_vencer / no_prazo)
 *   - Lista compacta de ate LIMITE_ITENS_INICIAL execucoes (com scroll
 *     interno se faltar altura no card)
 *   - Se houver mais itens que o limite, link "+N execucoes · Ver todas"
 */
function ServicosInitial({ title, bloco }: { title?: string; bloco?: string }) {
  const [s, setS] = useState<Stats | null>(null)
  const { items, loaded: itemsLoaded, erro: itemsErro } = useExecucoesAndamento()

  // Stats também precisa ser refetchado quando o SSE de execuções dispara.
  // Sem isso, o widget fica preso em "Nenhum serviço aberto" porque `s.emAberto`
  // foi calculado uma vez no mount e nunca atualiza — então mesmo o SSE
  // recarregando `items`, o early return baseado em `s.emAberto === 0` esconde
  // a lista nova.
  const fetchStats = useCallback(() => {
    ;(trpc.servico as any).getDashboardStats.query()
      .then((d: Stats) => setS(d))
      .catch(() => {})
  }, [])
  useEffect(() => { fetchStats() }, [fetchStats])
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false
    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/servicos/execucoes/events`)
        es.onmessage = () => { fetchStats() }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [fetchStats])

  const counts = useMemo(() => {
    const c = { atrasada: 0, a_vencer: 0, no_prazo: 0 }
    for (const it of items) c[it.situacao]++
    return c
  }, [items])

  // Ainda carregando o stats (titulo/scope) — mostra placeholder enxuto
  if (!s) return <EmptyState color="sky" Icon={ListChecks} title="Serviços" message="Carregando..." bloco={bloco} />

  // Sem servicos em aberto — empty state amigavel. Considera tanto `s.emAberto`
  // (contagem do stats) quanto `items.length` (lista do dashboard) — assim o
  // widget sai do estado vazio assim que QUALQUER um dos dois detecta serviço,
  // sem esperar refetch dos dois.
  if (s.emAberto === 0 && items.length === 0) {
    return (
      <EmptyState
        color="sky"
        Icon={ListChecks}
        title="Serviços em Andamento"
        message="Nenhum serviço aberto"
        href="/meus-servicos"
        showCheck
        bloco={bloco}
      />
    )
  }

  const tituloDefault = s.scope === 'todos' ? 'Serviços em Andamento' : s.scope === 'area' ? 'Serviços da Área' : 'Meus Serviços'
  const titulo = title ?? tituloDefault
  const sub = s.scope === 'todos' ? 'Visão geral da empresa' : s.scope === 'area' ? 'Serviços da sua área' : 'Sob sua responsabilidade'

  // Mini-chip de contagem por situacao (versao enxuta do Chip do modo expandido,
  // sem interatividade — clicar leva direto pra lista filtrada na pagina de
  // Meus Serviços via query string).
  function MiniChip({ k, label, Icon }: { k: ExecucaoItem['situacao']; label: string; Icon: typeof Clock }) {
    const cor = SITUACAO_CORES[k]
    const n = counts[k]
    return (
      <Link
        href={`/meus-servicos?situacao=${k}`}
        className="flex items-center gap-1.5 rounded-md border px-2 py-1 transition-shadow hover:shadow-sm shrink-0"
        style={{
          backgroundColor: cor.bg,
          borderColor: `${cor.dot}40`,
          color: cor.text,
        }}
        title={`${n} ${label.toLowerCase()}`}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wider hidden @[260px]:inline">{label}</span>
        <span className="text-sm font-bold tabular-nums leading-none">{n}</span>
      </Link>
    )
  }

  // Lista limitada — slice no maximo LIMITE_ITENS_INICIAL pra nao explodir
  // o card. Os itens ja vem ordenados do backend (atrasada → a_vencer → no_prazo).
  const visiveis = items.slice(0, LIMITE_ITENS_INICIAL)
  const restantes = Math.max(0, items.length - visiveis.length)

  return (
    <Card
      className="h-full border-l-4 border-l-sky-500 overflow-hidden @container/widget"
      style={bloco ? { borderLeftColor: bloco } : undefined}
    >
      <CardContent className="p-3 @sm:p-4 h-full flex flex-col overflow-hidden gap-2.5">
        {/* Header — icone + titulo + contagem total. Bloco clicavel leva pra
            Meus Serviços (mesmo comportamento original). */}
        <Link
          href="/meus-servicos"
          className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0 shrink-0"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
            <ListChecks className="h-4 w-4 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{titulo}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{sub}</p>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            <span className="font-semibold text-foreground">{s.emAberto}</span>{' '}
            {s.emAberto === 1 ? 'ativo' : 'ativos'}
          </span>
        </Link>

        {/* Chips de situacao — so renderiza apos carregar items. Enquanto
            carrega, deixa um espaco vazio pra evitar layout shift quando
            chegar. */}
        <div className="shrink-0 flex flex-wrap gap-1.5 min-h-[26px]">
          {itemsLoaded && !itemsErro && items.length > 0 && (
            <>
              {counts.atrasada > 0 && <MiniChip k="atrasada" label="Atrasadas" Icon={AlertTriangle} />}
              {counts.a_vencer > 0 && <MiniChip k="a_vencer" label="A vencer" Icon={Clock} />}
              {counts.no_prazo > 0 && <MiniChip k="no_prazo" label="No prazo" Icon={CheckCircle2} />}
            </>
          )}
        </div>

        {/* Lista compacta — flex-1 + overflow pra usar a altura restante do
            card. max-h tampa em caso de card muito alto (evita lista
            quilometrica). */}
        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 pr-1">
          {!itemsLoaded ? (
            <p className="text-center text-[11px] text-muted-foreground py-3">Carregando execuções...</p>
          ) : itemsErro ? (
            <p className="text-center text-[11px] text-rose-600 py-3">Erro: {itemsErro}</p>
          ) : visiveis.length === 0 ? (
            <p className="text-center text-[11px] text-muted-foreground py-3">Nenhuma execução em andamento.</p>
          ) : (
            <ul className="space-y-1 px-1 max-h-[200px]">
              {visiveis.map(it => {
                const cor = SITUACAO_CORES[it.situacao]
                const prazo = it.prazoLimite ? new Date(it.prazoLimite) : null
                const prazoLabel = formatarPrazoRelativo(prazo, it.situacao)
                return (
                  <li key={it.id}>
                    <Link
                      href={`/meus-servicos?exec=${it.id}`}
                      className="block rounded border bg-card px-2 py-1.5 hover:shadow-sm transition-shadow"
                      style={{ borderColor: `${cor.dot}30` }}
                      title={`${it.servicoNome} · ${it.clienteNome}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: cor.dot }}
                        />
                        <span className="text-[12px] font-medium truncate flex-1">
                          {it.servicoNome}
                        </span>
                        <span
                          className="text-[10px] font-medium tabular-nums shrink-0"
                          style={{ color: cor.dot }}
                        >
                          {prazoLabel}
                        </span>
                      </div>
                      <div className="ml-3 text-[10px] text-muted-foreground truncate">
                        <span className="truncate">{it.clienteNome}</span>
                        {it.passoAtual && (
                          <>
                            <span className="opacity-50"> · </span>
                            <span>
                              Passo &quot;{it.passoAtual.nome}&quot;{' '}
                              <span className="tabular-nums opacity-70">
                                ({it.passoAtual.concluidos}/{it.passoAtual.totalPassos})
                              </span>
                            </span>
                          </>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer — "+N execucoes · Ver todas" quando exceder o limite */}
        {itemsLoaded && restantes > 0 && (
          <Link
            href="/meus-servicos"
            className="shrink-0 inline-flex items-center justify-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline"
          >
            +{restantes} {restantes === 1 ? 'execução' : 'execuções'} · Ver todas
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
