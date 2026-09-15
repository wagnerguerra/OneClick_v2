'use client'

/**
 * Busca global do cabeçalho — o ⌘K do modelo LuminAux.
 *
 * O sistema tem mais de cem telas em catorze blocos. Chegar em "Particularidades
 * por área" pela sidebar são três cliques e a lembrança de em qual bloco ela
 * mora; aqui são quatro letras. É por isso que a paleta existe: ela substitui
 * o ato de LEMBRAR ONDE por escrever O QUÊ.
 *
 * O que ela oferece, nesta ordem:
 *
 *   1. RECENTES — sem nada digitado, as últimas páginas abertas. É o atalho de
 *      quem vai e volta entre duas telas o dia inteiro, que é o uso mais comum.
 *      Passa pelo MESMO filtro de permissão das Páginas: a trilha mora no
 *      `localStorage`, que não sabe de sessão nem de permissão, então é na
 *      exibição que a permissão de hoje vale (ver `busca-global-recentes.ts`).
 *   2. PÁGINAS — a navegação que ESTE usuário pode ver, do mesmo filtro da
 *      sidebar (`useNavegacaoPermitida`). Oferecer página que ele não pode
 *      abrir seria pior que não achar nada.
 *   3. CLIENTES — registro de verdade, não só tela. Entra a partir de três
 *      letras, porque com uma ou duas a consulta volta a carteira inteira.
 *
 * O teclado manda: ↑↓ andam, ↵ abre, Esc fecha. Quem usa paleta usa sem mouse.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import { Search, CornerDownLeft, Clock, FileText, Handshake, Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'
import { useNavegacaoPermitida } from '@/hooks/use-navegacao-permitida'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'
import {
  type Recente, lerRecentes, registrarRecente, filtrarPermitidos,
} from './busca-global-recentes'

type Achado = {
  chave: string
  titulo: string
  detalhe?: string
  href: string
  grupo: 'Recentes' | 'Páginas' | 'Clientes'
  icone: typeof Search
}

const MIN_LETRAS_REGISTRO = 3
/** Espelha `paleta-out` no globals.css. */
const SAIDA_MS = 130

/** Sem acento e sem caixa: quem digita "orcamento" quer achar "Orçamentos". */
function normalizar(v: string): string {
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Grava a página em que o usuário está, para alimentar os "Recentes".
 *
 * Escuta a NAVEGAÇÃO, e não só o que se abre pela paleta. É a diferença entre
 * uma lista que nasce vazia — e continua vazia para quem nunca usou a paleta —
 * e uma que já está útil na primeira vez que se aperta Ctrl+K.
 *
 * O título vem da navegação, não do `document.title`: em página de detalhe o
 * título do documento é o registro aberto ("Orçamento: #4489"), e o que serve
 * de atalho é a tela ("Orçamentos").
 */
export function RegistradorDeRecentes() {
  const pathname = usePathname()
  const { grupos } = useNavegacaoPermitida()
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!pathname || pathname === '/dashboard' || !userId) return
    let titulo = ''
    let melhor = 0
    for (const g of grupos) {
      for (const item of [...g.items, ...g.items.flatMap(i => i.subItems ?? [])]) {
        // O href mais LONGO que casa vence: /crm/funil é mais específico que
        // /crm, e é ele que a pessoa quer de volta.
        if ((pathname === item.href || pathname.startsWith(item.href + '/')) && item.href.length > melhor) {
          melhor = item.href.length
          titulo = item.label
        }
      }
    }
    if (titulo) registrarRecente(userId, titulo, pathname)
  }, [pathname, grupos, userId])

  return null
}

export function BuscaGlobal() {
  const router = useRouter()
  const { grupos, carregando } = useNavegacaoPermitida()
  const { data: session } = useSession()
  const userId = session?.user?.id ?? null

  const [aberto, setAberto] = useState(false)
  // Continua no DOM enquanto a animação de saída roda: desmontar no clique
  // faria a paleta sumir seca, sem fechamento nenhum.
  const [naTela, setNaTela] = useState(false)
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const [recentes, setRecentes] = useState<Recente[]>([])
  const [clientes, setClientes] = useState<Achado[]>([])
  const [buscandoClientes, setBuscandoClientes] = useState(false)
  const campoRef = useRef<HTMLInputElement>(null)
  const listaRef = useRef<HTMLDivElement>(null)

  // Todas as páginas que este usuário alcança, achatadas com o bloco no detalhe
  // — "Clientes" sozinho não diz nada; "Cadastros · Clientes" diz.
  const paginas = useMemo<Achado[]>(() => {
    const saida: Achado[] = []
    for (const g of grupos) {
      for (const item of g.items) {
        saida.push({ chave: item.href, titulo: item.label, detalhe: g.label,
                     href: item.href, grupo: 'Páginas', icone: item.icon })
        for (const sub of item.subItems ?? []) {
          saida.push({ chave: sub.href, titulo: sub.label, detalhe: `${g.label} · ${item.label}`,
                       href: sub.href, grupo: 'Páginas', icone: sub.icon })
        }
      }
    }
    return saida
  }, [grupos])

  /**
   * Mantém a paleta montada até a saída terminar.
   *
   * `SAIDA_MS` acompanha a duração de `paleta-out` no globals.css — os dois
   * precisam bater, senão ou o painel some antes de terminar o gesto, ou fica
   * um retângulo invisível segurando o clique depois de fechado.
   */
  useEffect(() => {
    if (aberto) { setNaTela(true); return }
    if (!naTela) return
    const t = setTimeout(() => setNaTela(false), SAIDA_MS)
    return () => clearTimeout(t)
  }, [aberto, naTela])

  // ⌘K / Ctrl+K abre de qualquer lugar; Esc fecha.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberto(a => !a)
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  useEffect(() => {
    if (!aberto) return
    setTermo('')
    setSelecionado(0)
    setClientes([])
    setRecentes(lerRecentes(userId))
    // O foco vai para o campo no quadro seguinte — antes disso o input ainda
    // não está montado.
    const t = setTimeout(() => campoRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [aberto, userId])

  // Registro de verdade: só a partir de três letras, com folga entre teclas.
  useEffect(() => {
    const alvo = termo.trim()
    if (alvo.length < MIN_LETRAS_REGISTRO) { setClientes([]); return }
    let cancelado = false
    setBuscandoClientes(true)
    const t = setTimeout(async () => {
      try {
        const r = await (trpc.cliente as never as {
          list: { query: (i: { page: number; limit: number; search: string }) => Promise<{ items: Array<{ id: string; razaoSocial: string; nomeFantasia: string | null; documento: string; code: number }> }> }
        }).list.query({ page: 1, limit: 6, search: alvo })
        if (cancelado) return
        setClientes(r.items.map(c => ({
          chave: `cliente-${c.id}`,
          titulo: c.nomeFantasia || c.razaoSocial,
          detalhe: `#${c.code} · ${c.documento}`,
          href: `/clientes/${c.id}`,
          grupo: 'Clientes' as const,
          icone: Handshake,
        })))
      } catch {
        // Sem permissão no módulo, ou rede fora: a paleta segue com as páginas.
        if (!cancelado) setClientes([])
      } finally {
        if (!cancelado) setBuscandoClientes(false)
      }
    }, 300)
    return () => { cancelado = true; clearTimeout(t) }
  }, [termo])

  const resultados = useMemo<Achado[]>(() => {
    const alvo = normalizar(termo)
    if (!alvo) {
      // O MESMO filtro das Páginas vale para os Recentes.
      //
      // Era aqui o vazamento: Páginas saía de `useNavegacaoPermitida`, mas
      // Recentes vinha direto do `localStorage`, sem passar por permissão
      // nenhuma. Um usuário só com Gestão de Arquivos abria o Ctrl+K e via
      // Usuários, Clientes e HelpDesk — o rastro de outra sessão no mesmo
      // navegador, ou de uma permissão que ele já teve.
      //
      // Enquanto as permissões não chegam, `paginas` está vazia e nada é
      // oferecido: no escuro, não mostrar é a resposta certa.
      if (carregando) return []
      const permitidos = paginas.map(p => p.href)
      return filtrarPermitidos(recentes, permitidos).map(r => ({
        chave: `recente-${r.href}`, titulo: r.titulo,
        href: r.href, grupo: 'Recentes' as const, icone: Clock,
      }))
    }
    const casa = (a: Achado) => normalizar(a.titulo).includes(alvo) || normalizar(a.detalhe ?? '').includes(alvo)
    // Página primeiro: é resposta instantânea e local. O cliente vem depois,
    // porque depende de ida ao servidor e chega alguns décimos mais tarde.
    return [...paginas.filter(casa), ...clientes]
  }, [termo, paginas, clientes, recentes, carregando])

  // A seleção volta ao topo quando a lista muda — manter o índice antigo
  // apontaria para outro item.
  useEffect(() => { setSelecionado(0) }, [resultados.length])

  const abrir = useCallback((a: Achado) => {
    registrarRecente(userId, a.titulo, a.href)
    setAberto(false)
    router.push(a.href)
  }, [router, userId])

  function aoTeclarNaLista(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelecionado(i => Math.min(i + 1, resultados.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelecionado(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const a = resultados[selecionado]; if (a) abrir(a) }
    else if (e.key === 'Escape') { e.preventDefault(); setAberto(false) }
  }

  // Mantém o item escolhido pelo teclado dentro da área visível.
  useEffect(() => {
    const el = listaRef.current?.querySelector<HTMLElement>(`[data-indice="${selecionado}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selecionado])

  let grupoAnterior = ''

  return (
    <>
      {/* Gatilho — 40×40 como os demais ícones do cabeçalho, com o atalho à vista */}
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Buscar no sistema"
        title="Buscar no sistema (Ctrl K)"
        className="hidden h-10 items-center gap-1.5 rounded-lg px-2 text-foreground transition-colors hover:bg-muted sm:inline-flex"
      >
        <Search className="h-5 w-5" />
        <kbd className="hidden rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:inline">
          Ctrl K
        </kbd>
      </button>

      {/*
        A paleta vai para o `document.body`, não para onde o componente mora.

        O gatilho vive dentro do `<header>`, que tem `z-30` e `backdrop-blur-sm`
        — e `backdrop-filter` abre um contexto de empilhamento. Dentro dele o
        `z-[100]` do overlay não vale contra a página: vale contra os irmãos do
        header, e o conjunto inteiro disputa a página no nível 30. Por isso o
        escurecimento cobria o conteúdo mas passava POR BAIXO da sidebar (z-40),
        do rail de tarefas (z-40) e do botão flutuante (z-50) — metade da tela
        escura, metade clara.

        Fora do header, no body, `fixed inset-0` volta a ser a viewport inteira
        e o z-index volta a significar o que diz.
      */}
      {naTela && typeof document !== 'undefined' && createPortal(
        <div
          data-state={aberto ? 'open' : 'closed'}
          className={cn(
            'dialog-overlay fixed inset-0 z-[100] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-[2px]',
            // Já fechada e ainda saindo: deixa de interceptar o clique. Sem
            // isso sobra um retângulo invisível de 130ms comendo o próximo
            // clique da pessoa.
            !aberto && 'pointer-events-none',
          )}
          onClick={() => setAberto(false)}
        >
          <div
            data-state={aberto ? 'open' : 'closed'}
            className="paleta-painel w-full max-w-[672px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
            onClick={e => e.stopPropagation()}
            onKeyDown={aoTeclarNaLista}
          >
            <div className="flex items-center gap-3 border-b border-border px-5 py-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={campoRef}
                value={termo}
                onChange={e => setTermo(e.target.value)}
                placeholder="Digite o nome de uma tela ou de um cliente…"
                className="campo-nu min-w-0 flex-1 text-foreground placeholder:text-muted-foreground"
              />
              {buscandoClientes && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                ESC
              </kbd>
            </div>

            <div ref={listaRef} className="nice-scrollbar max-h-[52vh] overflow-y-auto p-2">
              {resultados.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {termo.trim()
                    ? `Nada encontrado para “${termo.trim()}”.`
                    : 'Digite o nome de uma tela ou de um cliente. As páginas que você abrir aparecem aqui como atalho.'}
                </p>
              )}

              {resultados.map((a, i) => {
                const Icone = a.icone
                const cabecalho = a.grupo !== grupoAnterior ? a.grupo : null
                grupoAnterior = a.grupo
                return (
                  <div key={a.chave}>
                    {cabecalho && (
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1">
                        {cabecalho}
                      </p>
                    )}
                    <button
                      type="button"
                      data-indice={i}
                      onMouseEnter={() => setSelecionado(i)}
                      onClick={() => abrir(a)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                        i === selecionado ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        i === selecionado ? 'bg-primary/10 text-primary' : 'bg-muted/70 text-muted-foreground',
                      )}>
                        <Icone className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{a.titulo}</span>
                        {a.detalhe && (
                          <span className="block truncate text-[11px] text-muted-foreground">{a.detalhe}</span>
                        )}
                      </span>
                      {/* O destino à direita, como no modelo: diz para ONDE o
                          item leva sem precisar clicar para descobrir. */}
                      <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{a.href}</span>
                      {i === selecionado && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </button>
                  </div>
                )
              })}

              {termo.trim().length > 0 && termo.trim().length < MIN_LETRAS_REGISTRO && (
                <p className="flex items-center gap-1.5 px-3 py-2 text-[11px] text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  A partir de {MIN_LETRAS_REGISTRO} letras a busca também procura clientes.
                </p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
