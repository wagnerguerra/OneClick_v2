import { Injectable, Inject, Optional } from '@nestjs/common'
import type { ProvedorCnpj, DadosCnpj } from './provedor-cnpj'
import { Disjuntor, CnpjAlfanumericoNaoSuportadoError } from './provedor-cnpj'
import { ProvedorOpenCnpj } from './provedor-opencnpj'
import { ProvedorBrasilApi } from './provedor-brasilapi'
import { ProvedorSerpro } from './provedor-serpro'

/**
 * A cadeia de provedores: tenta um, cai para o próximo.
 *
 * Ordem padrão `opencnpj,brasilapi,serpro`, sobreponível por
 * `DOSSIE_PROVEDORES` no ambiente. As duas primeiras são gratuitas e sem token;
 * o SERPRO fica por último porque é pago por consulta — só entra quando as
 * públicas falham.
 *
 * Cada provedor tem seu disjuntor. Um provedor fora do ar não pode transformar
 * um backfill de dois mil clientes em dois mil timeouts: depois de 5 falhas
 * seguidas ele sai da fila por 5 minutos.
 */

export type TentativaProvedor = {
  fonte: string
  status: 'ok' | 'erro' | 'pulado'
  erro?: string
  httpStatus?: number
  latenciaMs: number
}

export type ResultadoCadeia = {
  dados: DadosCnpj | null
  tentativas: TentativaProvedor[]
  /** Erro terminal: não adianta tentar outro provedor (CNPJ alfanumérico, por exemplo). */
  erroTerminal?: string
}

const ORDEM_PADRAO = ['opencnpj', 'brasilapi', 'serpro']

@Injectable()
export class CadeiaProvedoresService {
  private readonly disjuntores = new Map<string, Disjuntor>()

  constructor(
    @Inject(ProvedorOpenCnpj) private readonly openCnpj: ProvedorOpenCnpj,
    @Inject(ProvedorBrasilApi) private readonly brasilApi: ProvedorBrasilApi,
    @Optional() @Inject(ProvedorSerpro) private readonly serpro?: ProvedorSerpro,
  ) {}

  /** A ordem configurada, já resolvida em provedores existentes e disponíveis. */
  private ordem(): ProvedorCnpj[] {
    const config = (process.env.DOSSIE_PROVEDORES || '').trim()
    const nomes = config ? config.split(',').map(s => s.trim()).filter(Boolean) : ORDEM_PADRAO
    const porNome: Record<string, ProvedorCnpj | undefined> = {
      opencnpj: this.openCnpj,
      brasilapi: this.brasilApi,
      serpro: this.serpro,
    }
    return nomes
      .map(n => porNome[n])
      .filter((p): p is ProvedorCnpj => !!p && p.disponivel())
  }

  private disjuntor(nome: string): Disjuntor {
    let d = this.disjuntores.get(nome)
    if (!d) { d = new Disjuntor(); this.disjuntores.set(nome, d) }
    return d
  }

  async consultar(documento: string): Promise<ResultadoCadeia> {
    const tentativas: TentativaProvedor[] = []

    for (const provedor of this.ordem()) {
      const disj = this.disjuntor(provedor.nome)
      if (disj.aberto) {
        tentativas.push({ fonte: provedor.nome, status: 'pulado', erro: 'disjuntor aberto', latenciaMs: 0 })
        continue
      }

      const inicio = Date.now()
      try {
        const dados = await provedor.consultar(documento)
        disj.registrarSucesso()
        tentativas.push({ fonte: provedor.nome, status: 'ok', latenciaMs: Date.now() - inicio })
        return { dados, tentativas }
      } catch (e) {
        const erro = e as Error
        const latenciaMs = Date.now() - inicio
        // CNPJ alfanumérico não é falha do provedor: NENHUM aceita o formato
        // ainda. Insistir na cadeia só gastaria três consultas para o mesmo
        // resultado — e no SERPRO isso é dinheiro.
        if (erro instanceof CnpjAlfanumericoNaoSuportadoError) {
          tentativas.push({ fonte: provedor.nome, status: 'erro', erro: erro.message, latenciaMs })
          return { dados: null, tentativas, erroTerminal: erro.message }
        }
        disj.registrarFalha()
        tentativas.push({ fonte: provedor.nome, status: 'erro', erro: erro.message, latenciaMs })
      }
    }

    return { dados: null, tentativas }
  }
}
