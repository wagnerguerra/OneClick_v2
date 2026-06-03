'use client'

import { useMemo } from 'react'
import { marked } from 'marked'
import { cn } from '@saas/ui'

/**
 * Renderiza texto markdown como HTML formatado. Usado pra exibir o plano
 * gerado pela IA do helpdesk (#HLP0083) — o plano fica armazenado e
 * trafega como markdown, mas é mostrado bonito pro operador.
 *
 * Estilo via Tailwind arbitrary variants (sem dependência do plugin
 * @tailwindcss/typography). Cobre h1-h3, p, ul/ol, code inline, pre,
 * blockquote, links, strong, em, hr.
 *
 * ⚠️ marked.parse() pode retornar Promise dependendo da config; aqui
 * forçamos modo síncrono via `async: false` (default).
 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => {
    if (!source) return ''
    try {
      // GFM = GitHub-Flavored Markdown (tabelas, listas com task box, autolinks)
      return marked.parse(source, { async: false, gfm: true, breaks: true }) as string
    } catch {
      return source.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))
    }
  }, [source])

  return (
    <div
      className={cn(
        'text-sm leading-relaxed',
        // Headings
        '[&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-2',
        '[&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5',
        '[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
        '[&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1',
        // Parágrafos
        '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        // Listas
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul]:space-y-0.5',
        '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol]:space-y-0.5',
        '[&_li]:leading-snug',
        // Code
        '[&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-muted [&_code]:text-[0.85em] [&_code]:font-mono',
        '[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12px]',
        // Inline
        '[&_strong]:font-semibold [&_em]:italic',
        // Links
        '[&_a]:text-sky-600 [&_a]:underline hover:[&_a]:text-sky-700 dark:[&_a]:text-sky-400',
        // Quotes
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        // Tabelas (GFM)
        '[&_table]:my-2 [&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse',
        '[&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:border [&_th]:border-border [&_th]:font-semibold',
        '[&_td]:px-2 [&_td]:py-1 [&_td]:border [&_td]:border-border',
        // HR
        '[&_hr]:my-3 [&_hr]:border-border',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
