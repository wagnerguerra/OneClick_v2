/**
 * Uma leva, um aviso.
 *
 * O defeito que isto existe para prender: o explorador sobe um arquivo por vez,
 * então arrastar dez arquivos eram dez e-mails ao responsável. Dez e-mails para
 * dizer uma coisa só é pior que um — a pessoa arquiva a leva inteira sem ler, e
 * o aviso seguinte, que talvez importasse, vai junto.
 *
 * Relógio falso porque as janelas são de 25s e 3 min: sem ele o teste ou espera
 * minutos ou não prova nada.
 */

import { GestaoArquivosLoteService } from './gestao-arquivos-lote.service'
import type { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'

const disparar = jest.fn()
const notificacao = { disparar } as unknown as GestaoArquivosNotificacaoService

const JANELA = 25_000
const TETO = 180_000

let svc: GestaoArquivosLoteService

function envio(over: Partial<Parameters<GestaoArquivosLoteService['registrar']>[0]> = {}) {
  return {
    clienteId: 'cli-1',
    clienteNome: 'ACME LTDA',
    escritorioNome: 'Central Contábil',
    areaId: 'area-contabil',
    arquivoNome: 'n.pdf',
    tamanho: 125_000,
    enviadoPor: 'Cliente Teste',
    link: '/gestao-arquivos/cli-1',
    ...over,
  }
}

/** Avança o relógio E deixa as promessas do despejo resolverem. */
async function passar(ms: number) {
  jest.advanceTimersByTime(ms)
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  disparar.mockResolvedValue(true)
  svc = new GestaoArquivosLoteService(notificacao)
})

afterEach(() => {
  jest.useRealTimers()
})

describe('um arquivo só', () => {
  it('não avisa antes de a janela fechar', async () => {
    svc.registrar(envio())
    await passar(JANELA - 1000)
    expect(disparar).not.toHaveBeenCalled()
  })

  it('mantém o aviso de antes: nome no assunto, tamanho e autoria no corpo', async () => {
    svc.registrar(envio())
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(1)
    const a = disparar.mock.calls[0]![0]
    expect(a.assunto).toBe('Novo arquivo de ACME LTDA — n.pdf')
    expect(a.corpo).toContain('122 KB')
    expect(a.corpo).toContain('Enviado por Cliente Teste')
    expect(a.roteamento).toEqual({ areaId: 'area-contabil' })
    expect(a.linkNoSino).toBe('/gestao-arquivos/cli-1')
  })
})

describe('uma leva', () => {
  it('dez arquivos viram UM aviso', async () => {
    for (let i = 0; i < 10; i++) svc.registrar(envio({ arquivoNome: `nota-${i}.xml` }))
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(1)
    const a = disparar.mock.calls[0]![0]
    expect(a.assunto).toBe('10 novos arquivos de ACME LTDA')
    expect(a.corpo).toContain('O cliente enviou 10 arquivos')
    expect(a.corpo).toContain('nota-0.xml')
    expect(a.corpo).toContain('nota-9.xml')
  })

  it('cada arquivo novo reabre a janela', async () => {
    svc.registrar(envio({ arquivoNome: 'a.pdf' }))
    await passar(JANELA - 5_000)
    svc.registrar(envio({ arquivoNome: 'b.pdf' }))
    await passar(JANELA - 5_000)
    // Já se passaram 40s do primeiro, e nada saiu: a leva ainda está aberta.
    expect(disparar).not.toHaveBeenCalled()

    await passar(5_000)
    expect(disparar).toHaveBeenCalledTimes(1)
    expect(disparar.mock.calls[0]![0].assunto).toBe('2 novos arquivos de ACME LTDA')
  })

  it('o teto fecha a leva mesmo com envio continuo', async () => {
    // Sem teto, um arquivo a cada 20s adiaria o aviso para SEMPRE — a janela
    // reabriria antes de fechar. É exatamente o que uma conexão lenta subindo
    // uma pasta grande produz, e não uma hipótese.
    const PASSO = 20_000
    for (let i = 0; i < 20; i++) {
      svc.registrar(envio({ arquivoNome: `f-${i}.pdf` }))
      await passar(PASSO)
    }

    expect(disparar).toHaveBeenCalled()
    // A prova do teto: o primeiro aviso saiu por volta dos 180s, e não no fim
    // dos 400s. Em passos de 20s isso são ~9 arquivos na primeira leva — se o
    // teto não existisse, a primeira leva teria os 20.
    const primeiraLeva = Number(/^(\d+) novos/.exec(disparar.mock.calls[0]![0].assunto as string)?.[1])
    expect(primeiraLeva).toBeGreaterThan(1)
    expect(primeiraLeva).toBeLessThanOrEqual(Math.ceil(TETO / PASSO) + 1)
    expect(primeiraLeva).toBeLessThan(20)
  })

  it('lista no máximo 15 nomes e resume o resto', async () => {
    for (let i = 0; i < 18; i++) svc.registrar(envio({ arquivoNome: `f-${i}.pdf` }))
    await passar(JANELA)

    const corpo = disparar.mock.calls[0]![0].corpo as string
    expect(corpo).toContain('f-14.pdf')
    expect(corpo).not.toContain('f-15.pdf')
    expect(corpo).toContain('e mais 3 arquivos')
  })

  it('junta os autores em vez de escolher um', async () => {
    svc.registrar(envio({ arquivoNome: 'a.pdf', enviadoPor: 'Ana' }))
    svc.registrar(envio({ arquivoNome: 'b.pdf', enviadoPor: 'Bruno' }))
    svc.registrar(envio({ arquivoNome: 'c.pdf', enviadoPor: 'Ana' }))
    await passar(JANELA)

    expect(disparar.mock.calls[0]![0].corpo).toContain('Enviado por Ana e Bruno.')
  })
})

describe('o que NÃO pode ser juntado', () => {
  it('áreas diferentes geram avisos separados', async () => {
    // Áreas diferentes têm responsáveis diferentes. Fundi-las mandaria ao
    // contábil a lista de notas fiscais que o roteamento acabou de separar.
    svc.registrar(envio({ areaId: 'area-contabil', arquivoNome: 'balancete.pdf' }))
    svc.registrar(envio({ areaId: 'area-fiscal', arquivoNome: 'nota.xml' }))
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(2)
    const areas = disparar.mock.calls.map(c => c[0].roteamento.areaId).sort()
    expect(areas).toEqual(['area-contabil', 'area-fiscal'])
  })

  it('clientes diferentes geram avisos separados', async () => {
    svc.registrar(envio({ clienteId: 'cli-1', clienteNome: 'ACME' }))
    svc.registrar(envio({ clienteId: 'cli-2', clienteNome: 'BETA' }))
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(2)
    expect(disparar.mock.calls.map(c => c[0].clienteId).sort()).toEqual(['cli-1', 'cli-2'])
  })

  it('arquivo sem área não se mistura com arquivo com área', async () => {
    svc.registrar(envio({ areaId: null, arquivoNome: 'solto.pdf' }))
    svc.registrar(envio({ areaId: 'area-fiscal', arquivoNome: 'nota.xml' }))
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(2)
    // O de área nula precisa sair COM `roteamento`, que é o que liga o fallback.
    const semArea = disparar.mock.calls.find(c => c[0].roteamento.areaId === null)
    expect(semArea).toBeDefined()
  })
})

describe('robustez', () => {
  it('despeja o pendente ao desligar — o deploy manda SIGTERM', async () => {
    svc.registrar(envio())
    await svc.onModuleDestroy()
    expect(disparar).toHaveBeenCalledTimes(1)
  })

  it('arquivo que chega durante o despejo abre leva nova, não some', async () => {
    let liberar: (() => void) | undefined
    disparar.mockImplementation(() => new Promise<boolean>(r => { liberar = () => r(true) }))

    svc.registrar(envio({ arquivoNome: 'a.pdf' }))
    await passar(JANELA)
    expect(disparar).toHaveBeenCalledTimes(1)

    // O primeiro disparo ainda não terminou.
    svc.registrar(envio({ arquivoNome: 'b.pdf' }))
    liberar?.()
    await passar(JANELA)

    expect(disparar).toHaveBeenCalledTimes(2)
    expect(disparar.mock.calls[1]![0].corpo).toContain('b.pdf')
  })

  it('falha no disparo não derruba nada nem trava a leva seguinte', async () => {
    disparar.mockRejectedValueOnce(new Error('SMTP fora'))
    svc.registrar(envio({ arquivoNome: 'a.pdf' }))
    await passar(JANELA)

    svc.registrar(envio({ arquivoNome: 'b.pdf' }))
    await passar(JANELA)
    expect(disparar).toHaveBeenCalledTimes(2)
  })

  it('registrar nunca lança — o arquivo já está no Drive', () => {
    // Um erro aqui viraria "não foi possível enviar" para um arquivo que subiu.
    expect(() => svc.registrar(envio({ arquivoNome: null as unknown as string }))).not.toThrow()
  })
})

describe('e-mail', () => {
  it('sai no shell padrão, com o ESCRITÓRIO como remetente', async () => {
    svc.registrar(envio())
    await passar(JANELA)

    const a = disparar.mock.calls[0]![0]
    expect(a.html).toContain('<!DOCTYPE')
    // O nome do escritório é a identidade de quem manda; o do cliente é o
    // assunto do aviso. Trocá-los faria o e-mail parecer vir do cliente.
    expect(a.html).toContain('Central Contábil')
    expect(a.iconeEmail).toBe('file-plus')
  })

  it('escapa o nome do arquivo — nome não vira tag no e-mail de ninguém', async () => {
    svc.registrar(envio({ arquivoNome: '<script>alert(1)</script>.pdf' }))
    svc.registrar(envio({ arquivoNome: 'b.pdf' }))
    await passar(JANELA)

    const html = disparar.mock.calls[0]![0].html as string
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
