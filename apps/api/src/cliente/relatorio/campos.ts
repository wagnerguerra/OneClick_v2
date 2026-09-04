import { limparCnpj, ehMatrizCnpj } from '@saas/types'

/**
 * Catálogo de campos do relatório de clientes.
 *
 * É a fonte da verdade de TUDO nesta feature: a tela monta a lista de campos a
 * partir daqui, o motor só aceita chaves que existam aqui, e o arquivo sai na
 * ordem que o usuário escolheu entre elas.
 *
 * A regra de segurança que sustenta o recurso está nesta forma: o cliente
 * nunca manda nome de coluna, manda CHAVE DE CATÁLOGO. Uma chave desconhecida
 * é descartada, não interpolada — o que elimina de saída injeção, coluna
 * inexistente e campo que o usuário não podia ver.
 *
 * Acrescentar um campo ao relatório é acrescentar um item nesta lista. Não há
 * segundo lugar para editar.
 */

/** De onde o valor sai. */
export type OrigemCampo =
  /** Coluna direta de `Cliente`. */
  | { tipo: 'campo'; campo: string }
  /**
   * Uma relação 1:N achatada numa célula só ("Ana Souza; Bruno Lima").
   *
   * Decisão do Wagner: uma linha por cliente, com os sócios juntos. Multiplicar
   * linhas repetiria os dados do cliente e enganaria quem somasse a planilha.
   */
  | { tipo: 'relacao'; relacao: string; campo: string; juntar?: string; onde?: Record<string, unknown> }
  /** Calculado a partir do cliente já carregado (não pede coluna nova). */
  | { tipo: 'derivado'; depende: string[] }

export interface CampoRelatorio {
  chave: string
  rotulo: string
  grupo: string
  tipo: 'texto' | 'numero' | 'data' | 'booleano' | 'enum' | 'lista'
  origem: OrigemCampo
  /** Sub-permissão do módulo `clientes` exigida para o campo aparecer/sair. */
  exigeSub?: string
  /** Converte o valor bruto no que vai para a célula. */
  formatar?: (valor: unknown, cliente: Record<string, unknown>) => string | number | null
  /** Sai marcado na primeira abertura da tela. */
  padrao?: boolean
}

const TRIBUTACAO: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real', MEI: 'MEI', IMUNE: 'Imune', ISENTA: 'Isenta',
}
const APURACAO: Record<string, string> = {
  TRIMESTRAL: 'Trimestral', ANUAL: 'Anual', ESTIMATIVA: 'Estimativa mensal',
}

/** Data em dd/mm/aaaa — o formato que o Excel brasileiro entende sem briga. */
const data = (v: unknown): string => {
  if (!v) return ''
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR')
}

/**
 * Booleano em três estados.
 *
 * As características fiscais são `Boolean?` de propósito: nulo é "ninguém
 * informou", que não é "não". Escrever "Não" numa célula vazia inventaria uma
 * resposta que ninguém deu.
 */
const simNao = (v: unknown): string => (v === true ? 'Sim' : v === false ? 'Não' : '')

const texto = (v: unknown): string => (v == null ? '' : String(v))
const numero = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'object' && v !== null && 'toNumber' in v
    ? (v as { toNumber: () => number }).toNumber()
    : Number(v)
  return Number.isFinite(n) ? n : null
}

export const CAMPOS_CLIENTE: CampoRelatorio[] = [
  // ── Identificação ──────────────────────────────────────────────────
  { chave: 'code', rotulo: 'Nº do cliente', grupo: 'Identificação', tipo: 'numero',
    origem: { tipo: 'campo', campo: 'code' }, padrao: true },
  { chave: 'razaoSocial', rotulo: 'Razão social', grupo: 'Identificação', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'razaoSocial' }, formatar: texto, padrao: true },
  { chave: 'nomeFantasia', rotulo: 'Nome fantasia', grupo: 'Identificação', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'nomeFantasia' }, formatar: texto },
  // O documento sai FORMATADO. Sem isso o Excel come o zero à esquerda e
  // transforma o CNPJ num número — estrago clássico de planilha exportada.
  { chave: 'documento', rotulo: 'CNPJ/CPF', grupo: 'Identificação', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'documento' }, padrao: true,
    formatar: (v) => {
      const d = limparCnpj(v as string)
      if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
      if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
      return d
    } },
  { chave: 'tipoDocumento', rotulo: 'Tipo de documento', grupo: 'Identificação', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'tipoDocumento' }, formatar: texto },
  // `tipo` descreve o que sai na CÉLULA (aqui, texto). Que o valor seja
  // derivado é assunto da `origem`, não do tipo — misturar os dois faria a
  // tela ter de conhecer a forma de cálculo para saber como alinhar a coluna.
  { chave: 'matrizFilial', rotulo: 'Matriz ou filial', grupo: 'Identificação', tipo: 'texto',
    origem: { tipo: 'derivado', depende: ['documento', 'ehMatriz', 'tipoDocumento'] },
    formatar: (_v, c) => (ehMatrizCnpj(c.documento as string, c.ehMatriz as boolean | null, c.tipoDocumento as string) ? 'Matriz' : 'Filial') },
  { chave: 'tipoCliente', rotulo: 'Tipo de cliente', grupo: 'Identificação', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'tipoCliente' }, formatar: texto },

  // ── Comercial ──────────────────────────────────────────────────────
  { chave: 'situacao', rotulo: 'Situação', grupo: 'Comercial', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'situacao' }, formatar: texto, padrao: true },
  { chave: 'status', rotulo: 'Ativo / Inativo', grupo: 'Comercial', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'status' }, formatar: texto },
  { chave: 'grupo', rotulo: 'Grupo empresarial', grupo: 'Comercial', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'grupo' }, formatar: texto },
  { chave: 'categoria', rotulo: 'Categoria', grupo: 'Comercial', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'categoria' }, formatar: texto, exigeSub: 'manage_commercial' },
  { chave: 'origem', rotulo: 'Origem', grupo: 'Comercial', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'origem' }, formatar: texto, exigeSub: 'manage_commercial' },
  { chave: 'dataEntrada', rotulo: 'Entrada na casa', grupo: 'Comercial', tipo: 'data',
    origem: { tipo: 'campo', campo: 'dataEntrada' }, formatar: data },
  { chave: 'dataSaida', rotulo: 'Saída', grupo: 'Comercial', tipo: 'data',
    origem: { tipo: 'campo', campo: 'dataSaida' }, formatar: data },
  { chave: 'dataAbertura', rotulo: 'Abertura na Receita', grupo: 'Comercial', tipo: 'data',
    origem: { tipo: 'campo', campo: 'dataAbertura' }, formatar: data },

  // ── Fiscal ─────────────────────────────────────────────────────────
  { chave: 'tributacao', rotulo: 'Tributação', grupo: 'Fiscal', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'tributacao' }, padrao: true,
    formatar: (v) => (v ? TRIBUTACAO[String(v)] ?? String(v) : '') },
  { chave: 'regime', rotulo: 'Regime contábil', grupo: 'Fiscal', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'regime' }, formatar: texto },
  { chave: 'porte', rotulo: 'Porte', grupo: 'Fiscal', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'porte' }, formatar: texto },
  { chave: 'situacaoCadastral', rotulo: 'Situação cadastral', grupo: 'Fiscal', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'situacaoCadastral' }, formatar: texto },
  { chave: 'inscricaoEstadual', rotulo: 'Inscrição estadual', grupo: 'Fiscal', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'inscricaoEstadual' }, formatar: texto },
  { chave: 'inscricaoMunicipal', rotulo: 'Inscrição municipal', grupo: 'Fiscal', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'inscricaoMunicipal' }, formatar: texto },
  { chave: 'apuracaoLucroReal', rotulo: 'Apuração do Lucro Real', grupo: 'Fiscal', tipo: 'enum',
    origem: { tipo: 'campo', campo: 'apuracaoLucroReal' },
    formatar: (v) => (v ? APURACAO[String(v)] ?? String(v) : '') },
  { chave: 'fatorR', rotulo: 'Sujeita ao Fator R', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'fatorR' }, formatar: simNao },
  { chave: 'apuraIssPorFora', rotulo: 'Apura ISS por fora', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'apuraIssPorFora' }, formatar: simNao },
  { chave: 'apuraIcmsPorFora', rotulo: 'Apura ICMS por fora', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'apuraIcmsPorFora' }, formatar: simNao },
  { chave: 'possuiProLabore', rotulo: 'Possui pró-labore', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'possuiProLabore' }, formatar: simNao },
  { chave: 'possuiFuncionarios', rotulo: 'Possui funcionários', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'possuiFuncionarios' }, formatar: simNao },
  { chave: 'semMovimento', rotulo: 'Sem movimento', grupo: 'Fiscal', tipo: 'booleano',
    origem: { tipo: 'campo', campo: 'semMovimento' }, formatar: simNao },

  // ── Endereço ───────────────────────────────────────────────────────
  { chave: 'cep', rotulo: 'CEP', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'cep' }, formatar: texto },
  { chave: 'logradouro', rotulo: 'Logradouro', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'logradouro' }, formatar: texto },
  { chave: 'numero', rotulo: 'Número', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'numero' }, formatar: texto },
  { chave: 'complemento', rotulo: 'Complemento', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'complemento' }, formatar: texto },
  { chave: 'bairro', rotulo: 'Bairro', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'bairro' }, formatar: texto },
  { chave: 'cidade', rotulo: 'Município', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'cidade' }, formatar: texto, padrao: true },
  { chave: 'uf', rotulo: 'UF', grupo: 'Endereço', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'uf' }, formatar: texto, padrao: true },

  // ── Contato ────────────────────────────────────────────────────────
  { chave: 'telefone', rotulo: 'Telefone', grupo: 'Contato', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'telefone' }, formatar: texto },
  { chave: 'email', rotulo: 'E-mail', grupo: 'Contato', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'email' }, formatar: texto },
  { chave: 'contatos', rotulo: 'Contatos cadastrados', grupo: 'Contato', tipo: 'lista',
    origem: { tipo: 'relacao', relacao: 'contatos', campo: 'nome', juntar: '; ' } },

  // ── Serviços ───────────────────────────────────────────────────────
  { chave: 'areasContratadas', rotulo: 'Áreas contratadas', grupo: 'Serviços', tipo: 'lista',
    origem: { tipo: 'relacao', relacao: 'servicosContratados', campo: 'area.name', juntar: '; ', onde: { contratado: true } },
    exigeSub: 'manage_services' },
  { chave: 'qtdAreas', rotulo: 'Qtd. de áreas', grupo: 'Serviços', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'servicosContratados', campo: '__count', onde: { contratado: true } },
    exigeSub: 'manage_services' },

  // ── Contrato ───────────────────────────────────────────────────────
  { chave: 'honorario', rotulo: 'Honorário', grupo: 'Contrato', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'contratoParams', campo: 'honorario' },
    formatar: numero, exigeSub: 'manage_contracts' },
  { chave: 'faturamento', rotulo: 'Faturamento', grupo: 'Contrato', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'contratoParams', campo: 'faturamento' },
    formatar: numero, exigeSub: 'manage_contracts' },
  { chave: 'lancamentos', rotulo: 'Lançamentos', grupo: 'Contrato', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'contratoParams', campo: 'lancamentos' },
    formatar: numero, exigeSub: 'manage_contracts' },
  { chave: 'funcionariosContrato', rotulo: 'Funcionários (contrato)', grupo: 'Contrato', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'contratoParams', campo: 'funcionarios' },
    formatar: numero, exigeSub: 'manage_contracts' },

  // ── Legalização ────────────────────────────────────────────────────
  { chave: 'nire', rotulo: 'NIRE', grupo: 'Legalização', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'nire' }, formatar: texto },
  { chave: 'naturezaJuridica', rotulo: 'Natureza jurídica', grupo: 'Legalização', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'naturezaJuridica' }, formatar: texto },
  { chave: 'cnaePrincipal', rotulo: 'CNAE principal', grupo: 'Legalização', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'cnaePrincipal' }, formatar: texto },
  { chave: 'codigoSimples', rotulo: 'Código Simples', grupo: 'Legalização', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'codigoSimples' }, formatar: texto },

  // ── Societário ─────────────────────────────────────────────────────
  { chave: 'socios', rotulo: 'Sócios', grupo: 'Societário', tipo: 'lista',
    // `nomeCompleto`, não `nome` — foi o que o teste do motor contra o banco
    // pegou: o typecheck não valida nome de campo dentro de um catálogo de
    // dados, só a forma dele.
    origem: { tipo: 'relacao', relacao: 'socios', campo: 'nomeCompleto', juntar: '; ' } },
  { chave: 'qtdSocios', rotulo: 'Qtd. de sócios', grupo: 'Societário', tipo: 'numero',
    origem: { tipo: 'relacao', relacao: 'socios', campo: '__count' } },
  { chave: 'capitalSocial', rotulo: 'Capital social', grupo: 'Societário', tipo: 'numero',
    origem: { tipo: 'campo', campo: 'capitalSocial' }, formatar: numero },

  // ── Benefícios e atividades ────────────────────────────────────────
  { chave: 'beneficios', rotulo: 'Benefícios fiscais', grupo: 'Benefícios e atividades', tipo: 'lista',
    origem: { tipo: 'relacao', relacao: 'beneficiosFiscais', campo: 'catalogo.nome', juntar: '; ' } },
  { chave: 'atividades', rotulo: 'Atividades', grupo: 'Benefícios e atividades', tipo: 'lista',
    origem: { tipo: 'relacao', relacao: 'atividades', campo: 'valor', juntar: '; ' } },

  // ── Integrações ────────────────────────────────────────────────────
  { chave: 'idSistema', rotulo: 'ID SCI', grupo: 'Integrações', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'idSistema' }, formatar: texto, exigeSub: 'manage_fiscal' },
  { chave: 'idOmie', rotulo: 'ID Omie', grupo: 'Integrações', tipo: 'texto',
    origem: { tipo: 'campo', campo: 'idOmie' }, formatar: texto, exigeSub: 'manage_fiscal' },
  { chave: 'idAcessorias', rotulo: 'ID Acessórias', grupo: 'Integrações', tipo: 'numero',
    origem: { tipo: 'campo', campo: 'idAcessorias' }, exigeSub: 'manage_fiscal' },
]

/** Índice por chave — o motor consulta por aqui, nunca varre a lista. */
export const CAMPOS_POR_CHAVE = new Map(CAMPOS_CLIENTE.map(c => [c.chave, c]))

/** Ordem em que os grupos aparecem na tela (a lista já vem nesta ordem). */
export const GRUPOS_CAMPOS = [...new Set(CAMPOS_CLIENTE.map(c => c.grupo))]

/**
 * O catálogo que ESTE usuário pode ver.
 *
 * A permissão é conferida na EXECUÇÃO, não no salvamento: um relatório salvo
 * hoje por quem podia ver honorário, aberto amanhã por quem não pode, sai sem
 * a coluna. A definição é a mesma; o resultado depende de quem executa.
 */
export function camposPermitidos(
  podeSub: (sub: string) => boolean,
): CampoRelatorio[] {
  return CAMPOS_CLIENTE.filter(c => !c.exigeSub || podeSub(c.exigeSub))
}
