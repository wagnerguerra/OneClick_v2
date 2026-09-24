const findMany = jest.fn()
jest.mock('@saas/db', () => ({ prisma: { clienteAreaContratada: { findMany: (...a: unknown[]) => findMany(...a) } } }))

import { listarEquipe } from './portal-equipe'
import type { VinculoPortal } from './portal-escopo'

/**
 * "Sua equipe" no portal. O que estes testes prendem é o recorte: quem está do
 * lado de fora vê só os contatos das áreas dele, só de gente ativa, e só nome,
 * e-mail e foto.
 */

const vinculo = (areas: string[]): VinculoPortal => ({
  clienteId: 'cli-1', nivel: 'OPERACIONAL', areas,
  podeVer: true, podeEditar: false, podeExcluir: false, podeVerBi: false, modulos: [],
} as unknown as VinculoPortal)

const ana = { name: 'Ana Fiscal', email: 'ana@escritorio.com', image: null, isActive: true }

beforeEach(() => jest.clearAllMocks())

describe('listarEquipe', () => {
  it('vínculo sem área não vê equipe nenhuma — nem consulta', async () => {
    expect(await listarEquipe(vinculo([]))).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('recorta pelo cliente do vínculo e pelas áreas dele, só contratadas e em vigor', async () => {
    findMany.mockResolvedValue([])
    await listarEquipe(vinculo(['area-fiscal']))
    expect(findMany.mock.calls[0][0].where).toEqual({
      clienteId: 'cli-1',
      areaId: { in: ['area-fiscal'] },
      contratado: true,
      dataEncerramento: null,
    })
  })

  it('não pede ao banco nada além de nome, e-mail, foto e se está ativo', async () => {
    findMany.mockResolvedValue([])
    await listarEquipe(vinculo(['area-fiscal']))
    const campos = findMany.mock.calls[0][0].select.responsavel.select
    expect(Object.keys(campos).sort()).toEqual(['email', 'image', 'isActive', 'name'])
  })

  it('devolve o contato no formato do portal', async () => {
    findMany.mockResolvedValue([
      { areaId: 'area-fiscal', area: { name: 'Fiscal' }, responsavel: ana, substituto: null },
    ])
    expect(await listarEquipe(vinculo(['area-fiscal']))).toEqual([
      {
        areaId: 'area-fiscal', area: 'Fiscal',
        responsavel: { nome: 'Ana Fiscal', email: 'ana@escritorio.com', imagem: null },
        substituto: null,
      },
    ])
  })

  it('quem saiu do escritório não aparece como contato', async () => {
    findMany.mockResolvedValue([
      {
        areaId: 'area-fiscal', area: { name: 'Fiscal' },
        responsavel: { ...ana, isActive: false },
        substituto: { name: 'Beto', email: 'beto@escritorio.com', image: null, isActive: true },
      },
    ])
    const [linha] = await listarEquipe(vinculo(['area-fiscal']))
    expect(linha!.responsavel).toBeNull()
    expect(linha!.substituto?.nome).toBe('Beto')
  })
})
