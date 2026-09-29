/**
 * Farol de completude do orçamento (medidor da "Visão geral" do preview).
 *
 * Vai de 0 a 100 somando o quanto o orçamento já andou e o quanto de
 * informação ele carrega. Não é o prazo: é "o que já está feito e o que
 * falta". Pesos (somam 100):
 *
 *  - etapa avançada ........ 40  (Novo 0 · A enviar 8 · Enviado 16 ·
 *                                  Aprovado 24 · Liberado 32 · Finalizado 40)
 *  - itens ................. 15  (tem itens 10 + tem serviço com valor 5)
 *  - valor definido ........  5
 *  - arquivos ..............  10  (ao menos um anexo)
 *  - mensagens .............  10  (1 ou 2 = 5; 3+ = 10)
 *  - pessoas ...............  10  (solicitante 5 + responsável do serviço 5)
 *  - tempo de vida .........  10  (no prazo 10 · atenção 5 · vencido 0;
 *                                  etapa final / sem prazo conta 10)
 *
 * Encerrado (saiu do funil) não pontua etapa.
 */

export type NivelCompletude = 'incompleto' | 'andamento' | 'quase' | 'completo'

export interface EntradaCompletude {
  status: string
  itens: Array<{ tipo: string; valorTotal?: number | null }>
  valorTotal: number
  arquivos: number
  mensagens: number
  temSolicitante: boolean
  temResponsavelServico: boolean
  prazoVariant: 'ok' | 'warning' | 'danger' | 'neutral' | null
}

export interface Completude {
  pct: number
  nivel: NivelCompletude
  /** O que ainda não pontuou — vira a frase "Falta: …". */
  falta: string[]
}

const PONTOS_ETAPA: Record<string, number> = {
  NOVO: 0, A_ENVIAR: 8, ENVIADO: 16, APROVADO: 24, LIBERADO: 32, FINALIZADO: 40,
}

export function calcularCompletude(e: EntradaCompletude): Completude {
  let pct = 0
  const falta: string[] = []

  const etapa = PONTOS_ETAPA[e.status] ?? 0
  pct += etapa
  if (etapa < 40 && e.status !== 'ENCERRADO') falta.push('avançar as etapas')

  if (e.itens.length > 0) pct += 10
  else falta.push('itens')
  if (e.itens.some(i => i.tipo === 'SERVICO' && Number(i.valorTotal ?? 0) > 0)) pct += 5
  else if (e.itens.length > 0) falta.push('valor nos serviços')

  if (e.valorTotal > 0) pct += 5
  else falta.push('valor do orçamento')

  if (e.arquivos > 0) pct += 10
  else falta.push('anexos')

  if (e.mensagens >= 3) pct += 10
  else if (e.mensagens > 0) { pct += 5; falta.push('mais mensagens') }
  else falta.push('mensagens')

  if (e.temSolicitante) pct += 5
  else falta.push('solicitante')
  if (e.temResponsavelServico) pct += 5
  else falta.push('responsável do serviço')

  const v = e.prazoVariant
  if (v === 'warning') { pct += 5; falta.push('atenção ao prazo') }
  else if (v === 'danger') falta.push('prazo vencido')
  else pct += 10 // ok, sem prazo ativo (neutral) ou desconhecido

  pct = Math.max(0, Math.min(100, pct))
  const nivel: NivelCompletude = pct < 40 ? 'incompleto' : pct < 70 ? 'andamento' : pct < 90 ? 'quase' : 'completo'
  return { pct, nivel, falta }
}

export const NIVEL_COMPLETUDE_LABEL: Record<NivelCompletude, string> = {
  incompleto: 'Incompleto',
  andamento: 'Em andamento',
  quase: 'Quase completo',
  completo: 'Completo',
}
