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
import { Button } from '@saas/ui'
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
        {/* styles escopados p/ o HTML editável (RichEditor); o HTML migrado dos
            artigos de sistema já traz suas classes utilitárias. */}
        <style dangerouslySetInnerHTML={{ __html: FAQ_HTML_CSS }} />
        <div className="faq-html" dangerouslySetInnerHTML={{ __html: artigo.conteudoHtml }} />
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

// Estilo do corpo HTML editável — cobre títulos/listas/citações/links/regra.
const FAQ_HTML_CSS = `
  .faq-html { font-size: 0.875rem; line-height: 1.65; }
  .faq-html > * + * { margin-top: 0.75rem; }
  .faq-html h1 { font-size: 1.4em; font-weight: 700; margin: 0.6em 0 0.3em; }
  .faq-html h2 { font-size: 1.2em; font-weight: 700; margin: 0.8em 0 0.3em; }
  .faq-html h3 { font-size: 1.05em; font-weight: 600; margin: 0.6em 0 0.2em; }
  .faq-html ul { list-style: disc; padding-left: 1.5rem; }
  .faq-html ol { list-style: decimal; padding-left: 1.5rem; }
  .faq-html li { margin: 0.15rem 0; }
  .faq-html a { color: var(--color-primary, #0891b2); text-decoration: underline; }
  .faq-html blockquote { border-left: 3px solid var(--color-border); padding-left: 0.75rem; color: var(--color-muted-foreground); margin: 0.5rem 0; }
  .faq-html hr { border: 0; border-top: 1px solid var(--color-border); margin: 0.9rem 0; }
  .faq-html strong { font-weight: 600; }
  .faq-html img { max-width: 100%; border-radius: 6px; }
`
