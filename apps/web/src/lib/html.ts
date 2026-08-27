/**
 * Utilitários de HTML para a interface.
 *
 * O projeto guarda texto rico como HTML (escrito no `RichEditor`). Para
 * **exibir** esse conteúdo, a regra do `CLAUDE.md` é `<RichContent>`, que
 * respeita listas, títulos e citações.
 *
 * `stripHtml` é a exceção declarada nessa regra: prévia com `line-clamp`, que
 * achata o conteúdo de propósito — num card de kanban de duas linhas, um `<p>`
 * ou uma lista não têm para onde ir, e renderizar a tag crua é pior ainda
 * (foi o que apareceu no card do projeto: "<p>Desenvolvimento…</p>").
 */

/** Texto puro a partir de HTML. Só para prévia; nunca para o conteúdo completo. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
