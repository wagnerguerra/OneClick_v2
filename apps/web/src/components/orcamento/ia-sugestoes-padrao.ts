/**
 * Sugestões padrão (ações rápidas) do assistente de IA do orçamento.
 * Usadas como fallback quando não há nenhuma configurada e como ponto de
 * partida do "Restaurar padrões" nas Configurações.
 */
export type IaSugestao = { label: string; prompt: string }

export const IA_SUGESTOES_PADRAO: IaSugestao[] = [
  { label: 'Analisar e redigir proposta', prompt: 'Analise este orçamento (itens, valores, condições e o histórico do cliente) e redija o texto completo da proposta para enviar ao cliente. Formate em Markdown simples (parágrafos, negrito, listas) — sem HTML e sem blocos de código.' },
  { label: 'Mais formal', prompt: 'Reescreva a última proposta com um tom mais formal e institucional, mantendo as mesmas informações.' },
  { label: 'Mais direto', prompt: 'Reescreva a última proposta de forma mais curta e objetiva, indo direto ao ponto.' },
  { label: 'Destacar o desconto', prompt: 'Reescreva a última proposta destacando o desconto/condição comercial oferecida como um diferencial para o cliente.' },
]
