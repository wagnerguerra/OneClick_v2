const findMany = jest.fn()
jest.mock('@saas/db', () => ({ prisma: { empresa: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import {
  idsDeEmpresasInativas, esquecerEmpresasInativas, semEmpresaInativa, sqlSemEmpresaInativa,
} from './empresa-inativa'

const and = (w: object) => (w as { AND?: unknown[] }).AND

beforeEach(() => {
  jest.clearAllMocks()
  esquecerEmpresasInativas()
})

describe('semEmpresaInativa', () => {
  it('sem empresa inativa, o where sai idêntico — rotina se comporta como antes', () => {
    const where = { status: 'ATIVO' }
    expect(semEmpresaInativa(where, [])).toBe(where)
  })

  it('recorta fora as inativas e mantém quem não tem empresa', () => {
    expect(semEmpresaInativa({ status: 'ATIVO' }, ['emp-x'])).toEqual({
      status: 'ATIVO',
      AND: [{ OR: [{ empresaId: null }, { empresaId: { notIn: ['emp-x'] } }] }],
    })
  })

  it('não atropela um OR que o where já tinha', () => {
    const where = { OR: [{ a: 1 }, { b: 2 }] }
    const r = semEmpresaInativa(where, ['emp-x'])
    expect(r.OR).toEqual([{ a: 1 }, { b: 2 }])
    expect(and(r)).toHaveLength(1)
  })

  it('soma a um AND existente, em lista ou objeto', () => {
    expect(and(semEmpresaInativa({ AND: [{ a: 1 }] }, ['e']))).toHaveLength(2)
    expect(and(semEmpresaInativa({ AND: { a: 1 } }, ['e']))).toHaveLength(2)
  })

  it('aceita outro nome de campo', () => {
    const r = semEmpresaInativa({}, ['e'], 'tenantEmpresaId')
    expect(and(r)).toEqual([{ OR: [{ tenantEmpresaId: null }, { tenantEmpresaId: { notIn: ['e'] } }] }])
  })
})

describe('idsDeEmpresasInativas', () => {
  it('consulta uma vez e reaproveita dentro do cache', async () => {
    findMany.mockResolvedValue([{ id: 'emp-x' }])
    expect(await idsDeEmpresasInativas()).toEqual(['emp-x'])
    expect(await idsDeEmpresasInativas()).toEqual(['emp-x'])
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it('esquecer força a consulta seguinte — inativar reflete na próxima volta', async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'emp-x' }])
    expect(await idsDeEmpresasInativas()).toEqual([])
    esquecerEmpresasInativas()
    expect(await idsDeEmpresasInativas()).toEqual(['emp-x'])
  })
})

describe('sqlSemEmpresaInativa', () => {
  it('usa NOT EXISTS, que deixa passar a linha sem empresa', () => {
    expect(sqlSemEmpresaInativa('v.empresa_id')).toBe(
      'NOT EXISTS (SELECT 1 FROM empresas e_inativa WHERE e_inativa.id = v.empresa_id AND e_inativa.is_active = false)',
    )
  })
})
