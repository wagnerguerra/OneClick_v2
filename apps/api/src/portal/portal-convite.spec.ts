/**
 * Convite de primeiro acesso — o que decide se um link vale.
 *
 * O token é a única autenticação desta rota: quem abre o link ainda não tem
 * senha, logo não tem sessão. Toda a segurança está em ele ser imprevisível,
 * de uso único, com prazo, e em o banco guardar só o hash.
 */

/** Mock de método do prisma: recebe um objeto de argumentos e devolve algo. */
type Metodo = jest.Mock<Promise<unknown>, [Record<string, never> | any]>
const metodo = (): Metodo => jest.fn()

const convite = {
  findUnique: metodo(), create: metodo(), update: metodo(), updateMany: metodo(),
}
const account = { findFirst: metodo(), update: metodo(), create: metodo() }
const user = { update: metodo() }
const session = { deleteMany: metodo() }
const clienteUsuario = { findUnique: metodo() }

/** Primeiro argumento de uma chamada, já tipado — evita `possibly undefined`. */
function arg<T>(m: Metodo, i = 0): T {
  return m.mock.calls[i]![0] as T
}

const tx = { portalConvite: convite, account, user, session }

jest.mock('@saas/db', () => ({
  prisma: {
    portalConvite: convite,
    account,
    clienteUsuario,
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}))

jest.mock('better-auth/crypto', () => ({
  hashPassword: jest.fn(async (s: string) => `hash:${s}`),
}))

import { createHash } from 'node:crypto'
import { PortalConviteService } from './portal-convite.service'

const emailService = { sendMail: jest.fn(async () => true) }
const svc = new PortalConviteService(emailService as never)

const TOKEN = 'token-de-teste-com-tamanho-suficiente'
const hashDe = (t: string) => createHash('sha256').update(t).digest('hex')

/** Convite saudável como o prisma devolveria. */
function conviteOk(over: Record<string, unknown> = {}) {
  return {
    id: 'cv-1',
    expiraEm: new Date(Date.now() + 86_400_000),
    usadoEm: null,
    clienteUsuario: {
      id: 'vin-1',
      ativo: true,
      user: { id: 'u1', name: 'Marina', email: 'marina@cliente.com.br', emailVerified: false },
      cliente: { razaoSocial: 'CENTRAL CONTABIL LTDA', status: 'ATIVO' },
    },
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  account.findFirst.mockResolvedValue({ id: 'acc-1' })
})

describe('enviar', () => {
  beforeEach(() => {
    clienteUsuario.findUnique.mockResolvedValue({
      id: 'vin-1', ativo: true,
      user: { id: 'u1', name: 'Marina', email: 'marina@cliente.com.br' },
      cliente: { razaoSocial: 'CENTRAL CONTABIL LTDA' },
    })
  })

  it('guarda só o hash do token — nunca o token', async () => {
    await svc.enviar('vin-1', { userId: 'interno' })
    const { data } = arg<{ data: Record<string, string> }>(convite.create)
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    // O token em claro não é gravado em campo nenhum.
    expect(Object.keys(data)).not.toContain('token')
  })

  it('manda o link por e-mail, com o token que NÃO está no banco', async () => {
    await svc.enviar('vin-1', { userId: 'interno' })
    const email = arg<{ to: string; html: string }>(emailService.sendMail as unknown as Metodo)
    expect(email.to).toBe('marina@cliente.com.br')

    const link = /\/convite\/([A-Za-z0-9_-]+)/.exec(email.html)
    expect(link).not.toBeNull()
    const { data } = arg<{ data: Record<string, string> }>(convite.create)
    // O hash gravado é o do token enviado — e o token não aparece no banco.
    expect(hashDe(link![1]!)).toBe(data.tokenHash)
  })

  it('queima os convites anteriores ao reenviar', async () => {
    // Reenviar por suspeita de vazamento tem de invalidar o link vazado.
    await svc.enviar('vin-1', { userId: 'interno' })
    expect(convite.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clienteUsuarioId: 'vin-1', usadoEm: null } }),
    )
  })

  it('não envia para acesso desativado', async () => {
    clienteUsuario.findUnique.mockResolvedValue({
      id: 'vin-1', ativo: false,
      user: { id: 'u1', name: 'M', email: 'm@x.com' },
      cliente: { razaoSocial: 'X' },
    })
    await expect(svc.enviar('vin-1', {})).rejects.toThrow(/desativado/i)
    expect(emailService.sendMail).not.toHaveBeenCalled()
  })

  it('falha de e-mail não desfaz o convite', async () => {
    // O cadastro já está certo; um provedor fora do ar não pode apagá-lo.
    emailService.sendMail.mockResolvedValueOnce(false as never)
    const r = await svc.enviar('vin-1', {})
    expect(r.enviado).toBe(false)
    expect(convite.create).toHaveBeenCalled()
  })
})

describe('validar', () => {
  it('busca pelo HASH do token recebido', async () => {
    convite.findUnique.mockResolvedValue(conviteOk())
    await svc.validar(TOKEN)
    expect(arg<{ where: unknown }>(convite.findUnique).where).toEqual({ tokenHash: hashDe(TOKEN) })
  })

  it('devolve o mínimo para a pessoa se reconhecer', async () => {
    convite.findUnique.mockResolvedValue(conviteOk())
    const v = await svc.validar(TOKEN)
    expect(v).toEqual({
      nome: 'Marina',
      email: 'marina@cliente.com.br',
      cliente: 'CENTRAL CONTABIL LTDA',
      primeiroAcesso: true,
    })
  })

  it('recusa convite já usado, expirado, de acesso desativado e de cliente inativo', async () => {
    // A MESMA mensagem nos quatro: distinguir confirmaria a um curioso que
    // determinado token existiu.
    const casos = [
      conviteOk({ usadoEm: new Date() }),
      conviteOk({ expiraEm: new Date(Date.now() - 1000) }),
      conviteOk({ clienteUsuario: { ...conviteOk().clienteUsuario, ativo: false } }),
      conviteOk({
        clienteUsuario: {
          ...conviteOk().clienteUsuario,
          cliente: { razaoSocial: 'X', status: 'INATIVO' },
        },
      }),
      null,
    ]
    for (const caso of casos) {
      convite.findUnique.mockResolvedValue(caso)
      await expect(svc.validar(TOKEN)).rejects.toThrow(/não é mais válido/i)
    }
  })
})

describe('definirSenha', () => {
  beforeEach(() => convite.findUnique.mockResolvedValue(conviteOk()))

  it('recusa senha curta antes de tocar no banco', async () => {
    await expect(svc.definirSenha(TOKEN, 'curta')).rejects.toThrow(/8 caracteres/)
    expect(convite.findUnique).not.toHaveBeenCalled()
  })

  it('grava a senha com hash, nunca em claro', async () => {
    await svc.definirSenha(TOKEN, 'senhaSegura123')
    const { data } = arg<{ data: { password: string } }>(account.update)
    expect(data.password).toBe('hash:senhaSegura123')
    expect(data.password).not.toBe('senhaSegura123')
  })

  it('queima o convite — uso único', async () => {
    await svc.definirSenha(TOKEN, 'senhaSegura123')
    expect(convite.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cv-1' }, data: { usadoEm: expect.any(Date) } }),
    )
  })

  it('marca o e-mail como verificado', async () => {
    // Chegar aqui prova que a pessoa recebeu o e-mail.
    await svc.definirSenha(TOKEN, 'senhaSegura123')
    expect(user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: true } })
  })

  it('derruba as sessões antigas', async () => {
    // Se o convite foi reenviado por suspeita de acesso indevido, manter a
    // sessão anterior viva anularia o motivo do reenvio.
    await svc.definirSenha(TOKEN, 'senhaSegura123')
    expect(session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('cria a conta de credencial quando não existe', async () => {
    account.findFirst.mockResolvedValue(null)
    await svc.definirSenha(TOKEN, 'senhaSegura123')
    expect(account.create).toHaveBeenCalled()
    expect(account.update).not.toHaveBeenCalled()
  })
})
