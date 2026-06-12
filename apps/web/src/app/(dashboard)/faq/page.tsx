'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HelpCircle, Search, ArrowRight, Plus, MoreVertical, Pencil, Trash2, EyeOff } from 'lucide-react'
import {
  Card, CardContent, Input, Button,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { useState, useMemo, useEffect, useCallback, type ComponentType } from 'react'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { FAQ_ARTIGOS, CATEGORIA_ORDEM } from './_components/articles-catalog'
import { resolveFaqIcon } from './_components/faq-icons'

const MODULE_COLOR = 'var(--mod-faq, #0891b2)' // cyan-600

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

  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return merged
    return merged.filter(a =>
      a.titulo.toLowerCase().includes(q)
      || a.descricao.toLowerCase().includes(q)
      || a.modulo.toLowerCase().includes(q)
      || a.tags.some(t => t.toLowerCase().includes(q)),
    )
  }, [merged, search])

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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <HelpCircle className="h-6 w-6" />
          </div>
          <div>
            <h1>FAQ&apos;s</h1>
            <p className="text-sm text-muted-foreground">
              Documentação dos fluxos do sistema · {total} artigo{total === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        {isMaster && (
          <Button variant="success" size="sm" asChild>
            <Link href="/faq/novo"><Plus className="h-4 w-4" /> Novo artigo</Link>
          </Button>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por tópico, módulo ou palavra-chave..."
          className="h-9 pl-8 text-sm"
        />
      </div>

      {/* Listagem agrupada por categoria */}
      {porCategoria.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          Nenhum artigo encontrado para &quot;{search}&quot;.
        </p>
      )}
      {porCategoria.map(grupo => (
        <section key={grupo.categoria} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1.5">
            {grupo.categoria}
            <span className="ml-2 text-[10px] font-normal text-muted-foreground/70 tabular-nums">
              {grupo.artigos.length} {grupo.artigos.length === 1 ? 'artigo' : 'artigos'}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {grupo.artigos.map(a => (
              <ArticleCard key={a.slug} artigo={a} isMaster={isMaster} onEditar={() => router.push(`/faq/editar/${a.slug}`)} onExcluir={() => excluir(a)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ArticleCard({ artigo: a, isMaster, onEditar, onExcluir }: {
  artigo: HubArtigo; isMaster: boolean; onEditar: () => void; onExcluir: () => void
}) {
  const Icon = a.Icon
  return (
    <Card className="relative h-full hover:shadow-md transition-shadow group">
      <Link href={`/faq/${a.slug}`}>
        <CardContent className="p-4 cursor-pointer">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: a.moduloColor }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: a.moduloColor }}>
                  {a.modulo}
                </span>
                <div className="flex items-center gap-1.5">
                  {a.rascunho && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300 rounded px-1 py-0.5">
                      <EyeOff className="h-2.5 w-2.5" /> rascunho
                    </span>
                  )}
                  {!isMaster && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />}
                </div>
              </div>
              <h3 className="text-sm font-semibold leading-tight mb-1 pr-6">{a.titulo}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.descricao}</p>
            </div>
          </div>
        </CardContent>
      </Link>
      {isMaster && (
        <div className="absolute top-2 right-2" onClick={(e) => e.preventDefault()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Ações do artigo">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEditar}><Pencil className="h-3.5 w-3.5 mr-2" /> Editar</DropdownMenuItem>
              {a.fonte === 'banco' && (
                <DropdownMenuItem onClick={onExcluir} className="text-rose-600 dark:text-rose-400 focus:text-rose-600 dark:focus:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </Card>
  )
}
