import { z } from 'zod'

export const prioridadeServicoSchema = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'])
export type PrioridadeServico = z.infer<typeof prioridadeServicoSchema>

export const PRIORIDADE_LABELS: Record<PrioridadeServico, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
}

export const PRIORIDADE_COLORS: Record<PrioridadeServico, string> = {
  BAIXA: '#94a3b8',     // slate
  MEDIA: '#10b981',     // emerald
  ALTA: '#f59e0b',      // amber
  URGENTE: '#ef4444',   // red
}

export const SERVICO_TIPO = ['ATIVIDADE', 'DECISAO', 'DOCUMENTACAO', 'INICIO', 'FIM', 'PERGUNTA'] as const
export type ServicoTipo = (typeof SERVICO_TIPO)[number]

export const SERVICO_TIPO_LABELS: Record<ServicoTipo, string> = {
  ATIVIDADE: 'Atividade',
  DECISAO: 'Decisão',
  DOCUMENTACAO: 'Documentação',
  INICIO: 'Início',
  FIM: 'Fim',
  PERGUNTA: 'Pergunta',
}

/** Opções default sugeridas ao criar um bloco PERGUNTA — usuário pode ajustar. */
export const PERGUNTA_OPCOES_PADRAO = ['Contábil', 'Trabalhista', 'Fiscal'] as const

/** Estratégias de atribuição de responsável em execuções deste serviço. */
export const ATRIBUICAO_RESPONSAVEL = [
  'ORCAMENTO', 'CLIENTE_AREA', 'MANUAL_FIXO', 'HERDA_PREDECESSOR',
] as const
export type AtribuicaoResponsavel = (typeof ATRIBUICAO_RESPONSAVEL)[number]

export const ATRIBUICAO_RESPONSAVEL_LABELS: Record<AtribuicaoResponsavel, string> = {
  ORCAMENTO:         'Do orçamento',
  CLIENTE_AREA:      'Do cliente (responsável da área)',
  MANUAL_FIXO:       'Manual fixo',
  HERDA_PREDECESSOR: 'Herda do passo anterior',
}

export const ATRIBUICAO_RESPONSAVEL_HINTS: Record<AtribuicaoResponsavel, string> = {
  ORCAMENTO:         'Usa o responsável definido no orçamento que originou a execução. Sem orçamento, fica vazio.',
  CLIENTE_AREA:      'Busca o responsável vinculado à área do serviço no cadastro do cliente (Cliente → Serviços). Fallback para o substituto.',
  MANUAL_FIXO:       'Toda execução desse serviço é atribuída ao usuário escolhido abaixo, ignorando orçamento e cliente.',
  HERDA_PREDECESSOR: 'Herda do passo anterior na cadeia de processos (controlado por encadeamento.herdaResponsavel).',
}

export const TIPO_DIAS_ANTES = ['CORRIDOS', 'UTEIS'] as const
export type TipoDiasAntes = (typeof TIPO_DIAS_ANTES)[number]
export const TIPO_DIAS_ANTES_LABELS: Record<TipoDiasAntes, string> = {
  CORRIDOS: 'Dias corridos',
  UTEIS: 'Dias úteis',
}

/** Papel do registro na tabela de serviços:
 *  - MENSAL: serviço top-level recorrente (entra em contratos mensais)
 *  - EXTRA:  serviço top-level pontual/sob demanda
 *  - FLUXO:  item interno do fluxo de outro serviço (não aparece na listagem) */
export const SERVICO_CATEGORIA = ['MENSAL', 'EXTRA', 'FLUXO'] as const
export type ServicoCategoria = (typeof SERVICO_CATEGORIA)[number]

export const SERVICO_CATEGORIA_LABELS: Record<ServicoCategoria, string> = {
  MENSAL: 'Mensal',
  EXTRA: 'Extra',
  FLUXO: 'Item de fluxo',
}

export const createServicoSchema = z.object({
  nome: z.string().min(1, 'Nome e obrigatorio'),
  descricao: z.string().optional().nullable(),
  slaHoras: z.coerce.number().min(0).optional().nullable(),
  categoria: z.string().optional().nullable(),
  prioridadePadrao: prioridadeServicoSchema.optional(),
  /** Tipo do bloco — default ATIVIDADE; DECISAO usa losango no fluxograma */
  tipo: z.enum(SERVICO_TIPO).optional(),
  /** Papel do registro — default EXTRA. Use FLUXO pra itens internos de cadeia. */
  categoriaServico: z.enum(SERVICO_CATEGORIA).optional(),
  /** Quando FLUXO, aponta pro serviço top-level dono do fluxo. */
  servicoPaiId: z.string().optional().nullable(),
  /** Texto padrão em HTML (TipTap) — pode ser usado como template de e-mail,
   *  notas iniciais ou documentação automática na execução. */
  textoPadrao: z.string().optional().nullable(),
  // Catalogo de orcamento
  valorPadrao: z.coerce.number().min(0).optional().nullable(),
  disponivelOrcamento: z.boolean().optional(),
  /** Marca como serviço de execução exclusivamente interna — não entra no catálogo
   *  de orçamento. Listado numa aba dedicada em /servicos. */
  ehServicoInterno: z.boolean().optional(),
  /** Marca o registro como obrigação acessória — entrega recorrente (mensal, anual etc).
   *  Listado em /obrigacoes; cabe no /servicos só pra fins de criação/edição uniforme. */
  ehObrigacaoAcessoria: z.boolean().optional(),
  // Se true, é servico recorrente (mensal) — entra em contratos de prestacao continua.
  // Se false (default), é servico pontual/extra (cobranca por execucao).
  recorrenteMensal: z.boolean().optional(),
  // ── Campos do bloco tipo PERGUNTA ──
  /** Texto da pergunta apresentada ao gestor em runtime. Obrigatório se tipo=PERGUNTA. */
  perguntaTexto: z.string().max(500).optional().nullable(),
  /** Lista de opções de resposta. Cada opção vira rótulo de aresta. */
  perguntaOpcoes: z.array(z.string().min(1).max(80)).max(20).optional().nullable(),
  /** Se true, gestor pode marcar várias opções (dispara N sucessores). */
  perguntaMulti: z.boolean().optional(),
  // ── Atribuição de responsável (legado — bloco PERGUNTA / fluxos antigos) ──
  atribuicaoResponsavel: z.enum(ATRIBUICAO_RESPONSAVEL).optional(),
  /** @deprecated — usar atribuicaoColaboradores. */
  responsavelFixoId: z.string().nullable().optional(),

  // ── Atribuição multi-valor (novo modelo, fonte da verdade) ──
  /** IDs de usuários candidatos diretamente listados. */
  atribuicaoColaboradores: z.array(z.string()).optional(),
  /** IDs de áreas — todos os usuários ativos viram candidatos. */
  atribuicaoAreas: z.array(z.string()).optional(),
  /** Soma o responsável do orçamento que originou a execução. */
  atribuicaoUsaOrcamento: z.boolean().optional(),
  /** Soma o responsável do cliente na área do serviço (ClienteAreaContratada). */
  atribuicaoUsaClienteArea: z.boolean().optional(),

  // ── Configurações avançadas (espelha campos do Acessórias) ──
  /** Apelido curto pra colunas/relatórios. Max 10 chars. */
  mininome: z.string().max(10).optional().nullable(),
  /** Tempo previsto de execução em minutos. */
  tempoPrevistoMinutos: z.coerce.number().int().min(0).max(99999).optional().nullable(),
  /** Quantos dias antes do prazo lembrar o responsável. 0 = sem lembrete. */
  lembrarDiasAntes: z.coerce.number().int().min(0).max(180).optional(),
  /** Tipo de contagem dos dias antes: CORRIDOS (calendário) ou UTEIS (FDS/feriado fora). */
  tipoDiasAntes: z.enum(['CORRIDOS', 'UTEIS']).optional(),
  /** Sábado é considerado dia útil pra fins do prazo desta obrigação. */
  sabadoEhUtil: z.boolean().optional(),
  /** Exigir que a entrega seja feita pelo robô. */
  exigirRobo: z.boolean().optional(),
  /** Indica que atraso pode gerar multa (sinalização em dashboards). */
  passivelDeMulta: z.boolean().optional(),
  /** Alerta nos dashboards quando guia não foi lida. */
  alertaGuiaNaoLida: z.boolean().optional(),
  /** Comentário padrão pré-preenchido na entrega manual. Max 300 chars. */
  comentarioPadrao: z.string().max(300).optional().nullable(),
})

export const updateServicoSchema = createServicoSchema.partial().extend({
  ativo: z.boolean().optional(),
})

// ── Vencimentos por mês (encoding Acessórias) ──────────────────────
/**
 * Encoding compartilhado com o Acessórias:
 *   0      = "Não tem" — não gera vencimento neste mês
 *   1..31  = "Todo dia N"
 *   51..70 = "N-ésimo dia útil" (51=1º, 70=20º)
 *   90     = "Último dia útil"
 */
export const VENCIMENTO_MENSAL_VALORES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70,
  90,
] as const

export function labelVencimentoMensal(v: number): string {
  if (v === 0) return 'Não tem'
  if (v >= 1 && v <= 31) return `Todo dia ${String(v).padStart(2, '0')}`
  if (v >= 51 && v <= 70) return `${v - 50}º dia útil`
  if (v === 90) return 'Último dia útil'
  return '?'
}

export const MESES_PT_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

function ehValorVencimentoValido(v: number): boolean {
  return v === 0
    || (v >= 1 && v <= 31)
    || (v >= 51 && v <= 70)
    || v === 90
}

export const setVencimentosMensaisSchema = z.object({
  servicoId: z.string(),
  /** Map mes (1-12) → valor encoded. Meses não presentes são removidos. */
  vencimentos: z.record(
    z.string().regex(/^([1-9]|1[0-2])$/),
    z.coerce.number().int().refine(ehValorVencimentoValido, { message: 'Valor de vencimento inválido' }),
  ),
})

// ── FlowPlan — representação intermediária (IR) de um fluxo de serviço ──
/**
 * Estrutura normalizada que descreve etapas/passos + blocos (sub-serviços FLUXO)
 * + arestas (encadeamentos) de um serviço, usando `tempId` locais em vez de IDs
 * reais. Três fontes produzem o mesmo FlowPlan — o assistente guiado, a geração
 * por IA e (opcionalmente) a pré-visualização de modelo — e um único
 * materializador no backend (`servico.service.ts → aplicarFlowPlan`) o grava
 * chamando as mutations que já existem (createServico/addEtapa/addPasso/
 * addEncadeamento). `origem: 'ROOT'` numa aresta = o próprio serviço dono.
 */
export const flowPlanBlocoSchema = z.object({
  tempId: z.string().min(1),
  tipo: z.enum(['ATIVIDADE', 'DECISAO', 'PERGUNTA', 'DOCUMENTACAO', 'FIM']),
  nome: z.string().min(1).max(200),
  perguntaTexto: z.string().max(500).optional().nullable(),
  perguntaOpcoes: z.array(z.string().min(1).max(80)).max(20).optional().nullable(),
  perguntaMulti: z.boolean().optional().nullable(),
})

export const flowPlanEtapaSchema = z.object({
  tempId: z.string().min(1),
  nome: z.string().min(1).max(200),
  ordem: z.coerce.number().int().min(0),
  passos: z.array(z.object({
    nome: z.string().min(1).max(200),
    ordem: z.coerce.number().int().min(0),
    obrigatorio: z.boolean().optional(),
    slaMinutos: z.coerce.number().int().min(0).optional().nullable(),
  })).default([]),
})

export const flowPlanArestaSchema = z.object({
  /** 'ROOT' = o próprio serviço dono; senão o tempId de um bloco. */
  origem: z.string().min(1),
  destino: z.string().min(1),
  rotulo: z.string().max(80).optional().nullable(),
  /** JSON `{all|any: [{campo,op,valor}]}` — opaco aqui, validado no encadeamento. */
  condicao: z.unknown().optional().nullable(),
  iniciaAuto: z.boolean().optional(),
  obrigatorio: z.boolean().optional(),
})

export const flowPlanSchema = z.object({
  etapas: z.array(flowPlanEtapaSchema).max(50).optional(),
  blocos: z.array(flowPlanBlocoSchema).max(100).optional(),
  arestas: z.array(flowPlanArestaSchema).max(200).optional(),
})

export const aplicarFlowPlanSchema = z.object({
  servicoId: z.string(),
  plan: flowPlanSchema,
})

// ── Roteiro de IA — mesma forma dos rascunhos do assistente guiado ──
/**
 * Saída estruturada da geração por IA (`servico.gerarFluxoIA`). Deliberadamente
 * no formato dos rascunhos da UI (etapas + perguntas com opções → novo/fim),
 * para o frontend apenas preencher os campos do assistente e o humano revisar
 * antes de aplicar. A IA não referencia serviços existentes por id (não conhece
 * o catálogo com segurança) — sugere só destinos novos ou "encerrar".
 */
export const fluxoRoteiroSchema = z.object({
  etapas: z.array(z.object({
    nome: z.string(),
    passos: z.array(z.string()).default([]),
  })).default([]),
  perguntas: z.array(z.object({
    texto: z.string(),
    multi: z.boolean().default(false),
    opcoes: z.array(z.object({
      texto: z.string(),
      destino: z.enum(['novo', 'fim']).default('novo'),
      destinoNome: z.string().default(''),
    })).default([]),
  })).default([]),
})

export const gerarFluxoIaSchema = z.object({
  descricao: z.string().min(10, 'Descreva o serviço com um pouco mais de detalhe').max(4000),
  nomeServico: z.string().max(200).optional(),
})

export type FluxoRoteiro = z.infer<typeof fluxoRoteiroSchema>
export type GerarFluxoIaInput = z.infer<typeof gerarFluxoIaSchema>

export type FlowPlanBloco  = z.infer<typeof flowPlanBlocoSchema>
export type FlowPlanEtapa  = z.infer<typeof flowPlanEtapaSchema>
export type FlowPlanAresta = z.infer<typeof flowPlanArestaSchema>
export type FlowPlan       = z.infer<typeof flowPlanSchema>

export const createServicoEtapaSchema = z.object({
  servicoId: z.string(),
  nome: z.string().min(1),
  ordem: z.coerce.number().min(0),
  slaHoras: z.coerce.number().min(0).optional().nullable(),
})

export const createServicoPassoSchema = z.object({
  etapaId: z.string(),
  nome: z.string().min(1),
  ordem: z.coerce.number().min(0),
  obrigatorio: z.boolean().default(true),
  slaHoras: z.coerce.number().min(0).optional().nullable(),
  /** SLA em minutos (precisão fina). Substitui slaHoras; quando preenchido, tem prioridade. */
  slaMinutos: z.coerce.number().int().min(0).optional().nullable(),
  textoOrientativo: z.string().optional().nullable(),
  recorrente: z.boolean().default(false),
  recorrenciaTipo: z.string().optional().nullable(),
  enviaEmail: z.boolean().default(false),
  emailAssunto: z.string().optional().nullable(),
  emailCorpo: z.string().optional().nullable(),
  // Dependencia: este passo so pode ser concluido apos o referenciado
  dependeDoPassoId: z.string().optional().nullable(),
  permiteAnexo: z.boolean().default(false),
  permiteIgnorar: z.boolean().default(false),
})

/**
 * Modelo de e-mail vinculado a um passo do template. Disparado quando o
 * passo é concluído via togglePasso. Suporta tags dinâmicas no assunto/corpo:
 *   {{cliente.razaoSocial}}, {{cliente.nomeFantasia}}, {{cliente.documento}}
 *   {{responsavel.name}}, {{responsavel.email}}
 *   {{servico.nome}}, {{etapa.nome}}, {{passo.nome}}
 */
export const createPassoEmailTemplateSchema = z.object({
  passoId: z.string(),
  nome: z.string().min(1).max(120),
  assunto: z.string().min(1).max(255),
  corpo: z.string().min(1),
  destinatarios: z.array(z.string().email()).default([]),
  exigirConfirmacao: z.boolean().default(false),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})

export const updatePassoEmailTemplateSchema = createPassoEmailTemplateSchema
  .partial()
  .omit({ passoId: true })

export type CreatePassoEmailTemplateInput = z.infer<typeof createPassoEmailTemplateSchema>
export type UpdatePassoEmailTemplateInput = z.infer<typeof updatePassoEmailTemplateSchema>

/**
 * Lembrete (template) vinculado a um passo. Ao concluir o passo via togglePasso,
 * o backend cria um AgendaEvento com data = hoje + (offsetValor, offsetUnidade)
 * e adiciona os participantes configurados. Disparo automático e silencioso.
 *
 * Tags suportadas no `titulo` e `descricao`:
 *   {{cliente.razaoSocial}}, {{cliente.nomeFantasia}}, {{cliente.documento}}
 *   {{responsavel.name}}, {{responsavel.email}}
 *   {{servico.nome}}, {{etapa.nome}}, {{passo.nome}}
 */
export const OFFSET_UNIDADE = ['DIAS', 'MESES', 'ANOS'] as const
export type OffsetUnidade = typeof OFFSET_UNIDADE[number]

export const createPassoLembreteSchema = z.object({
  passoId: z.string(),
  nome: z.string().min(1).max(120),
  titulo: z.string().min(1).max(255),
  descricao: z.string().max(2000).optional().nullable(),
  offsetValor: z.coerce.number().int().min(1).max(3650),
  offsetUnidade: z.enum(OFFSET_UNIDADE),
  tipoAgendaId: z.string().optional().nullable(),
  participantes: z.array(z.string()).default([]),
  participantesAreas: z.array(z.string()).default([]),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})

export const updatePassoLembreteSchema = createPassoLembreteSchema
  .partial()
  .omit({ passoId: true })

export type CreatePassoLembreteInput = z.infer<typeof createPassoLembreteSchema>
export type UpdatePassoLembreteInput = z.infer<typeof updatePassoLembreteSchema>

export const createExecucaoSchema = z.object({
  servicoId: z.string(),
  clienteId: z.string(),
  orcamentoId: z.string().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
  prioridade: prioridadeServicoSchema.optional(),
  observacoes: z.string().optional().nullable(),
})

// ── Fase 4 — colaboracao na execucao ────────────────────────────
export const addComentarioPassoSchema = z.object({
  execPassoId: z.string(),
  mensagem: z.string().min(1),
})

export const addAnexoPassoSchema = z.object({
  execPassoId: z.string(),
  fileName: z.string(),
  fileUrl: z.string(),
  fileSize: z.number().optional().nullable(),
  mimeType: z.string().optional().nullable(),
})

export const pausarExecucaoSchema = z.object({
  id: z.string(),
  motivo: z.string().min(1, 'Informe o motivo da pausa'),
})

export const addWatcherSchema = z.object({
  execucaoId: z.string(),
  userId: z.string(),
})

// ── Materiais de apoio (template) ─────────────────────────────────────
/** NOTA = instrução/dica em texto; LINK = URL externa; ARQUIVO = upload no S3/Minio. */
export const SERVICO_MATERIAL_TIPO = ['NOTA', 'LINK', 'ARQUIVO'] as const
export type ServicoMaterialTipo = (typeof SERVICO_MATERIAL_TIPO)[number]

export const SERVICO_MATERIAL_TIPO_LABELS: Record<ServicoMaterialTipo, string> = {
  NOTA: 'Nota',
  LINK: 'Link',
  ARQUIVO: 'Arquivo',
}

/** Schema base — usado tanto pra criar quanto pra atualizar.
 *  Exatamente UM entre etapaId / passoId deve estar preenchido. */
export const createMaterialSchema = z.object({
  etapaId: z.string().optional().nullable(),
  passoId: z.string().optional().nullable(),
  tipo: z.enum(SERVICO_MATERIAL_TIPO),
  titulo: z.string().min(1, 'Título é obrigatório').max(200),
  /** NOTA: texto (markdown leve). LINK: URL (validado). ARQUIVO: storage key. */
  conteudo: z.string().min(1, 'Conteúdo é obrigatório'),
  mimeType: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fileSize: z.coerce.number().int().nonnegative().optional().nullable(),
  ordem: z.coerce.number().int().nonnegative().optional(),
}).refine(
  d => (d.etapaId && !d.passoId) || (!d.etapaId && d.passoId),
  { message: 'Informe exatamente um entre etapaId e passoId' },
)

export const updateMaterialSchema = z.object({
  id: z.string(),
  titulo: z.string().min(1).max(200).optional(),
  conteudo: z.string().min(1).optional(),
  mimeType: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  fileSize: z.coerce.number().int().nonnegative().optional().nullable(),
  ordem: z.coerce.number().int().nonnegative().optional(),
})

export const reorderMateriaisSchema = z.object({
  /** Lista ordenada de IDs no mesmo container (etapa OU passo). */
  ids: z.array(z.string()).min(1),
})

export type CreateMaterialInput  = z.infer<typeof createMaterialSchema>
export type UpdateMaterialInput  = z.infer<typeof updateMaterialSchema>
export type ReorderMateriaisInput = z.infer<typeof reorderMateriaisSchema>

// ── Grupos de serviço (M→N) ──────────────────────────────────────────
/** Agrupa serviços por operação (ex: "Constituição de Cliente Mensal").
 *  Um serviço pode estar em vários grupos via tabela junção. */
export const createGrupoSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(120),
  descricao: z.string().optional().nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor hex inválida').optional().nullable(),
  ordem: z.coerce.number().int().nonnegative().optional(),
  servicoIds: z.array(z.string()).optional(),
})

export const updateGrupoSchema = z.object({
  id: z.string(),
  nome: z.string().min(1).max(120).optional(),
  descricao: z.string().optional().nullable(),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  ordem: z.coerce.number().int().nonnegative().optional(),
  ativo: z.boolean().optional(),
})

/** Substitui todos os serviços do grupo de uma vez. Aceita lista ordenada;
 *  o índice no array vira a `ordem` do item dentro do grupo. */
export const setGrupoServicosSchema = z.object({
  grupoId: z.string(),
  servicoIds: z.array(z.string()),
})

/** Espelho — substitui todos os grupos a que o serviço pertence. Útil pra
 *  edição rápida do "tag-set" de um serviço a partir do detalhe dele. */
export const setServicoGruposSchema = z.object({
  servicoId: z.string(),
  grupoIds: z.array(z.string()),
})

/** Ação operacional: cria execuções para todos os serviços do grupo num cliente.
 *  Retorna o array de execuções criadas. */
export const iniciarGrupoSchema = z.object({
  grupoId: z.string(),
  clienteId: z.string(),
  responsavelId: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
})

export type CreateGrupoInput        = z.infer<typeof createGrupoSchema>
export type UpdateGrupoInput        = z.infer<typeof updateGrupoSchema>
export type SetGrupoServicosInput   = z.infer<typeof setGrupoServicosSchema>
export type SetServicoGruposInput   = z.infer<typeof setServicoGruposSchema>
export type IniciarGrupoInput       = z.infer<typeof iniciarGrupoSchema>

export type CreateServicoInput = z.infer<typeof createServicoSchema>
export type UpdateServicoInput = z.infer<typeof updateServicoSchema>
export type CreateServicoEtapaInput = z.infer<typeof createServicoEtapaSchema>
export type CreateServicoPassoInput = z.infer<typeof createServicoPassoSchema>
export type CreateExecucaoInput = z.infer<typeof createExecucaoSchema>
