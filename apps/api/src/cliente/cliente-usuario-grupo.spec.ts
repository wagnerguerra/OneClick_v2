/**
 * Quais empresas do grupo um usuário do portal alcança.
 *
 * A trava que estes testes existem para prender: a lista de empresas chega
 * pelo CLIENTE HTTP e não vale nada por si. Sem refazer a consulta do grupo no
 * servidor, bastaria mandar um `clienteId` qualquer no payload para conceder a
 * alguém acesso ao portal de um cliente que não é do grupo dele.
 */

const clienteUsuario = {
  findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), count: jest.fn(),
}
const cliente = { findUnique: jest.fn(), findMany: jest.fn() }
const clienteAreaContratada = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { clienteUsuario, cliente, clienteAreaContratada },
}))

// `better-auth/crypto` e ESM e o jest nao o parseia. Nada aqui cria senha —
// so o cadastro de usuario novo usa o hash, e este spec nao passa por ele.
jest.mock('better-auth/crypto', () => ({ hashPassword: jest.fn() }))

import { ClienteUsuarioService } from './cliente-usuario.service'
import type { PortalConviteService } from '../portal/portal-convite.service'

const svc = new ClienteUsuarioService({} as unknown as PortalConviteService)

/** O vínculo que está sendo editado — a matriz. */
const BASE = {
  userId: 'u-1',
  clienteId: 'cli-matriz',
  nivel: 'OPERACIONAL',
  areas: ['area-fiscal'],
  podeVer: true,
  podeEditar: true,
  podeExcluir: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  clienteUsuario.findUnique.mockResolvedValue(BASE)
  // O cliente base pertence ao grupo "GRUPO ACME", na empresa emp-1.
  cliente.findUnique.mockResolvedValue({ id: 'cli-matriz', grupo: 'GRUPO ACME', empresaId: 'emp-1' })
  cliente.findMany.mockResolvedValue([
    { id: 'cli-filial-a', razaoSocial: 'ACME FILIAL A', documento: '1' },
    { id: 'cli-filial-b', razaoSocial: 'ACME FILIAL B', documento: '2' },
  ])
  clienteUsuario.findMany.mockResolvedValue([])
  clienteAreaContratada.findMany.mockResolvedValue([{ areaId: 'area-fiscal' }])
  clienteUsuario.create.mockResolvedValue({ id: 'novo' })
  clienteUsuario.update.mockResolvedValue({ id: 'x' })
  clienteUsuario.count.mockResolvedValue(1)
})

describe('a trava do grupo', () => {
  it('IGNORA empresa que não é do grupo, mesmo vindo no payload', async () => {
    const r = await svc.sincronizarGrupo(
      { id: 'v-1', clientes: ['cli-filial-a', 'cli-DE-OUTRO-GRUPO'] },
      'autor',
    )

    expect(r.liberados).toBe(1)
    const criados = clienteUsuario.create.mock.calls.map(c => c[0].data.clienteId)
    expect(criados).toEqual(['cli-filial-a'])
    expect(criados).not.toContain('cli-DE-OUTRO-GRUPO')
  })

  it('o grupo é procurado dentro da MESMA empresa', async () => {
    // Grupo é texto livre: dois escritórios podem ter "GRUPO SILVA" sem serem
    // o mesmo. Sem o recorte, um deles concederia acesso ao cliente do outro.
    await svc.sincronizarGrupo({ id: 'v-1', clientes: [] }, 'autor')
    expect(cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ empresaId: 'emp-1' }) }),
    )
  })

  it('cliente sem grupo não libera nada', async () => {
    cliente.findUnique.mockResolvedValue({ id: 'cli-matriz', grupo: null, empresaId: 'emp-1' })
    const r = await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-filial-a'] }, 'autor')
    expect(r.liberados).toBe(0)
    expect(clienteUsuario.create).not.toHaveBeenCalled()
  })
})

describe('sincronizar', () => {
  it('cria o vínculo herdando o acesso da matriz', async () => {
    await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-filial-a'] }, 'autor')
    expect(clienteUsuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u-1',
          clienteId: 'cli-filial-a',
          nivel: 'OPERACIONAL',
          podeVer: true,
          podeEditar: true,
          podeExcluir: false,
          criadoPorId: 'autor',
        }),
      }),
    )
  })

  it('revalida as áreas contra a empresa de DESTINO', async () => {
    // Cada empresa contrata as suas: herdar "Fiscal" para quem não contratou
    // fiscal daria uma área que não existe naquele cliente.
    clienteAreaContratada.findMany.mockResolvedValue([])
    await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-filial-a'] }, 'autor')
    expect(clienteUsuario.create.mock.calls[0]![0].data.areas).toEqual([])
  })

  it('religa o vínculo desativado em vez de criar outro', async () => {
    clienteUsuario.findMany.mockResolvedValue([
      { id: 'v-a', clienteId: 'cli-filial-a', ativo: false, nivel: 'OPERACIONAL' },
    ])
    const r = await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-filial-a'] }, 'autor')
    expect(clienteUsuario.create).not.toHaveBeenCalled()
    expect(clienteUsuario.update).toHaveBeenCalledWith({ where: { id: 'v-a' }, data: { ativo: true } })
    expect(r.liberados).toBe(1)
  })

  it('desmarcar DESATIVA, não apaga', async () => {
    // "Desativar corta o acesso e preserva o histórico" — a mesma distinção que
    // o diálogo já faz. Quem saiu do grupo hoje pode voltar.
    clienteUsuario.findMany.mockResolvedValue([
      { id: 'v-a', clienteId: 'cli-filial-a', ativo: true, nivel: 'OPERACIONAL' },
    ])
    const r = await svc.sincronizarGrupo({ id: 'v-1', clientes: [] }, 'autor')
    expect(clienteUsuario.update).toHaveBeenCalledWith({ where: { id: 'v-a' }, data: { ativo: false } })
    expect(r.revogados).toBe(1)
  })

  it('não mexe no que já está como deveria', async () => {
    clienteUsuario.findMany.mockResolvedValue([
      { id: 'v-a', clienteId: 'cli-filial-a', ativo: true, nivel: 'OPERACIONAL' },
    ])
    const r = await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-filial-a'] }, 'autor')
    expect(clienteUsuario.create).not.toHaveBeenCalled()
    expect(clienteUsuario.update).not.toHaveBeenCalled()
    expect(r).toEqual({ liberados: 0, revogados: 0, recusados: [] })
  })

  it('nunca toca no vínculo do cliente BASE', async () => {
    // Ele é o resto do formulário. Desmarcá-lo aqui seria a pessoa se excluir
    // da tela em que está.
    await svc.sincronizarGrupo({ id: 'v-1', clientes: ['cli-matriz'] }, 'autor')
    const tocados = [
      ...clienteUsuario.create.mock.calls.map(c => c[0].data.clienteId),
      ...clienteUsuario.update.mock.calls.map(() => 'update'),
    ]
    expect(tocados).not.toContain('cli-matriz')
  })
})

describe('quando uma empresa recusa', () => {
  it('não derruba as outras, e nomeia a que ficou para trás', async () => {
    // Abortar tudo deixaria um estado que ninguém deduz olhando a lista.
    clienteUsuario.findMany.mockResolvedValue([
      { id: 'v-a', clienteId: 'cli-filial-a', ativo: true, nivel: 'ADMINISTRADOR' },
      { id: 'v-b', clienteId: 'cli-filial-b', ativo: true, nivel: 'OPERACIONAL' },
    ])
    // A filial A ficaria sem nenhum administrador.
    clienteUsuario.count.mockResolvedValue(0)

    const r = await svc.sincronizarGrupo({ id: 'v-1', clientes: [] }, 'autor')

    expect(r.revogados).toBe(1)
    expect(r.recusados).toEqual(['ACME FILIAL A'])
    expect(clienteUsuario.update).toHaveBeenCalledWith({ where: { id: 'v-b' }, data: { ativo: false } })
  })
})

describe('grupoDoVinculo', () => {
  it('marca as empresas que a pessoa já alcança', async () => {
    clienteUsuario.findMany.mockResolvedValue([{ clienteId: 'cli-filial-b' }])
    const r = await svc.grupoDoVinculo('v-1')
    expect(r.grupo).toBe('GRUPO ACME')
    expect(r.empresas).toEqual([
      expect.objectContaining({ id: 'cli-filial-a', liberado: false }),
      expect.objectContaining({ id: 'cli-filial-b', liberado: true }),
    ])
  })

  it('cliente sem grupo devolve lista vazia, não erro', async () => {
    cliente.findUnique.mockResolvedValue({ id: 'cli-matriz', grupo: '', empresaId: 'emp-1' })
    await expect(svc.grupoDoVinculo('v-1')).resolves.toEqual({
      grupo: null, motivo: null, empresas: [],
    })
  })

  it('vínculo inexistente é erro claro', async () => {
    clienteUsuario.findUnique.mockResolvedValue(null)
    await expect(svc.grupoDoVinculo('nao-existe')).rejects.toThrow(/não encontrado/i)
  })
})
