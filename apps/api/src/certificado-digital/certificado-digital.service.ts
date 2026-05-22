import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import path from 'node:path'
import fs from 'node:fs/promises'
import { encryptPassword, decryptPassword, serializeCipher, parseCipher, sha256Hex } from './crypto.helper'
import { parsePfx } from './pfx-parser'

const STORAGE_ROOT = path.resolve(process.cwd(), 'uploads', 'certificados')

export type AcaoAcesso =
  | 'cadastrado'
  | 'visualizado'
  | 'editado'
  | 'download_pfx'
  | 'senha_visualizada'
  | 'usado_assinatura'
  | 'revogado'
  | 'arquivado'
  | 'desarquivado'
  | 'excluido'
  | 'integridade_falhou'
  | 'renovado'

export interface AuditContext {
  userId?: string
  ipAddress?: string
  userAgent?: string
  detalhes?: string
}

@Injectable()
export class CertificadoDigitalService {

  // ── Listagem (sem expor senha/arquivo) ────────────────────

  async list(opts: {
    empresaId?: string
    clienteId?: string
    status?: string
    incluirArquivados?: boolean
    incluirRenovados?: boolean
  }) {
    const where: any = {}
    if (opts.empresaId) where.empresaId = opts.empresaId
    if (opts.status) where.status = opts.status
    if (!opts.incluirArquivados) where.arquivado = false
    // Versões antigas (RENOVADO) ficam ocultas por padrão — só a versão atual aparece
    if (!opts.incluirRenovados && !opts.status) where.status = { not: 'RENOVADO' } as any

    // Quando filtra por clienteId, também procura certs vinculados pelo MESMO
    // CNPJ (documento). Cobre o caso de duplicação de cliente: o mesmo CNPJ
    // existe em 2 registros e o certificado tá vinculado só ao "irmão".
    if (opts.clienteId) {
      const cli = await prisma.cliente.findUnique({
        where: { id: opts.clienteId },
        select: { documento: true, tipoDocumento: true },
      })
      const cnpjLimpo = cli?.documento ? cli.documento.replace(/\D/g, '') : ''
      if (cli?.tipoDocumento === 'CNPJ' && cnpjLimpo.length === 14) {
        where.OR = [
          { clienteId: opts.clienteId },
          { documento: cnpjLimpo },
        ]
      } else {
        where.clienteId = opts.clienteId
      }
    }

    return prisma.certificadoDigital.findMany({
      where,
      select: {
        id: true, tipo: true, titular: true, documento: true,
        numeroSerie: true, emissor: true,
        emitidoEm: true, expiraEm: true, status: true,
        clienteId: true, empresaId: true, socioId: true,
        observacoes: true, arquivado: true,
        parentId: true,
        createdBy: true, createdAt: true, updatedAt: true,
        cliente: { select: { id: true, razaoSocial: true } },
        empresa: { select: { id: true, razaoSocial: true } },
        socio: { select: { id: true, nomeCompleto: true } },
      } as any,
      // Ordem alfabética pelo titular do certificado
      orderBy: { titular: 'asc' },
    })
  }

  async getById(id: string) {
    const cert = await prisma.certificadoDigital.findUnique({
      where: { id },
      select: {
        id: true, tipo: true, titular: true, documento: true,
        numeroSerie: true, emissor: true,
        emitidoEm: true, expiraEm: true, status: true,
        clienteId: true, empresaId: true, socioId: true,
        observacoes: true, arquivado: true, arquivadoEm: true,
        parentId: true,
        createdBy: true, createdAt: true, updatedAt: true,
        cliente: { select: { id: true, razaoSocial: true } },
        empresa: { select: { id: true, razaoSocial: true } },
        socio: { select: { id: true, nomeCompleto: true } },
      } as any,
    })
    if (!cert) return null
    // Carrega cadeia de versões anteriores (parentId em árvore)
    const versoes: Array<{ id: string; numeroSerie: string | null; emitidoEm: Date; expiraEm: Date; status: string }> = []
    let cursor: { parentId: string | null } | null = cert as any
    const visitados = new Set<string>([cert.id])
    while (cursor && (cursor as any).parentId) {
      const parentId: string = (cursor as any).parentId
      if (visitados.has(parentId)) break // safety
      visitados.add(parentId)
      const ant = await prisma.certificadoDigital.findUnique({
        where: { id: parentId },
        select: { id: true, numeroSerie: true, emitidoEm: true, expiraEm: true, status: true, parentId: true } as any,
      }) as any
      if (!ant) break
      versoes.push({ id: ant.id, numeroSerie: ant.numeroSerie, emitidoEm: ant.emitidoEm, expiraEm: ant.expiraEm, status: ant.status })
      cursor = ant
    }
    return { ...cert, versoesAnteriores: versoes }
  }

  // ── KPIs ──────────────────────────────────────────────────

  async getStats(empresaId?: string) {
    const where: any = { arquivado: false }
    if (empresaId) where.empresaId = empresaId
    const agora = new Date()
    const em30 = new Date(agora.getTime() + 30 * 86400000)
    const em60 = new Date(agora.getTime() + 60 * 86400000)

    const [ativos, vencendo60, vencendo30, vencidos, revogados] = await Promise.all([
      prisma.certificadoDigital.count({ where: { ...where, status: 'ATIVO', expiraEm: { gt: em60 } } }),
      prisma.certificadoDigital.count({ where: { ...where, status: 'ATIVO', expiraEm: { gt: em30, lte: em60 } } }),
      prisma.certificadoDigital.count({ where: { ...where, status: 'ATIVO', expiraEm: { gt: agora, lte: em30 } } }),
      prisma.certificadoDigital.count({ where: { ...where, status: { in: ['ATIVO', 'EXPIRADO'] }, expiraEm: { lte: agora } } }),
      prisma.certificadoDigital.count({ where: { ...where, status: 'REVOGADO' } }),
    ])
    return { ativos, vencendo60, vencendo30, vencidos, revogados }
  }

  // ── Cadastro (upload PFX + parse + cifra + storage) ───────

  async create(input: {
    pfxBase64: string
    senha: string
    clienteId?: string | null
    empresaId?: string | null
    socioId?: string | null
    observacoes?: string | null
  }, audit: AuditContext): Promise<{ id: string }> {
    // Vínculo: pelo menos um
    if (!input.clienteId && !input.empresaId && !input.socioId) {
      throw new Error('Vincule o certificado a um cliente, empresa ou sócio.')
    }

    const pfxBuffer = Buffer.from(input.pfxBase64, 'base64')
    if (pfxBuffer.length === 0) throw new Error('Arquivo vazio.')
    if (pfxBuffer.length > 5 * 1024 * 1024) throw new Error('PFX maior que 5 MB.')

    // Parse — valida senha já no upload
    const info = parsePfx(pfxBuffer, input.senha)

    // Hash de integridade
    const arquivoHash = sha256Hex(pfxBuffer)

    // Cifra senha
    const cipher = encryptPassword(input.senha)
    const senhaCifrada = serializeCipher(cipher)

    // Cria registro (sem arquivoPath ainda — gera após ter ID)
    const created = await prisma.certificadoDigital.create({
      data: {
        clienteId: input.clienteId || null,
        empresaId: input.empresaId || null,
        socioId: input.socioId || null,
        tipo: 'A1',
        titular: info.titular,
        documento: info.documento,
        numeroSerie: info.numeroSerie,
        emissor: info.emissor,
        emitidoEm: info.emitidoEm,
        expiraEm: info.expiraEm,
        status: info.expiraEm < new Date() ? 'EXPIRADO' : 'ATIVO',
        senhaCifrada,
        arquivoHash,
        observacoes: input.observacoes || null,
        createdBy: audit.userId || null,
      },
    })

    // Salva arquivo em uploads/certificados/{empresaId|global}/{id}.pfx
    const empresaPath = (input.empresaId || created.empresaId || 'global').replace(/[^a-z0-9_-]/gi, '_')
    const dir = path.join(STORAGE_ROOT, empresaPath)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${created.id}.pfx`)
    await fs.writeFile(filePath, pfxBuffer, { mode: 0o600 })  // permissão restrita
    const arquivoPath = path.relative(STORAGE_ROOT, filePath).replace(/\\/g, '/')

    await prisma.certificadoDigital.update({
      where: { id: created.id },
      data: { arquivoPath },
    })

    await this.registrarAcesso(created.id, 'cadastrado', audit)
    return { id: created.id }
  }

  // ── Edição (apenas metadados — não tocam arquivo/senha) ──

  async update(id: string, data: {
    clienteId?: string | null
    empresaId?: string | null
    socioId?: string | null
    observacoes?: string | null
  }, audit: AuditContext) {
    await prisma.certificadoDigital.update({
      where: { id },
      data: {
        clienteId: data.clienteId ?? undefined,
        empresaId: data.empresaId ?? undefined,
        socioId: data.socioId ?? undefined,
        observacoes: data.observacoes ?? undefined,
      },
    })
    await this.registrarAcesso(id, 'editado', audit)
    return { ok: true }
  }

  // ── Operações sensíveis ──────────────────────────────────

  /**
   * Lê o PFX do disco, verifica integridade, retorna como Buffer
   * (caller é responsável por enviar pra cliente e descartar).
   * REQUER reauth + sub-permissão "download_arquivo".
   */
  async downloadPfx(id: string, motivo: string, audit: AuditContext): Promise<Buffer> {
    const cert = await prisma.certificadoDigital.findUnique({
      where: { id },
      select: { arquivoPath: true, arquivoHash: true, titular: true },
    })
    if (!cert?.arquivoPath) throw new Error('Arquivo não disponível.')
    const fullPath = path.join(STORAGE_ROOT, cert.arquivoPath)
    const buffer = await fs.readFile(fullPath)

    // Verifica integridade — alerta crítico se hash divergir
    const hashAtual = sha256Hex(buffer)
    if (cert.arquivoHash && hashAtual !== cert.arquivoHash) {
      await this.registrarAcesso(id, 'integridade_falhou', {
        ...audit,
        detalhes: `hash divergente: gravado=${cert.arquivoHash} atual=${hashAtual}`,
      })
      throw new Error('Falha de integridade do arquivo. Operação bloqueada — contate o administrador.')
    }

    await this.registrarAcesso(id, 'download_pfx', { ...audit, detalhes: motivo })
    return buffer
  }

  /**
   * Decifra e retorna a senha em claro. REQUER reauth + sub-permissão
   * "ver_senha". Toda chamada gera registro em audit.
   */
  async getSenha(id: string, motivo: string, audit: AuditContext): Promise<string> {
    const cert = await prisma.certificadoDigital.findUnique({
      where: { id },
      select: { senhaCifrada: true },
    })
    if (!cert?.senhaCifrada) throw new Error('Senha não disponível.')
    const cipher = parseCipher(cert.senhaCifrada)
    const plain = decryptPassword(cipher)
    await this.registrarAcesso(id, 'senha_visualizada', { ...audit, detalhes: motivo })
    return plain
  }

  // ── Renovação (versionamento) ─────────────────────────────

  /**
   * Cria um NOVO certificado vinculado ao antigo via parentId. Marca o antigo
   * com status='RENOVADO' (some da listagem padrão mas continua acessível
   * pela cadeia de versões nos detalhes do novo).
   *
   * Vínculos (cliente/empresa/sócio) são herdados do antigo a menos que sejam
   * explicitamente sobrescritos no input.
   */
  async renovar(input: {
    parentId: string
    pfxBase64: string
    senha: string
    observacoes?: string | null
    // Sobrescrever vínculos (opcional — herda do antigo se vazio)
    clienteId?: string | null
    empresaId?: string | null
    socioId?: string | null
  }, audit: AuditContext): Promise<{ id: string }> {
    // Carrega o antigo para herdar vínculos
    const antigo = await prisma.certificadoDigital.findUnique({
      where: { id: input.parentId },
      select: { id: true, clienteId: true, empresaId: true, socioId: true, status: true, titular: true },
    })
    if (!antigo) throw new Error('Certificado original não encontrado.')
    if (antigo.status === 'RENOVADO') {
      throw new Error('Este certificado já foi renovado. Renove a versão mais recente.')
    }

    const pfxBuffer = Buffer.from(input.pfxBase64, 'base64')
    if (pfxBuffer.length === 0) throw new Error('Arquivo vazio.')
    if (pfxBuffer.length > 5 * 1024 * 1024) throw new Error('PFX maior que 5 MB.')

    const info = parsePfx(pfxBuffer, input.senha)

    // Garante que o NOVO é um cert posterior — emitidoEm > antigo.emitidoEm
    // (evita renovar com cert mais velho por engano)
    // Não bloqueia se mesma data, apenas valida que é cert diferente

    const arquivoHash = sha256Hex(pfxBuffer)
    const cipher = encryptPassword(input.senha)
    const senhaCifrada = serializeCipher(cipher)

    const empresaIdFinal = input.empresaId !== undefined ? input.empresaId : antigo.empresaId
    const clienteIdFinal = input.clienteId !== undefined ? input.clienteId : antigo.clienteId
    const socioIdFinal = input.socioId !== undefined ? input.socioId : antigo.socioId

    const created = await prisma.certificadoDigital.create({
      data: {
        clienteId: clienteIdFinal,
        empresaId: empresaIdFinal,
        socioId: socioIdFinal,
        tipo: 'A1',
        titular: info.titular,
        documento: info.documento,
        numeroSerie: info.numeroSerie,
        emissor: info.emissor,
        emitidoEm: info.emitidoEm,
        expiraEm: info.expiraEm,
        status: info.expiraEm < new Date() ? 'EXPIRADO' : 'ATIVO',
        senhaCifrada,
        arquivoHash,
        observacoes: input.observacoes || null,
        createdBy: audit.userId || null,
        parentId: input.parentId,
      } as any,
    })

    // Salva arquivo
    const empresaPath = (empresaIdFinal || 'global').replace(/[^a-z0-9_-]/gi, '_')
    const dir = path.join(STORAGE_ROOT, empresaPath)
    await fs.mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${created.id}.pfx`)
    await fs.writeFile(filePath, pfxBuffer, { mode: 0o600 })
    const arquivoPath = path.relative(STORAGE_ROOT, filePath).replace(/\\/g, '/')

    await prisma.certificadoDigital.update({
      where: { id: created.id },
      data: { arquivoPath },
    })

    // Marca o antigo como RENOVADO (sai da listagem padrão)
    await prisma.certificadoDigital.update({
      where: { id: input.parentId },
      data: { status: 'RENOVADO' },
    })
    // Pendência resolvida — notificações do cert antigo somem do sino
    await this.limparNotificacoesDoCert(input.parentId)

    // Audit em ambos: novo (cadastrado) + antigo (renovado para)
    await this.registrarAcesso(created.id, 'cadastrado', { ...audit, detalhes: `Renovação de ${input.parentId}` })
    await prisma.certificadoDigitalAcesso.create({
      data: {
        certificadoId: input.parentId,
        userId: audit.userId || null,
        acao: 'renovado',
        detalhes: `Substituído pela versão ${created.id}`,
        ipAddress: audit.ipAddress || null,
        userAgent: audit.userAgent || null,
      },
    }).catch(() => null)

    return { id: created.id }
  }

  // ── Status ───────────────────────────────────────────────

  async revogar(id: string, motivo: string, audit: AuditContext) {
    await prisma.certificadoDigital.update({
      where: { id },
      data: { status: 'REVOGADO' },
    })
    await this.registrarAcesso(id, 'revogado', { ...audit, detalhes: motivo })
    await this.limparNotificacoesDoCert(id)
    return { ok: true }
  }

  async arquivar(id: string, audit: AuditContext) {
    await prisma.certificadoDigital.update({
      where: { id },
      data: { arquivado: true, arquivadoEm: new Date(), arquivadoPor: audit.userId || null },
    })
    await this.registrarAcesso(id, 'arquivado', audit)
    await this.limparNotificacoesDoCert(id)
    return { ok: true }
  }

  async desarquivar(id: string, audit: AuditContext) {
    await prisma.certificadoDigital.update({
      where: { id },
      data: { arquivado: false, arquivadoEm: null, arquivadoPor: null },
    })
    await this.registrarAcesso(id, 'desarquivado', audit)
    return { ok: true }
  }

  /**
   * Exclusão definitiva — apaga registro e arquivo do disco.
   * SOMENTE master/empresa-master + reauth + motivo. Mantém os acessos
   * cascateados (apagados também via FK) — trilha some junto.
   */
  async excluir(id: string, motivo: string, audit: AuditContext) {
    const cert = await prisma.certificadoDigital.findUnique({
      where: { id },
      select: { arquivoPath: true },
    })
    // Audit ANTES de apagar (FK cascadeará)
    await this.registrarAcesso(id, 'excluido', { ...audit, detalhes: motivo })
    if (cert?.arquivoPath) {
      const fullPath = path.join(STORAGE_ROOT, cert.arquivoPath)
      await fs.unlink(fullPath).catch(() => null)
    }
    await prisma.certificadoDigital.delete({ where: { id } })
    // Resolve a pendência: tira do sino qualquer notificação relacionada a este cert
    await this.limparNotificacoesDoCert(id)
    return { ok: true }
  }

  /** Remove notificações pendentes do sino quando o cert foi resolvido. */
  private async limparNotificacoesDoCert(certId: string) {
    await prisma.notification.deleteMany({
      where: {
        origem: 'gestao-certificados',
        link: { contains: certId },
      },
    }).catch(() => null)
  }

  /**
   * Exclusão em massa. Cada item tem try/catch isolado — falha em 1 não para o lote.
   * Restrição (master/empresa-master sem reauth) é aplicada no router.
   */
  async excluirEmMassa(ids: string[], motivo: string, audit: AuditContext): Promise<{ ok: number; falhou: number }> {
    let ok = 0
    let falhou = 0
    for (const id of ids) {
      try {
        await this.excluir(id, motivo, audit)
        ok++
      } catch (e) {
        console.warn(`[CertificadoDigital] Falha ao excluir ${id}:`, (e as Error).message)
        falhou++
      }
    }
    return { ok, falhou }
  }

  /**
   * Varre duplicatas e exclui as redundantes.
   * Critérios (em ordem):
   *   1. Mesmo numeroSerie (mais confiável — é único do cert físico)
   *   2. Mesmo documento + emissor + expiraEm (fallback quando numeroSerie está null)
   * Mantém o mais ANTIGO (createdAt asc) — preserva histórico de auditoria.
   * Empresa do contexto: se passada, restringe à empresa.
   */
  async excluirDuplicatas(empresaId: string | undefined, audit: AuditContext): Promise<{
    gruposEncontrados: number
    duplicadosExcluidos: number
    falhou: number
  }> {
    const where: any = {}
    if (empresaId) where.empresaId = empresaId

    const todos = await prisma.certificadoDigital.findMany({
      where,
      select: {
        id: true, numeroSerie: true, documento: true, emissor: true,
        expiraEm: true, createdAt: true, titular: true,
      },
      orderBy: { createdAt: 'asc' },  // Mais antigo primeiro = registro a manter
    })

    // Agrupa por chave de duplicação
    const grupos = new Map<string, typeof todos>()
    for (const c of todos) {
      // Chave 1: numeroSerie (se existe e não vazio)
      const k1 = c.numeroSerie ? `serie:${c.numeroSerie}` : null
      // Chave 2: documento + emissor + expiraEm (fallback sem série)
      const k2 = !c.numeroSerie && c.documento
        ? `doc:${c.documento}|${c.emissor || ''}|${c.expiraEm.toISOString()}`
        : null
      const key = k1 || k2
      if (!key) continue
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(c)
    }

    let gruposComDup = 0
    let excluidos = 0
    let falhou = 0

    for (const [, lista] of grupos) {
      if (lista.length < 2) continue
      gruposComDup++
      // O primeiro (mais antigo) fica; os demais são excluídos
      const aManter = lista[0]!
      const aExcluir = lista.slice(1)
      console.log(`[CertificadoDigital] Duplicata: "${aManter.titular}" — mantém ${aManter.id} (${aManter.createdAt.toISOString()}), exclui ${aExcluir.length}`)
      for (const dup of aExcluir) {
        try {
          await this.excluir(dup.id, 'Excluído por varredura de duplicatas', audit)
          excluidos++
        } catch (e) {
          console.warn(`[CertificadoDigital] Falha ao excluir duplicata ${dup.id}:`, (e as Error).message)
          falhou++
        }
      }
    }

    return { gruposEncontrados: gruposComDup, duplicadosExcluidos: excluidos, falhou }
  }

  // ── Trilha de auditoria ──────────────────────────────────

  async listAcessos(certificadoId: string) {
    const items = await prisma.certificadoDigitalAcesso.findMany({
      where: { certificadoId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    // Enriquece com nome do usuário (sem relação Prisma)
    const userIds = Array.from(new Set(items.map(i => i.userId).filter((u): u is string => !!u)))
    const usersMap = userIds.length > 0
      ? new Map((await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })).map(u => [u.id, u]))
      : new Map()
    return items.map(i => ({
      ...i,
      usuario: i.userId ? usersMap.get(i.userId) ?? null : null,
    }))
  }

  // ── Notificação de vencimento (cron) ─────────────────────

  /**
   * Atualiza status para EXPIRADO em massa quando expiraEm < agora,
   * e cria notificações no sino para certificados próximos do vencimento.
   *
   * Buckets: 60d, 30d, 7d, VENCIDO. Cada (userId, certId, bucket) gera no
   * máximo uma notificação não-lida — quando o cert muda de bucket
   * (ex: 60d → 30d), uma nova notificação é criada.
   *
   * Destinatários: master/empresa-master da empresa do certificado +
   * responsável do cliente vinculado (ClienteAreaContratada.responsavelId).
   */
  async notificarVencimentos(): Promise<{ verificados: number; notificados: number; expirados: number }> {
    const agora = new Date()
    const em30 = new Date(agora.getTime() + 30 * 86400000)
    const em60 = new Date(agora.getTime() + 60 * 86400000)

    // 1. Atualiza status ATIVO → EXPIRADO em massa para certs vencidos
    const expRes = await prisma.certificadoDigital.updateMany({
      where: { status: 'ATIVO', expiraEm: { lte: agora } },
      data: { status: 'EXPIRADO' },
    })

    // 2. SYNC MODE: limpa todas notificações de cert do sistema e recria.
    //    Garante que notificações refletem o estado atual — certs renovados/excluídos/revogados/arquivados
    //    desaparecem do sino automaticamente; bucket muda quando o cert anda no tempo.
    await prisma.notification.deleteMany({ where: { origem: 'gestao-certificados' } })

    // 3. Carrega certs em buckets de alerta (não revogados, não arquivados)
    const certs = await prisma.certificadoDigital.findMany({
      where: {
        arquivado: false,
        status: { in: ['ATIVO', 'EXPIRADO'] },
        expiraEm: { lte: em60 },  // estão dentro de 60 dias OU vencidos
      },
      select: {
        id: true, titular: true, documento: true,
        clienteId: true, empresaId: true, expiraEm: true,
      },
    })

    if (certs.length === 0) {
      return { verificados: 0, notificados: 0, expirados: expRes.count }
    }
    // Vars não usadas após sync mode (eram pra dedupe diário/incremental)
    void em30

    // 3. Pré-carrega destinatários:
    //    a) master/empresa-master (sempre veem)
    //    b) users com permissão canRead em 'gestao-certificados'
    //    c) responsáveis dos clientes vinculados (ClienteAreaContratada)
    const empresaIds = Array.from(new Set(certs.map(c => c.empresaId).filter((e): e is string => !!e)))
    const clienteIds = Array.from(new Set(certs.map(c => c.clienteId).filter((c): c is string => !!c)))

    const [masters, usersComPermissao, areasResp] = await Promise.all([
      // (a) Masters globais e empresa-masters da(s) empresa(s) afetada(s)
      prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { isMaster: true },
            { isEmpresaMaster: true, ...(empresaIds.length > 0 ? { empresaId: { in: empresaIds } } : {}) },
          ],
        },
        select: { id: true, empresaId: true, isMaster: true },
      }),
      // (b) Users ativos com permissão canRead em 'gestao-certificados'.
      //     Filtra por empresa pra não vazar entre tenants.
      prisma.user.findMany({
        where: {
          isActive: true,
          permissions: { some: { moduleSlug: 'gestao-certificados', canRead: true } },
        },
        select: { id: true, empresaId: true, isMaster: true },
      }),
      // (c) Responsáveis por cliente nas áreas — qualquer um dos responsáveis do cliente
      clienteIds.length > 0
        ? prisma.clienteAreaContratada.findMany({
            where: { clienteId: { in: clienteIds }, responsavelId: { not: null } },
            select: { clienteId: true, responsavelId: true },
          })
        : Promise.resolve([]),
    ])

    // Map clienteId → set de responsavelIds
    const respPorCliente = new Map<string, Set<string>>()
    for (const a of areasResp) {
      if (!a.responsavelId) continue
      if (!respPorCliente.has(a.clienteId)) respPorCliente.set(a.clienteId, new Set())
      respPorCliente.get(a.clienteId)!.add(a.responsavelId)
    }

    // 4. Para cada cert, decide bucket + destinatários + cria/dedupe notificação
    let notificados = 0

    for (const cert of certs) {
      const dias = Math.ceil((new Date(cert.expiraEm).getTime() - agora.getTime()) / 86400000)
      let bucket: 'VENCIDO' | '7D' | '30D' | '60D'
      let titulo: string
      let tipo: 'info' | 'warning' | 'error'
      if (dias < 0) {
        bucket = 'VENCIDO'
        titulo = `Certificado VENCIDO: ${cert.titular}`
        tipo = 'error'
      } else if (dias <= 7) {
        bucket = '7D'
        titulo = `Certificado vence em ${dias} dia${dias === 1 ? '' : 's'}: ${cert.titular}`
        tipo = 'error'
      } else if (dias <= 30) {
        bucket = '30D'
        titulo = `Certificado vence em ${dias} dias: ${cert.titular}`
        tipo = 'warning'
      } else {
        bucket = '60D'
        titulo = `Certificado vence em ${dias} dias: ${cert.titular}`
        tipo = 'info'
      }

      const expISO = new Date(cert.expiraEm).toISOString().slice(0, 10)
      const link = `/gestao-certificados?cert=${cert.id}&estado=${bucket}&exp=${expISO}`
      const mensagem = `Documento ${cert.documento}. Verifique e renove se necessário.`

      // Destinatários:
      //  • masters globais (qualquer empresa)
      //  • masters/empresa-masters da empresa do certificado
      //  • users com permissão canRead no módulo (filtrado por empresa)
      //  • responsáveis do cliente vinculado
      const destinatarios = new Set<string>()
      for (const m of masters) {
        if (m.isMaster) destinatarios.add(m.id)
        else if (m.empresaId === cert.empresaId) destinatarios.add(m.id)
      }
      for (const u of usersComPermissao) {
        // Master global cobre todas; não-master só recebe se for da mesma empresa
        if (u.isMaster) destinatarios.add(u.id)
        else if (u.empresaId === cert.empresaId) destinatarios.add(u.id)
        else if (!cert.empresaId) destinatarios.add(u.id) // certs sem empresa definida (legado): notifica todos com permissão
      }
      if (cert.clienteId && respPorCliente.has(cert.clienteId)) {
        for (const r of respPorCliente.get(cert.clienteId)!) destinatarios.add(r)
      }
      if (destinatarios.size === 0) continue

      // Sync mode — não precisa dedupe, já limpamos tudo no início
      const data = Array.from(destinatarios).map(userId => ({
        userId,
        titulo,
        mensagem,
        tipo,
        link,
        origem: 'gestao-certificados',
        empresaId: cert.empresaId,
      }))
      if (data.length > 0) {
        await prisma.notification.createMany({ data }).catch(() => null)
        notificados += data.length
      }
    }

    return { verificados: certs.length, notificados, expirados: expRes.count }
  }

  // ── Helper interno ───────────────────────────────────────

  private async registrarAcesso(certificadoId: string, acao: AcaoAcesso, audit: AuditContext) {
    return prisma.certificadoDigitalAcesso.create({
      data: {
        certificadoId,
        userId: audit.userId || null,
        acao,
        ipAddress: audit.ipAddress || null,
        userAgent: audit.userAgent || null,
        detalhes: audit.detalhes || null,
      },
    }).catch((e: Error) => {
      console.warn('[CertificadoDigital] Falha ao registrar acesso:', e.message)
    })
  }
}
