/**
 * O de-para da máscara: nome do nível 3 → categoria da DRE.
 *
 * O que estes testes prendem: a chave é o NOME do nível 3, não o código da
 * conta. O porte anterior gravou 142 classificações de folha do plano da
 * Serrafer e casava por código — em outro plano de contas, conta com movimento
 * ficava fora da DRE em silêncio.
 */

import {
  categoriaDeNomeNivel3,
  deparaDoPlano,
  nivel3De,
  normalizarNomeConta,
  sqlDeparaValues,
  DEPARA_NIVEL3,
} from './depara-nivel3'

describe('normalização do nome', () => {
  it('ignora acento, caixa e espaço sobrando', () => {
    expect(normalizarNomeConta('  Deduções   das Receitas ')).toBe('DEDUCOES DAS RECEITAS')
  })

  it('o mesmo nome escrito de três jeitos cai na mesma categoria', () => {
    const esperado = 'RECEITAS_FINANCEIRAS'
    expect(categoriaDeNomeNivel3('RECEITAS FINANCEIRAS')).toBe(esperado)
    expect(categoriaDeNomeNivel3('Receitas Financeiras')).toBe(esperado)
    expect(categoriaDeNomeNivel3('RECEITAS  FINANCEIRAS ')).toBe(esperado)
  })
})

describe('as onze regras da planilha', () => {
  it('três nomes diferentes levam a RECEITAS_FINANCEIRAS', () => {
    for (const nome of ['RECEITAS FINANCEIRAS', 'RECEITAS OPERACIONAIS DIVERSAS', 'OUTRAS RECEITAS']) {
      expect(categoriaDeNomeNivel3(nome)).toBe('RECEITAS_FINANCEIRAS')
    }
  })

  it('as duas famílias de despesa operacional caem na mesma categoria', () => {
    expect(categoriaDeNomeNivel3('DESPESAS OPERACIONAIS')).toBe('DESPESAS_OPERACIONAIS')
    expect(categoriaDeNomeNivel3('DESPESAS OPERACIONAIS TRIBUTÁRIAS')).toBe('DESPESAS_OPERACIONAIS')
  })

  it('despesa financeira NÃO é despesa operacional', () => {
    expect(categoriaDeNomeNivel3('DESPESAS OPERACIONAIS FINANCEIRAS')).toBe('DESPESAS_FINANCEIRAS')
  })

  it('nome fora da máscara não vira categoria nenhuma', () => {
    expect(categoriaDeNomeNivel3('DISPONIBILIDADES')).toBeNull()
    expect(categoriaDeNomeNivel3('RECEITAS DE MEDIÇÃO')).toBeNull()
    expect(categoriaDeNomeNivel3(null)).toBeNull()
    expect(categoriaDeNomeNivel3('')).toBeNull()
  })
})

describe('nivel3De', () => {
  it('pega os três primeiros segmentos', () => {
    expect(nivel3De('04.2.1.09.025')).toBe('04.2.1')
    expect(nivel3De('03.1.1')).toBe('03.1.1')
  })

  it('conta curta demais não tem nível 3', () => {
    expect(nivel3De('01')).toBeNull()
    expect(nivel3De('03.1')).toBeNull()
  })
})

describe('deparaDoPlano, sobre o plano real da Finatto', () => {
  // Nomes do nível 3 como o SCI os devolve. Só os nomes — é o que decide.
  const PLANO_NIVEL3 = [
    { conta: '03.1.1', nomeSci: 'RECEITA BRUTA COM VENDAS E SERVIÇOS' },
    { conta: '03.1.2', nomeSci: 'RECEITA ENTIDADES SEM FINS LUCRATIVOS' },
    { conta: '03.1.3', nomeSci: 'DEDUÇÕES DAS RECEITAS C/VENDAS E SERVIÇO' },
    { conta: '03.1.4', nomeSci: 'RECEITAS FINANCEIRAS' },
    { conta: '03.1.5', nomeSci: 'RECEITAS COM PARTICIPAÇÕES SOCIETÁRIAS' },
    { conta: '03.1.6', nomeSci: 'RECEITAS OPERACIONAIS DIVERSAS' },
    { conta: '03.1.7', nomeSci: 'RECEITAS DE MEDIÇÃO' },
    { conta: '03.2.1', nomeSci: 'ALIENAÇÃO DE BENS' },
    { conta: '03.2.3', nomeSci: 'OUTRAS RECEITAS' },
    { conta: '04.1.1', nomeSci: 'CUSTOS DAS MERCADORIAS VENDIDAS' },
    { conta: '04.1.3', nomeSci: 'CUSTO DOS PRODUTOS VENDIDOS' },
    { conta: '04.2.1', nomeSci: 'DESPESAS OPERACIONAIS' },
    { conta: '04.2.2', nomeSci: 'DESPESAS OPERACIONAIS TRIBUTÁRIAS' },
    { conta: '04.2.3', nomeSci: 'DESPESAS OPERACIONAIS FINANCEIRAS' },
    { conta: '04.2.5', nomeSci: 'OUTRAS DESPESAS' },
    { conta: '04.4.1', nomeSci: 'CONTAS DE APURAÇÕES FINAIS' },
    { conta: '04.4.2', nomeSci: 'PROVISÕES P/IMPOSTOS S/LUCRO' },
  ]

  const depara = deparaDoPlano(PLANO_NIVEL3)
  const porConta = new Map(depara.map(d => [d.conta3, d.categoria]))

  it('reconhece as contas que a DRE usa', () => {
    expect(porConta.get('03.1.1')).toBe('RECEITA_BRUTA')
    expect(porConta.get('03.1.3')).toBe('DEDUCOES_IMPOSTOS')
    expect(porConta.get('03.1.4')).toBe('RECEITAS_FINANCEIRAS')
    expect(porConta.get('03.1.6')).toBe('RECEITAS_FINANCEIRAS')
    expect(porConta.get('03.2.3')).toBe('RECEITAS_FINANCEIRAS')
    expect(porConta.get('04.1.1')).toBe('CUSTO_DAS_VENDAS')
    expect(porConta.get('04.2.1')).toBe('DESPESAS_OPERACIONAIS')
    expect(porConta.get('04.2.2')).toBe('DESPESAS_OPERACIONAIS')
    expect(porConta.get('04.2.3')).toBe('DESPESAS_FINANCEIRAS')
    expect(porConta.get('04.4.2')).toBe('IR_CS')
  })

  it('deixa de fora o que a máscara não menciona', () => {
    for (const fora of ['03.1.2', '03.1.5', '03.1.7', '03.2.1', '04.1.3', '04.2.5', '04.4.1']) {
      expect(porConta.has(fora)).toBe(false)
    }
  })

  it('as contas de Receita Bruta que o template antigo não tinha entram pelo nível 3', () => {
    // 03.1.1.06.001 "Receita de Aluguel" e 03.1.1.04.002 "Serviços Prestados"
    // existem na Finatto e não existiam no plano da Serrafer. Eram 71.500,00
    // fora do cartão de Receita.
    for (const folha of ['03.1.1.06.001', '03.1.1.04.002', '03.1.1.01.004']) {
      expect(porConta.get(nivel3De(folha) as string)).toBe('RECEITA_BRUTA')
    }
  })

  it('o nome do nível 3 é que manda, não o código', () => {
    // Mesmos códigos, plano de contas com outros nomes: nada é reconhecido.
    const outroPlano = PLANO_NIVEL3.map(c => ({ ...c, nomeSci: 'CONTA QUALQUER' }))
    expect(deparaDoPlano(outroPlano)).toHaveLength(0)
  })

  it('ignora conta que não é de nível 3', () => {
    expect(deparaDoPlano([{ conta: '03.1.1.01.004', nomeSci: 'RECEITA BRUTA COM VENDAS E SERVIÇOS' }])).toHaveLength(0)
  })
})

describe('sqlDeparaValues', () => {
  it('monta a tabela inline', () => {
    const sql = sqlDeparaValues([{ conta3: '03.1.1', categoria: 'RECEITA_BRUTA' }])
    expect(sql).toBe(`(VALUES ('03.1.1','RECEITA_BRUTA'))`)
  })

  it('lista vazia continua sendo SQL válido', () => {
    // `VALUES ()` é erro de sintaxe; a linha impossível mantém a consulta de pé.
    expect(sqlDeparaValues([])).toContain('VALUES')
  })

  it('descarta código de conta fora do formato — o valor vira literal no SQL', () => {
    const sql = sqlDeparaValues([
      { conta3: `03.1.1'); DROP TABLE cliente_bi_linhas; --`, categoria: 'RECEITA_BRUTA' },
      { conta3: '04.2.1', categoria: 'DESPESAS_OPERACIONAIS' },
    ])
    expect(sql).not.toContain('DROP')
    expect(sql).toContain(`('04.2.1','DESPESAS_OPERACIONAIS')`)
  })
})

describe('a planilha e o código não podem divergir', () => {
  it('as onze regras estão todas aqui', () => {
    expect(DEPARA_NIVEL3).toHaveLength(11)
  })

  it('nenhum nome repetido — repetição seria mapeamento ambíguo', () => {
    const nomes = DEPARA_NIVEL3.map(d => normalizarNomeConta(d.nomeNivel3))
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})
