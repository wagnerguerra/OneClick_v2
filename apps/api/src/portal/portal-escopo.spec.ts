/**
 * Portal do Cliente — o isolamento entre clientes.
 *
 * Este é o teste mais importante do portal. Todo o resto do sistema isola por
 * empresa e tenant; aqui o isolamento é por CLIENTE, e quem chama é gente de
 * fora. Uma falha nestas regras não é bug de listagem — é um cliente lendo os
 * dados do outro.
 */

const findUnique = jest.fn()
const findMany = jest.fn()
const count = jest.fn()

jest.mock('@saas/db', () => ({
  prisma: {
    clienteUsuario: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}))

import {
  atendeNivel, intersecaoAreas, podeNaArea,
  resolverVinculo, listarVinculos, ehUsuarioDePortal,
  type VinculoPortal,
} from './portal-escopo'

const vinculo = (over: Partial<VinculoPortal> = {}): VinculoPortal => ({
  clienteId: 'cli-1', nivel: 'OPERACIONAL', areas: ['fiscal'], ...over,
})

/** Resposta do prisma para um vínculo saudável. */
function linhaOk(over: Record<string, unknown> = {}) {
  return {
    clienteId: 'cli-1',
    nivel: 'OPERACIONAL',
    areas: ['fiscal', 'pessoal'],
    ativo: true,
    cliente: {
      status: 'ATIVO',
      servicosContratados: [{ areaId: 'fiscal' }, { areaId: 'contabil' }],
    },
    ...over,
  }
}

describe('atendeNivel', () => {
  it('administrador atende qualquer exigência', () => {
    const admin = vinculo({ nivel: 'ADMINISTRADOR' })
    expect(atendeNivel(admin, 'CONSULTA')).toBe(true)
    expect(atendeNivel(admin, 'OPERACIONAL')).toBe(true)
    expect(atendeNivel(admin, 'ADMINISTRADOR')).toBe(true)
  })

  it('consulta não opera', () => {
    const leitor = vinculo({ nivel: 'CONSULTA' })
    expect(atendeNivel(leitor, 'CONSULTA')).toBe(true)
    expect(atendeNivel(leitor, 'OPERACIONAL')).toBe(false)
    expect(atendeNivel(leitor, 'ADMINISTRADOR')).toBe(false)
  })

  it('operacional não chega a administrador', () => {
    // É o que separa quem envia documento de quem vê honorário.
    expect(atendeNivel(vinculo(), 'ADMINISTRADOR')).toBe(false)
    expect(atendeNivel(vinculo(), 'OPERACIONAL')).toBe(true)
  })
})

describe('intersecaoAreas', () => {
  it('mantém só o que o cliente contrata', () => {
    expect(intersecaoAreas(['fiscal', 'pessoal'], ['fiscal', 'contabil'])).toEqual(['fiscal'])
  })

  it('área concedida e não contratada não abre nada', () => {
    // O cenário real: o cliente encerra a folha, e o usuário que estava
    // habilitado nela continuaria vendo folha se a interseção não existisse.
    expect(intersecaoAreas(['pessoal'], ['fiscal'])).toEqual([])
  })

  it('cliente sem área contratada não expõe nada, nem para quem tem tudo', () => {
    expect(intersecaoAreas(['fiscal', 'contabil', 'pessoal'], [])).toEqual([])
  })
})

describe('resolverVinculo — quem pode ver o quê', () => {
  it('devolve o vínculo com as áreas já interseccionadas', async () => {
    findUnique.mockResolvedValue(linhaOk())
    const v = await resolverVinculo('u1', 'cli-1')
    expect(v).not.toBeNull()
    // 'pessoal' foi concedida mas o cliente não contrata: sai.
    expect(v!.areas).toEqual(['fiscal'])
    expect(v!.nivel).toBe('OPERACIONAL')
  })

  it('consulta SEMPRE pelo par usuário+cliente', async () => {
    // A blindagem estrutural: se um dia alguém trocar isto por uma busca só
    // por cliente, o vazamento é imediato e silencioso.
    findUnique.mockResolvedValue(linhaOk())
    await resolverVinculo('u1', 'cli-1')
    const arg = findUnique.mock.calls[0]![0] as { where: { userId_clienteId: unknown } }
    expect(arg.where.userId_clienteId).toEqual({ userId: 'u1', clienteId: 'cli-1' })
  })

  it('sem vínculo, não vê', async () => {
    findUnique.mockResolvedValue(null)
    expect(await resolverVinculo('u1', 'cli-de-outro')).toBeNull()
  })

  it('vínculo desativado não vê', async () => {
    findUnique.mockResolvedValue(linhaOk({ ativo: false }))
    expect(await resolverVinculo('u1', 'cli-1')).toBeNull()
  })

  it('cliente inativado no escritório perde o portal junto', async () => {
    findUnique.mockResolvedValue(linhaOk({ cliente: { status: 'INATIVO', servicosContratados: [] } }))
    expect(await resolverVinculo('u1', 'cli-1')).toBeNull()
  })

  it('administrador também é limitado ao que o cliente contrata', async () => {
    // "Vê tudo do portal" continua sendo tudo DAQUELE cliente.
    findUnique.mockResolvedValue(linhaOk({
      nivel: 'ADMINISTRADOR',
      areas: ['fiscal', 'pessoal', 'contabil'],
      cliente: { status: 'ATIVO', servicosContratados: [{ areaId: 'fiscal' }] },
    }))
    const v = await resolverVinculo('u1', 'cli-1')
    expect(v!.nivel).toBe('ADMINISTRADOR')
    expect(v!.areas).toEqual(['fiscal'])
  })
})

describe('podeNaArea', () => {
  it('libera só a área efetiva', () => {
    const v = vinculo({ areas: ['fiscal'] })
    expect(podeNaArea(v, 'fiscal')).toBe(true)
    expect(podeNaArea(v, 'pessoal')).toBe(false)
  })
})

describe('listarVinculos — o caso do grupo econômico', () => {
  it('devolve as empresas do grupo com as áreas de cada uma', async () => {
    // A razão de o vínculo ser tabela e não campo: um login, várias empresas.
    findMany.mockResolvedValue([
      {
        clienteId: 'matriz', nivel: 'ADMINISTRADOR', areas: ['fiscal', 'pessoal'],
        cliente: { razaoSocial: 'GRUPO X MATRIZ', servicosContratados: [{ areaId: 'fiscal' }, { areaId: 'pessoal' }] },
      },
      {
        clienteId: 'filial', nivel: 'ADMINISTRADOR', areas: ['fiscal', 'pessoal'],
        cliente: { razaoSocial: 'GRUPO X FILIAL', servicosContratados: [{ areaId: 'fiscal' }] },
      },
    ])
    const lista = await listarVinculos('u1')
    expect(lista.map(l => l.clienteId)).toEqual(['matriz', 'filial'])
    // Mesma pessoa, permissões diferentes por empresa — porque o contrato difere.
    expect(lista[0]!.areas).toEqual(['fiscal', 'pessoal'])
    expect(lista[1]!.areas).toEqual(['fiscal'])
  })

  it('só traz vínculo ativo de cliente ativo', async () => {
    findMany.mockResolvedValue([])
    await listarVinculos('u1')
    const arg = findMany.mock.calls[0]![0] as { where: Record<string, unknown> }
    expect(arg.where).toMatchObject({ userId: 'u1', ativo: true, cliente: { status: 'ATIVO' } })
  })
})

describe('ehUsuarioDePortal', () => {
  it('é externo quando tem ao menos um vínculo ativo', async () => {
    count.mockResolvedValue(1)
    expect(await ehUsuarioDePortal('u1')).toBe(true)
  })

  it('interno do escritório não tem vínculo', async () => {
    count.mockResolvedValue(0)
    expect(await ehUsuarioDePortal('interno')).toBe(false)
  })
})
