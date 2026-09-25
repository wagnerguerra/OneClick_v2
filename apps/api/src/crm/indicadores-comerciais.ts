/**
 * Indicadores do funil comercial (/comercial) — regras puras.
 *
 * O painel segue a planilha que o comercial já preenchia à mão, em duas etapas:
 *
 *   Qualificação: leads recebidos · qualificados por ligação · por WhatsApp ·
 *                 sem resposta · desqualificados · reuniões agendadas
 *   Fechamento:   reuniões realizadas · propostas enviadas · contratos assinados
 *
 * De onde vem cada número (decidido com o Wagner em 25/09/2026):
 *  - leads recebidos: cards do CRM criados no período;
 *  - qualificação: o RESULTADO registrado na interação com o lead. Conta a
 *    última interação com resultado de cada lead dentro do período, então um
 *    lead que ficou sem resposta na segunda e foi qualificado na quarta conta
 *    uma vez, como qualificado — e pelo canal da interação que o qualificou;
 *  - reuniões: eventos da Agenda vinculados a um card. Agendada = criada no
 *    período; realizada = a data caiu no período e o horário já passou;
 *  - propostas enviadas: orçamentos enviados no período vindos de um card do
 *    CRM ou com serviço de entrada de novo cliente;
 *  - contratos assinados: orçamentos aprovados no período com serviço de
 *    entrada de novo cliente (Servico.entradaNovoCliente).
 */

/** Resultados que encerram a qualificação do lead (EM_ANDAMENTO não conta). */
const DECISIVOS = new Set<string>(['QUALIFICADO', 'SEM_RESPOSTA', 'DESQUALIFICADO'])

export interface InteracaoComResultado {
  oportunidadeId: string
  tipo: string
  resultado: string | null
  dataHora: Date
  userId: string | null
}

export interface SituacaoDoLead {
  resultado: 'QUALIFICADO' | 'SEM_RESPOSTA' | 'DESQUALIFICADO'
  /** Canal da interação decisiva (LIGACAO, WHATSAPP...). */
  canal: string
  userId: string | null
}

/** Última interação decisiva de cada lead (as interações já vêm do período). */
export function situacaoDosLeads(interacoes: InteracaoComResultado[]): Map<string, SituacaoDoLead> {
  const ultima = new Map<string, InteracaoComResultado>()
  for (const i of interacoes) {
    if (!i.resultado || !DECISIVOS.has(i.resultado)) continue
    const atual = ultima.get(i.oportunidadeId)
    if (!atual || i.dataHora.getTime() >= atual.dataHora.getTime()) ultima.set(i.oportunidadeId, i)
  }
  const mapa = new Map<string, SituacaoDoLead>()
  for (const [id, i] of ultima) {
    mapa.set(id, { resultado: i.resultado as SituacaoDoLead['resultado'], canal: i.tipo, userId: i.userId })
  }
  return mapa
}

/**
 * A reunião já aconteceu? `dia` e `hoje` são AAAA-MM-DD e as horas HH:MM, no
 * horário de Brasília. Reunião de hoje sem hora ainda não conta: não dá para
 * saber se já passou.
 */
export function reuniaoJaAconteceu(dia: string, horaFim: string | null, horaInicio: string | null, hoje: string, agoraHora: string): boolean {
  if (dia < hoje) return true
  if (dia > hoje) return false
  const hora = horaFim || horaInicio
  return !!hora && hora <= agoraHora
}

export const CAMPOS_INDICADOR = [
  'leadsRecebidos', 'qualifLigacao', 'qualifWhatsapp', 'qualifOutros', 'semResposta', 'desqualificados',
  'reunioesAgendadas', 'reunioesRealizadas', 'propostasEnviadas', 'contratosAssinados',
] as const
export type CampoIndicador = (typeof CAMPOS_INDICADOR)[number]
export type Totais = Record<CampoIndicador, number>

export function totaisZerados(): Totais {
  return Object.fromEntries(CAMPOS_INDICADOR.map(c => [c, 0])) as Totais
}

/** Campo do indicador para a situação do lead. */
export function campoDaSituacao(s: SituacaoDoLead): CampoIndicador {
  if (s.resultado === 'SEM_RESPOSTA') return 'semResposta'
  if (s.resultado === 'DESQUALIFICADO') return 'desqualificados'
  if (s.canal === 'LIGACAO') return 'qualifLigacao'
  if (s.canal === 'WHATSAPP') return 'qualifWhatsapp'
  return 'qualifOutros'
}

/**
 * Soma cada ocorrência no total e na linha da pessoa responsável por ela.
 * Ocorrência sem pessoa vai para a linha de chave '' ("Sem responsável").
 */
export function acumular(ocorrencias: Array<{ campo: CampoIndicador; userId: string | null }>) {
  const total = totaisZerados()
  const porPessoa = new Map<string, Totais>()
  for (const o of ocorrencias) {
    total[o.campo]++
    const chave = o.userId ?? ''
    const linha = porPessoa.get(chave) ?? totaisZerados()
    linha[o.campo]++
    porPessoa.set(chave, linha)
  }
  return { total, porPessoa }
}
