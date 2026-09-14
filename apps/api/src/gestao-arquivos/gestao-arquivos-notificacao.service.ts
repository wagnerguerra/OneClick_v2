import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import { EmailService } from '../common/email.service'

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

const CARGOS_COORDENACAO: ReadonlySet<string> = new Set(['COORDENADOR', 'GESTOR'])
const CARGOS_DIRETORIA: ReadonlySet<string> = new Set(['DIRETOR'])

@Injectable()
export class GestaoArquivosNotificacaoService {
  private readonly logger = new Logger(GestaoArquivosNotificacaoService.name)

  constructor(private readonly email: EmailService) {}

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
    const regra = await this.regraVigente(evento, clienteId)
    if (!regra || !regra.ativo) return []

    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { empresaId: true },
    })
    if (!cliente?.empresaId) return []
    const empresaId = cliente.empresaId

    const emails = new Set<string>()
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
          responsavel: { select: { email: true, isActive: true } },
          substituto: { select: { email: true, isActive: true } },
        },
      })
      for (const a of areas) {
        if (regra.notificaResponsavel && a.responsavel?.isActive && a.responsavel.email) {
          emails.add(a.responsavel.email)
        }
        if (regra.notificaSubstituto && a.substituto?.isActive && a.substituto.email) {
          emails.add(a.substituto.email)
        }
      }
    }

    const cargos: string[] = []
    if (regra.notificaCoordenador || caiuNoFallback) cargos.push(...CARGOS_COORDENACAO)
    if (regra.notificaDiretor) cargos.push(...CARGOS_DIRETORIA)
    if (cargos.length > 0) {
      const chefia = await prisma.user.findMany({
        where: { empresaId, isActive: true, role: { in: cargos as never[] } },
        select: { email: true },
      })
      for (const u of chefia) if (u.email) emails.add(u.email)
    }

    // Endereços avulsos: separados por ; ou , porque quem digita usa os dois.
    for (const extra of (regra.emailsExtras ?? '').split(/[;,]/)) {
      const e = extra.trim()
      if (e.includes('@')) emails.add(e)
    }

    return [...emails]
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
  }): Promise<boolean> {
    try {
      const para = await this.destinatarios(input.evento, input.clienteId, input.roteamento)
      if (para.length === 0) return false

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
