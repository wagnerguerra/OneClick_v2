'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, ArrowRight, Plus, MoreVertical, Pencil, Trash2, EyeOff, X,
  LifeBuoy, Handshake, Landmark, Workflow, Users, Database, Layers, Sparkles, Headphones,
} from 'lucide-react'
import {
  Card, CardContent, Input, Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  cn,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { useState, useMemo, useEffect, useCallback, type ComponentType } from 'react'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { trpc } from '@/lib/trpc'
import { PageHeaderBar } from '@/components/page-header-bar'
import { alerts } from '@/lib/alerts'
import { FAQ_ARTIGOS, CATEGORIA_ORDEM } from './_components/articles-catalog'
import { resolveFaqIcon } from './_components/faq-icons'

/** Acento da seção FAQ — o mesmo do cabeçalho dos artigos. */
const FAQ_COLOR = '#0891b2'

/**
 * Ícone e cor de cada categoria.
 *
 * Categoria não é módulo: não existe em `module_colors`, então não há CSS var
 * para puxar. O hex aqui segue a convenção que o próprio catálogo de artigos já
 * usa (`moduloColor`). Categoria nova sem entrada cai no acento do FAQ.
 */
const CATEGORIA_META: Record<string, { icon: ComponentType<{ className?: string }>; cor: string }> = {
  'Comercial': { icon: Handshake, cor: '#e11d48' },
  'Fiscal': { icon: Landmark, cor: '#0369a1' },
  'Operacional': { icon: Workflow, cor: '#7c3aed' },
  'Trabalhista': { icon: Users, cor: '#ea580c' },
  'Cadastros e estrutura': { icon: Database, cor: '#059669' },
  'Templates por Segmento': { icon: Layers, cor: '#0891b2' },
}
const metaDaCategoria = (c: string) => CATEGORIA_META[c] ?? { icon: Sparkles, cor: FAQ_COLOR }

/**
 * Artigos de entrada, para quem chega sem saber o que procurar.
 *
 * É uma escolha editorial, não um ranking: não medimos acesso, então seria
 * invenção rotular isto de "mais lidos".
 */
const COMECE_POR_AQUI = ['cliente-onboard', 'orcamentos', 'meus-servicos', 'helpdesk', 'multi-empresa']

/** Fundo suave do chip de ícone, na cor do módulo/categoria. */
const tint = (cor: string, pct = 12) => `color-mix(in srgb, ${cor} ${pct}%, transparent)`

/** Artigo unificado p/ render no hub (código ou banco). */
interface HubArtigo {
  slug: string
  titulo: string
  descricao: string
  modulo: string
  moduloColor: string
  Icon: ComponentType<{ className?: string }>
  categoria: string
  tags: string[]
  fonte: 'codigo' | 'banco'
  dbId?: string
  rascunho: boolean
}

interface DbArtigo {
  id: string; slug: string; titulo: string; descricao: string; modulo: string
  moduloColor: string; icon: string; categoria: string; tags: string[]; publicado: boolean
}

export default function FaqHubPage() {
  const [search, setSearch] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [dbArtigos, setDbArtigos] = useState<DbArtigo[]>([])
  const { profile } = useCurrentUserProfile()
  const isMaster = !!(profile?.isMaster || profile?.isEmpresaMaster)
  const router = useRouter()

  const carregar = useCallback(async () => {
    try {
      const data = await (trpc.faq as any).list.query()
      setDbArtigos(data ?? [])
    } catch { setDbArtigos([]) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  // Mescla: catálogo de código + banco (dedupe por slug, banco vence).
  const merged = useMemo<HubArtigo[]>(() => {
    const map = new Map<string, HubArtigo>()
    for (const a of FAQ_ARTIGOS) {
      if (!a.disponivel) continue
      map.set(a.slug, {
        slug: a.slug, titulo: a.titulo, descricao: a.descricao, modulo: a.modulo,
        moduloColor: a.moduloColor, Icon: a.icon, categoria: a.categoria, tags: a.tags,
        fonte: 'codigo', rascunho: false,
      })
    }
    for (const d of dbArtigos) {
      map.set(d.slug, {
        slug: d.slug, titulo: d.titulo, descricao: d.descricao, modulo: d.modulo,
        moduloColor: d.moduloColor, Icon: resolveFaqIcon(d.icon), categoria: d.categoria,
        tags: d.tags ?? [], fonte: 'banco', dbId: d.id, rascunho: !d.publicado,
      })
    }
    return [...map.values()]
  }, [dbArtigos])

  /** Resultado da BUSCA — a contagem dos tópicos sai daqui, não do filtro. */
  const buscados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return merged
    return merged.filter(a =>
      a.titulo.toLowerCase().includes(q)
      || a.descricao.toLowerCase().includes(q)
      || a.modulo.toLowerCase().includes(q)
      || a.categoria.toLowerCase().includes(q)
      || a.tags.some(t => t.toLowerCase().includes(q)),
    )
  }, [merged, search])

  const visiveis = useMemo(
    () => (categoria ? buscados.filter(a => a.categoria === categoria) : buscados),
    [buscados, categoria],
  )

  /** Tópicos com a contagem já refletindo a busca ativa. */
  const topicos = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const a of buscados) contagem.set(a.categoria, (contagem.get(a.categoria) ?? 0) + 1)
    const ordem = [...CATEGORIA_ORDEM as readonly string[]]
    const extras = [...contagem.keys()].filter(c => !ordem.includes(c)).sort()
    return [...ordem, ...extras]
      .map(c => ({ categoria: c, total: contagem.get(c) ?? 0 }))
      .filter(t => t.total > 0)
  }, [buscados])

  // Agrupa por categoria (ordem oficial primeiro; categorias novas vão ao fim).
  const porCategoria = useMemo(() => {
    const map = new Map<string, HubArtigo[]>()
    for (const a of visiveis) {
      const arr = map.get(a.categoria) ?? []
      arr.push(a)
      map.set(a.categoria, arr)
    }
    const ordem = [...CATEGORIA_ORDEM as readonly string[]]
    const extras = [...map.keys()].filter(c => !ordem.includes(c)).sort()
    return [...ordem, ...extras]
      .map(c => ({ categoria: c, artigos: (map.get(c) ?? []).sort((a, b) => a.titulo.localeCompare(b.titulo)) }))
      .filter(g => g.artigos.length > 0)
  }, [visiveis])

  const total = visiveis.length
  const filtrando = !!categoria || !!search.trim()

  const comecePorAqui = useMemo(
    () => COMECE_POR_AQUI.map(s => merged.find(a => a.slug === s)).filter((a): a is HubArtigo => !!a),
    [merged],
  )

  async function excluir(a: HubArtigo) {
    if (!a.dbId) return
    const ok = await alerts.confirmDelete(a.titulo)
    if (!ok) return
    try {
      await (trpc.faq as any).delete.mutate({ id: a.dbId })
      await carregar()
    } catch (e) { alerts.error('Erro ao excluir', (e as Error).message) }
  }

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={isMaster ? (
        <Button variant="success" size="sm" asChild>
          <Link href="/faq/novo"><Plus className="h-4 w-4" /> Novo artigo</Link>
        </Button>
      ) : undefined}>
        <h1 className="truncate">FAQ&apos;s</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>FAQ&apos;s</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{total} artigo{total === 1 ? '' : 's'}</span>
        </p>
      </PageHeaderBar>

      {/* ═══ Faixa de abertura — a busca é a ação principal da página ═══ */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border px-6 py-10 text-center sm:py-14"
        style={{
          backgroundImage: `linear-gradient(to bottom right, ${tint(FAQ_COLOR, 14)} 0%, var(--color-card) 50%, ${tint('#7c3aed', 10)} 100%)`,
        }}
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold shadow-sm"
          style={{ color: FAQ_COLOR }}
        >
          <LifeBuoy className="h-3.5 w-3.5" />
          Central de Ajuda
        </span>

        {/* Explicitamente maior que o h2 global (16px): esta é a capa da página. */}
        <h2 className="mt-4 text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">
          Em que podemos ajudar?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Busque abaixo ou escolha um tópico para ver os artigos daquele assunto.
        </p>

        <div className="relative mx-auto mt-6 max-w-lg text-left">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar por tópico, módulo ou palavra-chave..."
            className="h-12 rounded-full pl-11 pr-10 text-base shadow-md"
          />
          {!!search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* ═══ Navegar por tópico — os cards são o filtro ═══ */}
      {topicos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Navegar por tópico</h2>
            {categoria && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setCategoria(null)}>
                <X className="h-3.5 w-3.5" />Limpar filtro
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {topicos.map(t => {
              const { icon: Icone, cor } = metaDaCategoria(t.categoria)
              const ativo = categoria === t.categoria
              return (
                <button
                  key={t.categoria}
                  type="button"
                  onClick={() => setCategoria(ativo ? null : t.categoria)}
                  aria-pressed={ativo}
                  className="flex h-full w-full flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  style={{
                    borderColor: ativo ? cor : undefined,
                    backgroundColor: ativo ? tint(cor, 7) : undefined,
                  }}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: tint(cor), color: cor }}
                  >
                    <Icone className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight text-foreground">{t.categoria}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                      {t.total} artigo{t.total === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ═══ Lista + barra lateral ═══ */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {categoria ?? 'Todos os artigos'}
            {filtrando && (
              <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground">
                {total} encontrado{total === 1 ? '' : 's'}
              </span>
            )}
          </h2>

          {porCategoria.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-4 py-14 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum artigo encontrado{search.trim() ? <> para &quot;{search.trim()}&quot;</> : null}.
              </p>
              <Button
                variant="outline" size="sm" className="mt-3"
                onClick={() => { setSearch(''); setCategoria(null) }}
              >
                Limpar busca e filtro
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {porCategoria.map(grupo => (
                <div key={grupo.categoria}>
                  {/* Cabeçalho de grupo some quando já existe um filtro de categoria. */}
                  {!categoria && (
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {grupo.categoria}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground/70">
                        {grupo.artigos.length}
                      </span>
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {grupo.artigos.map(a => (
                      <ArticleRow
                        key={a.slug}
                        artigo={a}
                        isMaster={isMaster}
                        onEditar={() => router.push(`/faq/editar/${a.slug}`)}
                        onExcluir={() => excluir(a)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Barra lateral acompanha a rolagem: a lista é longa. */}
        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--app-header-offset)_+_1.5rem)] lg:self-start">
          {comecePorAqui.length > 0 && (
            <Card className="rounded-2xl">
              <CardContent className="p-5">
                <p className="text-sm font-semibold text-foreground">Comece por aqui</p>
                <ul className="mt-3 space-y-2.5">
                  {comecePorAqui.map(a => {
                    const Icon = a.Icon
                    return (
                      <li key={a.slug}>
                        <Link
                          href={`/faq/${a.slug}`}
                          className="group flex items-start gap-2 text-[13px] leading-snug text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0">{a.titulo}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="rounded-2xl">
            <CardContent className="p-5 text-center">
              <span
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: tint(FAQ_COLOR), color: FAQ_COLOR }}
              >
                <Headphones className="h-5 w-5" />
              </span>
              <p className="mt-3 text-base font-semibold text-foreground">Ainda tem dúvidas?</p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Não encontrou o que procurava? Abra um chamado que o time responde por lá.
              </p>
              <Button className="mt-4 w-full gap-2" asChild>
                <Link href="/helpdesk"><Headphones className="h-4 w-4" />Abrir um chamado</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/**
 * Uma linha da lista de artigos.
 *
 * O link cobre a linha inteira por sobreposição (`absolute inset-0`) em vez de
 * envolver o conteúdo: assim o menu de ações do master continua clicável, sem
 * aninhar botão dentro de link — que é inválido e quebra o teclado.
 */
function ArticleRow({ artigo: a, isMaster, onEditar, onExcluir }: {
  artigo: HubArtigo; isMaster: boolean; onEditar: () => void; onExcluir: () => void
}) {
  const Icon = a.Icon
  return (
    <div className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
      <Link href={`/faq/${a.slug}`} className="absolute inset-0 z-0" aria-label={a.titulo} />

      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: tint(a.moduloColor), color: a.moduloColor }}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{a.titulo}</p>
          {a.rascunho && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              <EyeOff className="h-2.5 w-2.5" /> rascunho
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-medium" style={{ color: a.moduloColor }}>{a.modulo}</span>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {a.descricao}
        </p>
      </div>

      {isMaster ? (
        <div className="relative z-10 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
                aria-label={`Ações do artigo ${a.titulo}`}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditar}><Pencil className="mr-2 h-3.5 w-3.5" /> Editar</DropdownMenuItem>
              {a.fonte === 'banco' && (
                <DropdownMenuItem onClick={onExcluir} className={cn(TEXT.rose, 'focus:text-rose-600 dark:focus:text-rose-400')}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  )
}
