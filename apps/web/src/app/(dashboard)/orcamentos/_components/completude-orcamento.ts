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

export interface CriterioCompletude {
  rotulo: string
  pontos: number
  maximo: number
  /** Como está hoje, em texto curto (ex.: "2 anexos", "vencido"). */
  situacao: string
}

export interface Completude {
  pct: number
  nivel: NivelCompletude
  /** O que ainda não pontuou — vira a frase "Falta: …". */
  falta: string[]
  /** Um critério por linha — a tabela de gargalo do tooltip. */
  criterios: CriterioCompletude[]
  /** Critério que mais deixou de pontuar (o gargalo), se houver. */
  gargalo: CriterioCompletude | null
}

const PONTOS_ETAPA: Record<string, number> = {
  NOVO: 0, A_ENVIAR: 8, ENVIADO: 16, APROVADO: 24, LIBERADO: 32, FINALIZADO: 40,
}
const ETAPA_LABEL: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function calcularCompletude(e: EntradaCompletude): Completude {
  const falta: string[] = []
  const criterios: CriterioCompletude[] = []

  const etapa = PONTOS_ETAPA[e.status] ?? 0
  if (etapa < 40 && e.status !== 'ENCERRADO') falta.push('avançar as etapas')
  criterios.push({ rotulo: 'Etapa', pontos: etapa, maximo: 40, situacao: ETAPA_LABEL[e.status] ?? e.status })

  let itens = 0
  if (e.itens.length > 0) itens += 10
  else falta.push('itens')
  if (e.itens.some(i => i.tipo === 'SERVICO' && Number(i.valorTotal ?? 0) > 0)) itens += 5
  else if (e.itens.length > 0) falta.push('valor nos serviços')
  criterios.push({ rotulo: 'Itens', pontos: itens, maximo: 15, situacao: e.itens.length ? plural(e.itens.length, 'item', 'itens') : 'nenhum' })

  const valor = e.valorTotal > 0 ? 5 : 0
  if (!valor) falta.push('valor do orçamento')
  criterios.push({ rotulo: 'Valor', pontos: valor, maximo: 5, situacao: valor ? 'definido' : 'sem valor' })

  const anexos = e.arquivos > 0 ? 10 : 0
  if (!anexos) falta.push('anexos')
  criterios.push({ rotulo: 'Anexos', pontos: anexos, maximo: 10, situacao: e.arquivos ? plural(e.arquivos, 'anexo', 'anexos') : 'nenhum' })

  const mensagens = e.mensagens >= 3 ? 10 : e.mensagens > 0 ? 5 : 0
  if (e.mensagens === 0) falta.push('mensagens')
  else if (e.mensagens < 3) falta.push('mais mensagens')
  criterios.push({ rotulo: 'Mensagens', pontos: mensagens, maximo: 10, situacao: e.mensagens ? plural(e.mensagens, 'mensagem', 'mensagens') : 'nenhuma' })

  const pessoas = (e.temSolicitante ? 5 : 0) + (e.temResponsavelServico ? 5 : 0)
  if (!e.temSolicitante) falta.push('solicitante')
  if (!e.temResponsavelServico) falta.push('responsável do serviço')
  criterios.push({
    rotulo: 'Pessoas', pontos: pessoas, maximo: 10,
    situacao: pessoas === 10 ? 'solicitante e responsável' : e.temSolicitante ? 'sem responsável' : e.temResponsavelServico ? 'sem solicitante' : 'ninguém',
  })

  const v = e.prazoVariant
  const tempo = v === 'warning' ? 5 : v === 'danger' ? 0 : 10 // ok, sem prazo ativo (neutral) ou desconhecido
  if (v === 'warning') falta.push('atenção ao prazo')
  else if (v === 'danger') falta.push('prazo vencido')
  criterios.push({ rotulo: 'Prazo', pontos: tempo, maximo: 10, situacao: v === 'warning' ? 'atenção' : v === 'danger' ? 'vencido' : v === 'ok' ? 'no prazo' : 'sem prazo ativo' })

  const pct = Math.max(0, Math.min(100, criterios.reduce((a, c) => a + c.pontos, 0)))
  const nivel: NivelCompletude = pct < 40 ? 'incompleto' : pct < 70 ? 'andamento' : pct < 90 ? 'quase' : 'completo'
  // Gargalo: o critério que mais deixou de pontuar. Encerrado não conta a
  // etapa (saiu do funil — não há o que avançar).
  const candidatos = criterios.filter(c => c.pontos < c.maximo && !(c.rotulo === 'Etapa' && e.status === 'ENCERRADO'))
  const gargalo = candidatos.reduce<CriterioCompletude | null>((g, c) => (!g || c.maximo - c.pontos > g.maximo - g.pontos ? c : g), null)
  return { pct, nivel, falta, criterios, gargalo }
}

export const NIVEL_COMPLETUDE_LABEL: Record<NivelCompletude, string> = {
  incompleto: 'Incompleto',
  andamento: 'Em andamento',
  quase: 'Quase completo',
  completo: 'Completo',
}
