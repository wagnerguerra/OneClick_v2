/**
 * Classificação das falhas do Google Drive.
 *
 * O caso que motivou: em 25/09/2026 o refresh token morreu (`invalid_grant`) e
 * o sistema dizia "não foi possível falar com o Google Drive agora" — uma
 * frase de falha passageira para um problema que só um administrador resolve.
 */

import {
  classificarFalhaDrive,
  falhaDriveExigeAdministrador,
  mensagemDaFalhaDrive,
  MENSAGENS_DRIVE,
} from './drive-erro'

/** O formato que o gaxios usa quando o endpoint do OAuth recusa o token. */
function erroGaxios(codigo: string, descricao = '') {
  const e = new Error(codigo) as Error & { response: { data: { error: string; error_description: string } } }
  e.response = { data: { error: codigo, error_description: descricao } }
  return e
}

describe('classificarFalhaDrive', () => {
  it('o erro exato de produção é de autorização', () => {
    // O que o log mostrava: "Error: invalid_grant", com a descrição no corpo.
    expect(classificarFalhaDrive(erroGaxios('invalid_grant', 'Token has been expired or revoked.'))).toBe('autorizacao')
  })

  it('reconhece o código mesmo sem o corpo da resposta', () => {
    // Na renovação do token, o googleapis às vezes lança só o Error com o código.
    expect(classificarFalhaDrive(new Error('invalid_grant'))).toBe('autorizacao')
  })

  it('reconhece pela descrição do Google', () => {
    expect(classificarFalhaDrive(new Error('Token has been expired or revoked.'))).toBe('autorizacao')
  })

  it('cliente OAuth inválido também é autorização', () => {
    expect(classificarFalhaDrive(erroGaxios('invalid_client'))).toBe('autorizacao')
    expect(classificarFalhaDrive(erroGaxios('unauthorized_client'))).toBe('autorizacao')
  })

  it('credencial ausente é configuração', () => {
    expect(classificarFalhaDrive(new Error('Credenciais Google não configuradas. Defina uma das opções: ...'))).toBe('configuracao')
    expect(classificarFalhaDrive(new Error('Service Account: JSON inválido — Unexpected end of JSON input'))).toBe('configuracao')
    expect(classificarFalhaDrive(new Error('OAuth: falha ao ler /opt/google/credentials.json: ENOENT'))).toBe('configuracao')
  })

  it('rede e limite de requisições são passageiros', () => {
    expect(classificarFalhaDrive(new Error('getaddrinfo ENOTFOUND www.googleapis.com'))).toBe('transitorio')
    expect(classificarFalhaDrive(erroGaxios('rateLimitExceeded'))).toBe('transitorio')
    expect(classificarFalhaDrive(new Error('socket hang up'))).toBe('transitorio')
  })

  it('não quebra com o que não é Error', () => {
    expect(classificarFalhaDrive(undefined)).toBe('transitorio')
    expect(classificarFalhaDrive('invalid_grant')).toBe('autorizacao')
    expect(classificarFalhaDrive({ qualquer: 1 })).toBe('transitorio')
  })
})

describe('mensagemDaFalhaDrive', () => {
  const expirado = erroGaxios('invalid_grant', 'Token has been expired or revoked.')

  it('o escritório ouve o nome do problema — é ele quem tem de agir', () => {
    const m = mensagemDaFalhaDrive(expirado, 'escritorio')
    expect(m).toMatch(/expirou/)
    expect(m).toMatch(/administrador/)
  })

  it('o cliente NÃO ouve falar de credencial nem de Google', () => {
    const m = mensagemDaFalhaDrive(expirado, 'portal')
    expect(m).not.toMatch(/Google|credencial|token|administrador/i)
    expect(m).toMatch(/escritório contábil/)
  })

  it('nenhuma mensagem de falha que exige administrador diz "agora"', () => {
    // O "agora" foi o que fez a falha parecer passageira por dias.
    for (const publico of ['escritorio', 'portal'] as const) {
      expect(MENSAGENS_DRIVE[publico].autorizacao).not.toMatch(/\bagora\b/)
      expect(MENSAGENS_DRIVE[publico].configuracao).not.toMatch(/\bagora\b/)
    }
  })

  it('a falha passageira continua pedindo para tentar de novo', () => {
    expect(mensagemDaFalhaDrive(new Error('socket hang up'), 'escritorio')).toMatch(/Tente de novo/)
  })
})

describe('falhaDriveExigeAdministrador — decide o nível do log', () => {
  it('autorização e configuração vão como erro', () => {
    expect(falhaDriveExigeAdministrador(new Error('invalid_grant'))).toBe(true)
    expect(falhaDriveExigeAdministrador(new Error('Credenciais Google não configuradas'))).toBe(true)
  })

  it('falha de rede fica como aviso', () => {
    expect(falhaDriveExigeAdministrador(new Error('ETIMEDOUT'))).toBe(false)
  })
})
