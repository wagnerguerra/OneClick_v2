'use client'

import Link from 'next/link'
import { HelpCircle, Search, ArrowRight, Sparkles } from 'lucide-react'
import { Card, CardContent, Input } from '@saas/ui'
import { useState, useMemo } from 'react'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { FAQ_ARTIGOS, CATEGORIA_ORDEM, type FaqArtigo, type FaqCategoria } from './_components/articles-catalog'

const MODULE_COLOR = 'var(--mod-faq, #0891b2)' // cyan-600

export default function FaqHubPage() {
  const [search, setSearch] = useState('')
  const { profile } = useCurrentUserProfile()
  const isMaster = profile?.isMaster || profile?.isEmpresaMaster

  // Filtra por busca + remove os ainda não escritos
  const visiveis = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = FAQ_ARTIGOS.filter(a => a.disponivel)
    if (!q) return base
    return base.filter(a =>
      a.titulo.toLowerCase().includes(q)
      || a.descricao.toLowerCase().includes(q)
      || a.modulo.toLowerCase().includes(q)
      || a.tags.some(t => t.includes(q)),
    )
  }, [search])

  // Agrupa por categoria, preservando a ordem oficial
  const porCategoria = useMemo(() => {
    const map = new Map<FaqCategoria, FaqArtigo[]>()
    for (const a of visiveis) {
      const arr = map.get(a.categoria) ?? []
      arr.push(a)
      map.set(a.categoria, arr)
    }
    return CATEGORIA_ORDEM
      .map(c => ({ categoria: c, artigos: map.get(c) ?? [] }))
      .filter(g => g.artigos.length > 0)
  }, [visiveis])

  const totalDisponivel = FAQ_ARTIGOS.filter(a => a.disponivel).length
  const totalPlanejado = FAQ_ARTIGOS.length

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
              Documentação dos fluxos do sistema · {totalDisponivel} artigo{totalDisponivel === 1 ? '' : 's'} publicado{totalDisponivel === 1 ? '' : 's'}
              {totalPlanejado > totalDisponivel && (
                <span className="text-muted-foreground/70"> · {totalPlanejado - totalDisponivel} em produção</span>
              )}
            </p>
          </div>
        </div>
        {isMaster && (
          <Link
            href="/admin/design-system"
            className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 text-[12px] font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
            title="Design System do FAQ — só master"
          >
            <Sparkles className="h-3.5 w-3.5" /> Design System
          </Link>
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
              <ArticleCard key={a.slug} artigo={a} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ArticleCard({ artigo: a }: { artigo: FaqArtigo }) {
  const Icon = a.icon
  return (
    <Link href={`/faq/${a.slug}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: a.moduloColor }}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: a.moduloColor }}
                >
                  {a.modulo}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-sm font-semibold leading-tight mb-1">{a.titulo}</h3>
              <p className="text-xs text-muted-foreground line-clamp-2">{a.descricao}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
