import { decidirSubstituicao, type CertVigente } from './substituicao-certificado'

const d = (s: string) => new Date(s)
const vig = (id: string, expira: string, hash = `h-${id}`): CertVigente => ({
  id, titular: 'CENTRAL CONTABIL LTDA', expiraEm: d(expira), arquivoHash: hash, clienteId: 'c1', socioId: null,
})

describe('decidirSubstituicao (#HLP0386)', () => {
  it('documento sem certificado vigente: cadastro normal', () => {
    expect(decidirSubstituicao({ expiraEm: d('2027-05-06'), arquivoHash: 'x' }, [])).toEqual({ acao: 'NOVO' })
  })

  it('certificado que vence depois substitui o vigente', () => {
    const r = decidirSubstituicao({ expiraEm: d('2027-05-06'), arquivoHash: 'novo' }, [vig('a', '2026-05-14')])
    expect(r.acao).toBe('SUBSTITUIR')
    if (r.acao === 'SUBSTITUIR') expect(r.atual.id).toBe('a')
  })

  it('o mesmo arquivo não é cadastrado de novo', () => {
    const r = decidirSubstituicao({ expiraEm: d('2026-05-14'), arquivoHash: 'h-a' }, [vig('a', '2026-05-14')])
    expect(r.acao).toBe('DUPLICADO')
  })

  it('arquivo que vence ANTES do vigente pede confirmação', () => {
    const r = decidirSubstituicao({ expiraEm: d('2026-01-01'), arquivoHash: 'velho' }, [vig('a', '2027-05-06')])
    expect(r.acao).toBe('CONFIRMAR')
  })

  it('confirmado, o mais antigo substitui mesmo assim', () => {
    const r = decidirSubstituicao({ expiraEm: d('2026-01-01'), arquivoHash: 'velho' }, [vig('a', '2027-05-06')], true)
    expect(r.acao).toBe('SUBSTITUIR')
  })

  it('com dois vigentes (duplicados antigos), mede contra o mais longo e substitui os dois', () => {
    const r = decidirSubstituicao(
      { expiraEm: d('2028-01-01'), arquivoHash: 'novo' },
      [vig('a', '2026-10-06'), vig('b', '2027-09-25')],
    )
    expect(r.acao).toBe('SUBSTITUIR')
    if (r.acao === 'SUBSTITUIR') {
      expect(r.atual.id).toBe('b')
      expect(r.substituidos.map(s => s.id).sort()).toEqual(['a', 'b'])
    }
  })

  it('entre os dois vigentes, pede confirmação se vencer antes do mais longo', () => {
    const r = decidirSubstituicao(
      { expiraEm: d('2027-01-01'), arquivoHash: 'novo' },
      [vig('a', '2026-10-06'), vig('b', '2027-09-25')],
    )
    expect(r.acao).toBe('CONFIRMAR')
  })
})
