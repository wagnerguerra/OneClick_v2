/**
 * Catálogo curado de campos do modelo Cliente que podem ser vinculados a um
 * passo do template de serviço. Quando o passo é concluído na execução, o
 * operador preenche esses campos num modal e o sistema atualiza o Cliente.
 *
 * Whitelist controlada (em vez de introspecção do schema) por 3 motivos:
 *   1. Segurança — só campos seguros pra alteração via workflow ficam expostos.
 *   2. UX previsível — cada campo tem rótulo amigável, tipo e máscara mapeados.
 *   3. Versionamento — adicionar/remover campos é uma alteração explícita.
 *
 * Para adicionar novo campo: incluir uma entrada aqui + garantir que o backend
 * (`servico.service.ts > atualizarCamposClienteDoPasso`) aceita a key na união.
 */

import { z } from 'zod'

/** Tipos de input suportados no modal de captura.
 *  Virtuais (não mapeiam 1:1 com coluna do Cliente):
 *   - AREAS_CONTRATADAS: relação ClienteAreaContratada (multi-select de áreas
 *     com availableForHiring=true)
 *   - PARAMETROS_CONTRATO: ClienteContratoParam (objeto com vários campos
 *     numéricos: honorário, faturamento, lançamentos, NFs, funcionários)
 *   - PARTICULARIDADES_AREAS: tabela cliente_particularidades — uma notinha
 *     de texto livre por área contratada do cliente. Requer áreas já marcadas
 *     como contratado=true (lista vazia se cliente não tem nenhuma). */
export const CAMPO_CLIENTE_TIPO = ['TEXT', 'TEXTAREA', 'DATE', 'NUMBER', 'EMAIL', 'SELECT', 'BOOL', 'AREAS_CONTRATADAS', 'PARAMETROS_CONTRATO', 'PARTICULARIDADES_AREAS'] as const
export type CampoClienteTipo = typeof CAMPO_CLIENTE_TIPO[number]

/** Grupos visuais usados pra agrupar opções no Select do editor. */
export const CAMPO_CLIENTE_GRUPO = ['Identificação', 'Comercial', 'Fiscal', 'Legalização', 'Endereço', 'Contato'] as const
export type CampoClienteGrupo = typeof CAMPO_CLIENTE_GRUPO[number]

export interface CampoClienteDef {
  /** Chave única, casa com o nome do campo no model `Cliente` (Prisma). */
  key: string
  /** Rótulo amigável exibido no editor e no modal de captura. */
  label: string
  /** Tipo do input — determina como renderiza no modal e como valida. */
  tipo: CampoClienteTipo
  /** Grupo do Select (UX). */
  grupo: CampoClienteGrupo
  /** Máscara/placeholder opcional. */
  placeholder?: string
  /** Opções (só pra tipo='SELECT') — pode usar valores do enum Prisma direto. */
  options?: Array<{ value: string; label: string }>
}

/** Catálogo. ⚠️ Manter sincronizado com o whitelist do backend. */
export const CAMPOS_CLIENTE_CATALOGO: CampoClienteDef[] = [
  // ── Identificação ────────────────────────────────────────────
  { key: 'nomeFantasia',  label: 'Nome fantasia',  tipo: 'TEXT', grupo: 'Identificação' },
  { key: 'tipoCliente',   label: 'Tipo de cliente', tipo: 'TEXT', grupo: 'Identificação' },

  // ── Comercial ────────────────────────────────────────────────
  { key: 'dataEntrada',   label: 'Data de entrada',  tipo: 'DATE', grupo: 'Comercial' },
  { key: 'dataSaida',     label: 'Data de saída',    tipo: 'DATE', grupo: 'Comercial' },
  { key: 'situacao',      label: 'Situação',         tipo: 'SELECT', grupo: 'Comercial', options: [
    { value: 'MENSAL',   label: 'Mensal' },
    { value: 'EXTRA',    label: 'Extra' },
    { value: 'INATIVO',  label: 'Inativo' },
  ]},
  { key: 'grupo',         label: 'Grupo',            tipo: 'TEXT', grupo: 'Comercial' },
  { key: 'categoria',     label: 'Categoria',        tipo: 'TEXT', grupo: 'Comercial' },
  { key: 'origem',        label: 'Origem',           tipo: 'TEXT', grupo: 'Comercial' },
  { key: 'observacoes',   label: 'Observações',      tipo: 'TEXTAREA', grupo: 'Comercial' },
  // Virtual — multi-select dinâmico carregado de Area.availableForHiring=true.
  // Backend faz upsert em ClienteAreaContratada (contratado=true/false).
  { key: 'areasContratadas', label: 'Áreas contratadas', tipo: 'AREAS_CONTRATADAS', grupo: 'Comercial' },
  // Virtual — N inputs numéricos. Backend faz upsert em ClienteContratoParam
  // (honorario, faturamento, lancamentos, nfEntrada, nfSaida, nfPrestado, nfTomado, funcionarios).
  { key: 'parametrosContrato', label: 'Parâmetros iniciais do contrato', tipo: 'PARAMETROS_CONTRATO', grupo: 'Comercial' },
  // Virtual — uma textarea por área contratada do cliente. Backend faz upsert
  // em cliente_particularidades (raw SQL, sem model Prisma).
  { key: 'particularidadesAreas', label: 'Particularidades por área contratada', tipo: 'PARTICULARIDADES_AREAS', grupo: 'Comercial' },

  // ── Fiscal ───────────────────────────────────────────────────
  { key: 'inscricaoEstadual',  label: 'Inscrição Estadual',  tipo: 'TEXT', grupo: 'Fiscal' },
  { key: 'inscricaoMunicipal', label: 'Inscrição Municipal', tipo: 'TEXT', grupo: 'Fiscal' },
  { key: 'tributacao',         label: 'Tributação',           tipo: 'SELECT', grupo: 'Fiscal', options: [
    { value: 'SIMPLES',         label: 'Simples Nacional' },
    { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
    { value: 'LUCRO_REAL',      label: 'Lucro Real' },
    { value: 'MEI',             label: 'MEI' },
  ]},

  // ── Legalização ──────────────────────────────────────────────
  { key: 'nire',          label: 'NIRE',              tipo: 'TEXT', grupo: 'Legalização' },
  { key: 'codigoSimples', label: 'Código do Simples', tipo: 'TEXT', grupo: 'Legalização' },
  { key: 'rgEdificacao',  label: 'RG da Edificação',  tipo: 'TEXT', grupo: 'Legalização' },
  { key: 'cnaePrincipal', label: 'CNAE Principal',    tipo: 'TEXT', grupo: 'Legalização' },

  // ── Endereço ─────────────────────────────────────────────────
  { key: 'cep',         label: 'CEP',         tipo: 'TEXT', grupo: 'Endereço', placeholder: '00000-000' },
  { key: 'logradouro',  label: 'Logradouro',  tipo: 'TEXT', grupo: 'Endereço' },
  { key: 'numero',      label: 'Número',      tipo: 'TEXT', grupo: 'Endereço' },
  { key: 'complemento', label: 'Complemento', tipo: 'TEXT', grupo: 'Endereço' },
  { key: 'bairro',      label: 'Bairro',      tipo: 'TEXT', grupo: 'Endereço' },
  { key: 'cidade',      label: 'Cidade',      tipo: 'TEXT', grupo: 'Endereço' },
  { key: 'uf',          label: 'UF',          tipo: 'TEXT', grupo: 'Endereço', placeholder: 'SP' },

  // ── Contato ──────────────────────────────────────────────────
  { key: 'telefone', label: 'Telefone', tipo: 'TEXT',  grupo: 'Contato' },
  { key: 'email',    label: 'E-mail',   tipo: 'EMAIL', grupo: 'Contato' },
]

/** Subcampos do tipo virtual PARAMETROS_CONTRATO. Cada um vira um input no
 *  modal de captura e mapeia 1:1 com uma coluna de ClienteContratoParam.
 *  `tipo` aqui é 'NUMBER' (int) ou 'CURRENCY' (decimal em R$). */
export const PARAMETROS_CONTRATO_CAMPOS = [
  { key: 'honorario',    label: 'Honorário',     tipo: 'CURRENCY' as const, placeholder: 'R$ 0,00' },
  { key: 'faturamento',  label: 'Faturamento',   tipo: 'CURRENCY' as const, placeholder: 'R$ 0,00' },
  { key: 'lancamentos',  label: 'Lançamentos',   tipo: 'NUMBER'   as const },
  { key: 'nfEntrada',    label: 'NF Entrada',    tipo: 'NUMBER'   as const },
  { key: 'nfSaida',      label: 'NF Saída',      tipo: 'NUMBER'   as const },
  { key: 'nfPrestado',   label: 'NF Prestado',   tipo: 'NUMBER'   as const },
  { key: 'nfTomado',     label: 'NF Tomado',     tipo: 'NUMBER'   as const },
  { key: 'funcionarios', label: 'Funcionários',  tipo: 'NUMBER'   as const },
] as const

export type ParametroContratoCampo = typeof PARAMETROS_CONTRATO_CAMPOS[number]['key']

/** Set das chaves válidas — usado pra validação no backend. */
export const CAMPOS_CLIENTE_KEYS = new Set(CAMPOS_CLIENTE_CATALOGO.map(c => c.key))

/** Helper — busca def pelo key (null se não existe na whitelist). */
export function findCampoClienteDef(key: string): CampoClienteDef | null {
  return CAMPOS_CLIENTE_CATALOGO.find(c => c.key === key) ?? null
}

// ── Zod schemas pro CRUD ──────────────────────────────────────────────

export const createPassoCampoClienteSchema = z.object({
  passoId: z.string(),
  campoChave: z.string().refine(v => CAMPOS_CLIENTE_KEYS.has(v), { message: 'Campo não permitido' }),
  /** Sobrescreve o `label` padrão do catálogo. Vazio = usa o do catálogo. */
  labelOverride: z.string().max(120).optional().nullable(),
  obrigatorio: z.boolean().default(false),
  /** Quando true, o operador precisa revisar/confirmar o valor mesmo que já
   *  esteja preenchido no cliente. Modal mostra checkbox "Revisado" — auto-marca
   *  ao alterar valor. Submit bloqueado se não foi revisado/alterado. */
  exigeEdicao: z.boolean().default(false),
  ordem: z.coerce.number().int().min(0).default(0),
  ativo: z.boolean().default(true),
})

export const updatePassoCampoClienteSchema = createPassoCampoClienteSchema
  .partial()
  .omit({ passoId: true })

export type CreatePassoCampoClienteInput = z.infer<typeof createPassoCampoClienteSchema>
export type UpdatePassoCampoClienteInput = z.infer<typeof updatePassoCampoClienteSchema>
