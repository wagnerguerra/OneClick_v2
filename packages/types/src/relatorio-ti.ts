import { z } from 'zod'

/**
 * Relatórios diários da equipe — schemas compartilhados entre API e tela.
 *
 * O relatório entra de duas formas, e o `formato` diz qual: o colaborador
 * anexa um arquivo pronto (o HTML que ele já gera hoje, um PDF, um Word) ou
 * escreve direto no painel. As duas convivem porque a equipe não deve trocar
 * de rotina para o painel existir.
 */

/** ANEXO = arquivo enviado · ESCRITO = texto digitado no painel. */
export const relatorioFormatoSchema = z.enum(['ANEXO', 'ESCRITO'])
export type RelatorioFormato = z.infer<typeof relatorioFormatoSchema>

/** Dia no formato AAAA-MM-DD — é dia de calendário, não instante. */
const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)')

export const criarRelatorioSchema = z.object({
  data: diaSchema,
  titulo: z.string().min(1).max(200),
  formato: relatorioFormatoSchema,
  /** Quando ESCRITO. */
  conteudoHtml: z.string().optional().nullable(),
  /** Quando ANEXO — o arquivo sobe em base64 e o servidor o guarda. */
  arquivoNome: z.string().max(255).optional().nullable(),
  arquivoBase64: z.string().optional().nullable(),
  arquivoMime: z.string().max(120).optional().nullable(),
})

export const atualizarRelatorioSchema = criarRelatorioSchema.partial().extend({
  id: z.string().min(1),
})

/** Um mês do calendário. `mes` é 1-12, e não o 0-11 do JavaScript. */
export const listarRelatoriosMesSchema = z.object({
  ano: z.coerce.number().int().min(2000).max(2100),
  mes: z.coerce.number().int().min(1).max(12),
})

export const listarRelatoriosDiaSchema = z.object({ data: diaSchema })

/**
 * Novidade publicada no painel inicial.
 *
 * Nasce de um relatório mas é texto PRÓPRIO: o que se escreve para a diretoria
 * não é o que se escreve para quem só quer saber o que mudou no sistema.
 */
export const novidadeTipoSchema = z.enum(['NOVO', 'MELHORIA', 'CORRECAO'])
export type NovidadeTipo = z.infer<typeof novidadeTipoSchema>

export const publicarNovidadeSchema = z.object({
  /** Relatório de origem — some se ele for apagado, a novidade fica. */
  relatorioId: z.string().optional().nullable(),
  titulo: z.string().min(1).max(160),
  descricao: z.string().max(4000).optional().nullable(),
  tipo: novidadeTipoSchema.default('NOVO'),
  /** Slug do módulo a que se refere — dá o link no widget. */
  moduloSlug: z.string().max(60).optional().nullable(),
})

export const atualizarNovidadeSchema = publicarNovidadeSchema.partial().extend({
  id: z.string().min(1),
  ativo: z.boolean().optional(),
})

export type PublicarNovidadeInput = z.infer<typeof publicarNovidadeSchema>
export type AtualizarNovidadeInput = z.infer<typeof atualizarNovidadeSchema>

export type CriarRelatorioInput = z.infer<typeof criarRelatorioSchema>
export type AtualizarRelatorioInput = z.infer<typeof atualizarRelatorioSchema>
export type ListarRelatoriosMesInput = z.infer<typeof listarRelatoriosMesSchema>
