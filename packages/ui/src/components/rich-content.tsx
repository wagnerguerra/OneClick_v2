'use client'

import { cn } from '../lib/utils'

/**
 * Renderiza o HTML produzido pelo <RichEditor>, com o MESMO visual do editor.
 *
 * Por que existe: o CSS do editor é escopado em `.rich-editor-root`, então vale
 * só DENTRO da área de edição. Ao exibir o conteúdo salvo, cada tela precisava
 * reestilizar por conta própria — e várias tinham colocado `prose prose-sm`,
 * que NÃO faz nada neste projeto: o `@tailwindcss/typography` nunca foi
 * instalado (decisão explícita, ver o comentário no topo de `markdown-view.tsx`).
 * Resultado: lista saía sem marcador, citação sem barra, título sem hierarquia.
 *
 * Técnica: arbitrary variants do Tailwind, o mesmo caminho já adotado pelo
 * `MarkdownView` — mantém a decisão de não depender do plugin.
 *
 * ⚠️ NÃO use em dois casos, que são diferentes de propósito:
 *  - Prévias com `line-clamp`, que achatam o HTML pra caber numa linha
 *    (helpdesk, cláusulas, orçamentos do legado).
 *  - A proposta impressa (`.descricao-content`), que tem CSS próprio por dois
 *    motivos reais: usa `em` relativo aos 13px do documento pra impressão casar
 *    com a tela, e precisa vencer por especificidade a regra `.quote-doc h1,h2,h3`.
 *
 * As regras abaixo espelham o bloco `<style>` do `rich-editor.tsx`. Mexeu lá,
 * mexa aqui.
 */
export function RichContent({ html, className, style }: {
  html: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      style={style}
      className={cn(
        // Parágrafos — sem margem sobrando na primeira/última linha, que é o que
        // desalinha o texto dentro de cards e caixas.
        '[&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        // Listas — o que estava quebrado na maioria das telas.
        '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2',
        '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2',
        '[&_li]:my-0.5 [&_li>p]:my-0',
        // Títulos — proporções idênticas às do editor.
        '[&_h1]:text-[1.5em] [&_h1]:font-bold [&_h1]:mt-[0.6em] [&_h1]:mb-[0.3em]',
        '[&_h2]:text-[1.25em] [&_h2]:font-semibold [&_h2]:mt-[0.5em] [&_h2]:mb-[0.3em]',
        '[&_h3]:text-[1.1em] [&_h3]:font-semibold [&_h3]:mt-[0.4em] [&_h3]:mb-[0.2em]',
        // Citação e linha divisória.
        '[&_blockquote]:border-l-[3px] [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_blockquote]:my-2',
        '[&_hr]:border-0 [&_hr]:border-t [&_hr]:border-border [&_hr]:my-3',
        // Marcações inline.
        '[&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through',
        // Links e imagens: o editor já grava classe própria no HTML que ele
        // gera, mas conteúdo antigo (ou colado de fora) vem sem — daí o fallback.
        '[&_a]:underline [&_img]:max-w-full [&_img]:rounded',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
