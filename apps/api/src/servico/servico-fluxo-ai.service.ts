import { Injectable } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import { fluxoRoteiroSchema, type FluxoRoteiro, type GerarFluxoIaInput } from '@saas/types'

/**
 * Geração por IA do rascunho de fluxo de um serviço (Claude / Anthropic).
 *
 * Reusa o padrão do OrcamentoAiService: SDK Anthropic, modelo Sonnet 4.6,
 * degrada graciosamente sem ANTHROPIC_API_KEY. Usa **tool-use** (saída
 * estruturada) para devolver um FluxoRoteiro validado por Zod.
 *
 * Decisão consciente (igual ao resto do produto): a IA NÃO grava nada. Ela só
 * devolve o rascunho; o assistente preenche os campos e o humano revisa e
 * clica "Criar fluxo" (que chama aplicarFlowPlan pelo fluxo tRPC normal).
 */
@Injectable()
export class ServicoFluxoAiService {
  private readonly MODEL = 'claude-sonnet-4-6'
  private client: Anthropic | null = null

  private getClient(): Anthropic | null {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return null
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  /** JSON Schema (não-Zod) exigido pela API de tool-use da Anthropic. Espelha
   *  o `fluxoRoteiroSchema` de @saas/types. */
  private readonly TOOL_SCHEMA = {
    type: 'object' as const,
    properties: {
      etapas: {
        type: 'array',
        description: 'Checklist de etapas do serviço; cada etapa agrupa passos executados na ordem.',
        items: {
          type: 'object',
          properties: {
            nome: { type: 'string' },
            passos: { type: 'array', items: { type: 'string' } },
          },
          required: ['nome', 'passos'],
        },
      },
      perguntas: {
        type: 'array',
        description: 'Pontos de decisão em que o operador escolhe um caminho. Cada opção segue para um novo serviço ("novo") ou encerra ("fim").',
        items: {
          type: 'object',
          properties: {
            texto: { type: 'string' },
            multi: { type: 'boolean' },
            opcoes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  texto: { type: 'string' },
                  destino: { type: 'string', enum: ['novo', 'fim'] },
                  destinoNome: { type: 'string', description: 'Nome do novo serviço quando destino="novo".' },
                },
                required: ['texto', 'destino'],
              },
            },
          },
          required: ['texto', 'opcoes'],
        },
      },
    },
    required: ['etapas', 'perguntas'],
  }

  async gerarRoteiro(input: GerarFluxoIaInput): Promise<FluxoRoteiro> {
    const client = this.getClient()
    if (!client) {
      throw new Error('Geração por IA indisponível: configure ANTHROPIC_API_KEY no servidor.')
    }

    const sistema = [
      'Você é um assistente que estrutura processos de escritórios de contabilidade.',
      'A partir da descrição de um serviço, monte um roteiro objetivo: um checklist de etapas/passos',
      'e, quando fizer sentido, pontos de decisão (perguntas) com as opções e para onde cada uma segue.',
      'Regras: use português do Brasil; nomes curtos e claros; não invente serviços existentes',
      '(destinos são sempre "novo" com um nome, ou "fim"); prefira 3–7 passos por etapa; só crie',
      'perguntas quando o caminho realmente se ramifica. IMPORTANTE: cada OPÇÃO de pergunta deve ser',
      'um rótulo curto (no máx. ~60 caracteres, idealmente 1–4 palavras, ex.: "Simples Nacional");',
      'detalhes vão no nome do destino, nunca na opção. Responda SEMPRE chamando a ferramenta montar_roteiro.',
    ].join(' ')

    const userMsg = [
      input.nomeServico ? `Serviço: ${input.nomeServico}` : '',
      `Descrição: ${input.descricao}`,
    ].filter(Boolean).join('\n')

    const resp = await client.messages.create({
      model: this.MODEL,
      max_tokens: 4000,
      system: sistema,
      tools: [{
        name: 'montar_roteiro',
        description: 'Devolve o roteiro estruturado (etapas + perguntas) do serviço.',
        input_schema: this.TOOL_SCHEMA,
      }],
      tool_choice: { type: 'tool', name: 'montar_roteiro' },
      messages: [{ role: 'user', content: userMsg }],
    })

    const bloco = resp.content.find(c => c.type === 'tool_use')
    if (!bloco || bloco.type !== 'tool_use') {
      throw new Error('A IA não retornou um roteiro estruturado. Tente descrever com mais detalhe.')
    }
    // Valida/normaliza com Zod (aplica defaults e descarta lixo).
    return fluxoRoteiroSchema.parse(bloco.input)
  }
}
