import { filtroDeBusca, escopoDeEmpresa, consolidar, type ClienteEncontrado } from './orcamento-busca-cliente'

/** Atalho para ler o `OR` sem repetir o cast em cada teste. */
function ramos(termo: string) {
  const f = filtroDeBusca(termo)
  return (f?.OR ?? []) as Array<Record<string, unknown>>
}

function cliente(p: Partial<ClienteEncontrado> & { id: string }): ClienteEncontrado {
  return {
    razaoSocial: p.id, nomeFantasia: null, documento: '',
    empresaId: 'emp-1', status: 'ATIVO', ...p,
  }
}

describe('filtroDeBusca', () => {
  it('não vira busca por documento quando o termo tem letras', () => {
    // O defeito original: "House027" era espremido para "027" e casava com
    // todo CNPJ terminado em 027 (SÃO GABRIEL, BEDESCHI, BR PRIME).
    const doc = ramos('House027').find(r => 'documento' in r)
    expect(doc).toEqual({ documento: { contains: 'HOUSE027', mode: 'insensitive' } })
  })

  it('busca o documento quando o termo é um CNPJ formatado', () => {
    const doc = ramos('38.711.960/0001-32').find(r => 'documento' in r)
    expect(doc).toEqual({ documento: { contains: '38711960000132', mode: 'insensitive' } })
  })

  it('ignora o ramo do documento para termos curtos demais', () => {
    expect(ramos('SP').some(r => 'documento' in r)).toBe(false)
  })

  it('exige TODAS as palavras do termo no nome', () => {
    const nome = ramos('clinica odontologica')[0] as { AND: unknown[] }
    expect(nome.AND).toEqual([
      { razaoSocial: { contains: 'clinica', mode: 'insensitive' } },
      { razaoSocial: { contains: 'odontologica', mode: 'insensitive' } },
    ])
  })

  it('não filtra nada quando o termo é vazio', () => {
    expect(filtroDeBusca('   ')).toBeNull()
    expect(filtroDeBusca(undefined)).toBeNull()
  })
})

describe('escopoDeEmpresa', () => {
  it('recorta o master pela empresa carregada', () => {
    // Era aqui que o balão sugeria cliente de `jrg-empresa` para quem estava
    // dentro da Central: o master não era recortado.
    expect(escopoDeEmpresa(true, 'emp-1')).toEqual({ empresaId: 'emp-1' })
  })

  it('deixa o master sem recorte só quando não há empresa carregada', () => {
    expect(escopoDeEmpresa(true, undefined)).toEqual({})
  })

  it('fecha para o não-master sem empresa', () => {
    expect(escopoDeEmpresa(false, undefined)).toEqual({ empresaId: '__none__' })
  })
})

describe('consolidar', () => {
  it('marca o ex-cliente e o joga para depois dos ativos', () => {
    const saida = consolidar([
      cliente({ id: 'a', razaoSocial: 'ZZ ATIVA', documento: '1' }),
      cliente({ id: 'b', razaoSocial: 'AA EX', documento: '2', status: 'INATIVO' }),
    ])
    expect(saida.map(c => [c.razaoSocial, c.inativo])).toEqual([
      ['ZZ ATIVA', false],
      ['AA EX', true],
    ])
  })

  it('prefere a cópia ativa quando o mesmo documento aparece duas vezes', () => {
    const saida = consolidar([
      cliente({ id: 'morta', documento: '38711960000132', status: 'INATIVO' }),
      cliente({ id: 'viva', documento: '38.711.960/0001-32' }),
    ])
    expect(saida.map(c => c.id)).toEqual(['viva'])
  })

  it('prefere a cópia com empresa entre duas do mesmo status', () => {
    const saida = consolidar([
      cliente({ id: 'orfa', documento: '1', empresaId: null }),
      cliente({ id: 'real', documento: '1' }),
    ])
    expect(saida.map(c => c.id)).toEqual(['real'])
  })

  it('nunca deduplica clientes sem documento', () => {
    const saida = consolidar([
      cliente({ id: 'x', razaoSocial: 'A' }),
      cliente({ id: 'y', razaoSocial: 'B' }),
    ])
    expect(saida).toHaveLength(2)
  })
})
