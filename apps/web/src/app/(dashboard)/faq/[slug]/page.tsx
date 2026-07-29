'use client'

/**
 * Rota dinâmica de artigo do FAQ.
 *  1. Busca o artigo no banco (faq_artigos) por slug.
 *  2. Se existe → renderiza o conteúdo (HTML) dentro do ArticleShell.
 *  3. Se não → renderiza o componente de código (fallback em _articles/).
 *  4. Nenhum dos dois → "não encontrado".
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Button, RichContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { ArticleShell } from '../_components/article-shell'
import { resolveFaqIcon } from '../_components/faq-icons'
import { faqArticleComponents } from '../_articles'

interface DbArtigo {
  slug: string
  titulo: string
  descricao: string
  modulo: string
  moduloColor: string
  icon: string
  conteudoHtml: string
  publicado: boolean
}

export default function FaqArtigoPage() {
  const params = useParams()
  const slug = String(params?.slug ?? '')
  const [artigo, setArtigo] = useState<DbArtigo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const data = await (trpc.faq as any).getBySlug.query({ slug })
        if (alive) setArtigo(data ?? null)
      } catch {
        if (alive) setArtigo(null)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [slug])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 text-muted-foreground py-24">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando artigo…
      </div>
    )
  }

  // 1) Artigo do banco (editável) — tem precedência
  if (artigo) {
    const Icon = resolveFaqIcon(artigo.icon)
    return (
      <ArticleShell
        modulo={artigo.modulo}
        moduloColor={artigo.moduloColor}
        icon={Icon}
        titulo={artigo.titulo}
        descricao={artigo.descricao}
      >
        {/* O HTML migrado dos artigos de sistema já traz suas classes
            utilitárias; o escrito no RichEditor depende do RichContent, que
            aplica as MESMAS regras do editor. Antes havia aqui um bloco
            `.faq-html` que replicava essas regras à mão. */}
        <RichContent className="text-sm leading-relaxed [&_a]:text-primary" html={artigo.conteudoHtml} />
      </ArticleShell>
    )
  }

  // 2) Fallback: componente de código (artigo de sistema ainda não editado)
  const CodeArticle = faqArticleComponents[slug]
  if (CodeArticle) return <CodeArticle />

  // 3) Não encontrado
  return (
    <div className="max-w-md mx-auto text-center py-24 space-y-4">
      <p className="text-sm text-muted-foreground">Artigo não encontrado.</p>
      <Button variant="outline" size="sm" asChild>
        <Link href="/faq"><ArrowLeft className="h-3.5 w-3.5" /> Voltar para o FAQ</Link>
      </Button>
    </div>
  )
}

