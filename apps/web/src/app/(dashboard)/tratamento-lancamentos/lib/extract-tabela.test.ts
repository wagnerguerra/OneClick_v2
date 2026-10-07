import { describe, expect, it } from 'vitest'
import { extractTabelaFromMatrix, type CellValue } from './extract-tabela'

// Regressão da extração de planilhas. Cada caso reproduz (com dados fictícios) o
// FORMATO de um arquivo real que já foi extraído errado — a tabela mais simples
// possível precisa sair inteira, com o cabeçalho certo.

type Row = CellValue[]
const extrai = (m: Row[]) => extractTabelaFromMatrix(m, 'Planilha')

describe('tabela simples — cabeçalho na 1ª linha', () => {
  it('subtotais de grupo no meio NÃO partem a tabela (caso "Custom Box")', () => {
    const H: Row = ['Data de vencimento', 'Número', 'Nome', 'Valor', 'Situação', 'Liquidação', 'Pago', 'Juro', 'CPF/CNPJ', 'Descrição']
    const lanc = (venc: string, nome: string, valor: string): Row =>
      [venc, 'NF 1', nome, valor, 'Pago', '04/08/2026', valor, '0,00', '03.888.008/0002-05', 'Boleto']
    // Subtotal de cada grupo: só os valores, nas colunas de valor.
    const subtotal = (v: string): Row => [null, null, null, v, null, null, v, '0,00', null, null]
    const m: Row[] = [
      H,
      lanc('07/2026', 'ALFA LTDA', '10,00'), lanc('07/2026', 'BETA LTDA', '20,00'), subtotal('30,00'),
      lanc('08/2026', 'GAMA LTDA', '1,00'), lanc('08/2026', 'DELTA LTDA', '2,00'), lanc('08/2026', 'EPSILON LTDA', '3,00'), subtotal('6,00'),
      lanc('09/2026', 'ZETA LTDA', '5,00'), subtotal('5,00'),
    ]
    const t = extrai(m)
    expect(t.meta.mode).toBe('single')
    expect(t.meta.headerRowIndex).toBe(0)
    expect(t.headers).toEqual(H)
    expect(t.rows.map((r) => r.Nome)).toEqual(['ALFA LTDA', 'BETA LTDA', 'GAMA LTDA', 'DELTA LTDA', 'EPSILON LTDA', 'ZETA LTDA'])
  })

  it('campos opcionais vazios não derrubam linhas (caso "clientes/fornecedores")', () => {
    const m: Row[] = [
      ['ID', 'Situação', 'Razão Social', 'Nome Fantasia', 'Documento', 'Tributação', 'Grupo', 'Cidade', 'UF', 'Telefone', 'E-mail', 'Áreas'],
      [1, 'MENSAL', 'ALFA LTDA', null, '01323046000104', null, 'ÚNICA', null, null, null, null, null],
      [2, 'AVULSO', 'BETA LTDA', 'BETA', '47100110009650', 'LUCRO_REAL', 'GRUPO B', 'VITÓRIA', 'ES', '(27) 3333-3333', 'b@b.com', 'Fiscal'],
      [3, 'MENSAL', 'GAMA LTDA', null, null, null, null, null, null, null, null, null],
      [4, 'MENSAL', 'DELTA LTDA', 'DELTA', '28410074000115', 'SIMPLES', null, 'SERRA', 'ES', null, null, null],
    ]
    const t = extrai(m)
    expect(t.meta.headerRowIndex).toBe(0)
    expect(t.rows).toHaveLength(4)
    expect(t.rows.map((r) => r['Razão Social'])).toEqual(['ALFA LTDA', 'BETA LTDA', 'GAMA LTDA', 'DELTA LTDA'])
  })

  it('uma única linha de dados, mais estreita que o cabeçalho (caso "cargos")', () => {
    const m: Row[] = [
      ['Código', 'Cargo', 'Área', 'Colaboradores', 'Versão', 'Organograma', 'Descrição', 'Responsabilidades', 'Habilidades', 'Autoridades', 'Experiências', 'Treinamentos', 'Educação'],
      [1, 'Analista', 'TI', 1, 1, 'Sim', '', '', '', '', '', '', ''],
    ]
    const t = extrai(m)
    expect(t.rows).toEqual([{ Código: 1, Cargo: 'Analista', Área: 'TI', Colaboradores: 1, Versão: 1, Organograma: 'Sim' }])
  })

  it('lançamentos idênticos repetidos não viram "cabeçalho repetido" (caso "PAGAMENTOS")', () => {
    const boleto: Row = ['23/06/2026', 'BOLETO PAGO PAGBRASIL', 'PAGBRASIL', '14.630.124/0001-65', '-153,9', 'Antivirus']
    const m: Row[] = [
      ['Data', 'Histórico', 'Razão Social', 'CNPJ', 'Valor', 'Obs'],
      ['22/06/2026', 'PIX ENVIADO', 'ALFA', '01.323.046/0001-04', '-10,00', 'x'],
      boleto, boleto, boleto,
      ['24/06/2026', 'TARIFA', null, null, '-5,00', null],
    ]
    const t = extrai(m)
    expect(t.meta.mode).toBe('single')
    expect(t.meta.headerRowIndex).toBe(0)
    expect(t.rows).toHaveLength(5)
  })

  it('tabela só de texto (sem números) sai inteira', () => {
    const m: Row[] = [
      ['Variável', 'Uso', 'Onde é lida'],
      ['API_URL', 'endereço da API', 'web'],
      ['DB_URL', 'banco', 'api'],
      ['REDIS_URL', 'cache', 'api'],
    ]
    const t = extrai(m)
    expect(t.meta.headerRowIndex).toBe(0)
    expect(t.rows).toHaveLength(3)
  })
})

describe('tabela com preâmbulo e rodapé', () => {
  it('acha o cabeçalho abaixo do preâmbulo e aceita quadro-resumo à direita (caso "títulos pagos Bradesco")', () => {
    const m: Row[] = [
      [null, null, null, 'Títulos Pagos por Negociação'],
      ['Id do produto', null, 'Conta do Produto', null, 'Nome do cliente'],
      ['9', null, '2888 11494', null, 'EMPRESA X'],
      [],
      ['Tipo', 'Seu Número', 'Pagador', 'Dt de Venc.', 'Dt de Pag.', 'Valor do Título', 'Valor Cobrado'],
      // Primeiras linhas com um quadro-resumo colado à direita (colunas 8–10).
      ['2', '016131-003', 'ALFA ME', '03/06/2026', '06/07/2026', 580.16, 593.69, null, 'D:', 'BANCO', 593.69],
      ['2', '016619-001', 'BETA ME', '04/06/2026', '06/07/2026', 1050, 1073.68, null, 'C:', 'CLIENTE', 580.16],
      ['2', '016743-001', 'GAMA EIRELI', '09/06/2026', '01/07/2026', 1867.5, 1896.32],
      ['2', '016800-002', 'DELTA SA', '10/06/2026', '02/07/2026', 99.9, 99.9],
    ]
    const t = extrai(m)
    expect(t.meta.headerRowIndex).toBe(4)
    expect(t.rows.map((r) => r.Pagador)).toEqual(['ALFA ME', 'BETA ME', 'GAMA EIRELI', 'DELTA SA'])
  })

  it('descarta rodapé esparso de total, mas mantém lançamento cujo texto começa com "Total"', () => {
    const m: Row[] = [
      ['Data', 'Descrição', 'Fornecedor', 'Documento', 'Valor', 'Conta'],
      ['01/06/2026', 'Energia', 'TOTAL DISTRIBUIDORA LTDA', '123', '100,00', 'Itaú'],
      ['02/06/2026', 'Água', 'CESAN', '456', '50,00', 'Itaú'],
      [null, 'Total geral', null, null, '150,00', null],
    ]
    const t = extrai(m)
    expect(t.rows.map((r) => r.Fornecedor)).toEqual(['TOTAL DISTRIBUIDORA LTDA', 'CESAN'])
  })

  it('linha estreita de títulos de grupo acima do cabeçalho não vira cabeçalho', () => {
    const m: Row[] = [
      ['Identificação', null, null, 'Valores', null],
      ['Data', 'Histórico', 'Documento', 'Débito', 'Crédito'],
      ['01/06/2026', 'PIX', '1', '10,00', null],
      ['02/06/2026', 'TED', '2', null, '20,00'],
    ]
    const t = extrai(m)
    expect(t.meta.headerRowIndex).toBe(1)
    expect(t.headers).toEqual(['Data', 'Histórico', 'Documento', 'Débito', 'Crédito'])
    expect(t.rows).toHaveLength(2)
  })
})

describe('reservas', () => {
  it('arquivo sem linha de cabeçalho cai na heurística antiga (1ª linha do bloco vira cabeçalho)', () => {
    const m: Row[] = [
      ['01/06/2026', 'PIX', '10,00'],
      ['02/06/2026', 'TED', '20,00'],
      ['03/06/2026', 'DOC', '30,00'],
    ]
    const t = extrai(m)
    expect(t.meta.mode).toBe('single')
    expect(t.rows).toHaveLength(2)
  })

  it('relatório com cabeçalho repetido continua no modo relatório', () => {
    const H: Row = ['Data', 'Histórico', 'Documento', 'Valor']
    const m: Row[] = [
      ['Banco:', '001 - BRASIL'], H, ['01/06/2026', 'PIX', '1', '10,00'], ['02/06/2026', 'TED', '2', '20,00'],
      ['Banco:', '341 - ITAU'], H, ['03/06/2026', 'DOC', '3', '30,00'],
    ]
    const t = extrai(m)
    expect(t.meta.mode).toBe('report')
    expect(t.rows).toHaveLength(3)
    expect(t.rows.map((r) => r.Banco)).toEqual(['001 - BRASIL', '001 - BRASIL', '341 - ITAU'])
  })
})
