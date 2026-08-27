import { limparCnpj, ehCnpjAlfanumerico } from '@saas/types'

/**
 * Contrato dos provedores de CNPJ do dossiê.
 *
 * Todos devolvem a MESMA forma normalizada (`DadosCnpj`), para o serviço de
 * enriquecimento não saber de quem veio o dado — só de qual fonte, que fica
 * gravada junto para a tela mostrar a procedência.
 *
 * O payload cru vai junto de propósito: reprocessar o que já foi baixado é
 * grátis, consultar de novo custa tempo e cota.
 */

export type CnaeNormalizado = { codigo: string; descricao: string; principal: boolean }

export type SocioNormalizado = {
  nome: string
  documento: string
  qualificacao: string
  dataEntrada: string | null
  faixaEtaria: string | null
  representanteLegal: string | null
}

export type DadosCnpj = {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  situacaoCadastral: string | null
  dataSituacaoCadastral: string | null
  motivoSituacaoCadastral: string | null
  matriz: boolean | null
  dataAbertura: string | null
  naturezaJuridica: string | null
  porte: string | null
  capitalSocial: number | null

  cnaes: CnaeNormalizado[]

  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  municipioIbge: string | null
  uf: string | null

  telefones: string[]
  email: string | null

  optanteSimples: boolean | null
  dataOpcaoSimples: string | null
  optanteMei: boolean | null

  socios: SocioNormalizado[]

  fonte: string
  urlFonte: string
  /** Resposta crua, como veio do provedor. */
  payload: unknown
}

export interface ProvedorCnpj {
  /** Identificador curto e estável — vai gravado em cada fato e coleta. */
  readonly nome: string
  /** Falso quando o provedor exige credencial que não está configurada. */
  disponivel(): boolean
  consultar(cnpj: string): Promise<DadosCnpj>
}

export class CnpjAlfanumericoNaoSuportadoError extends Error {
  constructor(cnpj: string) {
    super(
      `O CNPJ ${cnpj} é alfanumérico e as fontes públicas ainda não aceitam esse formato. ` +
      'Preencha os dados manualmente até a Receita liberar a consulta.',
    )
    this.name = 'CnpjAlfanumericoNaoSuportadoError'
  }
}

/**
 * Normaliza e recusa o que não dá para consultar.
 *
 * A recusa do alfanumérico é explícita: a alternativa seria limpar com `/\D/g`,
 * que apaga as letras e transforma o documento em outro — a consulta então
 * responderia sobre uma empresa que não é a do cliente, silenciosamente.
 */
export function prepararCnpjParaConsulta(documento: string | null | undefined): string {
  const limpo = limparCnpj(documento)
  if (limpo.length !== 14) throw new Error(`CNPJ inválido (${limpo.length} posições, esperado 14).`)
  if (ehCnpjAlfanumerico(limpo)) throw new CnpjAlfanumericoNaoSuportadoError(limpo)
  return limpo
}

// ── Resiliência ──────────────────────────────────────────────

const TIMEOUT_MS = 5_000
const TENTATIVAS = 3

/** Só 429 e 5xx merecem nova tentativa: 404 e 400 não melhoram com insistência. */
function vaiTentarDeNovo(status: number): boolean {
  return status === 429 || status >= 500
}

export async function buscarComBackoff(
  url: string,
  init: RequestInit,
  esperar: (ms: number) => Promise<void> = (ms) => new Promise(r => setTimeout(r, ms)),
): Promise<Response> {
  let ultimoErro: Error | null = null
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (resp.ok || !vaiTentarDeNovo(resp.status)) return resp
      ultimoErro = new Error(`HTTP ${resp.status}`)
    } catch (e) {
      ultimoErro = e as Error
    }
    if (tentativa < TENTATIVAS) await esperar(300 * 2 ** (tentativa - 1)) // 300ms, 600ms
  }
  throw ultimoErro ?? new Error('Falha desconhecida na consulta.')
}

/**
 * Disjuntor por provedor: depois de N falhas seguidas, o provedor sai do ar por
 * X minutos e a cadeia vai direto para o próximo. Sem isso, um provedor caído
 * transforma um backfill de 2.000 clientes em 2.000 esperas de 15 segundos.
 */
export class Disjuntor {
  private falhas = 0
  private abertoAte = 0

  constructor(
    private readonly limiteFalhas = 5,
    private readonly janelaMs = 5 * 60 * 1000,
    private readonly agora: () => number = () => Date.now(),
  ) {}

  get aberto(): boolean { return this.agora() < this.abertoAte }

  registrarSucesso(): void { this.falhas = 0; this.abertoAte = 0 }

  registrarFalha(): void {
    this.falhas++
    if (this.falhas >= this.limiteFalhas) this.abertoAte = this.agora() + this.janelaMs
  }
}
