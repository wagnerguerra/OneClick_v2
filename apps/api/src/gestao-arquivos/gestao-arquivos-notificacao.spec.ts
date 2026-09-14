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
const userPermission = { findMany: jest.fn() }

jest.mock('@saas/db', () => ({
  prisma: { cliente, gestaoArquivosNotificacao, clienteAreaContratada, user, userPermission },
}))

import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'
import type { EmailService } from '../common/email.service'
import type { NotificationService } from '../notification/notification.service'

const sendMail = jest.fn()
const criarParaUsers = jest.fn()
const svc = new GestaoArquivosNotificacaoService(
  { sendMail } as unknown as EmailService,
  { criarParaUsers } as unknown as NotificationService,
)

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

/**
 * Uma pessoa do escritório.
 *
 * O `id` não é enfeite de fixture: é a chave por onde os destinatários são
 * deduplicados e por onde o sino é aceso. Um dublê sem id colapsava duas
 * pessoas numa só — foi o teste abaixo que mostrou isso.
 */
const ativo = (email: string, id = email) => ({ id, email, isActive: true })

beforeEach(() => {
  jest.clearAllMocks()
  cliente.findUnique.mockResolvedValue({ empresaId: 'emp-1' })
  gestaoArquivosNotificacao.findMany.mockResolvedValue([REGRA_PADRAO])
  clienteAreaContratada.findMany.mockResolvedValue([])
  user.findMany.mockResolvedValue([])
  // Por padrão ninguém é master e ninguém tem o módulo: cada teste do sino
  // libera explicitamente quem precisa, para nenhum passar por descuido.
  userPermission.findMany.mockResolvedValue([])
  sendMail.mockResolvedValue(true)
  criarParaUsers.mockResolvedValue({ count: 0 })
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
    user.findMany.mockResolvedValue([{ id: 'u-coord', email: 'coord@esc.com' }])

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
    user.findMany.mockResolvedValue([{ id: 'u-coord', email: 'coord@esc.com' }])
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

/**
 * O sino, e os DOIS portoes que ele tem de respeitar.
 *
 * E-mail e sino nao tem o mesmo publico, e isso e de proposito. E-mail chega
 * fora do sistema e nao da acesso a nada; sino mora dentro e leva a uma tela.
 * Mandar alguem para uma tela que vai recusa-lo e prometer o que nao se cumpre
 * — e o titulo do aviso leva a razao social do cliente junto.
 */
describe('sino', () => {
  const contabil = ativo('contabil@esc.com', 'u-contabil')

  beforeEach(() => {
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: contabil, substituto: null },
    ])
  })

  function avisar(extra = {}) {
    return svc.disparar({
      evento: 'ARQUIVO_ENVIADO',
      clienteId: 'cli-1',
      roteamento: { areaId: 'area-contabil' },
      assunto: 'Novo arquivo de ACME LTDA — n.pdf',
      corpo: 'O cliente enviou "n.pdf" (122 KB) pelo portal.\nEnviado por Fulano.',
      linkNoSino: '/gestao-arquivos/cli-1',
      ...extra,
    })
  }

  it('acende para quem tem canRead no modulo, com link e empresa', async () => {
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])

    await avisar()

    expect(criarParaUsers).toHaveBeenCalledTimes(1)
    const [ids, payload] = criarParaUsers.mock.calls[0]
    expect(ids).toEqual(['u-contabil'])
    expect(payload).toMatchObject({
      link: '/gestao-arquivos/cli-1',
      origem: 'gestao-arquivos',
      empresaId: 'emp-1',
      tipo: 'info',
    })
    // A primeira linha do corpo e a que diz o que aconteceu; o resto e fecho.
    expect(payload.mensagem).toBe('O cliente enviou "n.pdf" (122 KB) pelo portal.')
  })

  it('NAO acende para quem so e responsavel, sem permissao no modulo', async () => {
    // Ser responsavel por uma area decide QUAIS clientes a pessoa ve; quem
    // abre a porta do modulo e o canRead. Dois portoes — olhar so o primeiro
    // deixaria passar quem o segundo barra.
    userPermission.findMany.mockResolvedValue([])

    await avisar()

    expect(criarParaUsers).not.toHaveBeenCalled()
    // E o e-mail sai do mesmo jeito: a regra do escritorio mandou avisar.
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ bcc: ['contabil@esc.com'] }),
    )
  })

  it('acende para o master mesmo sem linha de permissao', async () => {
    // Master e dono do tenant abrem tudo por cargo e nao tem linha em
    // UserPermission. Exigir a linha calaria justamente quem mais precisa.
    user.findMany.mockResolvedValue([{ id: 'u-contabil' }])
    userPermission.findMany.mockResolvedValue([])

    await avisar()

    expect(criarParaUsers.mock.calls[0][0]).toEqual(['u-contabil'])
  })

  it('so consulta permissao dos destinatarios, e do modulo certo', async () => {
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])
    await avisar()
    expect(userPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['u-contabil'] },
          moduleSlug: 'gestao-arquivos',
          canRead: true,
        }),
      }),
    )
  })

  it('sem link nao acende sino nenhum', async () => {
    // Um sino que nao leva a lugar nenhum faz a pessoa procurar o arquivo pelo
    // menu depois de ja saber que ele chegou: custa mais do que informa.
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])
    await avisar({ linkNoSino: null })
    expect(criarParaUsers).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalled()
  })

  it('endereco avulso da regra nao vira sino', async () => {
    // `emailsExtras` sao enderecos, muitas vezes de fora do escritorio: nao ha
    // usuario a quem acender nada.
    gestaoArquivosNotificacao.findMany.mockResolvedValue([
      { ...REGRA_PADRAO, notificaResponsavel: false, notificaSubstituto: false, emailsExtras: 'terceiro@fora.com' },
    ])
    await avisar()
    expect(criarParaUsers).not.toHaveBeenCalled()
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ bcc: ['terceiro@fora.com'] }),
    )
  })

  it('a mesma pessoa em duas areas recebe UM aviso, nao dois', async () => {
    // Responsavel de uma area e substituta de outra e o caso comum.
    clienteAreaContratada.findMany.mockResolvedValue([
      { responsavel: contabil, substituto: null },
      { responsavel: null, substituto: contabil },
    ])
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])

    const ok = await avisar({ roteamento: { areaId: null } })

    expect(ok).not.toBe(undefined)
    expect(criarParaUsers.mock.calls[0][0]).toEqual(['u-contabil'])
    expect(sendMail.mock.calls[0][0].bcc).toEqual(['contabil@esc.com'])
  })

  it('falha ao acender o sino NAO derruba o e-mail', async () => {
    // O sino e o canal auxiliar. Perder os dois porque um falhou seria trocar
    // um aviso a menos por dois.
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])
    criarParaUsers.mockRejectedValue(new Error('banco fora'))

    await expect(avisar()).resolves.toBe(true)
    expect(sendMail).toHaveBeenCalled()
  })

  it('exclusao acende em amarelo, envio em azul', async () => {
    userPermission.findMany.mockResolvedValue([{ userId: 'u-contabil' }])
    gestaoArquivosNotificacao.findMany.mockResolvedValue([
      { ...REGRA_PADRAO, evento: 'ARQUIVO_EXCLUIDO' },
    ])
    await avisar({ evento: 'ARQUIVO_EXCLUIDO' })
    expect(criarParaUsers.mock.calls[0][1].tipo).toBe('warning')
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
