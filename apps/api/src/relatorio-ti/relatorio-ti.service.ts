import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { CriarRelatorioInput, AtualizarRelatorioInput } from '@saas/types'
import { HtmlPdfService } from '../ferramentas/html-pdf.service'
import { JuntarPdfService } from '../ferramentas/juntar-pdf.service'
import { EmailService } from '../common/email.service'

/**
 * Relatórios diários da equipe.
 *
 * A rotina existia fora do sistema: cada um escrevia o seu, mandava para o
 * líder, e o líder repassava à diretoria. Aqui ela ganha um lugar — a equipe
 * posta, todo mundo lê o histórico, e o líder consolida e envia.
 */

/**
 * Onde ficam os anexos.
 *
 * Subpasta própria, com permissão restrita, e NÃO a raiz de `uploads/`: a rota
 * que serve anexos genéricos não pede sessão — a proteção dela é o nome ser
 * impossível de adivinhar. Relatório interno da equipe não deve depender
 * disso, então este módulo serve os arquivos por um caminho próprio, que
 * confere quem está pedindo.
 */
const ARQUIVOS_ROOT = path.resolve(process.cwd(), 'uploads', 'relatorios-ti')

/** Teto do anexo. Relatório é texto; arquivo maior que isso é outra coisa. */
const LIMITE_MB = 20

/** Cargos que lideram o próprio setor — mesma lista do módulo de benefícios. */
const ROLES_LIDER_SETOR = ['GESTOR', 'COORDENADOR', 'DIRETOR']

/** Extensões que o consolidado consegue absorver como texto. */
const EXTENSOES_HTML = ['.html', '.htm']

@Injectable()
export class RelatorioTiService {
  constructor(
    @Inject(HtmlPdfService) private readonly htmlPdf: HtmlPdfService,
    @Inject(JuntarPdfService) private readonly juntarPdf: JuntarPdfService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}
  /**
   * Áreas que a pessoa lidera.
   *
   * Duas fontes, como no módulo de Benefícios Fiscais: o cargo de liderança
   * sobre o próprio setor e o campo "Líder" da área. Assim o painel funciona
   * para o líder de hoje e para o sucessor, sem ninguém tocar em código.
   */
  private async areasLideradas(userId?: string): Promise<string[]> {
    if (!userId) return []
    const ids = new Set<string>()
    const u = await prisma.user.findUnique({
      where: { id: userId }, select: { role: true, areaId: true },
    }).catch(() => null)
    if (u?.areaId && ROLES_LIDER_SETOR.includes(String(u.role))) ids.add(u.areaId)
    const areas = await prisma.area.findMany({
      where: { leaderId: userId, isActive: true }, select: { id: true },
    }).catch(() => [])
    for (const a of areas) ids.add(a.id)
    return [...ids]
  }

  /** Lidera a área da equipe? É o que libera as ações do painel sem permissão explícita. */
  async ehLiderDaEquipe(userId: string | undefined, empresaId?: string | null): Promise<boolean> {
    const cfg = await this.getConfig(empresaId)
    if (!cfg.areaId) return false
    return (await this.areasLideradas(userId)).includes(cfg.areaId)
  }

  // ── Configuração ──────────────────────────────────────────

  async getConfig(empresaId?: string | null) {
    const linha = await prisma.relatorioTiConfig.findFirst({
      where: { empresaId: empresaId ?? null },
    }).catch(() => null)

    return {
      areaId: linha?.areaId ?? null,
      destinatariosIds: linha?.destinatariosIds ?? [],
      destinatariosEmails: linha?.destinatariosEmails ?? [],
      assuntoPadrao: linha?.assuntoPadrao ?? 'Relatórios da TI — {data}',
    }
  }

  async salvarConfig(
    data: { areaId?: string | null; destinatariosIds?: string[]; destinatariosEmails?: string[]; assuntoPadrao?: string | null },
    empresaId?: string | null,
  ) {
    const existente = await prisma.relatorioTiConfig.findFirst({
      where: { empresaId: empresaId ?? null }, select: { id: true },
    }).catch(() => null)

    if (existente) {
      await prisma.relatorioTiConfig.update({ where: { id: existente.id }, data })
    } else {
      await prisma.relatorioTiConfig.create({ data: { ...data, empresaId: empresaId ?? null } })
    }
    return this.getConfig(empresaId)
  }

  /** Quem é cobrado pelo relatório: os ativos da área configurada. */
  async equipe(empresaId?: string | null) {
    const cfg = await this.getConfig(empresaId)
    if (!cfg.areaId) return []
    return prisma.user.findMany({
      where: { areaId: cfg.areaId, isActive: true, ...(empresaId ? { empresaId } : {}) },
      select: { id: true, name: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ── Leitura ───────────────────────────────────────────────

  /**
   * O mês inteiro de uma vez.
   *
   * O calendário precisa saber, por dia, quem postou e se o dia já foi enviado
   * — buscar dia a dia seriam trinta idas ao banco para desenhar uma tela só.
   */
  async mes(ano: number, mes: number, empresaId?: string | null) {
    const inicio = new Date(Date.UTC(ano, mes - 1, 1))
    const fim = new Date(Date.UTC(ano, mes, 1))

    const [relatorios, envios, equipe] = await Promise.all([
      prisma.relatorioDiario.findMany({
        where: { empresaId: empresaId ?? null, data: { gte: inicio, lt: fim } },
        orderBy: [{ data: 'asc' }, { criadoEm: 'asc' }],
        select: {
          id: true, data: true, titulo: true, formato: true, criadoEm: true,
          autor: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.relatorioEnvio.findMany({
        where: { empresaId: empresaId ?? null, data: { gte: inicio, lt: fim } },
        orderBy: { enviadoEm: 'desc' },
        select: { id: true, data: true, enviadoEm: true, destinatarios: true },
      }),
      this.equipe(empresaId),
    ])

    return { relatorios, envios, equipe }
  }

  async dia(data: string, empresaId?: string | null) {
    return prisma.relatorioDiario.findMany({
      where: { empresaId: empresaId ?? null, data: new Date(`${data}T00:00:00.000Z`) },
      orderBy: { criadoEm: 'asc' },
      include: { autor: { select: { id: true, name: true, image: true } } },
    })
  }

  // ── Escrita ───────────────────────────────────────────────

  async criar(input: CriarRelatorioInput, autorId: string, empresaId?: string | null) {
    this.validar(input)

    const relatorio = await prisma.relatorioDiario.create({
      data: {
        empresaId: empresaId ?? null,
        autorId,
        data: new Date(`${input.data}T00:00:00.000Z`),
        titulo: input.titulo,
        formato: input.formato,
        conteudoHtml: input.formato === 'ESCRITO' ? (input.conteudoHtml || '') : null,
      },
    })

    if (input.formato === 'ANEXO') {
      await this.guardarArquivo(relatorio.id, input)
    }

    return prisma.relatorioDiario.findUnique({
      where: { id: relatorio.id },
      include: { autor: { select: { id: true, name: true, image: true } } },
    })
  }

  async atualizar(input: AtualizarRelatorioInput, userId: string, podeTudo: boolean) {
    const atual = await this.meuOuDoLider(input.id, userId, podeTudo)

    // Trocar de formato apaga o que sobrou do anterior: um relatório escrito
    // que virou anexo não pode continuar carregando o texto antigo.
    const trocouFormato = input.formato !== undefined && input.formato !== atual.formato

    await prisma.relatorioDiario.update({
      where: { id: input.id },
      data: {
        ...(input.data !== undefined ? { data: new Date(`${input.data}T00:00:00.000Z`) } : {}),
        ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
        ...(input.formato !== undefined ? { formato: input.formato } : {}),
        ...(input.conteudoHtml !== undefined ? { conteudoHtml: input.conteudoHtml } : {}),
        ...(trocouFormato && input.formato === 'ESCRITO'
          ? { arquivoPath: null, arquivoNome: null, arquivoMime: null, arquivoBytes: null }
          : {}),
      },
    })

    if (input.arquivoBase64) await this.guardarArquivo(input.id, input)

    return prisma.relatorioDiario.findUnique({
      where: { id: input.id },
      include: { autor: { select: { id: true, name: true, image: true } } },
    })
  }

  async remover(id: string, userId: string, podeTudo: boolean) {
    const atual = await this.meuOuDoLider(id, userId, podeTudo)
    if (atual.arquivoPath) {
      await fs.unlink(path.join(ARQUIVOS_ROOT, atual.arquivoPath)).catch(() => undefined)
    }
    await prisma.relatorioDiario.delete({ where: { id } })
    return { ok: true }
  }

  /**
   * Devolve o anexo para o controller servir.
   *
   * O controller é quem confere a sessão; aqui só se resolve o caminho — e o
   * caminho vem do banco, nunca do que o usuário digitou.
   */
  async arquivo(id: string, empresaId?: string | null) {
    const r = await prisma.relatorioDiario.findFirst({
      where: { id, empresaId: empresaId ?? null },
      select: { arquivoPath: true, arquivoNome: true, arquivoMime: true },
    })
    if (!r?.arquivoPath) throw new Error('Este relatório não tem arquivo anexado.')

    const conteudo = await fs.readFile(path.join(ARQUIVOS_ROOT, r.arquivoPath))
    return {
      conteudo,
      nome: r.arquivoNome || 'relatorio',
      mime: r.arquivoMime || 'application/octet-stream',
    }
  }

  // ── Consolidar e enviar ───────────────────────────────────

  /**
   * O dia inteiro num PDF só.
   *
   * Reaproveita as duas ferramentas que já existem, em vez de escrever mais uma
   * geração de PDF: o `consolidar` transforma tudo o que é TEXTO num documento
   * único (com quebra de página entre os relatórios), e o `juntar` costura nele
   * os anexos que já chegaram em PDF.
   *
   * O que não é nem um nem outro — um Word, por exemplo — fica de fora e volta
   * em `naoIncluidos`. Converter mal seria pior do que dizer.
   */
  async consolidarDia(data: string, empresaId?: string | null) {
    const doDia = await this.dia(data, empresaId)
    if (doDia.length === 0) throw new Error('Não há relatórios neste dia.')

    const dataBr = this.formatarData(data)
    const textos: Array<{ nome: string; conteudo: string }> = []
    const pdfs: Array<{ nome: string; base64: string }> = []
    const naoIncluidos: string[] = []

    for (const r of doDia) {
      if (r.formato === 'ESCRITO') {
        textos.push({ nome: r.titulo, conteudo: this.folha(r.autor.name, r.titulo, r.conteudoHtml ?? '') })
        continue
      }

      const ext = path.extname(r.arquivoNome || '').toLowerCase()
      const conteudo = r.arquivoPath
        ? await fs.readFile(path.join(ARQUIVOS_ROOT, r.arquivoPath)).catch(() => null)
        : null
      if (!conteudo) { naoIncluidos.push(`${r.autor.name} — arquivo não encontrado`); continue }

      if (EXTENSOES_HTML.includes(ext)) {
        textos.push({ nome: r.titulo, conteudo: this.folha(r.autor.name, r.titulo, conteudo.toString('utf8')) })
      } else if (ext === '.pdf') {
        pdfs.push({ nome: r.arquivoNome || `${r.autor.name}.pdf`, base64: conteudo.toString('base64') })
      } else {
        naoIncluidos.push(`${r.autor.name} — ${r.arquivoNome} (${ext || 'sem extensão'})`)
      }
    }

    if (textos.length === 0 && pdfs.length === 0) {
      throw new Error('Nenhum relatório deste dia pôde entrar no PDF.')
    }

    const nomeSaida = `relatorios-ti-${data}`
    const partes: Array<{ nome: string; base64: string }> = []

    if (textos.length > 0) {
      // Capa antes de tudo: quem abre o PDF precisa saber de que dia ele é e
      // de quem são as folhas, sem ter de procurar.
      const capa = { nome: 'Capa', conteudo: this.capa(dataBr, doDia.map(r => r.autor.name)) }
      const pdf = await this.htmlPdf.consolidar([capa, ...textos], nomeSaida)
      partes.push({ nome: pdf.nome, base64: pdf.base64 })
    }
    for (const p of pdfs) partes.push(p)

    const final = partes.length === 1 ? partes[0]! : await this.juntarPdf.juntar(partes, nomeSaida)

    return {
      nome: `${nomeSaida}.pdf`,
      base64: final.base64,
      naoIncluidos,
      relatorioIds: doDia.map(r => r.id),
    }
  }

  /**
   * Manda o consolidado para a diretoria e registra o envio.
   *
   * O registro é o que deixa o painel dizer "enviado por Fulano às 18h02" — sem
   * ele, reenviar vira dúvida e ninguém sabe se o dia já foi repassado.
   */
  async enviarDiretoria(
    input: { data: string; destinatarios?: string[]; assunto?: string; mensagem?: string },
    userId: string,
    empresaId?: string | null,
  ) {
    const cfg = await this.getConfig(empresaId)
    const dataBr = this.formatarData(input.data)

    const destinatarios = input.destinatarios?.length
      ? input.destinatarios
      : await this.destinatariosPadrao(cfg)
    if (destinatarios.length === 0) {
      throw new Error('Nenhum destinatário. Configure a diretoria antes de enviar.')
    }

    const pdf = await this.consolidarDia(input.data, empresaId)
    const assunto = (input.assunto || cfg.assuntoPadrao || 'Relatórios da TI — {data}')
      .replace('{data}', dataBr)

    const enviado = await this.email.sendMail({
      to: destinatarios,
      subject: assunto,
      html: this.corpoEmail(dataBr, input.mensagem, pdf.naoIncluidos),
      attachments: [{ filename: pdf.nome, content: Buffer.from(pdf.base64, 'base64') }],
    })
    if (!enviado) {
      throw new Error('O servidor de e-mail recusou o envio. Confira as configurações de e-mail.')
    }

    await prisma.relatorioEnvio.create({
      data: {
        empresaId: empresaId ?? null,
        data: new Date(`${input.data}T00:00:00.000Z`),
        assunto,
        pdfNome: pdf.nome,
        destinatarios,
        relatorioIds: pdf.relatorioIds,
        enviadoPorId: userId,
      },
    })

    return { ok: true, destinatarios, naoIncluidos: pdf.naoIncluidos }
  }

  /** Envios já feitos num dia. */
  async enviosDoDia(data: string, empresaId?: string | null) {
    return prisma.relatorioEnvio.findMany({
      where: { empresaId: empresaId ?? null, data: new Date(`${data}T00:00:00.000Z`) },
      orderBy: { enviadoEm: 'desc' },
    })
  }

  /** E-mails da configuração: usuários escolhidos + endereços avulsos. */
  private async destinatariosPadrao(cfg: { destinatariosIds: string[]; destinatariosEmails: string[] }) {
    const users = cfg.destinatariosIds.length > 0
      ? await prisma.user.findMany({
        where: { id: { in: cfg.destinatariosIds }, isActive: true },
        select: { email: true },
      }).catch(() => [])
      : []
    return [...new Set([...users.map(u => u.email), ...cfg.destinatariosEmails].filter(Boolean))]
  }

  private formatarData(data: string) {
    const [ano, mes, dia] = data.split('-')
    return `${dia}/${mes}/${ano}`
  }

  /** Cabeçalho de cada relatório dentro do consolidado — diz de quem é a folha. */
  private folha(autor: string, titulo: string, corpo: string) {
    return '<div style="font-family:Inter,system-ui,sans-serif">'
      + '<div style="border-bottom:2px solid #22d3ee;padding-bottom:6px;margin-bottom:14px">'
      + `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b">${this.escapar(autor)}</div>`
      + `<div style="font-size:17px;font-weight:700;color:#0f172a">${this.escapar(titulo)}</div>`
      + '</div>' + corpo + '</div>'
  }

  private capa(dataBr: string, autores: string[]) {
    const nomes = [...new Set(autores)].map(n => this.escapar(n)).join('<br>')
    return '<div style="font-family:Inter,system-ui,sans-serif;padding:60px 0;text-align:center">'
      + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#64748b">Relatórios da TI</div>'
      + `<div style="font-size:34px;font-weight:800;color:#0f172a;margin:8px 0 26px">${dataBr}</div>`
      + `<div style="font-size:13px;color:#334155;line-height:2">${nomes}</div></div>`
  }

  private corpoEmail(dataBr: string, mensagem?: string, naoIncluidos: string[] = []) {
    const fora = naoIncluidos.length > 0
      ? `<p style="color:#92400e;font-size:12.5px">Não entraram no PDF (formato não suportado):<br>${naoIncluidos.map(n => this.escapar(n)).join('<br>')}</p>`
      : ''
    return '<div style="font-family:Inter,system-ui,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">'
      + `<p>Segue em anexo o consolidado dos relatórios da TI de <b>${dataBr}</b>.</p>`
      + (mensagem ? `<div style="margin:14px 0">${mensagem}</div>` : '')
      + fora
      + '<p style="color:#64748b;font-size:12px;margin-top:22px">Enviado pelo OneClick.</p></div>'
  }

  /** O nome vem do cadastro, mas cabeçalho de PDF não é lugar de confiar em texto alheio. */
  private escapar(t: string) {
    return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))
  }

  // ── Apoio ─────────────────────────────────────────────────

  private validar(input: { formato: string; conteudoHtml?: string | null; arquivoBase64?: string | null }) {
    if (input.formato === 'ESCRITO') {
      const texto = (input.conteudoHtml || '').replace(/<[^>]*>/g, '').trim()
      if (!texto) throw new Error('Escreva o relatório antes de publicar.')
      return
    }
    if (!input.arquivoBase64) throw new Error('Anexe o arquivo do relatório.')
    // Base64 infla ~33%: o teto olha o tamanho real do arquivo.
    const mb = (input.arquivoBase64.length * 0.75) / (1024 * 1024)
    if (mb > LIMITE_MB) throw new Error(`O arquivo passa de ${LIMITE_MB} MB.`)
  }

  private async guardarArquivo(
    id: string,
    input: { arquivoBase64?: string | null; arquivoNome?: string | null; arquivoMime?: string | null },
  ) {
    if (!input.arquivoBase64) return

    // A extensão vem do nome informado, e o nome do arquivo em disco é o id —
    // assim nada do que o usuário digitou vira caminho.
    const ext = path.extname(input.arquivoNome || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10)
    const arquivoPath = `${id}${ext || '.bin'}`
    const conteudo = Buffer.from(input.arquivoBase64, 'base64')

    await fs.mkdir(ARQUIVOS_ROOT, { recursive: true })
    await fs.writeFile(path.join(ARQUIVOS_ROOT, arquivoPath), conteudo, { mode: 0o600 })

    await prisma.relatorioDiario.update({
      where: { id },
      data: {
        arquivoPath,
        arquivoNome: input.arquivoNome || arquivoPath,
        arquivoMime: input.arquivoMime || null,
        arquivoBytes: conteudo.length,
      },
    })
  }

  /** Mexer no relatório é de quem o escreveu — ou de quem lidera a equipe. */
  private async meuOuDoLider(id: string, userId: string, podeTudo: boolean) {
    const atual = await prisma.relatorioDiario.findUnique({
      where: { id },
      select: { id: true, autorId: true, formato: true, arquivoPath: true },
    })
    if (!atual) throw new Error('Relatório não encontrado.')
    if (atual.autorId !== userId && !podeTudo) {
      throw new Error('Este relatório é de outra pessoa.')
    }
    return atual
  }
}
