import { Injectable } from '@nestjs/common'
import type { ProvedorCnpj, DadosCnpj, CnaeNormalizado, SocioNormalizado } from './provedor-cnpj'
import { buscarComBackoff, prepararCnpjParaConsulta } from './provedor-cnpj'

/**
 * OpenCNPJ — espelho gratuito e sem token da base de dados abertos da Receita.
 *
 * É o primeiro da cadeia porque devolve o que as outras fontes não devolvem
 * inteiro: os CNAEs COM DESCRIÇÃO (não só o código), Simples e MEI com datas, o
 * motivo da situação cadastral e o código IBGE do município. Também responde
 * bem mais rápido que a BrasilAPI.
 *
 * A ressalva: é serviço comunitário, sem SLA — por isso a BrasilAPI vem logo
 * atrás na cadeia, e o disjuntor tira o provedor do caminho quando ele cai.
 */

type RespostaOpenCnpj = {
  cnpj?: string
  razao_social?: string
  nome_fantasia?: string | null
  situacao_cadastral?: string
  data_situacao_cadastral?: string
  motivo_situacao_cadastral?: string
  matriz_filial?: string
  data_inicio_atividade?: string
  natureza_juridica?: string
  porte_empresa?: string
  capital_social?: string | number
  cnaes?: Array<{ codigo?: string; descricao?: string; is_principal?: boolean }>
  cnae_principal?: string
  logradouro?: string; tipo_logradouro?: string; numero?: string; complemento?: string
  bairro?: string; cep?: string; uf?: string; municipio?: string; codigo_municipio?: string
  telefones?: Array<{ ddd?: string; numero?: string } | string>
  email?: string
  opcao_simples?: string | boolean | null
  data_opcao_simples?: string | null
  opcao_mei?: string | boolean | null
  QSA?: Array<{
    nome_socio?: string; cnpj_cpf_socio?: string; qualificacao_socio?: string
    data_entrada_sociedade?: string; faixa_etaria?: string; representante_legal?: string
  }>
}

const BASE = 'https://api.opencnpj.org'

@Injectable()
export class ProvedorOpenCnpj implements ProvedorCnpj {
  readonly nome = 'opencnpj'

  /** Sem credencial: está sempre disponível. */
  disponivel(): boolean { return true }

  async consultar(documento: string): Promise<DadosCnpj> {
    const cnpj = prepararCnpjParaConsulta(documento)
    const url = `${BASE}/${cnpj}`
    const resp = await buscarComBackoff(url, { headers: { Accept: 'application/json' } })
    if (resp.status === 404) throw new Error('CNPJ não encontrado na base da Receita.')
    if (!resp.ok) throw new Error(`OpenCNPJ respondeu ${resp.status}.`)
    const d = await resp.json() as RespostaOpenCnpj

    return {
      cnpj,
      razaoSocial: (d.razao_social || '').trim(),
      nomeFantasia: this.textoOuNulo(d.nome_fantasia),
      situacaoCadastral: this.textoOuNulo(d.situacao_cadastral),
      dataSituacaoCadastral: this.textoOuNulo(d.data_situacao_cadastral),
      motivoSituacaoCadastral: this.textoOuNulo(d.motivo_situacao_cadastral),
      matriz: d.matriz_filial ? /matriz/i.test(d.matriz_filial) : null,
      dataAbertura: this.textoOuNulo(d.data_inicio_atividade),
      naturezaJuridica: this.textoOuNulo(d.natureza_juridica),
      porte: this.textoOuNulo(d.porte_empresa),
      capitalSocial: this.numeroOuNulo(d.capital_social),

      cnaes: this.normalizarCnaes(d),

      cep: this.textoOuNulo(d.cep),
      logradouro: this.montarLogradouro(d),
      numero: this.textoOuNulo(d.numero),
      complemento: this.textoOuNulo(d.complemento),
      bairro: this.textoOuNulo(d.bairro),
      municipio: this.textoOuNulo(d.municipio),
      municipioIbge: this.textoOuNulo(d.codigo_municipio),
      uf: this.textoOuNulo(d.uf),

      telefones: this.normalizarTelefones(d.telefones),
      email: this.textoOuNulo(d.email),

      optanteSimples: this.boolOuNulo(d.opcao_simples),
      dataOpcaoSimples: this.textoOuNulo(d.data_opcao_simples),
      optanteMei: this.boolOuNulo(d.opcao_mei),

      socios: this.normalizarSocios(d.QSA),

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

  /** A base traz "S"/"N" em alguns campos e booleano em outros. */
  private boolOuNulo(v: unknown): boolean | null {
    if (v == null || v === '') return null
    if (typeof v === 'boolean') return v
    const t = String(v).trim().toUpperCase()
    if (['S', 'SIM', 'TRUE', '1'].includes(t)) return true
    if (['N', 'NAO', 'NÃO', 'FALSE', '0'].includes(t)) return false
    return null
  }

  private montarLogradouro(d: RespostaOpenCnpj): string | null {
    const tipo = (d.tipo_logradouro || '').trim()
    const nome = (d.logradouro || '').trim()
    const junto = [tipo, nome].filter(Boolean).join(' ').trim()
    return junto === '' ? null : junto
  }

  private normalizarCnaes(d: RespostaOpenCnpj): CnaeNormalizado[] {
    const lista = (d.cnaes ?? [])
      .filter(c => !!c.codigo)
      .map(c => ({
        codigo: String(c.codigo).trim(),
        descricao: (c.descricao || '').trim(),
        principal: !!c.is_principal,
      }))
    // Se a lista detalhada vier vazia, ainda dá para registrar o principal.
    if (lista.length === 0 && d.cnae_principal) {
      return [{ codigo: String(d.cnae_principal).trim(), descricao: '', principal: true }]
    }
    return lista
  }

  private normalizarTelefones(t: RespostaOpenCnpj['telefones']): string[] {
    if (!Array.isArray(t)) return []
    return t
      .map(item => typeof item === 'string' ? item : `${item?.ddd ?? ''}${item?.numero ?? ''}`)
      .map(s => s.replace(/\D/g, ''))
      .filter(s => s.length >= 8)
  }

  private normalizarSocios(qsa: RespostaOpenCnpj['QSA']): SocioNormalizado[] {
    if (!Array.isArray(qsa)) return []
    return qsa.map(s => ({
      nome: (s.nome_socio || '').trim(),
      documento: (s.cnpj_cpf_socio || '').trim(),
      qualificacao: (s.qualificacao_socio || '').trim(),
      dataEntrada: this.textoOuNulo(s.data_entrada_sociedade),
      faixaEtaria: this.textoOuNulo(s.faixa_etaria),
      representanteLegal: this.textoOuNulo(s.representante_legal),
    })).filter(s => !!s.nome)
  }
}
