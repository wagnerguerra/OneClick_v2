/**
 * Desconto é um OU outro: geral, ou item a item. Nunca os dois.
 *
 * ## Por quê
 *
 * As duas parcelas somavam (`recalcularTotais`, decisão do #HLP0302). No
 * orçamento #4630 isso deu 20% em cada item MAIS 20% de desconto geral: o
 * resumo mostrou "Desconto (40,0%) − R$ 2.880,00" ao lado de itens marcando
 * −20%, e a leitura natural de quem abriu foi que o total estava errado. Não
 * estava — mas nada na tela dizia que havia dois descontos.
 *
 * ## A regra, e o que ela NÃO faz
 *
 * Barra valor NOVO, nunca o que já está gravado. Orçamento anterior a esta
 * regra que ficou com os dois continua editável e mantém o valor dele — travar
 * o que já existe deixaria o registro sem saída, porque é justamente zerando um
 * dos lados que se desfaz a combinação. E toda edição de outro campo passa pelo
 * mesmo `update` (a tela salva sozinha), então uma guarda cega travaria o
 * orçamento inteiro.
 *
 * Vive fora do service, sem Prisma, para a regra ter teste.
 */

export type DecisaoDesconto = { permitido: boolean; motivo: string | null }

export const MOTIVO_GERAL_BLOQUEADO =
  'Este orçamento já tem desconto nos itens. Zere o desconto dos itens para usar o desconto geral — '
  + 'os dois juntos somariam, e o total deixaria de bater com o que as linhas mostram.'

export const MOTIVO_ITEM_BLOQUEADO =
  'Este orçamento já tem desconto geral. Zere o desconto geral (aba Itens, "Desconto e Pagamento") '
  + 'para aplicar desconto item a item — os dois juntos somariam.'

/**
 * O maior entre percentual e valor fixo, tratado só como "há desconto?".
 *
 * Não é uma soma nem uma conversão: percentual e reais não se somam. Serve
 * apenas para responder se o lado está zerado, e por isso o máximo basta.
 */
export function intensidadeDesconto(
  pct: number | string | null | undefined,
  valor: number | string | null | undefined,
): number {
  return Math.max(Number(pct ?? 0) || 0, Number(valor ?? 0) || 0)
}

/**
 * Decide se um desconto pode ser gravado.
 *
 * - `pedido`   — a intensidade que está chegando
 * - `atual`    — a que já está gravada NESTE lado (item ou cabeçalho)
 * - `outroLadoTemDesconto` — o outro lado já tem desconto?
 */
export function decidirDesconto(
  pedido: number,
  atual: number,
  outroLadoTemDesconto: boolean,
  motivo: string,
): DecisaoDesconto {
  // Zerar é sempre permitido — é a saída de quem já tem os dois.
  if (pedido <= 0) return { permitido: true, motivo: null }
  // Reenvio do mesmo valor não é desconto novo. A tela salva sozinha e manda o
  // orçamento inteiro a cada mudança; sem isto, mexer na forma de pagamento de
  // um orçamento antigo dispararia o bloqueio.
  if (pedido === atual) return { permitido: true, motivo: null }
  if (!outroLadoTemDesconto) return { permitido: true, motivo: null }
  return { permitido: false, motivo }
}
