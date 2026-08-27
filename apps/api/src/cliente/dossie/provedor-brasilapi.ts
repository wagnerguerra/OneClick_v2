import { Injectable } from '@nestjs/common'
import type { ProvedorCnpj, DadosCnpj, CnaeNormalizado, SocioNormalizado } from './provedor-cnpj'
import { buscarComBackoff, prepararCnpjParaConsulta } from './provedor-cnpj'

/**
 * BrasilAPI — segunda da cadeia. Gratuita, sem token, com limite de taxa baixo.
 *
 * Cobre bem os dados cadastrais e traz a descrição do CNAE principal, mas os
 * secundários vêm sem descrição em alguns registros. Por isso é reserva do
 * OpenCNPJ, e não o contrário.
 */

type RespostaBrasilApi = {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string | null
  descricao_situacao_cadastral?: string
  situacao_cadastral?: number | string
  data_situacao_cadastral?: string
  descricao_motivo_situacao_cadastral?: string
  descricao_identificador_matriz_filial?: string
  identificador_matriz_filial?: number
  data_inicio_atividade?: string
  natureza_juridica?: string
  porte?: string
  capital_social?: number | string
  cnae_fiscal?: number | string
  cnae_fiscal_descricao?: string
  cnaes_secundarios?: Array<{ codigo?: number | string; descricao?: string }>
  cep?: string
  descricao_tipo_de_logradouro?: string
  logradouro?: string; numero?: string; complemento?: string; bairro?: string
  municipio?: string; codigo_municipio_ibge?: number | string; uf?: string
  ddd_telefone_1?: string; ddd_telefone_2?: string
  email?: string
  opcao_pelo_simples?: boolean | null
  data_opcao_pelo_simples?: string | null
  opcao_pelo_mei?: boolean | null
  qsa?: Array<{
    nome_socio?: string; cnpj_cpf_do_socio?: string; qualificacao_socio?: string
    data_entrada_sociedade?: string; faixa_etaria?: string
    nome_representante_legal?: string
  }>
}

const BASE = 'https://brasilapi.com.br/api/cnpj/v1'

@Injectable()
export class ProvedorBrasilApi implements ProvedorCnpj {
  readonly nome = 'brasilapi'

  disponivel(): boolean { return true }

  async consultar(documento: string): Promise<DadosCnpj> {
    const cnpj = prepararCnpjParaConsulta(documento)
    const url = `${BASE}/${cnpj}`
    const resp = await buscarComBackoff(url, { headers: { Accept: 'application/json' } })
    if (resp.status === 404) throw new Error('CNPJ não encontrado na base da Receita.')
    if (!resp.ok) throw new Error(`BrasilAPI respondeu ${resp.status}.`)
    const d = await resp.json() as RespostaBrasilApi

    return {
      cnpj,
      razaoSocial: (d.razao_social || '').trim(),
      nomeFantasia: this.textoOuNulo(d.nome_fantasia),
      situacaoCadastral: this.textoOuNulo(d.descricao_situacao_cadastral),
      dataSituacaoCadastral: this.textoOuNulo(d.data_situacao_cadastral),
      motivoSituacaoCadastral: this.textoOuNulo(d.descricao_motivo_situacao_cadastral),
      matriz: d.identificador_matriz_filial != null
        ? Number(d.identificador_matriz_filial) === 1
        : d.descricao_identificador_matriz_filial ? /matriz/i.test(d.descricao_identificador_matriz_filial) : null,
      dataAbertura: this.textoOuNulo(d.data_inicio_atividade),
      naturezaJuridica: this.textoOuNulo(d.natureza_juridica),
      porte: this.textoOuNulo(d.porte),
      capitalSocial: this.numeroOuNulo(d.capital_social),

      cnaes: this.normalizarCnaes(d),

      cep: this.textoOuNulo(d.cep),
      logradouro: [d.descricao_tipo_de_logradouro, d.logradouro]
        .map(s => (s || '').trim()).filter(Boolean).join(' ') || null,
      numero: this.textoOuNulo(d.numero),
      complemento: this.textoOuNulo(d.complemento),
      bairro: this.textoOuNulo(d.bairro),
      municipio: this.textoOuNulo(d.municipio),
      municipioIbge: this.textoOuNulo(d.codigo_municipio_ibge),
      uf: this.textoOuNulo(d.uf),

      telefones: [d.ddd_telefone_1, d.ddd_telefone_2]
        .map(t => (t || '').replace(/\D/g, ''))
        .filter(t => t.length >= 8),
      email: this.textoOuNulo(d.email),

      optanteSimples: d.opcao_pelo_simples ?? null,
      dataOpcaoSimples: this.textoOuNulo(d.data_opcao_pelo_simples),
      optanteMei: d.opcao_pelo_mei ?? null,

      socios: this.normalizarSocios(d.qsa),

      fonte: this.nome,
      urlFonte: url,
      payload: d,
    }
  }

  private textoOuNulo(v: unknown): string | null {
    const t = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim()
    return t === '' ? null : t
  }

  /**
   * Número que chega em dois dialetos: "1.234,56" (brasileiro) e "1234.56"
   * (ponto decimal, que é como a base da Receita devolve o capital social).
   * Tratar todo ponto como separador de milhar multiplicava o capital social
   * por cem — R$ 205 bilhões viravam R$ 20 trilhões, calados.
   */
  private numeroOuNulo(v: unknown): number | null {
    if (v == null || v === '') return null
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    const texto = String(v).trim()
    const bruto = texto.includes(',')
      ? texto.replace(/\./g, '').replace(',', '.') // brasileiro
      : texto                                      // ponto já é decimal
    const n = Number(bruto)
    return Number.isFinite(n) ? n : null
  }

  private normalizarCnaes(d: RespostaBrasilApi): CnaeNormalizado[] {
    const lista: CnaeNormalizado[] = []
    if (d.cnae_fiscal) {
      lista.push({
        // O código vem numérico e perde o zero à esquerda ("0600001" vira 600001).
        codigo: String(d.cnae_fiscal).padStart(7, '0'),
        descricao: (d.cnae_fiscal_descricao || '').trim(),
        principal: true,
      })
    }
    for (const c of d.cnaes_secundarios ?? []) {
      if (!c.codigo) continue
      const codigo = String(c.codigo).padStart(7, '0')
      // A base devolve "0000000 — não informada" quando não há secundário.
      if (/^0+$/.test(codigo)) continue
      lista.push({ codigo, descricao: (c.descricao || '').trim(), principal: false })
    }
    return lista
  }

  private normalizarSocios(qsa: RespostaBrasilApi['qsa']): SocioNormalizado[] {
    if (!Array.isArray(qsa)) return []
    return qsa.map(s => ({
      nome: (s.nome_socio || '').trim(),
      documento: (s.cnpj_cpf_do_socio || '').trim(),
      qualificacao: (s.qualificacao_socio || '').trim(),
      dataEntrada: this.textoOuNulo(s.data_entrada_sociedade),
      faixaEtaria: this.textoOuNulo(s.faixa_etaria),
      representanteLegal: this.textoOuNulo(s.nome_representante_legal),
    })).filter(s => !!s.nome)
  }
}
