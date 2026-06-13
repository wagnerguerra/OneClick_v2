import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type {
  CreateClausulaInput,
  UpdateClausulaInput,
  CreateContratoTemplateInput,
  CreateContratoInput,
  AssinarWebPkiInput,
} from '@saas/types'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { PdfSignService } from './pdf-sign.service'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

/** Escapa caracteres especiais HTML pra evitar quebras de layout/template injection. */
function escapeHtmlAttr(s: string): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

@Injectable()
export class ContratoService {
  constructor(private readonly pdfSign: PdfSignService) {}
  // ════════════════════════════════════════════════════════════
  // CLÁUSULAS — versionamento
  // ════════════════════════════════════════════════════════════

  /**
   * Lista todas as cláusulas, agrupadas por código (apenas a versão mais
   * recente publicada de cada código aparece por padrão). Use
   * includeAllVersions para ver o histórico completo.
   */
  async listClausulas(opts?: { includeAllVersions?: boolean; categoria?: string; empresaId?: string }) {
    const where: any = {}
    if (opts?.empresaId) where.empresaId = opts.empresaId
    if (opts?.categoria) where.categoria = opts.categoria

    const all = await (prisma as any).clausula.findMany({
      where,
      orderBy: [{ categoria: 'asc' }, { codigo: 'asc' }, { versao: 'desc' }],
    })

    if (opts?.includeAllVersions) return all

    // Apenas a versão mais recente de cada código
    const seen = new Set<string>()
    const out: any[] = []
    for (const c of all) {
      if (seen.has(c.codigo)) continue
      seen.add(c.codigo)
      out.push(c)
    }
    return out
  }

  /** Lista todas as versões de um código específico (histórico). */
  async listClausulaVersoes(codigo: string) {
    return (prisma as any).clausula.findMany({
      where: { codigo },
      orderBy: { versao: 'desc' },
    })
  }

  async getClausula(id: string) {
    const c = await (prisma as any).clausula.findUnique({ where: { id } })
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cláusula não encontrada' })
    return c
  }

  /** Cria a primeira versão de uma cláusula. Código deve ser único. */
  async createClausula(input: CreateClausulaInput, empresaId?: string) {
    const existing = await (prisma as any).clausula.findFirst({ where: { codigo: input.codigo } })
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: `Já existe cláusula com código "${input.codigo}". Use updateClausula para criar nova versão.` })
    }
    return (prisma as any).clausula.create({
      data: {
        codigo: input.codigo,
        versao: 1,
        titulo: input.titulo,
        conteudo: input.conteudo || '',
        categoria: input.categoria,
        parentId: input.parentId || null,
        ordem: input.ordem,
        publicada: input.publicada,
        publicadaEm: input.publicada ? new Date() : null,
        notasVersao: input.notasVersao || null,
        empresaId: empresaId || null,
      },
    })
  }

  /**
   * "Editar" uma cláusula = criar nova versão. A versão antiga continua
   * existindo (e os snapshots de contratos antigos a referenciam), mas a
   * nova versão é a que entra em novos contratos quando publicada.
   */
  async updateClausula(id: string, input: UpdateClausulaInput) {
    const atual = await this.getClausula(id)

    // Próxima versão = max(versao) + 1 para o mesmo código
    const max = await (prisma as any).clausula.aggregate({
      where: { codigo: atual.codigo },
      _max: { versao: true },
    })
    const novaVersao = (max._max.versao || atual.versao) + 1

    const nova = await (prisma as any).clausula.create({
      data: {
        codigo: atual.codigo,
        versao: novaVersao,
        titulo: input.titulo ?? atual.titulo,
        conteudo: input.conteudo ?? atual.conteudo,
        categoria: input.categoria ?? atual.categoria,
        parentId: input.parentId !== undefined ? input.parentId : atual.parentId,
        ordem: input.ordem ?? atual.ordem,
        publicada: input.publicada ?? false,
        publicadaEm: input.publicada ? new Date() : null,
        notasVersao: input.notasVersao || null,
        empresaId: atual.empresaId,
      },
    })

    // Se a nova versão foi publicada, despublica todas as anteriores do mesmo código
    if (nova.publicada) {
      await (prisma as any).clausula.updateMany({
        where: { codigo: atual.codigo, id: { not: nova.id } },
        data: { publicada: false },
      })
    }
    return nova
  }

  /**
   * "Excluir" cláusula = despublicar todas as versões. Não remove fisicamente
   * pois os snapshots de contratos antigos podem fazer referência. A FK em
   * snapshot é onDelete: Restrict para garantir.
   */
  async deleteClausula(codigo: string) {
    const result = await (prisma as any).clausula.updateMany({
      where: { codigo },
      data: { publicada: false },
    })
    return { despublicadas: result.count }
  }

  /** Publica explicitamente uma versão (despublicando outras). */
  async publicarClausula(id: string) {
    const c = await this.getClausula(id)
    await (prisma as any).clausula.updateMany({
      where: { codigo: c.codigo, id: { not: id } },
      data: { publicada: false },
    })
    return (prisma as any).clausula.update({
      where: { id },
      data: { publicada: true, publicadaEm: new Date() },
    })
  }

  // ════════════════════════════════════════════════════════════
  // TEMPLATES DE CONTRATO
  // ════════════════════════════════════════════════════════════

  async listTemplates(empresaId?: string) {
    return (prisma as any).contratoTemplate.findMany({
      where: empresaId ? { empresaId } : {},
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      include: {
        clausulas: {
          orderBy: { ordem: 'asc' },
          include: { clausula: { select: { id: true, codigo: true, versao: true, titulo: true, categoria: true } } },
        },
        _count: { select: { contratos: true } },
      },
    })
  }

  async getTemplate(id: string) {
    const t = await (prisma as any).contratoTemplate.findUnique({
      where: { id },
      include: {
        clausulas: {
          orderBy: { ordem: 'asc' },
          include: { clausula: true },
        },
      },
    })
    if (!t) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' })
    return t
  }

  async createTemplate(input: CreateContratoTemplateInput, empresaId?: string) {
    return (prisma as any).contratoTemplate.create({
      data: {
        nome: input.nome,
        descricao: input.descricao || null,
        regimeTributario: input.regimeTributario || null,
        temIE: input.temIE,
        comMovimento: input.comMovimento,
        ativo: input.ativo ?? true,
        empresaId: empresaId || null,
      },
    })
  }

  async updateTemplate(id: string, input: Partial<CreateContratoTemplateInput>) {
    return (prisma as any).contratoTemplate.update({ where: { id }, data: input as any })
  }

  async deleteTemplate(id: string) {
    return (prisma as any).contratoTemplate.update({ where: { id }, data: { ativo: false } })
  }

  /**
   * Duplica um template existente: copia todos os metadados (regime, IE, etc.)
   * e cria nova lista de ContratoTemplateClausula apontando para as mesmas
   * clausulaIds (mantém a versão fixada quando aplicável).
   * O nome ganha sufixo " (Cópia)" — incrementa se já existir.
   */
  async duplicateTemplate(id: string, opts?: { nome?: string; empresaId?: string }) {
    const original = await this.getTemplate(id)

    // Resolve nome único
    let nomeNovo = opts?.nome?.trim() || `${original.nome} (Cópia)`
    let suffix = 2
    while (await (prisma as any).contratoTemplate.findFirst({ where: { nome: nomeNovo, empresaId: opts?.empresaId ?? null } })) {
      nomeNovo = `${original.nome} (Cópia ${suffix})`
      suffix++
      if (suffix > 50) break  // segurança
    }

    return prisma.$transaction(async (tx) => {
      const novo = await (tx as any).contratoTemplate.create({
        data: {
          nome: nomeNovo,
          descricao: original.descricao ? `${original.descricao} (duplicado de ${original.nome})` : `Duplicado de ${original.nome}`,
          regimeTributario: original.regimeTributario,
          temIE: original.temIE,
          comMovimento: original.comMovimento,
          ativo: original.ativo,
          empresaId: opts?.empresaId ?? original.empresaId,
        },
      })
      if (original.clausulas?.length > 0) {
        await (tx as any).contratoTemplateClausula.createMany({
          data: original.clausulas.map((tc: any) => ({
            templateId: novo.id,
            clausulaId: tc.clausulaId,
            ordem: tc.ordem,
            fixaVersao: tc.fixaVersao,
          })),
        })
      }
      return novo
    })
  }

  /** Substitui a lista de cláusulas do template por uma nova ordem completa. */
  async setTemplateClausulas(templateId: string, clausulas: Array<{ clausulaId: string; ordem: number; fixaVersao: boolean }>) {
    await (prisma as any).contratoTemplateClausula.deleteMany({ where: { templateId } })
    if (clausulas.length === 0) return { count: 0 }
    return (prisma as any).contratoTemplateClausula.createMany({
      data: clausulas.map((c) => ({ templateId, ...c })),
    })
  }

  // ════════════════════════════════════════════════════════════
  // VÍNCULO Servico → Cláusulas (códigos)
  // ════════════════════════════════════════════════════════════

  async getServicoClausulas(servicoId: string) {
    return (prisma as any).servicoClausula.findMany({
      where: { servicoId },
      orderBy: { ordem: 'asc' },
    })
  }

  async setServicoClausulas(servicoId: string, codigos: string[]) {
    await (prisma as any).servicoClausula.deleteMany({ where: { servicoId } })
    if (codigos.length === 0) return { count: 0 }
    return (prisma as any).servicoClausula.createMany({
      data: codigos.map((codigo, i) => ({ servicoId, clausulaCodigo: codigo, ordem: i })),
    })
  }

  // ════════════════════════════════════════════════════════════
  // CONTRATOS (instâncias)
  // ════════════════════════════════════════════════════════════

  async listContratos(opts?: { empresaId?: string; status?: string; clienteId?: string }) {
    const where: any = {}
    if (opts?.empresaId) where.empresaId = opts.empresaId
    if (opts?.status) where.status = opts.status
    if (opts?.clienteId) where.clienteId = opts.clienteId
    return (prisma as any).contrato.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        template: { select: { id: true, nome: true } },
        _count: { select: { assinaturas: true, servicos: true } },
      },
    })
  }

  async getContrato(id: string) {
    const c = await (prisma as any).contrato.findUnique({
      where: { id },
      include: {
        cliente: true,
        template: true,
        orcamento: { select: { id: true, numero: true, totalGeral: true } },
        snapshots: { orderBy: { ordem: 'asc' } },
        servicos: { include: { servico: { select: { id: true, nome: true, categoria: true } } } },
        assinaturas: { orderBy: { assinadoEm: 'desc' } },
        eventos: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contrato não encontrado' })
    return c
  }

  /**
   * Busca por token público (rota pública para o cliente assinar).
   */
  async getContratoByToken(token: string) {
    const c = await (prisma as any).contrato.findUnique({
      where: { token },
      include: {
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        template: { select: { nome: true } },
        snapshots: { orderBy: { ordem: 'asc' } },
        assinaturas: { select: { id: true, parte: true, tipo: true, signatarioNome: true, assinadoEm: true } },
      },
    })
    if (!c) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contrato não encontrado' })
    return c
  }

  /**
   * Cria um contrato a partir de um template, gerando os snapshots das
   * cláusulas (versão publicada mais recente de cada código). Se um
   * orçamento for fornecido, também cria os ContratoServico a partir dos
   * itens SERVICO do orçamento.
   */
  async createContrato(input: CreateContratoInput, empresaId?: string) {
    // 1. Snapshot dos dados do cliente (se não foram passados explicitamente)
    const cliente = await prisma.cliente.findUnique({ where: { id: input.clienteId } })
    if (!cliente) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado' })

    // 2. Buscar template + suas cláusulas + as cláusulas dos serviços vinculados
    const template = await this.getTemplate(input.templateId)

    // Códigos das cláusulas dos serviços (se houver) que devem ser incluídas
    let clausulasServicos: string[] = []
    if (input.servicoIds && input.servicoIds.length > 0) {
      const sc = await (prisma as any).servicoClausula.findMany({
        where: { servicoId: { in: input.servicoIds } },
        orderBy: { ordem: 'asc' },
      })
      clausulasServicos = Array.from(new Set(sc.map((x: any) => x.clausulaCodigo)))
    }

    // Resolver cláusulas finais: template (com versão fixa ou flutuante) + cláusulas dos serviços (sempre flutuante)
    const snapshots: Array<{ codigo: string; versao: number; titulo: string; conteudo: string; categoria: string; ordem: number; clausulaId: string }> = []

    // 2a. Cláusulas do template
    let ordemCounter = 0
    for (const tc of template.clausulas) {
      let cl: any
      if (tc.fixaVersao) {
        cl = tc.clausula
      } else {
        // Busca versão publicada mais recente daquele código
        cl = await (prisma as any).clausula.findFirst({
          where: { codigo: tc.clausula.codigo, publicada: true },
          orderBy: { versao: 'desc' },
        })
        if (!cl) cl = tc.clausula  // fallback para a versão amarrada
      }
      snapshots.push({
        clausulaId: cl.id,
        codigo: cl.codigo,
        versao: cl.versao,
        titulo: cl.titulo,
        conteudo: cl.conteudo,
        categoria: cl.categoria,
        ordem: tc.ordem ?? ordemCounter++,
      })
    }

    // 2b. Cláusulas dos serviços (que ainda não estão no template)
    const codigosNoTemplate = new Set(snapshots.map((s) => s.codigo))
    for (const codigo of clausulasServicos) {
      if (codigosNoTemplate.has(codigo)) continue
      const cl = await (prisma as any).clausula.findFirst({
        where: { codigo, publicada: true },
        orderBy: { versao: 'desc' },
      })
      if (!cl) continue
      snapshots.push({
        clausulaId: cl.id,
        codigo: cl.codigo,
        versao: cl.versao,
        titulo: cl.titulo,
        conteudo: cl.conteudo,
        categoria: cl.categoria,
        ordem: 1000 + snapshots.length, // jogados no fim, ordem por inserção
      })
    }

    // 3. Snapshot dos serviços (nome) para audit trail
    let servicosData: Array<{ servicoId: string; nomeServico: string; categoria: string | null; ordem: number }> = []
    if (input.servicoIds && input.servicoIds.length > 0) {
      const servicos = await (prisma as any).servico.findMany({ where: { id: { in: input.servicoIds } } })
      servicosData = servicos.map((s: any, i: number) => ({
        servicoId: s.id,
        nomeServico: s.nome,
        categoria: s.categoria || null,
        ordem: i,
      }))
    }

    // 4. Criar contrato + snapshots + servicos numa transaction
    const contrato = await prisma.$transaction(async (tx) => {
      const c = await (tx as any).contrato.create({
        data: {
          clienteId: input.clienteId,
          templateId: input.templateId,
          orcamentoId: input.orcamentoId || null,
          dataInicio: input.dataInicio ? new Date(input.dataInicio) : null,
          dataFim: input.dataFim ? new Date(input.dataFim) : null,
          prazoAvisoDias: input.prazoAvisoDias,
          honorarioMensal: input.honorarioMensal ?? null,
          honorarioFormaPagamento: input.honorarioFormaPagamento || null,
          diaVencimento: input.diaVencimento ?? null,
          observacoes: input.observacoes || null,
          responsavelId: input.responsavelId || null,
          contratanteRazaoSocial: input.contratanteRazaoSocial || cliente.razaoSocial,
          contratanteCnpj: input.contratanteCnpj || cliente.documento,
          contratanteEndereco: input.contratanteEndereco || [cliente.endereco, cliente.cidade, cliente.estado].filter(Boolean).join(', ') || null,
          contratanteRepresentante: input.contratanteRepresentante || null,
          contratanteCpfRep: input.contratanteCpfRep || null,
          empresaId: empresaId || null,
        },
      })

      if (snapshots.length > 0) {
        await (tx as any).contratoClausulaSnapshot.createMany({
          data: snapshots.map((s) => ({ contratoId: c.id, ...s })),
        })
      }
      if (servicosData.length > 0) {
        await (tx as any).contratoServico.createMany({
          data: servicosData.map((s) => ({ contratoId: c.id, ...s })),
        })
      }
      await (tx as any).contratoEvento.create({
        data: { contratoId: c.id, tipo: 'criado', descricao: 'Contrato criado em rascunho' },
      })
      return c
    })

    return contrato
  }

  async updateContrato(id: string, input: any) {
    return (prisma as any).contrato.update({ where: { id }, data: input })
  }

  // ════════════════════════════════════════════════════════════
  // GERAÇÃO DE PDF (puppeteer)
  // ════════════════════════════════════════════════════════════

  /**
   * Substitui placeholders no formato {{caminho.campo}} pelos dados do
   * contrato + cliente + honorário. Tolerante a campos ausentes.
   */
  private renderPlaceholders(html: string, ctx: any): string {
    const map: Record<string, string> = {
      'cliente.razao_social': ctx.contratanteRazaoSocial || ctx.cliente?.razaoSocial || '',
      'cliente.cnpj': ctx.contratanteCnpj || ctx.cliente?.documento || '',
      'cliente.endereco': ctx.contratanteEndereco || '',
      'cliente.representante': ctx.contratanteRepresentante || '',
      'cliente.cpf_rep': ctx.contratanteCpfRep || '',
      'contrato.numero': String(ctx.numero || '').padStart(5, '0'),
      'contrato.data_inicio': ctx.dataInicio ? new Date(ctx.dataInicio).toLocaleDateString('pt-BR') : '___/___/_____',
      'contrato.data_fim': ctx.dataFim ? new Date(ctx.dataFim).toLocaleDateString('pt-BR') : 'prazo indeterminado',
      'honorario.valor': ctx.honorarioMensal ? Number(ctx.honorarioMensal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ ____,__',
      'honorario.forma_pagamento': ctx.honorarioFormaPagamento || '',
      'honorario.dia_vencimento': ctx.diaVencimento ? `dia ${ctx.diaVencimento}` : 'dia ____',
    }
    return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => map[k] ?? `{{${k}}}`)
  }

  /**
   * Monta o HTML completo do contrato a partir dos snapshots, ordenados
   * pela hierarquia (raiz primeiro, filhos abaixo de cada pai).
   */
  /**
   * Tenta carregar uma imagem como data-URI base64 a partir de uma URL.
   * Aceita 3 formas:
   *   1. URL absoluta (ex: http://localhost:4000/api/upload/xxx.png) → primeiro
   *      tenta filesystem (apps/api/uploads), depois HTTP
   *   2. Caminho relativo começando com `/` (ex: `/marca-dagua.png`) → resolve
   *      em `apps/web/public/` (assets estáticos do frontend)
   *   3. null/undefined → retorna null
   * Sempre falha graciosa pra não bloquear a geração do PDF.
   */
  private async loadImageAsDataUri(url: string | null | undefined): Promise<string | null> {
    if (!url) return null
    try {
      // Caso 2: caminho relativo "/xyz.png" → asset do frontend (apps/web/public)
      if (url.startsWith('/') && !url.startsWith('/api/')) {
        const safe = url.replace(/^\//, '').replace(/[^a-zA-Z0-9._/\-]/g, '')
        const webPublic = path.resolve(process.cwd(), '..', 'web', 'public', safe)
        try {
          const buf = await fs.readFile(webPublic)
          return this.bufferToDataUri(buf, safe)
        } catch { /* sem fallback público — segue */ }
      }
      // Caso 1a: /api/upload/xxx → tenta no filesystem da API
      const relMatch = url.match(/\/api\/upload\/([^/?#]+)$/)
      if (relMatch?.[1]) {
        const filename = relMatch[1].replace(/[^a-zA-Z0-9._-]/g, '')
        const localPath = path.join(UPLOADS_DIR, filename)
        try {
          const buf = await fs.readFile(localPath)
          return this.bufferToDataUri(buf, filename)
        } catch { /* tenta via HTTP abaixo */ }
      }
      // Caso 1b: HTTP genérico
      const res = await fetch(url)
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      const mime = res.headers.get('content-type') || 'image/png'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  }

  private bufferToDataUri(buf: Buffer, filename: string): string {
    const ext = (filename.split('.').pop() || 'png').toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  }

  /**
   * Busca a empresa contratante (do contrato) pra puxar logo + marca d'água.
   * Fallback: primeira empresa ativa cadastrada.
   */
  private async getEmpresaParaPdf(empresaId: string | null | undefined): Promise<any | null> {
    if (empresaId) {
      const e = await prisma.empresa.findUnique({ where: { id: empresaId } })
      if (e) return e
    }
    return prisma.empresa.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  }

  /**
   * HTML da PÁGINA DE ROSTO (capa) do contrato. Usada em PDF separado pra
   * não receber o rodapé de numeração de páginas.
   */
  buildCoverHtml(c: any, opts?: { logoDataUri?: string | null; watermarkDataUri?: string | null; empresa?: any | null }): string {
    const empresa = opts?.empresa || null
    const empresaNome = empresa?.razaoSocial || empresa?.nomeFantasia || 'CONTRATADA'
    const accentColor = '#fb7185'
    const dataEmissao = new Date(c.createdAt || Date.now()).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    const cidade = empresa?.cidade || 'Serra'
    const uf = empresa?.uf || 'ES'

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font-family: 'Times New Roman', Georgia, serif;
    color: #111;
    width: 210mm;
    height: 297mm;
    position: relative;
    overflow: hidden;
  }
  .cover {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 30mm 22mm;
    box-sizing: border-box;
    position: relative;
  }
  /* Marca d'água */
  .cover .watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    max-width: 520px;
    aspect-ratio: 1 / 1;
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    opacity: 0.07;
    z-index: 0;
  }
  .cover .content { position: relative; z-index: 1; }
  .cover .logo-wrap { margin-bottom: 32mm; }
  .cover .logo-wrap img {
    max-height: 120px;
    max-width: 380px;
    object-fit: contain;
  }
  .cover .empresa-fallback {
    font-size: 18pt;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .cover .accent-bar {
    width: 60px;
    height: 4px;
    background: ${accentColor};
    margin: 0 auto 16px auto;
  }
  .cover .titulo {
    font-size: 24pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 8px 0;
    line-height: 1.15;
  }
  .cover .subtitulo {
    font-size: 11pt;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    margin-bottom: 28mm;
    font-family: Arial, sans-serif;
  }
  .cover .numero-contrato {
    font-size: 14pt;
    color: ${accentColor};
    font-weight: 700;
    letter-spacing: 0.1em;
    font-family: 'Courier New', monospace;
    margin-bottom: 16mm;
  }
  .cover .partes-info {
    border-top: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 12mm 0;
    width: 100%;
    max-width: 140mm;
  }
  .cover .partes-info .label {
    font-size: 8pt;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-family: Arial, sans-serif;
    margin-bottom: 6px;
  }
  .cover .partes-info .valor {
    font-size: 13pt;
    font-weight: 600;
    color: #1a1a1a;
    line-height: 1.4;
    margin-bottom: 14px;
  }
  .cover .partes-info .valor:last-child { margin-bottom: 0; }
  .cover .partes-info .doc {
    font-size: 10pt;
    color: #555;
    font-family: 'Courier New', monospace;
    letter-spacing: 0.05em;
    font-weight: normal;
    margin-top: 2px;
  }
  .cover .footer-cover {
    position: absolute;
    bottom: 22mm;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 11pt;
    color: #4b5563;
    z-index: 1;
    font-family: 'Times New Roman', Georgia, serif;
  }
  .cover .footer-cover strong { color: #1a1a1a; }
</style>
</head>
<body>
  <div class="cover">
    ${opts?.watermarkDataUri ? `<div class="watermark" style="background-image: url('${opts.watermarkDataUri}');"></div>` : ''}

    <div class="content">
      <div class="logo-wrap">
        ${opts?.logoDataUri
          ? `<img src="${opts.logoDataUri}" alt="${escapeHtmlAttr(empresaNome)}" />`
          : `<p class="empresa-fallback">${escapeHtmlAttr(empresaNome)}</p>`
        }
      </div>

      <div class="accent-bar"></div>
      <h1 class="titulo">Contrato de<br/>Prestação de Serviços</h1>
      <div class="subtitulo">${escapeHtmlAttr(c.template?.nome || 'Serviços Contábeis')}</div>

      <div class="numero-contrato">Nº ${String(c.numero).padStart(5, '0')}</div>

      <div class="partes-info">
        <div class="label">Contratante</div>
        <div class="valor">
          ${escapeHtmlAttr(c.contratanteRazaoSocial || c.cliente?.razaoSocial || '')}
          ${(c.contratanteCnpj || c.cliente?.documento) ? `<div class="doc">CNPJ ${c.contratanteCnpj || c.cliente?.documento}</div>` : ''}
        </div>
      </div>
    </div>

    <div class="footer-cover">
      ${escapeHtmlAttr(cidade)}/${escapeHtmlAttr(uf)}, <strong>${dataEmissao}</strong>
    </div>
  </div>
</body>
</html>`
  }

  buildContratoHtml(c: any, opts?: { logoDataUri?: string | null; watermarkDataUri?: string | null; empresa?: any | null }): string {
    const snapshots = (c.snapshots || []).slice().sort((a: any, b: any) => a.ordem - b.ordem)

    // Agrupa por categoria mantendo ordem original
    const byCat = new Map<string, any[]>()
    for (const s of snapshots) {
      if (!byCat.has(s.categoria)) byCat.set(s.categoria, [])
      byCat.get(s.categoria)!.push(s)
    }

    const sections = Array.from(byCat.entries()).map(([cat, items], catIdx) => {
      const itemsHtml = items
        .map((s: any) => `
          <div class="clausula">
            <h3>${s.titulo}</h3>
            <div class="clausula-conteudo">${this.renderPlaceholders(s.conteudo, c)}</div>
          </div>
        `)
        .join('')
      return `
        <section class="categoria">
          <h2>CLÁUSULA ${catIdx + 1}ª — ${cat.replace(/_/g, ' ')}</h2>
          ${itemsHtml}
        </section>
      `
    }).join('')

    // Mapeia cada parte (CONTRATADA / CONTRATANTE) para a assinatura correspondente.
    // Renderiza o selo digital se houver, ou linha pontilhada de "aguardando".
    const assinaturasArr = (c.assinaturas || []) as any[]
    const assinaturaContratada = assinaturasArr.find((a) => a.parte === 'CONTRATADA')
    const assinaturaContratante = assinaturasArr.find((a) => a.parte === 'CONTRATANTE')

    const renderBlocoAssinatura = (parte: 'CONTRATADA' | 'CONTRATANTE', a: any | undefined): string => {
      if (!a) {
        return `
          <div class="assinatura-bloco">
            <div class="linha"></div>
            <p class="parte-label">${parte}</p>
            <p style="font-size: 8pt; color: #999;">Aguardando assinatura</p>
          </div>
        `
      }
      // Identifica AC e URL de verificação por tipo
      const tipoMap: Record<string, { badge: string; verify: string; label: string }> = {
        SERVER:    { badge: 'CRC',    verify: 'http://central-rnc.com.br/validar-assinatura', label: 'ASSINADO DIGITALMENTE' },
        WEBPKI:    { badge: 'ICP-BR', verify: 'http://validar.iti.gov.br',                     label: 'ASSINADO DIGITALMENTE' },
        GOVBR:     { badge: 'GOV.BR', verify: 'https://assinatura.iti.br/validar',             label: 'ASSINADO DIGITALMENTE' },
        SERPROID:  { badge: 'SERPRO', verify: 'http://serpro.gov.br/br/assinador-digital',     label: 'ASSINADO DIGITALMENTE' },
        ACEITE:    { badge: 'ACEITE', verify: '',                                              label: 'ACEITE ELETRÔNICO' },
      }
      const meta = tipoMap[a.tipo as string] || tipoMap.SERVER!

      // CPF mostra com máscara, CNPJ idem
      const docFormatado = a.signatarioDoc
        ? (a.signatarioDoc.length === 11
            ? a.signatarioDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            : a.signatarioDoc.length === 14
              ? a.signatarioDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
              : a.signatarioDoc)
        : null
      const docLabel = a.signatarioDoc?.length === 14 ? 'CNPJ' : 'CPF'

      return `
        <div class="assinatura-bloco">
          <p class="parte-label">${parte}</p>
          <div class="selo-digital">
            <div class="selo-header">${meta.label}</div>
            <div class="selo-body">
              <div class="selo-content">
                <div class="selo-nome">${escapeHtmlAttr(a.signatarioNome || '')}</div>
                ${docFormatado ? `
                  <div class="selo-doc-label">${docLabel}</div>
                  <div class="selo-doc-value">${docFormatado}</div>
                ` : ''}
                <div class="selo-data">Assinado em ${new Date(a.assinadoEm).toLocaleString('pt-BR')}</div>
                ${meta.verify ? `
                  <div class="selo-verify">
                    A conformidade da assinatura pode ser verificada em:<br />
                    <a href="${meta.verify}">${meta.verify.replace(/^https?:\/\//, '')}</a>
                  </div>
                ` : ''}
              </div>
              <div class="selo-badge">${meta.badge}</div>
            </div>
          </div>
        </div>
      `
    }

    const assinaturasHtml = `
      <div class="assinaturas">
        ${renderBlocoAssinatura('CONTRATADA', assinaturaContratada)}
        ${renderBlocoAssinatura('CONTRATANTE', assinaturaContratante)}
      </div>
    `

    const empresa = opts?.empresa || null
    const empresaNome = empresa?.razaoSocial || empresa?.nomeFantasia || 'CONTRATADA'

    const accentColor = '#fb7185' // rose, identidade Comercial

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 24mm 22mm 28mm 22mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Times New Roman', Georgia, serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #111;
    margin: 0;
    position: relative;
  }

  /* Marca d'água — repete em todas as páginas via position: fixed (puppeteer respeita) */
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    max-width: 520px;
    aspect-ratio: 1 / 1;
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    opacity: 0.07;
    z-index: 0;
    pointer-events: none;
  }
  .watermark-text {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-22deg);
    font-family: 'Inter', sans-serif;
    font-size: 80pt;
    font-weight: 800;
    color: #1a1a1a;
    opacity: 0.04;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    z-index: 0;
    pointer-events: none;
  }

  /* Conteúdo acima da marca d'água */
  .doc-content { position: relative; z-index: 1; }

  /* (logo + título do contrato ficam na página de rosto, gerada separadamente) */

  /* Título do documento (centralizado abaixo do header) */
  h1 {
    font-size: 14pt;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 8px 0 18px 0;
    font-weight: 700;
  }

  /* Bloco das partes */
  .partes {
    background: #f9fafb;
    border-left: 3px solid ${accentColor};
    padding: 10px 14px;
    margin-bottom: 18px;
    font-size: 10pt;
  }
  .partes p { margin: 4px 0; }

  section.categoria { margin-bottom: 16px; page-break-inside: avoid; }
  h2 {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 16px 0 8px 0;
    border-bottom: 1px solid #ccc;
    padding-bottom: 3px;
    font-weight: 600;
  }
  h3 { font-size: 10pt; margin: 8px 0 4px 0; font-weight: 600; }
  .clausula { margin-bottom: 10px; }
  .clausula-conteudo { text-align: justify; }
  .clausula-conteudo p { margin: 4px 0; }
  .clausula-conteudo ul, .clausula-conteudo ol { margin: 4px 0 4px 18px; }
  .clausula-conteudo li { margin: 2px 0; }

  /* Assinaturas — bloco de cada parte */
  .assinaturas {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px dashed #ccc;
    page-break-inside: avoid;
  }
  .assinatura-bloco { text-align: center; }
  .assinatura-bloco .parte-label {
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #444;
    margin-bottom: 6px;
  }
  /* Aguardando assinatura — apenas linha */
  .assinatura-bloco .linha { border-top: 1px solid #111; margin: 50px 12px 6px 12px; }
  .assinatura-bloco p { font-size: 9.5pt; margin: 2px 0; }

  /* === Selo de assinatura digital — estilo SERPRO/Adobe ===
     Layout horizontal com header azul "ASSINADO DIGITALMENTE",
     nome em destaque, CPF/CNPJ, URL de validação, e badge da AC. */
  .selo-digital {
    position: relative;
    width: 100%;
    border: 1px solid #b3d8ec;
    border-radius: 4px;
    background: #fff;
    overflow: hidden;
    text-align: left;
    font-family: Arial, Helvetica, sans-serif;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  .selo-digital .selo-header {
    background: #0d8bc1;
    color: #fff;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.18em;
    padding: 4px 10px 4px 12px;
    text-transform: uppercase;
  }
  .selo-digital .selo-body {
    padding: 8px 12px 10px 12px;
    position: relative;
  }
  /* Círculos concêntricos decorativos atrás do conteúdo (estilo SERPRO) */
  .selo-digital .selo-body::before {
    content: '';
    position: absolute;
    top: -10px;
    left: -16px;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    border: 1.5px solid #b3d8ec;
    opacity: 0.45;
    pointer-events: none;
  }
  .selo-digital .selo-body::after {
    content: '';
    position: absolute;
    top: 6px;
    left: 0;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1.5px solid #b3d8ec;
    opacity: 0.55;
    pointer-events: none;
  }
  .selo-digital .selo-content {
    position: relative;
    z-index: 1;
    padding-left: 38px;
  }
  .selo-digital .selo-nome {
    font-size: 10pt;
    font-weight: 700;
    color: #2c3e50;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 1.15;
    margin-bottom: 4px;
  }
  .selo-digital .selo-doc-label {
    font-size: 7.5pt;
    color: #7a8a99;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-top: 4px;
  }
  .selo-digital .selo-doc-value {
    font-size: 10pt;
    color: #0d8bc1;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-bottom: 2px;
  }
  .selo-digital .selo-data {
    font-size: 7.5pt;
    color: #7a8a99;
    margin-top: 4px;
  }
  .selo-digital .selo-verify {
    font-size: 6.5pt;
    color: #0d8bc1;
    margin-top: 6px;
    line-height: 1.3;
    word-break: break-all;
  }
  .selo-digital .selo-verify a { color: #0d8bc1; text-decoration: underline; }
  .selo-digital .selo-badge {
    position: absolute;
    bottom: 8px;
    right: 10px;
    background: #5a6770;
    color: #fff;
    font-size: 7pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 3px 8px;
    border-radius: 2px;
    z-index: 2;
  }

  /* (rodapé com numeração é renderizado pelo puppeteer footerTemplate) */
</style>
</head>
<body>

  ${opts?.watermarkDataUri
    ? `<div class="watermark" style="background-image: url('${opts.watermarkDataUri}');" aria-hidden></div>`
    : `<div class="watermark-text" aria-hidden>${escapeHtmlAttr(empresaNome)}</div>`
  }

  <div class="doc-content">
    <div class="partes">
      <p><strong>CONTRATANTE:</strong> ${escapeHtmlAttr(c.contratanteRazaoSocial || c.cliente?.razaoSocial || '')}, inscrita no CNPJ sob o nº ${c.contratanteCnpj || c.cliente?.documento || ''}${c.contratanteEndereco ? `, com sede em ${escapeHtmlAttr(c.contratanteEndereco)}` : ''}${c.contratanteRepresentante ? `, neste ato representada por ${escapeHtmlAttr(c.contratanteRepresentante)}${c.contratanteCpfRep ? ` (CPF ${c.contratanteCpfRep})` : ''}` : ''}.</p>
    </div>

    ${sections}

    ${assinaturasHtml}
  </div>
</body>
</html>`
  }

  /**
   * Gera o PDF do contrato usando puppeteer e salva em uploads/.
   * Retorna { url, hash, filename }. Atualiza pdfUrl + pdfHash no contrato.
   */
  async gerarPdf(contratoId: string): Promise<{ url: string; hash: string; filename: string }> {
    const c = await this.getContrato(contratoId)

    // Busca empresa contratante (CONTRATADA) e carrega logo + marca d'agua
    // como data-URI pra que o puppeteer renderize sem dependencia externa.
    // Fallback do watermark: asset estático /marca-dagua.png em apps/web/public,
    // mesmo padrão usado pela página /orcamentos/[id]/imprimir.
    const empresa = await this.getEmpresaParaPdf(c.empresaId)
    const [logoDataUri, watermarkDataUri] = await Promise.all([
      this.loadImageAsDataUri(empresa?.logoUrl),
      this.loadImageAsDataUri(empresa?.marcaDaguaUrl || '/marca-dagua.png'),
    ])

    const coverHtml = this.buildCoverHtml(c, { logoDataUri, watermarkDataUri, empresa })
    const contentHtml = this.buildContratoHtml(c, { logoDataUri, watermarkDataUri, empresa })

    // Footer das páginas de conteúdo: "Página X de Y" (Y = total do conteúdo, sem rosto).
    // O contador `pageNumber` aqui é relativo apenas ao PDF de conteúdo, então
    // 1 corresponde à 1ª página depois da rosto — exatamente o que o usuário pediu.
    const footerTemplate = `
      <div style="
        font-family: Arial, sans-serif;
        font-size: 9pt;
        color: #6b7280;
        width: 100%;
        padding: 0 22mm;
        box-sizing: border-box;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <span style="font-size: 7.5pt;">Contrato Nº ${String(c.numero).padStart(5, '0')}</span>
        <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
      </div>
    `
    const headerTemplate = `<div></div>` // header vazio é obrigatório se displayHeaderFooter=true

    // Lazy import — puppeteer é pesado, só carregamos quando necessário
    const puppeteer = await import('puppeteer')
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
    let coverPdf: Buffer
    let contentPdf: Buffer
    try {
      // 1) PDF da página de rosto — sem header/footer, margens zero (controle no HTML)
      const coverPage = await browser.newPage()
      await coverPage.setContent(coverHtml, { waitUntil: 'networkidle0' })
      coverPdf = Buffer.from(await coverPage.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      }))
      await coverPage.close()

      // 2) PDF do conteúdo — com footer "Página X de Y" em cada página
      const contentPage = await browser.newPage()
      await contentPage.setContent(contentHtml, { waitUntil: 'networkidle0' })
      contentPdf = Buffer.from(await contentPage.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '24mm', right: '22mm', bottom: '22mm', left: '22mm' },
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
      }))
      await contentPage.close()
    } finally {
      await browser.close()
    }

    // 3) Concatena cover + content via pdf-lib
    const { PDFDocument } = await import('pdf-lib')
    const merged = await PDFDocument.create()
    const coverDoc = await PDFDocument.load(coverPdf)
    const contentDoc = await PDFDocument.load(contentPdf)
    const coverPages = await merged.copyPages(coverDoc, coverDoc.getPageIndices())
    coverPages.forEach((p) => merged.addPage(p))
    const contentPages = await merged.copyPages(contentDoc, contentDoc.getPageIndices())
    contentPages.forEach((p) => merged.addPage(p))
    const pdfBuffer = Buffer.from(await merged.save())

    // Hash e arquivo
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex')
    const filename = `contrato-${c.id}.pdf`
    await fs.mkdir(UPLOADS_DIR, { recursive: true })
    await fs.writeFile(path.join(UPLOADS_DIR, filename), pdfBuffer)

    const apiUrl = process.env.BETTER_AUTH_URL ?? process.env.API_URL ?? 'http://localhost:4000'
    const url = `${apiUrl}/api/upload/${filename}`

    await (prisma as any).contrato.update({
      where: { id: contratoId },
      data: { pdfUrl: url, pdfHash: hash },
    })

    await (prisma as any).contratoEvento.create({
      data: { contratoId, tipo: 'pdf_gerado', descricao: 'PDF do contrato gerado', metadata: { hash } },
    })

    return { url, hash, filename }
  }

  async changeContratoStatus(id: string, novoStatus: string, opts?: { userId?: string; motivo?: string }) {
    const c = await (prisma as any).contrato.update({
      where: { id },
      data: {
        status: novoStatus,
        ...(novoStatus === 'ENCERRADO' ? { encerradoEm: new Date(), motivoEncerramento: opts?.motivo || null } : {}),
      },
    })
    await (prisma as any).contratoEvento.create({
      data: { contratoId: id, userId: opts?.userId || null, tipo: `status_${novoStatus.toLowerCase()}`, descricao: opts?.motivo || null },
    })
    return c
  }

  // ════════════════════════════════════════════════════════════
  // ASSINATURAS
  // ════════════════════════════════════════════════════════════

  /**
   * Registra uma assinatura via Web PKI (Lacuna). O frontend computou o
   * PKCS#7 sobre o hash SHA-256 do PDF gerado. Aqui registramos a assinatura
   * e atualizamos o status do contrato. A montagem do PDF PAdES final fica
   * pra um job assíncrono ou endpoint subsequente que combina os PKCS#7
   * de ambas as partes.
   */
  async assinarWebPki(input: AssinarWebPkiInput, opts: { ip?: string; userAgent?: string }) {
    const contrato = await (prisma as any).contrato.findUnique({ where: { id: input.contratoId } })
    if (!contrato) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contrato não encontrado' })

    const ass = await (prisma as any).contratoAssinatura.create({
      data: {
        contratoId: input.contratoId,
        parte: input.parte,
        tipo: 'WEBPKI',
        signatarioNome: input.signatarioNome,
        signatarioDoc: input.signatarioDoc || null,
        signatarioEmail: input.signatarioEmail || null,
        certSubject: input.certSubject,
        certIssuer: input.certIssuer || null,
        certSerial: input.certSerial || null,
        certValidoAte: input.certValidoAte ? new Date(input.certValidoAte) : null,
        pkcs7Base64: input.pkcs7Base64,
        hashPdf: input.hashPdf,
        ip: opts.ip || null,
        userAgent: opts.userAgent || null,
      },
    })

    await (prisma as any).contratoEvento.create({
      data: {
        contratoId: input.contratoId,
        tipo: input.parte === 'CONTRATADA' ? 'assinado_contratada' : 'assinado_cliente',
        descricao: `${input.parte} assinou via Web PKI`,
        metadata: { certSubject: input.certSubject, hashPdf: input.hashPdf },
      },
    })

    // Atualizar status do contrato
    await this.atualizarStatusAposAssinatura(input.contratoId)
    return ass
  }

  /**
   * Aceite simples (sem certificado) — usado quando o cliente não tem cert
   * digital nem conta gov.br Prata/Ouro. Gera audit trail (IP, hash, etc).
   */
  async aceitarProposta(token: string, signatarioNome: string, signatarioDoc: string, opts: { ip?: string; userAgent?: string; email?: string }) {
    const contrato = await (prisma as any).contrato.findUnique({ where: { token } })
    if (!contrato) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contrato não encontrado' })
    if (contrato.status === 'ASSINADO' || contrato.status === 'VIGENTE') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Contrato já está assinado.' })
    }

    // Hash determinístico do conteúdo + signatário para auditoria
    const hash = crypto.createHash('sha256')
      .update(`${contrato.id}|${signatarioNome}|${signatarioDoc}|${Date.now()}`)
      .digest('hex')

    const ass = await (prisma as any).contratoAssinatura.create({
      data: {
        contratoId: contrato.id,
        parte: 'CONTRATANTE',
        tipo: 'ACEITE',
        signatarioNome,
        signatarioDoc,
        signatarioEmail: opts.email || null,
        hashPdf: hash,
        ip: opts.ip || null,
        userAgent: opts.userAgent || null,
      },
    })

    await (prisma as any).contratoEvento.create({
      data: {
        contratoId: contrato.id,
        tipo: 'aceite_cliente',
        descricao: `Cliente aceitou proposta (sem certificado digital): ${signatarioNome} (${signatarioDoc})`,
      },
    })

    await this.atualizarStatusAposAssinatura(contrato.id)
    return ass
  }

  // ════════════════════════════════════════════════════════════
  // GOV.BR ASSINATURA — OAuth + assinarPKCS7
  // ════════════════════════════════════════════════════════════
  // Implementa o fluxo da API "Assinatura Eletrônica gov.br":
  //   1. iniciarAssinaturaGovbr() → retorna URL de autorização para o usuário ser redirecionado
  //   2. usuário autoriza no portal gov.br → redirect com ?code=... ?state=...
  //   3. callbackAssinaturaGovbr() → troca code por access_token, chama assinarPKCS7,
  //      armazena a assinatura.
  //
  // Env vars necessárias (cadastrar app em https://sso.staging.acesso.gov.br):
  //   GOVBR_CLIENT_ID
  //   GOVBR_CLIENT_SECRET
  //   GOVBR_REDIRECT_URI            ex: https://app.central-rnc.com.br/api/contratos/govbr-callback
  //   GOVBR_BASE_URL_SSO            (default: https://sso.staging.acesso.gov.br)
  //   GOVBR_BASE_URL_ASSINATURA     (default: https://assinatura-api.staging.iti.br)

  // Storage temporário do code_verifier (PKCE) e state — em produção, usar Redis.
  private govbrAuthState = new Map<string, { codeVerifier: string; contratoId: string; parte: 'CONTRATADA' | 'CONTRATANTE'; expiresAt: number }>()

  private cleanupExpiredAuthStates() {
    const now = Date.now()
    for (const [k, v] of this.govbrAuthState) {
      if (v.expiresAt < now) this.govbrAuthState.delete(k)
    }
  }

  private generatePkcePair() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    return { codeVerifier, codeChallenge }
  }

  /**
   * Gera URL de autorização gov.br. Frontend redireciona o usuário para essa
   * URL; após autorizar, o gov.br redireciona de volta para GOVBR_REDIRECT_URI
   * com ?code=... que deve ser processado pelo callbackAssinaturaGovbr.
   */
  iniciarAssinaturaGovbr(contratoId: string, parte: 'CONTRATADA' | 'CONTRATANTE'): { authUrl: string; state: string } {
    this.cleanupExpiredAuthStates()
    const clientId = process.env.GOVBR_CLIENT_ID
    const redirectUri = process.env.GOVBR_REDIRECT_URI
    const ssoBase = process.env.GOVBR_BASE_URL_SSO || 'https://sso.staging.acesso.gov.br'
    if (!clientId || !redirectUri) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'gov.br não configurado. Defina GOVBR_CLIENT_ID e GOVBR_REDIRECT_URI no .env após cadastrar a aplicação em sso.acesso.gov.br.',
      })
    }
    const { codeVerifier, codeChallenge } = this.generatePkcePair()
    // Prefixo identifica o provedor no callback (gov.br vs SerproID compartilham o mesmo redirect)
    const state = 'govbr_' + crypto.randomBytes(16).toString('base64url')
    this.govbrAuthState.set(state, {
      codeVerifier,
      contratoId,
      parte,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    })
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'sign',
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    return { authUrl: `${ssoBase}/authorize?${params.toString()}`, state }
  }

  /**
   * Processa o callback do gov.br: troca o code por access_token, busca o
   * certificado público do usuário, gera hash do PDF do contrato, chama
   * assinarPKCS7 e persiste a assinatura.
   */
  async callbackAssinaturaGovbr(code: string, state: string, opts: { ip?: string; userAgent?: string }) {
    const cached = this.govbrAuthState.get(state)
    if (!cached) throw new TRPCError({ code: 'BAD_REQUEST', message: 'State inválido ou expirado' })
    this.govbrAuthState.delete(state)
    if (cached.expiresAt < Date.now()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sessão expirada' })

    const ssoBase = process.env.GOVBR_BASE_URL_SSO || 'https://sso.staging.acesso.gov.br'
    const apiBase = process.env.GOVBR_BASE_URL_ASSINATURA || 'https://assinatura-api.staging.iti.br'
    const clientId = process.env.GOVBR_CLIENT_ID!
    const clientSecret = process.env.GOVBR_CLIENT_SECRET!
    const redirectUri = process.env.GOVBR_REDIRECT_URI!

    // 1. Trocar code por access_token
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenRes = await fetch(`${ssoBase}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: cached.codeVerifier,
      }),
    })
    if (!tokenRes.ok) {
      const t = await tokenRes.text()
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `gov.br token exchange falhou: ${tokenRes.status} ${t.slice(0, 200)}` })
    }
    const tokenJson: any = await tokenRes.json()
    const accessToken = tokenJson.access_token as string

    // 2. Garantir que o PDF está gerado e pegar o hash
    let contrato = await (prisma as any).contrato.findUnique({ where: { id: cached.contratoId } })
    if (!contrato.pdfHash) {
      await this.gerarPdf(cached.contratoId)
      contrato = await (prisma as any).contrato.findUnique({ where: { id: cached.contratoId } })
    }

    // 3. Buscar certificado público do usuário
    const certRes = await fetch(`${apiBase}/externo/v2/certificadoPublico`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    let certInfo: any = {}
    if (certRes.ok) {
      try { certInfo = await certRes.json() } catch { /* não crítico */ }
    }

    // 4. Chamar assinarPKCS7 com o hash do PDF
    const signRes = await fetch(`${apiBase}/externo/v2/assinarPKCS7`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashAlgorithm: 'SHA256', hash: contrato.pdfHash }),
    })
    if (!signRes.ok) {
      const t = await signRes.text()
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `gov.br assinarPKCS7 falhou: ${signRes.status} ${t.slice(0, 200)}` })
    }
    const signJson: any = await signRes.json()
    const pkcs7 = signJson.pkcs7 || signJson.signature || ''

    // 5. Persistir assinatura
    const ass = await (prisma as any).contratoAssinatura.create({
      data: {
        contratoId: cached.contratoId,
        parte: cached.parte,
        tipo: 'GOVBR',
        signatarioNome: certInfo.nome || certInfo.commonName || 'Signatário gov.br',
        signatarioDoc: certInfo.cpf || null,
        signatarioEmail: certInfo.email || null,
        certSubject: certInfo.subject || null,
        certIssuer: certInfo.issuer || 'AC gov.br',
        pkcs7Base64: pkcs7,
        hashPdf: contrato.pdfHash,
        ip: opts.ip || null,
        userAgent: opts.userAgent || null,
        govbrTransactionId: signJson.id || null,
      },
    })

    await (prisma as any).contratoEvento.create({
      data: {
        contratoId: cached.contratoId,
        tipo: cached.parte === 'CONTRATADA' ? 'assinado_contratada' : 'assinado_cliente',
        descricao: `${cached.parte} assinou via gov.br`,
        metadata: { tipo: 'GOVBR', signatario: certInfo.nome || null },
      },
    })

    await this.atualizarStatusAposAssinatura(cached.contratoId)
    return ass
  }

  // ════════════════════════════════════════════════════════════
  // SERPRO Neo iD ASSINATURA — OAuth Authorization Code
  // ════════════════════════════════════════════════════════════
  // Doc oficial: https://neoid.estaleiro.serpro.gov.br/manual-integracao/utilizacao-certificado/assinatura-digital/
  //
  // Fluxo (espelha gov.br, mas usa o IdP do SERPRO):
  //   1. iniciarAssinaturaSerproId() → URL de autorização para o usuario
  //   2. usuário autentica com cert ICP-Brasil/SerproID e autoriza
  //   3. SERPRO redireciona para SERPROID_REDIRECT_URI com ?code=&state=
  //   4. callbackAssinaturaSerproId() troca code por token, calcula hash,
  //      chama POST /oauth/v0/oauth/signature, persiste assinatura
  //
  // Env vars necessárias (cadastradas no /configuracoes):
  //   SERPROID_CLIENT_ID
  //   SERPROID_CLIENT_SECRET
  //   SERPROID_REDIRECT_URI       URL pública que o SERPRO redireciona
  //   SERPROID_BASE_URL           default: https://serproid.serpro.gov.br

  // Storage temporario do state — em prod, mover pra Redis para suportar multi-instance
  private serproIdAuthState = new Map<string, { contratoId: string; parte: 'CONTRATADA' | 'CONTRATANTE'; expiresAt: number }>()

  private cleanupExpiredSerproIdStates() {
    const now = Date.now()
    for (const [k, v] of this.serproIdAuthState) {
      if (v.expiresAt < now) this.serproIdAuthState.delete(k)
    }
  }

  /**
   * Gera URL de autorização do SerproID. O frontend redireciona o usuário
   * pra essa URL; após autorizar, o SerproID volta para SERPROID_REDIRECT_URI
   * com ?code=...&state=...
   */
  iniciarAssinaturaSerproId(contratoId: string, parte: 'CONTRATADA' | 'CONTRATANTE'): { authUrl: string; state: string } {
    this.cleanupExpiredSerproIdStates()
    const clientId = process.env.SERPROID_CLIENT_ID
    const redirectUri = process.env.SERPROID_REDIRECT_URI
    const baseUrl = process.env.SERPROID_BASE_URL || 'https://serproid.serpro.gov.br'
    if (!clientId || !redirectUri) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'SerproID não configurado. Defina SERPROID_CLIENT_ID e SERPROID_REDIRECT_URI em /configuracoes (após cadastrar a aplicação no portal SerproID).',
      })
    }
    const state = 'srpid_' + crypto.randomBytes(16).toString('base64url')
    this.serproIdAuthState.set(state, {
      contratoId,
      parte,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
    })
    // Scope "signature" autoriza o uso do certificado para assinatura
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'signature',
      redirect_uri: redirectUri,
      state,
    })
    return { authUrl: `${baseUrl}/oauth/v0/oauth/authorize?${params.toString()}`, state }
  }

  /**
   * Processa o callback: troca code por access_token, calcula hash do PDF
   * (já gerado no createPdf), chama o endpoint de assinatura do SerproID
   * e persiste o PKCS#7.
   */
  async callbackAssinaturaSerproId(code: string, state: string, opts: { ip?: string; userAgent?: string }) {
    const cached = this.serproIdAuthState.get(state)
    if (!cached) throw new TRPCError({ code: 'BAD_REQUEST', message: 'State inválido ou expirado' })
    this.serproIdAuthState.delete(state)
    if (cached.expiresAt < Date.now()) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Sessão expirada' })

    const baseUrl = process.env.SERPROID_BASE_URL || 'https://serproid.serpro.gov.br'
    const clientId = process.env.SERPROID_CLIENT_ID!
    const clientSecret = process.env.SERPROID_CLIENT_SECRET!
    const redirectUri = process.env.SERPROID_REDIRECT_URI!

    // 1. Troca code por access_token
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    const tokenRes = await fetch(`${baseUrl}/oauth/v0/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) {
      const t = await tokenRes.text()
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `SerproID token exchange falhou: ${tokenRes.status} ${t.slice(0, 200)}` })
    }
    const tokenJson: any = await tokenRes.json()
    const accessToken = tokenJson.access_token as string

    // 2. Garantir que o PDF está gerado e pegar o hash (em hex)
    let contrato = await (prisma as any).contrato.findUnique({ where: { id: cached.contratoId } })
    if (!contrato.pdfHash) {
      await this.gerarPdf(cached.contratoId)
      contrato = await (prisma as any).contrato.findUnique({ where: { id: cached.contratoId } })
    }

    // 3. Converter hash hex → base64 (formato esperado pela API SerproID)
    const hashBase64 = Buffer.from(contrato.pdfHash, 'hex').toString('base64')

    // 4. Chamar endpoint de assinatura
    const signRes = await fetch(`${baseUrl}/oauth/v0/oauth/signature`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        hashes: [{
          id: contrato.id,
          alias: `Contrato #${String(contrato.numero).padStart(5, '0')}`,
          hash: hashBase64,
          hash_algorithm: '2.16.840.1.101.3.4.2.1', // SHA-256
          signature_format: 'CMS',                   // PKCS#7
        }],
      }),
    })
    if (!signRes.ok) {
      const t = await signRes.text()
      throw new TRPCError({ code: 'BAD_GATEWAY', message: `SerproID signature falhou: ${signRes.status} ${t.slice(0, 200)}` })
    }
    const signJson: any = await signRes.json()
    const sig = signJson?.signatures?.[0]
    if (!sig?.raw_signature) {
      throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Resposta SerproID sem raw_signature' })
    }
    const pkcs7 = sig.raw_signature as string

    // 5. Buscar dados do certificado (opcional — endpoint /userinfo retorna nome/CPF do signatário)
    let signatarioNome = 'Signatário SerproID'
    let signatarioDoc: string | null = null
    let certSubject: string | null = null
    let certIssuer: string | null = 'AC SERPRO'
    try {
      const userInfoRes = await fetch(`${baseUrl}/oauth/v0/oauth/userinfo`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      if (userInfoRes.ok) {
        const ui: any = await userInfoRes.json()
        signatarioNome = ui.name || ui.nome || ui.commonName || signatarioNome
        signatarioDoc = ui.cpf || ui.cnpj || null
        certSubject = ui.subject || null
      }
    } catch { /* nao critico */ }

    // 6. Persistir assinatura
    const ass = await (prisma as any).contratoAssinatura.create({
      data: {
        contratoId: cached.contratoId,
        parte: cached.parte,
        tipo: 'SERPROID',
        signatarioNome,
        signatarioDoc,
        certSubject,
        certIssuer,
        pkcs7Base64: pkcs7,
        hashPdf: contrato.pdfHash,
        ip: opts.ip || null,
        userAgent: opts.userAgent || null,
      },
    })

    await (prisma as any).contratoEvento.create({
      data: {
        contratoId: cached.contratoId,
        tipo: cached.parte === 'CONTRATADA' ? 'assinado_contratada' : 'assinado_cliente',
        descricao: `${cached.parte} assinou via SerproID`,
        metadata: { tipo: 'SERPROID', signatario: signatarioNome },
      },
    })

    await this.atualizarStatusAposAssinatura(cached.contratoId)
    return ass
  }

  // ════════════════════════════════════════════════════════════
  // ASSINATURA SERVER-SIDE — usa cert da empresa em CERTIFICADO_PATH
  // ════════════════════════════════════════════════════════════
  // Para a CONTRATADA: o servidor assina o PDF com node-signpdf usando o
  // e-CNPJ ICP-Brasil já cadastrado em /configuracoes (CERTIFICADO_PATH/SENHA).
  // Resultado: PDF assinado embarcado (PAdES-BES), zero fricção pro usuario.
  //
  // Validade legal: equivalente a assinatura manuscrita (MP 2.200-2/2001 + cert
  // ICP-Brasil A1/A3). Se o produto API CARIMBO DE TEMPO SERPRO estiver
  // configurado (TSA_URL), pode-se elevar para PAdES-T no futuro.

  /**
   * Assina o PDF do contrato server-side com o cert configurado em
   * CERTIFICADO_PATH/CERTIFICADO_SENHA. Aplica-se à parte CONTRATADA.
   * Recalcula o hash do PDF (agora com a assinatura embutida) e atualiza
   * pdfUrl + pdfHash.
   */
  async assinarServerSide(contratoId: string, parte: 'CONTRATADA' | 'CONTRATANTE', opts: { ip?: string; userAgent?: string }) {
    if (!this.pdfSign.certificadoDisponivel()) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Certificado do servidor nao disponivel. Verifique se o PFX foi enviado em /configuracoes/certificado e a senha em /configuracoes (grupo SERPRO).',
      })
    }

    const contrato = await (prisma as any).contrato.findUnique({ where: { id: contratoId } })
    if (!contrato) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contrato nao encontrado' })

    // 1. Garantir que o PDF esta gerado
    if (!contrato.pdfUrl) {
      await this.gerarPdf(contratoId)
    }

    // 2. Ler o PDF do disco
    const filename = `contrato-${contratoId}.pdf`
    const pdfPath = path.join(UPLOADS_DIR, filename)
    const pdfBuffer = await fs.readFile(pdfPath)

    // 3. Extrair info do certificado para audit trail
    const certPath = this.pdfSign.resolveCertPath()!
    const certPassword = process.env.CERTIFICADO_SENHA!
    const certInfo = this.pdfSign.extrairInfoCertificado(certPath, certPassword)

    // 4. Assinar (PAdES BES + TimeStamp SERPRO se configurado → PAdES-T)
    const signed = await this.pdfSign.assinarPdf(pdfBuffer, {
      nomeSignatario: certInfo.nome,
      motivo: `Assinatura digital — ${parte === 'CONTRATADA' ? 'Contratada' : 'Contratante'}`,
      local: 'Serra/ES',
      withTimestamp: true,
    })

    // 5. Sobrescrever PDF assinado e recalcular hash
    await fs.writeFile(pdfPath, signed.buffer)
    const novoHash = crypto.createHash('sha256').update(signed.buffer).digest('hex')

    await (prisma as any).contrato.update({
      where: { id: contratoId },
      data: { pdfHash: novoHash },
    })

    // 6. Persistir assinatura
    const ass = await (prisma as any).contratoAssinatura.create({
      data: {
        contratoId,
        parte,
        tipo: 'SERVER',
        signatarioNome: certInfo.nome,
        signatarioDoc: certInfo.cpfCnpj,
        certSubject: certInfo.nome,
        certIssuer: certInfo.issuer,
        certSerial: certInfo.serial,
        certValidoAte: certInfo.notAfter,
        hashPdf: novoHash,
        // pkcs7Base64 nao se aplica — assinatura ja esta embutida no PDF
        ip: opts.ip || null,
        userAgent: opts.userAgent || null,
      },
    })

    await (prisma as any).contratoEvento.create({
      data: {
        contratoId,
        tipo: parte === 'CONTRATADA' ? 'assinado_contratada' : 'assinado_cliente',
        descricao: `${parte} assinou via certificado do servidor (${certInfo.nome}) — PAdES-${signed.padesLevel}${signed.tsaInfo ? ` · ${signed.tsaInfo}` : ''}`,
        metadata: { tipo: 'SERVER', signatario: certInfo.nome, hashPdf: novoHash, padesLevel: signed.padesLevel, tsaInfo: signed.tsaInfo },
      },
    })

    await this.atualizarStatusAposAssinatura(contratoId)
    return ass
  }

  /**
   * Após cada assinatura, verifica se ambas as partes assinaram e, em
   * caso afirmativo, move o contrato para ASSINADO (e VIGENTE se já está
   * dentro do período).
   */
  private async atualizarStatusAposAssinatura(contratoId: string) {
    const todas = await (prisma as any).contratoAssinatura.findMany({ where: { contratoId } })
    const temContratada = todas.some((a: any) => a.parte === 'CONTRATADA')
    const temContratante = todas.some((a: any) => a.parte === 'CONTRATANTE')
    const c = await (prisma as any).contrato.findUnique({ where: { id: contratoId } })

    let novoStatus: string | null = null
    if (temContratada && temContratante) {
      const agora = new Date()
      const inicio = c.dataInicio ? new Date(c.dataInicio) : null
      novoStatus = inicio && inicio <= agora ? 'VIGENTE' : 'ASSINADO'
    } else if (temContratada || temContratante) {
      novoStatus = 'AGUARDANDO_ASSINATURA'
    }

    if (novoStatus && novoStatus !== c.status) {
      await (prisma as any).contrato.update({ where: { id: contratoId }, data: { status: novoStatus } })
    }
  }

  /**
   * Endpoint público de validação — recebe o hash de um PDF assinado e
   * retorna metadados (nomes dos signatários, datas, etc) para que terceiros
   * possam confirmar autenticidade.
   */
  async validarPorHash(hashPdf: string) {
    const ass = await (prisma as any).contratoAssinatura.findFirst({
      where: { hashPdf },
      include: {
        contrato: {
          select: {
            id: true, numero: true, status: true,
            cliente: { select: { razaoSocial: true, documento: true } },
            assinaturas: {
              select: { parte: true, tipo: true, signatarioNome: true, signatarioDoc: true, assinadoEm: true, certSubject: true, certIssuer: true },
            },
          },
        },
      },
    })
    if (!ass) return null
    return {
      contratoNumero: ass.contrato.numero,
      cliente: ass.contrato.cliente,
      status: ass.contrato.status,
      assinaturas: ass.contrato.assinaturas,
    }
  }

  // ── Relatorio consolidado (Painel de Gestao a Vista) ───────
  /**
   * Agregados da carteira de contratos para o painel comercial:
   * MRR (honorario recorrente da carteira ativa), contagem por status,
   * contratos a vencer (30/60 dias) e evolucao novos x encerrados (6 meses).
   */
  async reportComercial(empresaId?: string) {
    const baseWhere: any = {}
    if (empresaId) baseWhere.empresaId = empresaId

    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const in60 = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
    // Inicio do mes 5 meses atras (janela de 6 meses, mes atual incluso)
    const inicioJanela = new Date(now.getFullYear(), now.getMonth() - 5, 1)

    const [mrrAgg, porStatusRaw, aVencerRows, criados, encerrados] = await Promise.all([
      // MRR = honorario mensal somado da carteira ativa (VIGENTE + ASSINADO)
      (prisma as any).contrato.aggregate({
        where: { ...baseWhere, status: { in: ['VIGENTE', 'ASSINADO'] } },
        _sum: { honorarioMensal: true },
      }),
      (prisma as any).contrato.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { _all: true },
        _sum: { honorarioMensal: true },
      }),
      // A vencer: vigentes/assinados com dataFim nos proximos 60 dias
      (prisma as any).contrato.findMany({
        where: {
          ...baseWhere,
          status: { in: ['VIGENTE', 'ASSINADO'] },
          dataFim: { not: null, lte: in60 },
        },
        orderBy: { dataFim: 'asc' },
        take: 20,
        select: {
          id: true,
          numero: true,
          dataFim: true,
          honorarioMensal: true,
          cliente: { select: { id: true, razaoSocial: true } },
        },
      }),
      (prisma as any).contrato.findMany({
        where: { ...baseWhere, createdAt: { gte: inicioJanela } },
        select: { createdAt: true },
      }),
      (prisma as any).contrato.findMany({
        where: { ...baseWhere, encerradoEm: { not: null, gte: inicioJanela } },
        select: { encerradoEm: true },
      }),
    ])

    // Contagem por status -> mapa
    const porStatus: Record<string, number> = {}
    let totalContratos = 0
    for (const r of porStatusRaw as Array<{ status: string; _count: { _all: number } }>) {
      porStatus[r.status] = r._count._all
      totalContratos += r._count._all
    }

    // A vencer: classifica em <=30d e <=60d
    const aVencer = (aVencerRows as Array<any>).map((c) => ({
      id: c.id,
      numero: c.numero,
      cliente: c.cliente?.razaoSocial ?? '—',
      dataFim: c.dataFim,
      honorarioMensal: Number(c.honorarioMensal ?? 0),
      diasRestantes: c.dataFim ? Math.ceil((new Date(c.dataFim).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null,
    }))
    const aVencer30 = aVencer.filter((c) => c.dataFim && new Date(c.dataFim) <= in30).length
    const aVencer60 = aVencer.length

    // Evolucao mensal (6 buckets)
    const buckets: Array<{ mes: string; novos: number; encerrados: number }> = []
    const idxByKey: Record<string, number> = {}
    const mesesLabel = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      idxByKey[key] = buckets.length
      buckets.push({ mes: `${mesesLabel[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, novos: 0, encerrados: 0 })
    }
    for (const c of criados as Array<{ createdAt: Date }>) {
      const d = new Date(c.createdAt)
      const idx = idxByKey[`${d.getFullYear()}-${d.getMonth()}`]
      if (idx !== undefined) buckets[idx].novos++
    }
    for (const c of encerrados as Array<{ encerradoEm: Date }>) {
      const d = new Date(c.encerradoEm)
      const idx = idxByKey[`${d.getFullYear()}-${d.getMonth()}`]
      if (idx !== undefined) buckets[idx].encerrados++
    }

    return {
      mrr: Number(mrrAgg._sum.honorarioMensal ?? 0),
      totalContratos,
      vigentes: porStatus['VIGENTE'] ?? 0,
      assinados: porStatus['ASSINADO'] ?? 0,
      aguardandoAssinatura: porStatus['AGUARDANDO_ASSINATURA'] ?? 0,
      rascunhos: porStatus['RASCUNHO'] ?? 0,
      encerrados: porStatus['ENCERRADO'] ?? 0,
      cancelados: porStatus['CANCELADO'] ?? 0,
      aVencer30,
      aVencer60,
      porStatus: (porStatusRaw as Array<any>).map((r) => ({
        status: r.status,
        count: r._count._all,
        valor: Number(r._sum?.honorarioMensal ?? 0),
      })),
      aVencer,
      evolucaoMensal: buckets,
    }
  }
}
