const areaFindFirst = jest.fn()
const userFindUnique = jest.fn()
const clienteFindUnique = jest.fn()
jest.mock('@saas/db', () => ({
  prisma: {
    clienteAreaContratada: { findFirst: (...a: unknown[]) => areaFindFirst(...a) },
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
  },
}))
jest.mock('../common/email.service', () => ({ EmailService: class {} }))

import { PortalContatoService, escaparHtml } from './portal-contato.service'
import type { EmailService } from '../common/email.service'
import type { VinculoPortal } from './portal-escopo'

/**
 * "Escrever para a equipe". O que estes testes prendem: o endereço de destino
 * sai do cadastro e nunca da tela; o texto do cliente não vira HTML; e a
 * resposta do contador volta para quem escreveu.
 */

const sendMail = jest.fn()
const novoServico = () => new PortalContatoService({ sendMail } as unknown as EmailService)

const vinculo = { clienteId: 'cli-1', areas: ['area-fiscal'] } as unknown as VinculoPortal
const entrada = { areaId: 'area-fiscal', assunto: 'Dúvida sobre a guia', mensagem: 'Olá, a guia de setembro veio com valor diferente.' }

const ana = { name: 'Ana Fiscal', email: 'ana@escritorio.com', isActive: true }
const beto = { name: 'Beto Substituto', email: 'beto@escritorio.com', isActive: true }

beforeEach(() => {
  jest.clearAllMocks()
  areaFindFirst.mockResolvedValue({ area: { name: 'Fiscal' }, responsavel: ana, substituto: beto })
  userFindUnique.mockResolvedValue({ name: 'Maria Cliente', email: 'maria@cliente.com' })
  clienteFindUnique.mockResolvedValue({ razaoSocial: 'ACME LTDA', empresa: { nomeFantasia: 'Central Contábil', razaoSocial: 'CENTRAL' } })
  sendMail.mockResolvedValue(true)
})

describe('destinatário', () => {
  it('manda para o responsável da área, com resposta para o cliente', async () => {
    const r = await novoServico().enviar(vinculo, 'u-1', entrada)
    const mail = sendMail.mock.calls[0][0]
    expect(mail.to).toBe('ana@escritorio.com')
    expect(mail.replyTo).toBe('maria@cliente.com')
    expect(mail.subject).toBe('[Portal] Dúvida sobre a guia — ACME LTDA')
    expect(r).toEqual({ destinatario: 'Ana Fiscal' })
  })

  it('responsável inativo: vai para o substituto', async () => {
    areaFindFirst.mockResolvedValue({ area: { name: 'Fiscal' }, responsavel: { ...ana, isActive: false }, substituto: beto })
    await novoServico().enviar(vinculo, 'u-1', entrada)
    expect(sendMail.mock.calls[0][0].to).toBe('beto@escritorio.com')
  })

  it('sem ninguém ativo na área, recusa e não envia', async () => {
    areaFindFirst.mockResolvedValue({ area: { name: 'Fiscal' }, responsavel: null, substituto: null })
    await expect(novoServico().enviar(vinculo, 'u-1', entrada)).rejects.toThrow(/não tem um responsável/)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('área fora do vínculo não existe — nem consulta o banco', async () => {
    await expect(novoServico().enviar(vinculo, 'u-1', { ...entrada, areaId: 'area-contabil' })).rejects.toThrow(/não encontrada/)
    expect(areaFindFirst).not.toHaveBeenCalled()
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('procura a área só dentro do cliente do vínculo, contratada e em vigor', async () => {
    await novoServico().enviar(vinculo, 'u-1', entrada)
    expect(areaFindFirst.mock.calls[0][0].where).toEqual({
      clienteId: 'cli-1', areaId: 'area-fiscal', contratado: true, dataEncerramento: null,
    })
  })
})

describe('conteúdo', () => {
  it('o texto do cliente é escapado — não vira HTML no e-mail', async () => {
    await novoServico().enviar(vinculo, 'u-1', { ...entrada, mensagem: '<script>alert(1)</script>\nlinha 2' })
    const html: string = sendMail.mock.calls[0][0].html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>linha 2')
  })

  it('quebra de linha no assunto vira espaço — nada de cabeçalho injetado', async () => {
    await novoServico().enviar(vinculo, 'u-1', { ...entrada, assunto: 'Oi\r\nBcc: alguem@x.com' })
    expect(sendMail.mock.calls[0][0].subject).toBe('[Portal] Oi Bcc: alguem@x.com — ACME LTDA')
  })

  it('o rodapé não manda "não responder" num e-mail feito para ser respondido', async () => {
    await novoServico().enviar(vinculo, 'u-1', entrada)
    expect(sendMail.mock.calls[0][0].html).not.toContain('não responda')
  })

  it('assunto ou mensagem vazios são recusados antes de consultar', async () => {
    await expect(novoServico().enviar(vinculo, 'u-1', { ...entrada, mensagem: '   ' })).rejects.toThrow(/Preencha/)
    expect(areaFindFirst).not.toHaveBeenCalled()
  })

  it('escaparHtml cobre os cinco caracteres', () => {
    expect(escaparHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('limite e falha', () => {
  it('a sexta mensagem em 10 minutos é recusada', async () => {
    const svc = novoServico()
    for (let i = 0; i < 5; i++) await svc.enviar(vinculo, 'u-1', entrada)
    await expect(svc.enviar(vinculo, 'u-1', entrada)).rejects.toThrow(/várias mensagens/)
    expect(sendMail).toHaveBeenCalledTimes(5)
  })

  it('o limite é por pessoa', async () => {
    const svc = novoServico()
    for (let i = 0; i < 5; i++) await svc.enviar(vinculo, 'u-1', entrada)
    await expect(svc.enviar(vinculo, 'u-2', entrada)).resolves.toEqual({ destinatario: 'Ana Fiscal' })
  })

  it('falha de SMTP vira erro legível, não sucesso silencioso', async () => {
    sendMail.mockResolvedValue(false)
    await expect(novoServico().enviar(vinculo, 'u-1', entrada)).rejects.toThrow(/Não foi possível enviar/)
  })
})
