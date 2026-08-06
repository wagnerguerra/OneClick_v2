import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as path from 'path'
import * as fs from 'fs/promises'
import type { CriarRelatorioInput, AtualizarRelatorioInput } from '@saas/types'

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

@Injectable()
export class RelatorioTiService {
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
