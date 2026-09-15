import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common'
import { GestaoArquivosNotificacaoService } from './gestao-arquivos-notificacao.service'
import { buildEmailLayout } from '../common/email-layout'

/**
 * Junta os envios de uma mesma leva num aviso só.
 *
 * O explorador sobe UM arquivo por vez — de propósito, porque a fila e a barra
 * de progresso vivem nele e se perdem se a fonte engolir o laço. A API, então,
 * recebe dez mutações separadas quando alguém arrasta dez arquivos, e o aviso
 * saía dez vezes. Dez e-mails para dizer uma coisa só é pior que um: o
 * responsável arquiva a leva inteira sem ler, e o aviso seguinte, que talvez
 * importasse, vai junto.
 *
 * A agregação é por CLIENTE + ÁREA, e não só por cliente: áreas diferentes têm
 * responsáveis diferentes, e fundir as duas mandaria para o contábil a lista de
 * notas fiscais que o roteamento acabou de separar.
 *
 * O balde vive em memória. É proporcional ao que está em jogo: o arquivo já
 * está no Drive e já tem linha no `ArquivoLog` quando isto roda — o que uma
 * queda custaria é o aviso, não o dado. Em troca, não há tabela nova, job nem
 * estado para reconciliar. O `onModuleDestroy` despeja o que estiver pendente,
 * então um deploy (SIGTERM) não engole leva nenhuma; só uma morte abrupta
 * engoliria, e aí a leva aparece na tela do escritório do mesmo jeito.
 */

/** Silêncio que fecha a leva. Arrastar dez arquivos leva segundos. */
const JANELA_MS = 25_000

/**
 * Teto desde o PRIMEIRO arquivo.
 *
 * Sem ele, um envio a cada 20 segundos adiaria o aviso para sempre — e o caso
 * não é hipotético: é exatamente o que uma conexão lenta subindo uma pasta
 * grande produz.
 */
const TETO_MS = 180_000

/** Nomes listados no corpo antes de virar "e mais N". */
const MAX_NOMES = 15

export interface EnvioDoCliente {
  clienteId: string
  clienteNome: string
  /**
   * O ESCRITÓRIO, não o cliente.
   *
   * É a identidade de quem manda o e-mail — vai no logo, na tarja acima do
   * título e no rodapé. Pôr o nome do cliente ali faria o aviso parecer vir
   * dele, quando quem manda é o sistema do escritório.
   */
  escritorioNome: string
  areaId: string | null
  arquivoNome: string
  tamanho?: number | null
  enviadoPor: string | null
  link: string
}

interface Balde {
  clienteId: string
  clienteNome: string
  escritorioNome: string
  areaId: string | null
  link: string
  arquivos: Array<{ nome: string; tamanho: number | null }>
  autores: Set<string>
  primeiroEm: number
  timer: NodeJS.Timeout
}

function kb(bytes: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return ` (${Math.max(1, Math.round(bytes / 1024))} KB)`
  return ` (${(bytes / 1024 / 1024).toFixed(1)} MB)`
}

/** "Fulano", "Fulano e Beltrano", "Fulano, Beltrano e Sicrano". */
function listar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ''
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

@Injectable()
export class GestaoArquivosLoteService implements OnModuleDestroy {
  private readonly logger = new Logger(GestaoArquivosLoteService.name)
  private readonly baldes = new Map<string, Balde>()

  constructor(private readonly notificacao: GestaoArquivosNotificacaoService) {}

  /**
   * Anota um envio e (re)arma o despejo.
   *
   * Nunca lança: quem chama já pôs o arquivo no Drive, e o aviso não pode
   * transformar um envio bem-sucedido em erro de tela.
   */
  registrar(e: EnvioDoCliente): void {
    try {
      const chave = `${e.clienteId}:${e.areaId ?? '-'}`
      const agora = Date.now()
      const atual = this.baldes.get(chave)

      if (atual) {
        clearTimeout(atual.timer)
        atual.arquivos.push({ nome: e.arquivoNome, tamanho: e.tamanho ?? null })
        if (e.enviadoPor) atual.autores.add(e.enviadoPor)
        // O teto conta do primeiro arquivo, então a espera nunca passa dele por
        // mais que a folga de um tique.
        const restante = Math.max(0, atual.primeiroEm + TETO_MS - agora)
        atual.timer = setTimeout(() => void this.despejar(chave), Math.min(JANELA_MS, restante))
        return
      }

      const balde: Balde = {
        clienteId: e.clienteId,
        clienteNome: e.clienteNome,
        escritorioNome: e.escritorioNome,
        areaId: e.areaId,
        link: e.link,
        arquivos: [{ nome: e.arquivoNome, tamanho: e.tamanho ?? null }],
        autores: new Set(e.enviadoPor ? [e.enviadoPor] : []),
        primeiroEm: agora,
        timer: setTimeout(() => void this.despejar(chave), JANELA_MS),
      }
      this.baldes.set(chave, balde)
    } catch (err) {
      this.logger.warn(`Falha ao acumular envio do cliente ${e.clienteId}: ${String(err)}`)
    }
  }

  /** Despeja tudo que estiver pendente — o deploy manda SIGTERM e passa por aqui. */
  async onModuleDestroy(): Promise<void> {
    const chaves = [...this.baldes.keys()]
    await Promise.all(chaves.map(c => this.despejar(c)))
  }

  private async despejar(chave: string): Promise<void> {
    const balde = this.baldes.get(chave)
    if (!balde) return
    // Tira do mapa ANTES de mandar: um envio que chegue durante o disparo abre
    // uma leva nova em vez de entrar numa que já está saindo.
    this.baldes.delete(chave)
    clearTimeout(balde.timer)

    try {
      await this.notificacao.disparar({
        evento: 'ARQUIVO_ENVIADO',
        clienteId: balde.clienteId,
        // `roteamento` sempre presente, mesmo com área nula: é ele que diz "é
        // arquivo, e a classificação falhou", e é isso que liga o fallback.
        roteamento: { areaId: balde.areaId },
        linkNoSino: balde.link,
        assunto: this.assunto(balde),
        corpo: this.corpo(balde),
        html: this.html(balde),
        iconeEmail: 'file-plus',
      })
    } catch (err) {
      this.logger.warn(`Falha ao despejar a leva de ${balde.clienteId}: ${String(err)}`)
    }
  }

  private assunto(b: Balde): string {
    const n = b.arquivos.length
    return n === 1
      ? `Novo arquivo de ${b.clienteNome} — ${b.arquivos[0]!.nome}`
      : `${n} novos arquivos de ${b.clienteNome}`
  }

  /**
   * Texto puro — é o que alimenta a mensagem do sino.
   *
   * A primeira linha diz o que aconteceu, porque é só ela que cabe no sino.
   */
  private corpo(b: Balde): string {
    const n = b.arquivos.length
    const quem = b.autores.size ? ` Enviado por ${listar([...b.autores])}.` : ''
    const cabeca = n === 1
      ? `O cliente enviou "${b.arquivos[0]!.nome}"${kb(b.arquivos[0]!.tamanho)} pelo portal.${quem}`
      : `O cliente enviou ${n} arquivos pelo portal.${quem}`
    if (n === 1) return `${cabeca}\nO arquivo está na pasta do cliente, em Gestão de Arquivos.`

    const listados = b.arquivos.slice(0, MAX_NOMES).map(a => `• ${a.nome}${kb(a.tamanho)}`)
    const resto = n - listados.length
    if (resto > 0) listados.push(`• e mais ${resto} arquivo${resto > 1 ? 's' : ''}`)
    return [cabeca, '', ...listados, '', 'Os arquivos estão na pasta do cliente, em Gestão de Arquivos.'].join('\n')
  }

  /** O mesmo conteúdo no shell padrão dos e-mails do sistema. */
  private html(b: Balde): string {
    const n = b.arquivos.length
    const quem = b.autores.size ? listar([...b.autores]) : null
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')

    const linhas = b.arquivos.slice(0, MAX_NOMES).map(a => `
      <tr>
        <td style="padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a">${escapar(a.nome)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;text-align:right;white-space:nowrap">${escapar(kb(a.tamanho).trim().replace(/[()]/g, '')) || '—'}</td>
      </tr>`).join('')
    const resto = n - Math.min(n, MAX_NOMES)
    const maisLinha = resto > 0
      ? `<tr><td colspan="2" style="padding:8px 0 0;font-size:12px;color:#64748b">e mais ${resto} arquivo${resto > 1 ? 's' : ''}</td></tr>`
      : ''

    const intro = n === 1
      ? `<p style="margin:0 0 14px;font-size:14px;color:#334155;line-height:1.55">O cliente enviou um arquivo pelo portal${quem ? `, por <strong>${escapar(quem)}</strong>` : ''}.</p>`
      : `<p style="margin:0 0 14px;font-size:14px;color:#334155;line-height:1.55">O cliente enviou <strong>${n} arquivos</strong> pelo portal${quem ? `, por <strong>${escapar(quem)}</strong>` : ''}.</p>`

    return buildEmailLayout({
      empresaNome: b.escritorioNome,
      logoUrl: null,
      preheader: n === 1
        ? `${b.clienteNome} enviou ${b.arquivos[0]!.nome}`
        : `${b.clienteNome} enviou ${n} arquivos`,
      heroAccent: '#0ea5e9',
      heroTitle: n === 1 ? 'Novo arquivo do cliente' : `${n} novos arquivos do cliente`,
      heroSubtitle: b.clienteNome,
      iconName: 'file-plus',
      bodyHtml: `
        ${intro}
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 6px">
          ${linhas}
          ${maisLinha}
        </table>`,
      ctaLabel: 'Abrir a pasta do cliente',
      ctaUrl: `${base}${b.link}`,
    })
  }
}
