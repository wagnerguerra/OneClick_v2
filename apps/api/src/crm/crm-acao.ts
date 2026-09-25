import { z } from 'zod'

/**
 * Ações e Interações do card do CRM — regras puras.
 *
 * AÇÃO é o andamento do atendimento: o que foi feito ou o que falta fazer, com
 * prazo e responsáveis. Por baixo é uma AgendaTarefa vinculada ao card (a aba
 * "Tarefas" virou "Ações" em 25/09/2026), então herda a ciência por membro, os
 * lembretes por sino/e-mail e a presença na lista de tarefas da Agenda.
 *
 * INTERAÇÃO é cada contato com o lead (ligação, WhatsApp, reunião...). As
 * anotações continuam para o que é genérico.
 */

/** A Ação não tem título próprio na tela: ele sai do começo do texto. */
export const TAMANHO_TITULO_ACAO = 120

export function textoDoHtml(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Título da AgendaTarefa por trás da Ação. É o que aparece na lista de tarefas
 * da Agenda, no sino e no assunto do e-mail de lembrete — por isso texto puro
 * e curto, cortado na palavra.
 */
export function tituloDaAcao(html: string): string {
  const texto = textoDoHtml(html)
  if (!texto) return 'Ação'
  if (texto.length <= TAMANHO_TITULO_ACAO) return texto
  return texto.slice(0, TAMANHO_TITULO_ACAO).replace(/\s+\S*$/, '') + '…'
}

/**
 * Quando avisar, em minutos antes do prazo. Prazo sem hora conta às 09:00
 * (regra do tick de lembretes), então "No dia" avisa às 09:00 do dia.
 */
export const OPCOES_LEMBRETE_ACAO = [0, 1440, 2880, 10080] as const

export const lembreteAcaoSchema = z.object({
  /** null = sem lembrete. */
  minutosAntes: z.number().int().min(0).max(43200).nullable(),
  /** Além do sino, manda e-mail. */
  email: z.boolean().default(false),
})
export type LembreteAcao = z.infer<typeof lembreteAcaoSchema>

/** Traduz a escolha da tela para os lembretes da AgendaTarefa. */
export function lembretesDaAcao(l: LembreteAcao): Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }> {
  if (l.minutosAntes === null) return []
  const lista: Array<{ canal: 'POPUP' | 'EMAIL'; minutosAntes: number }> = [{ canal: 'POPUP', minutosAntes: l.minutosAntes }]
  if (l.email) lista.push({ canal: 'EMAIL', minutosAntes: l.minutosAntes })
  return lista
}

export const TIPOS_INTERACAO = ['LIGACAO', 'WHATSAPP', 'EMAIL', 'REUNIAO', 'VISITA', 'OUTRO'] as const
export const tipoInteracaoSchema = z.enum(TIPOS_INTERACAO)
export type TipoInteracao = z.infer<typeof tipoInteracaoSchema>

export const ROTULO_INTERACAO: Record<TipoInteracao, string> = {
  LIGACAO: 'Ligação',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  REUNIAO: 'Reunião',
  VISITA: 'Visita',
  OUTRO: 'Contato',
}

/** Linha do histórico do card: "Ligação com Maria", ou só "Ligação". */
export function descricaoDaInteracao(tipo: TipoInteracao, contato?: string | null): string {
  const rotulo = ROTULO_INTERACAO[tipo]
  const quem = contato?.trim()
  return quem ? `${rotulo} com ${quem}` : rotulo
}

export const interacaoSchema = z.object({
  tipo: tipoInteracaoSchema,
  /** Quando o contato aconteceu (ISO). */
  dataHora: z.coerce.date(),
  contato: z.string().max(200).nullable().optional(),
  resumo: z.string().min(1),
})
