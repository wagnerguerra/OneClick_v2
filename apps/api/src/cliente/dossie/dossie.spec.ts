import {
  prepararCnpjParaConsulta,
  CnpjAlfanumericoNaoSuportadoError,
  buscarComBackoff,
  Disjuntor,
} from './provedor-cnpj'
import { ProvedorOpenCnpj } from './provedor-opencnpj'
import { ProvedorBrasilApi } from './provedor-brasilapi'
import { detectarDivergencias } from './divergencias'
import type { DadosCnpj } from './provedor-cnpj'

/** Nenhum teste bate em API real — o fetch global é sempre trocado por mock. */
const fetchOriginal = global.fetch
afterEach(() => { global.fetch = fetchOriginal; jest.restoreAllMocks() })

function respostaFalsa(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('prepararCnpjParaConsulta', () => {
  it('normaliza máscara e devolve as 14 posições', () => {
    expect(prepararCnpjParaConsulta('33.000.167/0001-01')).toBe('33000167000101')
  })

  it('recusa CNPJ alfanumérico em vez de apagar as letras', () => {
    // O erro é o ponto do teste: `/\D/g` transformaria 12ABC34501DE35 em
    // 123450135 e a consulta responderia sobre outra empresa.
    expect(() => prepararCnpjParaConsulta('12ABC34501DE35')).toThrow(CnpjAlfanumericoNaoSuportadoError)
  })

  it('recusa documento com tamanho errado', () => {
    expect(() => prepararCnpjParaConsulta('123')).toThrow(/esperado 14/)
  })
})

describe('buscarComBackoff', () => {
  it('não repete em 404 — insistir não muda a resposta', async () => {
    const mock = jest.fn().mockResolvedValue(respostaFalsa({}, 404))
    global.fetch = mock as unknown as typeof fetch
    const r = await buscarComBackoff('http://x', {}, async () => {})
    expect(r.status).toBe(404)
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('repete em 429 e devolve o sucesso da segunda tentativa', async () => {
    const mock = jest.fn()
      .mockResolvedValueOnce(respostaFalsa({}, 429))
      .mockResolvedValueOnce(respostaFalsa({ ok: true }, 200))
    global.fetch = mock as unknown as typeof fetch
    const r = await buscarComBackoff('http://x', {}, async () => {})
    expect(r.ok).toBe(true)
    expect(mock).toHaveBeenCalledTimes(2)
  })

  it('desiste depois de três tentativas em 500, lançando para a cadeia tentar o próximo', async () => {
    const mock = jest.fn().mockResolvedValue(respostaFalsa({}, 500))
    global.fetch = mock as unknown as typeof fetch
    await expect(buscarComBackoff('http://x', {}, async () => {})).rejects.toThrow(/HTTP 500/)
    expect(mock).toHaveBeenCalledTimes(3)
  })
})

describe('Disjuntor', () => {
  it('abre depois do limite de falhas e fecha ao passar a janela', () => {
    let agora = 1_000
    const d = new Disjuntor(3, 60_000, () => agora)
    d.registrarFalha(); d.registrarFalha()
    expect(d.aberto).toBe(false)
    d.registrarFalha()
    expect(d.aberto).toBe(true)
    agora += 60_001
    expect(d.aberto).toBe(false)
  })

  it('um sucesso zera a contagem', () => {
    const d = new Disjuntor(2, 60_000, () => 0)
    d.registrarFalha()
    d.registrarSucesso()
    d.registrarFalha()
    expect(d.aberto).toBe(false)
  })
})

describe('ProvedorOpenCnpj — normalização', () => {
  it('traduz o payload preservando descrição do CNAE e Simples/MEI', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({
      cnpj: '33000167000101',
      razao_social: 'PETROLEO BRASILEIRO S A PETROBRAS',
      nome_fantasia: 'PETROBRAS - EDISE',
      situacao_cadastral: 'Ativa',
      matriz_filial: 'Matriz',
      capital_social: '205431960490.52',
      cnaes: [
        { codigo: '0600001', descricao: 'Extração de petróleo e gás natural', is_principal: true },
        { codigo: '1921700', descricao: 'Fabricação de produtos do refino de petróleo', is_principal: false },
      ],
      tipo_logradouro: 'AVENIDA', logradouro: 'REPUBLICA DO CHILE',
      codigo_municipio: '6001', municipio: 'RIO DE JANEIRO', uf: 'RJ',
      telefones: [{ ddd: '21', numero: '32242020' }],
      opcao_simples: 'N', opcao_mei: 'N',
      QSA: [{ nome_socio: 'FULANO DE TAL', cnpj_cpf_socio: '***123456**', qualificacao_socio: 'Diretor' }],
    })) as unknown as typeof fetch

    const d = await new ProvedorOpenCnpj().consultar('33.000.167/0001-01')
    expect(d.fonte).toBe('opencnpj')
    expect(d.matriz).toBe(true)
    expect(d.capitalSocial).toBeCloseTo(205431960490.52, 2)
    expect(d.cnaes[0]).toEqual({ codigo: '0600001', descricao: 'Extração de petróleo e gás natural', principal: true })
    expect(d.logradouro).toBe('AVENIDA REPUBLICA DO CHILE')
    expect(d.municipioIbge).toBe('6001')
    expect(d.telefones).toEqual(['2132242020'])
    expect(d.optanteSimples).toBe(false)
    expect(d.socios).toHaveLength(1)
  })

  it('campo que vem como objeto vira a descrição, não "[object Object]"', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({
      razao_social: 'EMPRESA X',
      // A base devolve este campo ora como texto, ora como objeto.
      motivo_situacao_cadastral: { codigo: '00', descricao: 'SEM MOTIVO' },
      porte_empresa: { codigo: '03', descricao: 'EPP' },
      situacao_cadastral: 'Ativa',
    })) as unknown as typeof fetch

    const d = await new ProvedorOpenCnpj().consultar('33000167000101')
    expect(d.motivoSituacaoCadastral).toBe('SEM MOTIVO')
    expect(d.porte).toBe('EPP')
  })

  it('objeto sem campo legível some do dossiê em vez de virar JSON na tela', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({
      razao_social: 'EMPRESA X',
      motivo_situacao_cadastral: { codigo: '00' },
    })) as unknown as typeof fetch

    const d = await new ProvedorOpenCnpj().consultar('33000167000101')
    expect(d.motivoSituacaoCadastral).toBeNull()
  })

  it('capital social em formato brasileiro vira número', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({
      razao_social: 'EMPRESA X',
      capital_social: '20000,00', // é assim que chega para a maioria dos clientes
    })) as unknown as typeof fetch

    const d = await new ProvedorOpenCnpj().consultar('33000167000101')
    expect(d.capitalSocial).toBe(20000)
  })

  it('avisa quando o CNPJ não existe na base', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({}, 404)) as unknown as typeof fetch
    await expect(new ProvedorOpenCnpj().consultar('33000167000101')).rejects.toThrow(/não encontrado/)
  })
})

describe('ProvedorBrasilApi — normalização', () => {
  it('recompõe o zero à esquerda do CNAE, que vem como número', async () => {
    global.fetch = jest.fn().mockResolvedValue(respostaFalsa({
      razao_social: 'EMPRESA X',
      cnae_fiscal: 600001, // 0600001 sem o zero
      cnae_fiscal_descricao: 'Extração de petróleo e gás natural',
      cnaes_secundarios: [
        { codigo: 1921700, descricao: 'Refino' },
        { codigo: 0, descricao: 'Não informada' }, // marcador de "sem secundário"
      ],
      identificador_matriz_filial: 1,
    })) as unknown as typeof fetch

    const d = await new ProvedorBrasilApi().consultar('33000167000101')
    expect(d.cnaes.map(c => c.codigo)).toEqual(['0600001', '1921700'])
    expect(d.matriz).toBe(true)
  })
})

describe('detectarDivergencias', () => {
  const base = { razaoSocial: 'EMPRESA X LTDA', nomeFantasia: null, cnaePrincipal: null,
    inscricaoEstadual: null, capitalSocial: null, cep: null, logradouro: null, numero: null,
    complemento: null, bairro: null, cidade: null, uf: null, telefone: null, email: null }

  /** DadosCnpj completo — a comparação varre todos os campos, não só o do teste. */
  function daFonte(parcial: Partial<DadosCnpj>): DadosCnpj {
    return {
      cnpj: '33000167000101', razaoSocial: 'EMPRESA X LTDA', nomeFantasia: null,
      situacaoCadastral: null, dataSituacaoCadastral: null, motivoSituacaoCadastral: null,
      matriz: null, dataAbertura: null, naturezaJuridica: null, porte: null, capitalSocial: null,
      cnaes: [], cep: null, logradouro: null, numero: null, complemento: null, bairro: null,
      municipio: null, municipioIbge: null, uf: null, telefones: [], email: null,
      optanteSimples: null, dataOpcaoSimples: null, optanteMei: null, socios: [],
      fonte: 'opencnpj', urlFonte: 'u', payload: {},
      ...parcial,
    }
  }

  it('não sugere nada quando o cadastro bate com a fonte', () => {
    const d = detectarDivergencias(
      { ...base },
      daFonte({ razaoSocial: 'EMPRESA X LTDA' }),
    )
    expect(d).toHaveLength(0)
  })

  it('sugere quando os valores diferem de verdade', () => {
    const d = detectarDivergencias(
      { ...base },
      daFonte({ razaoSocial: 'EMPRESA X COMERCIO LTDA' }),
    )
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ campo: 'razaoSocial', valorSugerido: 'EMPRESA X COMERCIO LTDA' })
  })

  it('ignora diferença só de acento, caixa e espaço — não é divergência real', () => {
    const d = detectarDivergencias(
      { ...base, razaoSocial: 'Empresa  X  Ltda' },
      daFonte({ razaoSocial: 'EMPRESA X LTDA' }),
    )
    expect(d).toHaveLength(0)
  })

  it('não sugere apagar: fonte vazia com cadastro preenchido fica como está', () => {
    const d = detectarDivergencias(
      { ...base, nomeFantasia: 'LOJA DO ZÉ' },
      daFonte({ nomeFantasia: null }),
    )
    expect(d).toHaveLength(0)
  })
})
