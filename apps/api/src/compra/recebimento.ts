/**
 * Recebimento por item do pedido de compra — regras puras.
 *
 * Cada item pode chegar em partes, em datas diferentes (CompraItemRecebimento).
 * O pedido:
 *   APROVADO          → nada chegou ainda
 *   RECEBIDO_PARCIAL  → parte chegou
 *   RECEBIDO          → todos os itens completos (e aí pode ser avaliado)
 *
 * Pedido recebido antes do recebimento por item (25/09/2026) não tem registros:
 * seus itens contam como recebidos por inteiro.
 */

export type SituacaoRecebimento = 'PENDENTE' | 'PARCIAL' | 'RECEBIDO'

/** Status que já passaram pelo recebimento do pedido inteiro (legado). */
const JA_RECEBIDO = new Set(['RECEBIDO', 'AVALIADO'])

/**
 * Quanto do item já chegou. Sem registros num pedido já recebido (legado),
 * é a quantidade inteira.
 */
export function quantidadeRecebida(
  item: { quantidade: number },
  registros: Array<{ quantidade: number }>,
  statusPedido: string,
): number {
  if (registros.length === 0 && JA_RECEBIDO.has(statusPedido)) return item.quantidade
  return registros.reduce((t, r) => t + r.quantidade, 0)
}

export function situacaoDoItem(quantidade: number, recebida: number): SituacaoRecebimento {
  if (recebida <= 0) return 'PENDENTE'
  return recebida >= quantidade ? 'RECEBIDO' : 'PARCIAL'
}

/** Status do pedido pela soma dos itens (só entre os estados de recebimento). */
export function statusPeloRecebimento(itens: Array<{ quantidade: number; recebida: number }>): 'APROVADO' | 'RECEBIDO_PARCIAL' | 'RECEBIDO' {
  if (itens.length === 0) return 'APROVADO'
  if (itens.every(i => i.recebida >= i.quantidade)) return 'RECEBIDO'
  if (itens.some(i => i.recebida > 0)) return 'RECEBIDO_PARCIAL'
  return 'APROVADO'
}

/**
 * Confere uma entrega antes de gravar. Devolve a mensagem do primeiro problema
 * ou `null`. Não deixa receber mais do que falta: excesso é erro de digitação
 * (ou item a mais, que é outro pedido).
 */
export function validarEntrega(
  itensDoPedido: Array<{ id: string; descricao: string; quantidade: number; recebida: number }>,
  entrega: Array<{ itemId: string; quantidade: number }>,
): string | null {
  const porId = new Map(itensDoPedido.map(i => [i.id, i]))
  const vistos = new Set<string>()
  for (const e of entrega) {
    const item = porId.get(e.itemId)
    if (!item) return 'Item não pertence a este pedido.'
    if (vistos.has(e.itemId)) return `"${item.descricao}" aparece duas vezes na mesma entrega.`
    vistos.add(e.itemId)
    if (!Number.isInteger(e.quantidade) || e.quantidade <= 0) return `Quantidade inválida para "${item.descricao}".`
    const falta = item.quantidade - item.recebida
    if (falta <= 0) return `"${item.descricao}" já foi recebido por inteiro.`
    if (e.quantidade > falta) return `"${item.descricao}": faltam ${falta}, não dá para receber ${e.quantidade}.`
  }
  return null
}
