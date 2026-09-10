import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'

// A guarda importa `AuthService` como VALOR (é o token do `@Inject`), e esse
// módulo puxa `better-auth`, que é ESM e o jest não transforma. O dublê troca
// só o token — a guarda recebe o serviço pelo construtor de qualquer jeito.
jest.mock('../auth/auth.service', () => ({ AuthService: class AuthServiceDuble {} }))

import { UsuarioExternoGuard } from './usuario-externo.guard'

/**
 * A guarda que fecha a superfície REST para o usuário externo.
 *
 * Nasceu de um vazamento real: `GET /api/admin/online-users` devolvia o
 * diretório da equipe interna ao usuário do portal, porque escopa por
 * `empresaId` e o externo herda o `empresaId` do escritório. O gate que existia
 * cobria só o tRPC, e o sistema tem 40+ controllers REST.
 */

const getSession = jest.fn()
const authService = { auth: { api: { getSession } } } as never

function contexto(url: string, comCookie = true): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        originalUrl: url,
        url,
        headers: comCookie ? { cookie: 'better-auth.session_token=abc' } : {},
      }),
    }),
  } as unknown as ExecutionContext
}

const guard = new UsuarioExternoGuard(authService)

const externo = { user: { id: 'u1', role: 'COLABORADOR_CLIENTE' } }
const interno = { user: { id: 'u2', role: 'COLABORADOR_INTERNO' } }

beforeEach(() => jest.clearAllMocks())

describe('rota interna', () => {
  it('barra o usuário do portal', async () => {
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/admin/online-users')))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('barra também no stream de presença', async () => {
    // O SSE é outra rota do mesmo controller: fosse o gate por endpoint,
    // corrigir a lista deixaria o stream vazando.
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/admin/online-users/events')))
      .rejects.toBeInstanceOf(ForbiddenException)
  })

  it('deixa passar o colaborador interno', async () => {
    getSession.mockResolvedValue(interno)
    await expect(guard.canActivate(contexto('/api/admin/online-users'))).resolves.toBe(true)
  })

  it('ignora a query string ao comparar o caminho', async () => {
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/danfe/lista?empresaId=x')))
      .rejects.toBeInstanceOf(ForbiddenException)
  })
})

describe('rotas que o externo precisa', () => {
  it('libera autenticação — ele precisa entrar e trocar a senha', async () => {
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/auth/sign-in/email'))).resolves.toBe(true)
  })

  it('libera o namespace do portal', async () => {
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/portal/qualquer-coisa'))).resolves.toBe(true)
  })

  it('libera o tRPC, que é gateado por dentro', async () => {
    // Uma rota só atende procedure interna e de portal. Bloquear aqui mataria
    // o portal junto; lá dentro, `assertUsuarioInterno` faz a separação.
    getSession.mockResolvedValue(externo)
    await expect(guard.canActivate(contexto('/api/trpc/portal.convite.validar'))).resolves.toBe(true)
    expect(getSession).not.toHaveBeenCalled()
  })
})

describe('requisição sem sessão', () => {
  it('passa sem resolver sessão quando não há cookie', async () => {
    // Evita uma consulta por requisição em tudo que é público.
    await expect(guard.canActivate(contexto('/api/health', false))).resolves.toBe(true)
    expect(getSession).not.toHaveBeenCalled()
  })

  it('sessão ilegível não vira bloqueio', async () => {
    // Autenticar é problema da rota; aqui só interessa negar quem é
    // comprovadamente externo.
    getSession.mockRejectedValue(new Error('cookie inválido'))
    await expect(guard.canActivate(contexto('/api/danfe/lista'))).resolves.toBe(true)
  })

  it('sessão anônima passa — rota pública continua pública', async () => {
    getSession.mockResolvedValue(null)
    await expect(guard.canActivate(contexto('/api/contratos/assinar'))).resolves.toBe(true)
  })
})
