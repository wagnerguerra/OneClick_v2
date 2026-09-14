/**
 * Para quem vai o aviso do porta-arquivos.
 *
 * O defeito que estes testes existem para prender: sem endereço, o aviso de
 * arquivo novo acorda o responsável de TODAS as áreas contratadas do cliente.
 * O contábil recebe e-mail de nota fiscal, o fiscal recebe de folha, e em
 * pouco tempo ninguém lê nenhum — que é o mesmo resultado de não notificar,
 * com o custo de parecer que notifica.
 */

const cliente = { findUnique: jest.fn() }
const gestaoArquivosNotificacao = { findMany: jest.fn() }
const clienteAreaContratada = { findMany: jest.fn() }
const user = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { cliente, gestaoArquivosNotificacao, clienteAreaContratada, user },
}))

import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'
import type { EmailService } from '../common/email.service'

const sendMail = jest.fn()
const svc = new GestaoArquivosNotificacaoService({ sendMail } as unknown as EmailService)

/** A regra que a Central tem hoje em produção: responsável + substituto. */
const REGRA_PADRAO = {
  clienteId: null,
  evento: 'ARQUIVO_ENVIADO',
  ativo: true,
  notificaResponsavel: true,
  notificaSubstituto: true,
  notificaCoordenador: false,
  notificaDiretor: false,
  emailsExtras: null,
}

const ativo = (email: string) => ({ email, isActive: true })

beforeEach(() => {
  jest.clearAllMocks()
  cliente.findUnique.mockResolvedValue({ empresaId: 'emp-1' })
  gestaoArquivosNotificacao.findMany.mockResolvedValue([REGRA_PADRAO])
  clienteAreaContratada.findMany.mockResolvedValue([])
  user.findMany.mockResolvedValue([])
  sendMail.mockResolvedValue(true)
})

describe('recorte por área', () => {
  it('consulta só a área do arquivo quando ela é conhecida', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('contabil@esc.com'), substituto: null },
    ])

    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })

    expect(clienteAreaContratada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clienteId: 'cli-1', areaId: 'area-contabil' }),
      }),
    )
    expect(para).toEqual(['contabil@esc.com'])
  })

  it('leva o substituto DAQUELA área junto, quando a regra pede', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('contabil@esc.com'), substituto: ativo('reserva@esc.com') },
    ])
    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })
    expect(para.sort()).toEqual(['contabil@esc.com', 'reserva@esc.com'])
  })

  it('ignora responsável inativo — quem saiu do escritório não é destino', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: { email: 'saiu@esc.com', isActive: false }, substituto: ativo('fica@esc.com') },
    ])
    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })
    expect(para).toEqual(['fica@esc.com'])
  })
})

describe('fallback do arquivo sem área', () => {
  it('não filtra por área nenhuma — vai a todos os responsáveis', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('contabil@esc.com'), substituto: null },
      { responsavel: ativo('fiscal@esc.com'), substituto: null },
      { responsavel: ativo('trabalhista@esc.com'), substituto: null },
    ])

    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: null })

    const where = clienteAreaContratada.findMany.mock.calls[0]![0].where as Record<string, unknown>
    expect(where).not.toHaveProperty('areaId')
    expect(para).toEqual(
      expect.arrayContaining(['contabil@esc.com', 'fiscal@esc.com', 'trabalhista@esc.com']),
    )
  })

  it('chama a coordenação MESMO que a regra não tenha pedido', async () => {
    // Deliberado, e o oposto de um bug: sem área não existe dono, e o trabalho
    // do fallback é garantir que alguém com poder de encaminhar fique sabendo.
    // A regra da Central tem notificaCoordenador = false.
    user.findMany.mockResolvedValue([{ email: 'coord@esc.com' }])

    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: null })

    expect(user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: { in: ['COORDENADOR', 'GESTOR'] } }),
      }),
    )
    expect(para).toContain('coord@esc.com')
  })

  it('não chama a coordenação quando a área é conhecida e a regra não pediu', async () => {
    // Com dono definido, abrir para a chefia é justamente o ruído que o
    // roteamento veio eliminar.
    await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })
    expect(user.findMany).not.toHaveBeenCalled()
  })

  it('evento que NÃO roteia por área não convoca a coordenação', async () => {
    // `ARQUIVO_LIDO` e `SOLICITACAO_VENCIDA` falam de uma pendência, não de uma
    // pasta: omitir o roteamento é dizer "este evento não tem área", e não
    // "é um arquivo que não soubemos classificar". Fosse um `areaId` opcional
    // solto, os dois passariam a acordar a chefia sem que ninguém pedisse.
    user.findMany.mockResolvedValue([{ email: 'coord@esc.com' }])
    const para = await svc.destinatarios('ARQUIVO_LIDO', 'cli-1')
    expect(user.findMany).not.toHaveBeenCalled()
    expect(para).not.toContain('coord@esc.com')
  })
})

describe('a regra continua mandando', () => {
  it('regra desligada cala o aviso, com ou sem área', async () => {
    gestaoArquivosNotificacao.findMany.mockResolvedValue([{ ...REGRA_PADRAO, ativo: false }])
    await expect(svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: null })).resolves.toEqual([])
  })

  it('sem regra cadastrada não há destinatário', async () => {
    gestaoArquivosNotificacao.findMany.mockResolvedValue([])
    await expect(svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })).resolves.toEqual([])
  })

  it('a regra DO CLIENTE vence a regra padrão da empresa', async () => {
    gestaoArquivosNotificacao.findMany.mockResolvedValue([
      REGRA_PADRAO,
      { ...REGRA_PADRAO, clienteId: 'cli-1', notificaResponsavel: false, emailsExtras: 'so@este.com' },
    ])
    const para = await svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: 'area-contabil' })
    expect(para).toEqual(['so@este.com'])
  })

  it('cliente sem empresa não notifica ninguém', async () => {
    // Mandar e-mail com base numa empresa adivinhada é pior que não mandar.
    cliente.findUnique.mockResolvedValue({ empresaId: null })
    await expect(svc.destinatarios('ARQUIVO_ENVIADO', 'cli-1', { areaId: null })).resolves.toEqual([])
  })
})

describe('disparar', () => {
  it('repassa a área para o recorte dos destinatários', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('contabil@esc.com'), substituto: null },
    ])

    await svc.disparar({
      evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1', roteamento: { areaId: 'area-contabil' },
      assunto: 'Novo arquivo', corpo: 'chegou',
    })

    expect(clienteAreaContratada.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ areaId: 'area-contabil' }) }),
    )
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ bcc: ['contabil@esc.com'] }),
    )
  })

  it('manda em BCC: a lista de quem responde por qual cliente não circula', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('a@esc.com'), substituto: ativo('b@esc.com') },
    ])
    await svc.disparar({ evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1', assunto: 'x', corpo: 'y' })
    const arg = sendMail.mock.calls[0]![0] as Record<string, unknown>
    expect(arg).not.toHaveProperty('to')
    expect(arg.bcc).toHaveLength(2)
  })

  it('escapa o corpo — nome de arquivo não vira tag no e-mail de ninguém', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('a@esc.com'), substituto: null },
    ])
    await svc.disparar({
      evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1',
      assunto: 'x', corpo: 'O cliente enviou "<script>alert(1)</script>.pdf"',
    })
    const html = (sendMail.mock.calls[0]![0] as { html: string }).html
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('sem ninguém para avisar, não manda e-mail nenhum', async () => {
    const ok = await svc.disparar({
      evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1', assunto: 'x', corpo: 'y',
    })
    expect(ok).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('nunca lança: quem chama já concluiu e auditou a operação', async () => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: ativo('a@esc.com'), substituto: null },
    ])
    sendMail.mockRejectedValue(new Error('SMTP fora'))
    await expect(
      svc.disparar({ evento: 'ARQUIVO_ENVIADO', clienteId: 'cli-1', assunto: 'x', corpo: 'y' }),
    ).resolves.toBe(false)
  })
})
