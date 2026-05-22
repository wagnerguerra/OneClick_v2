/**
 * Substitui referências `#HLP1234` em HTML por links clicáveis para a página
 * de redirect `/helpdesk/n/<numero>` (que resolve o número para o id e redireciona).
 *
 * Padrão: `#HLP` seguido de 1 a 8 dígitos. Limite serve pra evitar pegar
 * sequências numéricas absurdas e pra preservar performance (não escala-livre).
 */
export function linkifyHelpdesk(html: string): string {
  if (!html) return html
  return html.replace(
    /#HLP(\d{1,8})\b/g,
    (_match, numero: string) =>
      `<a href="/helpdesk/n/${numero}" class="text-cyan-600 hover:underline font-semibold">#HLP${numero}</a>`,
  )
}
