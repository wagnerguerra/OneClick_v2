import { Injectable, Inject, Optional } from '@nestjs/common'
import { CnpjService } from '../../cnpj/cnpj.service'
import type { ProvedorCnpj, DadosCnpj, CnaeNormalizado, SocioNormalizado } from './provedor-cnpj'
import { prepararCnpjParaConsulta } from './provedor-cnpj'

/**
 * SERPRO — último da cadeia, adaptando o `CnpjService` que já existe no projeto.
 *
 * Fica por último porque é pago por consulta: só entra quando as fontes
 * públicas falham. Não reimplementa a chamada — o `CnpjService` já cuida do
 * token, do gate por empresa e do registro de consumo; aqui só traduzimos o
 * `CnpjResult` dele para a forma comum do dossiê.
 */
@Injectable()
export class ProvedorSerpro implements ProvedorCnpj {
  readonly nome = 'serpro'

  constructor(
    @Optional() @Inject(CnpjService) private readonly cnpjService?: CnpjService,
  ) {}

  /** Sem chave configurada não adianta gastar uma volta na cadeia. */
  disponivel(): boolean {
    return !!this.cnpjService
      && !!process.env.SERPRO_CONSUMER_KEY?.trim()
      && !!process.env.SERPRO_CONSUMER_SECRET?.trim()
  }

  async consultar(documento: string): Promise<DadosCnpj> {
    if (!this.cnpjService) throw new Error('CnpjService indisponível.')
    const cnpj = prepararCnpjParaConsulta(documento)
    const r = await this.cnpjService.consultarCnpj(cnpj)

    const cnaes: CnaeNormalizado[] = []
    if (r.cnaePrincipalCodigo) {
      cnaes.push({
        codigo: r.cnaePrincipalCodigo,
        descricao: r.atividadePrincipal || '',
        principal: true,
      })
    }
    for (const c of r.cnaesSecundarios ?? []) {
      if (!c.codigo) continue
      cnaes.push({ codigo: c.codigo, descricao: c.descricao || '', principal: false })
    }

    const socios: SocioNormalizado[] = (r.qsa ?? []).map(s => ({
      nome: s.nome,
      documento: s.cpfCnpj,
      qualificacao: s.qualificacao,
      dataEntrada: null,
      faixaEtaria: null,
      representanteLegal: null,
    })).filter(s => !!s.nome)

    return {
      cnpj,
      razaoSocial: r.razaoSocial,
      nomeFantasia: r.nomeFantasia,
      situacaoCadastral: r.situacao || null,
      dataSituacaoCadastral: null,
      motivoSituacaoCadastral: null,
      matriz: null,
      dataAbertura: r.dataAbertura,
      naturezaJuridica: r.naturezaJuridica,
      porte: r.porte,
      capitalSocial: r.capitalSocial,

      cnaes,

      cep: r.cep,
      logradouro: r.logradouro,
      numero: r.numero,
      complemento: r.complemento,
      bairro: r.bairro,
      municipio: r.municipio,
      municipioIbge: null,
      uf: r.uf,

      telefones: r.telefone ? [r.telefone.replace(/\D/g, '')] : [],
      email: r.email,

      // O consumo do SERPRO neste projeto não devolve Simples/MEI.
      optanteSimples: null,
      dataOpcaoSimples: null,
      optanteMei: null,

      socios,

      fonte: this.nome,
      urlFonte: 'https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2',
      payload: r,
    }
  }
}
