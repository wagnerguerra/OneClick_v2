import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import { EmailService } from '../common/email.service'
import { NotificationService } from '../notification/notification.service'

/**
 * Quem recebe e-mail quando algo acontece no porta-arquivos.
 *
 * A configuração é por evento, com regra PADRÃO da empresa (`clienteId` nulo) e
 * sobreposição opcional por cliente. Desenhado assim porque o caso comum é uma
 * regra só para todo mundo, e a exceção ("neste cliente o diretor também quer
 * saber") não deve obrigar a cadastrar os outros trezentos.
 */

/** Os quatro eventos que disparam e-mail. */
export const EVENTOS_NOTIFICAVEIS = [
  'ARQUIVO_ENVIADO',
  'ARQUIVO_EXCLUIDO',
  'SOLICITACAO_VENCIDA',
  'ARQUIVO_LIDO',
] as const

export type EventoNotificavel = (typeof EVENTOS_NOTIFICAVEIS)[number]

/** O mesmo slug que o `readProcedure` do router exige. */
const MODULE_SLUG = 'gestao-arquivos'

const CARGOS_COORDENACAO: ReadonlySet<string> = new Set(['COORDENADOR', 'GESTOR'])
const CARGOS_DIRETORIA: ReadonlySet<string> = new Set(['DIRETOR'])

@Injectable()
export class GestaoArquivosNotificacaoService {
  private readonly logger = new Logger(GestaoArquivosNotificacaoService.name)

  constructor(
    private readonly email: EmailService,
    private readonly notificacoes: NotificationService,
  ) {}

  /**
   * Regra vigente para um evento neste cliente.
   *
   * Busca as duas linhas possíveis de uma vez e escolhe a específica quando
   * existe. Duas consultas em sequência dariam o mesmo resultado e custariam
   * uma ida a mais ao banco em todo disparo.
   */
  async regraVigente(evento: EventoNotificavel, clienteId: string) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { empresaId: true },
    })
    // `empresaId` do cliente é nullable no schema. Sem empresa não há regra a
    // aplicar — devolver null cala a notificação, que é o certo: mandar e-mail
    // com base numa empresa adivinhada seria pior que não mandar.
    if (!cliente?.empresaId) return null
    const empresaId = cliente.empresaId

    const regras = await prisma.gestaoArquivosNotificacao.findMany({
      where: {
        empresaId,
        evento,
        OR: [{ clienteId }, { clienteId: null }],
      },
    })
    return regras.find(r => r.clienteId === clienteId) ?? regras.find(r => !r.clienteId) ?? null
  }

  /**
   * Destinatários de um evento, já sem repetição.
   *
   * O responsável e o substituto saem de `ClienteAreaContratada` — as MESMAS
   * pessoas que o escopo do módulo usa para dar acesso. Coordenação e diretoria
   * saem do cargo, dentro da empresa do cliente.
   *
   * `roteamento` é o endereço do aviso, e a AUSÊNCIA dele é diferente de
   * `{ areaId: null }`. Ausente significa "este evento não tem área" — é o
   * caso de `ARQUIVO_LIDO` e `SOLICITACAO_VENCIDA`, que falam de uma pendência
   * e não de uma pasta, e onde só a regra manda. Presente com `areaId` significa
   * "é desta área": o contábil deixa de receber e-mail de nota fiscal e o
   * fiscal deixa de receber de folha. Presente com `null` significa "é um
   * arquivo, e não descobrimos de que área" — e só aí vale o fallback.
   *
   * A distinção não é preciosismo: fosse um `areaId` opcional solto, todo
   * evento sem área cairia no fallback e passaria a acordar a coordenação,
   * inclusive os dois que nada têm a ver com pasta.
   */
  async destinatarios(
    evento: EventoNotificavel,
    clienteId: string,
    roteamento?: { areaId: string | null },
  ): Promise<string[]> {
    const { usuarios, extras } = await this.resolverDestinatarios(evento, clienteId, roteamento)
    return [...new Set([...usuarios.map(u => u.email), ...extras])]
  }

  /**
   * As mesmas pessoas, com o ID junto do e-mail.
   *
   * O sino precisa do `userId` e o e-mail precisa do endereco, e os dois tem
   * de chegar a QUEM MESMO — nao a dois conjuntos que se parecem. Resolver uma
   * vez e distribuir e o que impede o aviso aparecer no sino de um e na caixa
   * de outro no dia em que alguem mexer numa das duas consultas.
   *
   * Os `emailsExtras` da regra ficam de fora dos `usuarios` porque nao SAO
   * usuarios: sao enderecos avulsos, sem ninguem a quem acender um sino.
   */
  private async resolverDestinatarios(
    evento: EventoNotificavel,
    clienteId: string,
    roteamento?: { areaId: string | null },
  ): Promise<{ usuarios: Array<{ id: string; email: string }>; extras: string[]; empresaId: string | null }> {
    const vazio = { usuarios: [], extras: [], empresaId: null }
    const regra = await this.regraVigente(evento, clienteId)
    if (!regra || !regra.ativo) return vazio

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { empresaId: true },
    })
    if (!cliente?.empresaId) return vazio
    const empresaId = cliente.empresaId

    // Chaveado por id: a mesma pessoa e responsavel de uma area e substituta de
    // outra o tempo todo, e sem isto receberia o aviso duas vezes.
    const porId = new Map<string, { id: string; email: string }>()
    const juntar = (u: { id: string; email: string | null; isActive: boolean } | null | undefined) => {
      // O `u.id` e a chave: sem ele duas pessoas distintas virariam uma so,
      // e o aviso sumiria para alguem sem nenhum erro aparecer. Prisma sempre
      // devolve o id — a guarda existe porque a consequencia de nao ter e
      // silenciosa, e foi assim que um dublê de teste sem id mascarou o caso.
      if (!u?.id || !u.isActive || !u.email) return
      porId.set(u.id, { id: u.id, email: u.email })
    }
    const areaId = roteamento?.areaId ?? null
    /**
     * Arquivo que o roteamento não soube classificar: o aviso ABRE em vez de
     * fechar.
     *
     * Vai para todos os responsáveis E para a coordenação, mesmo que a regra
     * não tenha pedido coordenação. É deliberado, e é o oposto de um bug: sem
     * área não existe dono, e o trabalho do fallback é garantir que alguém com
     * poder de encaminhar fique sabendo. Fechar aqui — mandar para ninguém, ou
     * só para quem a regra listou — transformaria "não soubemos classificar"
     * em "o arquivo se perdeu", que é o defeito que este módulo existe para
     * não ter.
     *
     * Note o `!!roteamento`: evento que não roteia por área não é "arquivo sem
     * área", é outro assunto, e não convoca ninguém a mais.
     */
    const caiuNoFallback = !!roteamento && !areaId

    if (regra.notificaResponsavel || regra.notificaSubstituto) {
      const areas = await prisma.clienteAreaContratada.findMany({
        where: {
          clienteId,
          contratado: true,
          dataEncerramento: null,
          // Com área, o recorte é ela. Sem área, todas.
          ...(areaId ? { areaId } : {}),
        },
        select: {
          responsavel: { select: { id: true, email: true, isActive: true } },
          substituto: { select: { id: true, email: true, isActive: true } },
        },
      })
      for (const a of areas) {
        if (regra.notificaResponsavel) juntar(a.responsavel)
        if (regra.notificaSubstituto) juntar(a.substituto)
      }
    }

    const cargos: string[] = []
    if (regra.notificaCoordenador || caiuNoFallback) cargos.push(...CARGOS_COORDENACAO)
    if (regra.notificaDiretor) cargos.push(...CARGOS_DIRETORIA)
    if (cargos.length > 0) {
      const chefia = await prisma.user.findMany({
        // `empresaId` aqui não é enfeite: sem ele, "todo COORDENADOR" seria
        // todo coordenador de TODOS os escritórios, e o arquivo de um cliente
        // da Central acenderia o sino de outro tenant.
        where: { empresaId, isActive: true, role: { in: cargos as never[] } },
        select: { id: true, email: true },
      })
      for (const u of chefia) juntar({ ...u, isActive: true })
    }

    // Endereços avulsos: separados por ; ou , porque quem digita usa os dois.
    const extras = new Set<string>()
    for (const extra of (regra.emailsExtras ?? '').split(/[;,]/)) {
      const e = extra.trim()
      if (e.includes('@')) extras.add(e)
    }

    return { usuarios: [...porId.values()], extras: [...extras], empresaId }
  }

  /**
   * Dos destinatários, quem pode mesmo ABRIR o módulo.
   *
   * O e-mail vai para quem a regra mandou, e isso está certo: e-mail é aviso,
   * chega fora do sistema e não dá acesso a nada. O sino é diferente — ele
   * mora dentro do sistema e leva a uma tela. Mandar alguém para uma tela que
   * vai recusá-lo é prometer o que não se cumpre, e o título do aviso carrega
   * a razão social do cliente para alguém que talvez não devesse vê-la.
   *
   * Ser responsável por uma área NÃO concede o módulo: `resolverEscopo` decide
   * QUAIS clientes a pessoa vê, mas quem abre a porta é o `canRead` de
   * `gestao-arquivos` no `UserPermission`, conferido pelo `readProcedure`. São
   * dois portões, e só olhar o primeiro deixaria passar quem o segundo barra.
   */
  private async comAcessoAoModulo(
    usuarios: Array<{ id: string; email: string }>,
  ): Promise<Array<{ id: string; email: string }>> {
    if (usuarios.length === 0) return []
    const ids = usuarios.map(u => u.id)
    const [donos, permitidos] = await Promise.all([
      // Master e dono do tenant não têm linha em `UserPermission` — abrem tudo
      // por cargo. Exigir a linha deles calaria justamente quem mais precisa.
      prisma.user.findMany({
        where: { id: { in: ids }, OR: [{ isMaster: true }, { isEmpresaMaster: true }] },
        select: { id: true },
      }),
      prisma.userPermission.findMany({
        where: { userId: { in: ids }, moduleSlug: MODULE_SLUG, canRead: true },
        select: { userId: true },
      }),
    ])
    const ok = new Set([...donos.map(d => d.id), ...permitidos.map(p => p.userId)])
    return usuarios.filter(u => ok.has(u.id))
  }

  /**
   * Manda o e-mail do evento.
   *
   * Vai tudo em BCC, com o `to` caindo no próprio remetente: são pessoas do
   * mesmo escritório, mas a lista de quem responde por qual cliente não precisa
   * circular em cabeçalho de e-mail a cada notificação.
   *
   * Nunca lança. Quem chama já concluiu e auditou a operação — uma falha de
   * SMTP não pode transformar um arquivo excluído com sucesso em erro na tela.
   */
  async disparar(input: {
    evento: EventoNotificavel
    clienteId: string
    assunto: string
    corpo: string
    /**
     * Endereço do aviso. Omitir = evento sem área. `{ areaId: null }` = é um
     * arquivo cuja área não descobrimos, e aí vale o fallback. Ver
     * `destinatarios`, onde a diferença entre os dois está explicada.
     */
    roteamento?: { areaId: string | null }
    /**
     * Para onde o sino leva. Ausente = o aviso sai só por e-mail.
     *
     * Um sino que não leva a lugar nenhum obriga a pessoa a procurar o arquivo
     * pelo menu depois de já saber que ele chegou — e aí o aviso custa mais do
     * que informa.
     */
    linkNoSino?: string | null
  }): Promise<boolean> {
    try {
      const { usuarios, extras, empresaId } = await this.resolverDestinatarios(
        input.evento, input.clienteId, input.roteamento,
      )
      const para = [...new Set([...usuarios.map(u => u.email), ...extras])]
      if (para.length === 0) return false

      // O sino ANTES do e-mail, e sem esperar por ele.
      //
      // O e-mail depende de SMTP, que é o único dos dois que sai da nossa mão:
      // se ele demorar ou falhar, o aviso no sino já está gravado e a pessoa vê
      // do mesmo jeito. Na ordem inversa, uma fila de SMTP travada engoliria os
      // dois canais de uma vez, que é justamente o que ter dois canais deveria
      // impedir.
      await this.acenderSino(usuarios, empresaId, input)

      const html = input.corpo
        .split('\n')
        .map(l => `<p style="margin:0 0 12px">${this.escapar(l)}</p>`)
        .join('')

      return await this.email.sendMail({ bcc: para, subject: input.assunto, html })
    } catch (err) {
      this.logger.warn(
        `Falha ao notificar ${input.evento} do cliente ${input.clienteId}: ${String(err)}`,
      )
      return false
    }
  }

  /**
   * Acende o sino de quem é usuário do sistema E alcança o módulo.
   *
   * Os `emailsExtras` da regra não entram: são endereços avulsos, muitas vezes
   * de fora do escritório, e não há sino a acender para eles.
   *
   * Nunca lança. O sino é o canal auxiliar; derrubar o e-mail — que é o canal
   * que o módulo prometeu — porque a gravação da notificação falhou seria
   * trocar um aviso a menos por dois.
   */
  private async acenderSino(
    usuarios: Array<{ id: string; email: string }>,
    empresaId: string | null,
    input: { evento: EventoNotificavel; assunto: string; corpo: string; linkNoSino?: string | null },
  ): Promise<void> {
    if (usuarios.length === 0 || !input.linkNoSino) return
    try {
      const podem = await this.comAcessoAoModulo(usuarios)
      if (podem.length === 0) return
      await this.notificacoes.criarParaUsers(podem.map(u => u.id), {
        titulo: input.assunto,
        // O corpo do e-mail tem várias linhas e um fecho; no sino cabe a
        // primeira, que é a que diz o que aconteceu.
        mensagem: input.corpo.split('\n')[0] ?? null,
        tipo: input.evento === 'ARQUIVO_EXCLUIDO' ? 'warning' : 'info',
        link: input.linkNoSino,
        origem: MODULE_SLUG,
        empresaId,
      })
    } catch (err) {
      this.logger.warn(`Falha ao acender o sino de ${input.evento}: ${String(err)}`)
    }
  }

  /**
   * Escapa o corpo antes de virar HTML.
   *
   * O texto carrega nome de arquivo e motivo digitado por gente — um
   * `<script>` num nome de arquivo não pode virar tag no e-mail de ninguém.
   */
  private escapar(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Administração ─────────────────────────────────────────────────────────

  /** Regras da empresa, para a tela de administração do módulo. */
  async listarRegras(empresaId: string, clienteId?: string | null) {
    return prisma.gestaoArquivosNotificacao.findMany({
      where: { empresaId, clienteId: clienteId ?? null },
      orderBy: { evento: 'asc' },
    })
  }

  /**
   * Salva a regra de um evento.
   *
   * `upsert` do Prisma não serve aqui: a chave é parcial no banco (dois índices
   * distintos, um para `cliente_id IS NULL` e outro para o resto, porque em
   * Postgres NULL <> NULL). Então é busca-e-decide explícito.
   */
  async salvarRegra(input: {
    empresaId: string
    clienteId?: string | null
    evento: EventoNotificavel
    ativo: boolean
    notificaResponsavel: boolean
    notificaSubstituto: boolean
    notificaCoordenador: boolean
    notificaDiretor: boolean
    emailsExtras?: string | null
  }) {
    const clienteId = input.clienteId ?? null
    const existente = await prisma.gestaoArquivosNotificacao.findFirst({
      where: { empresaId: input.empresaId, clienteId, evento: input.evento },
      select: { id: true },
    })

    const dados = {
      ativo: input.ativo,
      notificaResponsavel: input.notificaResponsavel,
      notificaSubstituto: input.notificaSubstituto,
      notificaCoordenador: input.notificaCoordenador,
      notificaDiretor: input.notificaDiretor,
      emailsExtras: input.emailsExtras?.trim() || null,
    }

    if (existente) {
      await prisma.gestaoArquivosNotificacao.update({ where: { id: existente.id }, data: dados })
    } else {
      await prisma.gestaoArquivosNotificacao.create({
        data: { empresaId: input.empresaId, clienteId, evento: input.evento, ...dados },
      })
    }
    return { ok: true }
  }

  /** Remove a exceção de um cliente — ele volta a seguir a regra padrão. */
  async removerExcecao(empresaId: string, clienteId: string, evento: EventoNotificavel) {
    await prisma.gestaoArquivosNotificacao.deleteMany({
      where: { empresaId, clienteId, evento },
    })
    return { ok: true }
  }
}
