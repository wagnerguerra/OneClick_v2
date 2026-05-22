import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Importacao de dados Comerciais do banco SERPRO2 (MySQL db_intranet).
 * Importa: CRM Etapas, Oportunidades, Orcamentos + Itens, Servicos + Etapas + Passos,
 * Execucoes, Pesquisas de Satisfacao.
 *
 * Preserva numeros de orcamento e respeita multi-empresa via empresa_id.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mysql = require('mysql2/promise')

export interface ImportComercialResult {
  etapas: number
  oportunidades: number
  orcamentos: number
  orcamentoItens: number
  servicosCatalogo: number
  servicos: number
  execucoes: number
  pesquisas: number
  erros: string[]
  message: string
}

export interface ImportComercialProgress {
  status: 'idle' | 'running' | 'done' | 'error'
  fase: string
  current: number
  total: number
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string }>
}

@Injectable()
export class ImportComercialService {
  private progress: ImportComercialProgress = { status: 'idle', fase: '', current: 0, total: 0, logs: [] }

  getProgress(): ImportComercialProgress { return { ...this.progress, logs: [...this.progress.logs] } }

  private log(level: 'info' | 'warn' | 'error' | 'success', msg: string) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    this.progress.logs.push({ time, level, msg })
    const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : level === 'success' ? '✓' : '→'
    console.log(`[IMPORT-COMERCIAL] ${prefix} ${msg}`)
  }

  private async getConnection() {
    const config = {
      host: process.env.LEGACY_DB_HOST || 'localhost',
      port: Number(process.env.LEGACY_DB_PORT || 3306),
      user: process.env.LEGACY_DB_USER || 'root',
      password: process.env.LEGACY_DB_PASSWORD || '',
      database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
      connectTimeout: 10000,
    }
    this.log('info', `MySQL: ${config.host}:${config.port}/${config.database} (user=${config.user})`)
    return mysql.createConnection(config)
  }

  // Mapa de IDs antigos (MySQL INT) → novos (PostgreSQL cuid)
  private idMap = {
    etapas: new Map<number, string>(),
    oportunidades: new Map<number, string>(),
    orcamentos: new Map<number, string>(),
    servicos: new Map<number, string>(),
    servicoEtapas: new Map<number, string>(),
    servicoPassos: new Map<number, string>(),
    execucoes: new Map<number, string>(),
    catalogo: new Map<number, string>(),
    clientes: new Map<number, string>(), // legacy cliente_id → new clienteId
  }

  // Resolver clienteId do novo sistema pelo ID legado
  private async resolverCliente(legacyClienteId: number | null, conn: any): Promise<string | null> {
    if (!legacyClienteId) return null
    if (this.idMap.clientes.has(legacyClienteId)) return this.idMap.clientes.get(legacyClienteId)!

    // Buscar CNPJ no legado
    const [rows] = await conn.query('SELECT documento FROM clientes WHERE id = ? LIMIT 1', [legacyClienteId])
    if (!rows?.[0]?.documento) return null
    const cnpj = String(rows[0].documento).replace(/\D/g, '')

    // Buscar no novo sistema
    const newCliente = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM clientes WHERE replace(replace(replace(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, cnpj,
    ).catch(() => [])

    if (newCliente[0]) {
      this.idMap.clientes.set(legacyClienteId, newCliente[0].id)
      return newCliente[0].id
    }
    return null
  }

  // Resolver empresaId do novo sistema pelo ID legado
  private async resolverEmpresa(legacyEmpresaId: number | null, conn: any): Promise<string | null> {
    if (!legacyEmpresaId) return null

    // Buscar CNPJ da empresa no legado
    const [rows] = await conn.query('SELECT cnpj FROM empresas WHERE id = ? LIMIT 1', [legacyEmpresaId])
    if (!rows?.[0]?.cnpj) return null
    const cnpj = String(rows[0].cnpj).replace(/\D/g, '')

    // Buscar no novo sistema
    const newEmpresa = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM empresas WHERE replace(replace(replace(cnpj, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, cnpj,
    ).catch(() => [])

    return newEmpresa[0]?.id || null
  }

  async importarTudo(): Promise<ImportComercialResult> {
    if (this.progress.status === 'running') throw new Error('Importacao ja em andamento')

    this.progress = { status: 'running', fase: 'Conectando...', current: 0, total: 8, logs: [] }
    this.idMap = {
      etapas: new Map(), oportunidades: new Map(), orcamentos: new Map(),
      servicos: new Map(), servicoEtapas: new Map(), servicoPassos: new Map(),
      execucoes: new Map(), catalogo: new Map(), clientes: new Map(),
    }

    const result: ImportComercialResult = {
      etapas: 0, oportunidades: 0, orcamentos: 0, orcamentoItens: 0,
      servicosCatalogo: 0, servicos: 0, execucoes: 0, pesquisas: 0,
      erros: [], message: '',
    }

    let conn: any = null
    try {
      this.log('info', 'Conectando ao MySQL legado (db_intranet)...')
      conn = await this.getConnection()
      this.log('success', 'Conectado ao MySQL')

      // ── FASE 1: CRM Etapas ────────────────────────────────
      this.progress.fase = 'CRM Etapas'
      this.progress.current = 1
      result.etapas = await this.importarEtapas(conn)

      // ── FASE 2: Oportunidades ─────────────────────────────
      this.progress.fase = 'Oportunidades'
      this.progress.current = 2
      result.oportunidades = await this.importarOportunidades(conn)

      // ── FASE 3: Catalogo de Servicos ──────────────────────
      this.progress.fase = 'Catalogo de Servicos'
      this.progress.current = 3
      result.servicosCatalogo = await this.importarCatalogo(conn)

      // ── FASE 4: Orcamentos + Itens ────────────────────────
      this.progress.fase = 'Orcamentos'
      this.progress.current = 4
      const orcResult = await this.importarOrcamentos(conn)
      result.orcamentos = orcResult.orcamentos
      result.orcamentoItens = orcResult.itens

      // ── FASE 5: Servicos (Templates) ──────────────────────
      this.progress.fase = 'Servicos'
      this.progress.current = 5
      result.servicos = await this.importarServicos(conn)

      // ── FASE 6: Execucoes ─────────────────────────────────
      this.progress.fase = 'Execucoes de Servico'
      this.progress.current = 6
      result.execucoes = await this.importarExecucoes(conn)

      // ── FASE 7: Pesquisas de Satisfacao ───────────────────
      this.progress.fase = 'Pesquisas de Satisfacao'
      this.progress.current = 7
      result.pesquisas = await this.importarPesquisas(conn)

      // ── FASE 8: Resumo ────────────────────────────────────
      this.progress.fase = 'Concluido'
      this.progress.current = 8
      result.message = `Importacao concluida: ${result.etapas} etapas, ${result.oportunidades} oportunidades, ${result.orcamentos} orcamentos (${result.orcamentoItens} itens), ${result.servicosCatalogo} catalogo, ${result.servicos} servicos, ${result.execucoes} execucoes, ${result.pesquisas} pesquisas`
      this.log('success', result.message)
      this.progress.status = 'done'

    } catch (e) {
      this.log('error', `Erro fatal: ${(e as Error).message}`)
      result.erros.push((e as Error).message)
      result.message = `Erro: ${(e as Error).message}`
      this.progress.status = 'error'
    } finally {
      if (conn) await conn.end().catch(() => {})
    }

    return result
  }

  // ── FASE 1: CRM Etapas ──────────────────────────────────

  private async importarEtapas(conn: any): Promise<number> {
    this.log('info', 'Importando CRM Etapas...')
    const [rows] = await conn.query('SELECT * FROM crm_etapas ORDER BY empresa_id, ordem')
    let count = 0

    for (const row of rows) {
      try {
        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)
        // Verificar duplicata por nome + empresa
        const existing = await prisma.crmEtapa.findFirst({
          where: { nome: row.nome, empresaId: empresaId || undefined },
        })
        if (existing) { this.idMap.etapas.set(row.id, existing.id); continue }

        const created = await prisma.crmEtapa.create({
          data: {
            nome: row.nome, ordem: row.ordem, cor: row.cor || '#818cf8',
            probabilidade: row.probabilidade_pct || 0,
            ehGanho: !!row.eh_ganho, ehPerda: !!row.eh_perda,
            empresaId,
          },
        })
        this.idMap.etapas.set(row.id, created.id)
        count++
      } catch (e) { this.log('warn', `Etapa ${row.nome}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} etapa(s) importada(s)`)
    return count
  }

  // ── FASE 2: Oportunidades ─────────────────────────────────

  private async importarOportunidades(conn: any): Promise<number> {
    this.log('info', 'Importando Oportunidades...')
    const [rows] = await conn.query('SELECT * FROM oportunidades ORDER BY id')
    let count = 0

    for (const row of rows) {
      try {
        const etapaId = this.idMap.etapas.get(row.etapa_id)
        if (!etapaId) { this.log('warn', `Oportunidade ${row.titulo}: etapa ${row.etapa_id} nao encontrada`); continue }

        const clienteId = await this.resolverCliente(row.cliente_id, conn)
        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)

        const created = await prisma.oportunidade.create({
          data: {
            titulo: row.titulo || 'Sem titulo',
            descricao: row.descricao || null,
            valor: row.valor_estimado || null,
            etapaId, clienteId, empresaId,
            responsavelId: null, // usuario nao mapeado
            createdAt: row.criado_em || new Date(),
          },
        })
        this.idMap.oportunidades.set(row.id, created.id)
        count++

        // Tarefas
        const [tarefas] = await conn.query('SELECT * FROM oportunidade_tarefas WHERE oportunidade_id = ?', [row.id])
        for (const t of tarefas) {
          await prisma.oportunidadeTarefa.create({
            data: { oportunidadeId: created.id, titulo: t.titulo, concluida: !!t.concluida, prazo: t.vencimento || null },
          }).catch(() => {})
        }

        // Mensagens
        const [msgs] = await conn.query('SELECT * FROM oportunidade_mensagens WHERE oportunidade_id = ?', [row.id])
        for (const m of msgs) {
          await prisma.oportunidadeMensagem.create({
            data: { oportunidadeId: created.id, userId: null, mensagem: m.conteudo || '', createdAt: m.criado_em || new Date() },
          }).catch(() => {})
        }
      } catch (e) { this.log('warn', `Oportunidade ${row.id}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} oportunidade(s) importada(s)`)
    return count
  }

  // ── FASE 3: Catalogo de Servicos ──────────────────────────

  private async importarCatalogo(conn: any): Promise<number> {
    this.log('info', 'Importando Catalogo de Servicos...')
    const [rows] = await conn.query('SELECT * FROM servicos_catalogo WHERE ativo = 1 ORDER BY id')
    let count = 0

    for (const row of rows) {
      try {
        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)
        // Verificar duplicata
        const existing = await prisma.servicoCatalogo.findFirst({ where: { nome: row.nome, empresaId: empresaId || undefined } })
        if (existing) { this.idMap.catalogo.set(row.id, existing.id); continue }

        const tipo = String(row.tipo || 'SERVICO').replace('Ç', 'C').replace('SERVIÇO', 'SERVICO')
        const created = await prisma.servicoCatalogo.create({
          data: {
            nome: row.nome, tipo,
            valorPadrao: row.valor_padrao || null,
            textoPadrao: row.texto_padrao || null,
            ativo: true, empresaId,
          },
        })
        this.idMap.catalogo.set(row.id, created.id)
        count++
      } catch (e) { this.log('warn', `Catalogo ${row.nome}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} item(ns) de catalogo importado(s)`)
    return count
  }

  // ── FASE 4: Orcamentos ────────────────────────────────────

  private async importarOrcamentos(conn: any): Promise<{ orcamentos: number; itens: number }> {
    this.log('info', 'Importando Orcamentos...')
    const [rows] = await conn.query('SELECT * FROM orcamentos ORDER BY empresa_id, numero')
    let orcCount = 0, itensCount = 0

    for (const row of rows) {
      try {
        const clienteId = await this.resolverCliente(row.cliente_id, conn)
        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)
        const oportunidadeId = row.oportunidade_id ? (this.idMap.oportunidades.get(row.oportunidade_id) || null) : null

        // Verificar duplicata por numero + empresa
        const existing = await prisma.orcamento.findFirst({
          where: { numero: row.numero, empresaId: empresaId || undefined },
        })
        if (existing) { this.idMap.orcamentos.set(row.id, existing.id); continue }

        // Mapear status
        let status = String(row.status || 'NOVO').toUpperCase()
        if (status === 'PESQUISA') status = 'ENVIADO' // status PESQUISA nao existe no novo
        const validStatuses = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO']
        if (!validStatuses.includes(status)) status = 'NOVO'

        const created = await prisma.orcamento.create({
          data: {
            numero: row.numero, // PRESERVAR NUMERO ORIGINAL
            token: row.token || undefined,
            clienteId, empresaId, oportunidadeId,
            responsavelId: null, solicitanteId: null,
            status: status as any,
            tipo: row.tipo || null,
            validadeDias: row.validade_dias || 90,
            contatos: row.contatos || null,
            emailsContatos: row.emails_contatos || null,
            descontoPct: row.desconto_pct || null,
            descontoValor: row.desconto_valor || null,
            formaPagamento: null,
            textoInterno: row.texto_interno || null,
            textoCorpoCliente: row.texto_corpo_cliente || null,
            observacoes: null,
            decisaoTipo: row.decisao_cliente_tipo || null,
            decisaoEm: row.decisao_cliente_em || null,
            decisaoNome: row.decisao_cliente_nome || null,
            decisaoCpf: row.decisao_cliente_cpf || null,
            decisaoObs: row.decisao_cliente_observacao || null,
            arquivado: !!row.arquivado,
            arquivadoEm: row.arquivado_em || null,
            createdAt: row.criado_em || new Date(),
          },
        })
        this.idMap.orcamentos.set(row.id, created.id)
        orcCount++

        // Itens
        const [itens] = await conn.query('SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY id', [row.id])
        for (const item of itens) {
          const tipo = String(item.tipo || 'SERVICO').replace('Ç', 'C').replace('SERVIÇO', 'SERVICO')
          await prisma.orcamentoItem.create({
            data: {
              orcamentoId: created.id,
              tipo,
              descricao: item.descricao || '',
              quantidade: item.quantidade || 1,
              valorUnitario: item.valor_unitario || 0,
              catalogoId: item.servico_catalogo_id ? (this.idMap.catalogo.get(item.servico_catalogo_id) || null) : null,
            },
          }).catch(() => {})
          itensCount++
        }

        // Recalcular totais
        await this.recalcularTotais(created.id)

        // Eventos
        const [eventos] = await conn.query('SELECT * FROM orcamento_eventos WHERE orcamento_id = ? ORDER BY criado_em', [row.id])
        for (const ev of eventos) {
          await prisma.orcamentoEvento.create({
            data: {
              orcamentoId: created.id, userId: null,
              tipo: ev.tipo || 'imported', de: null, para: null,
              descricao: ev.descricao || 'Importado do legado',
              createdAt: ev.criado_em || new Date(),
            },
          }).catch(() => {})
        }

        // Mensagens
        const [msgs] = await conn.query('SELECT * FROM orcamento_mensagens WHERE orcamento_id = ? ORDER BY criado_em', [row.id])
        for (const m of msgs) {
          await prisma.orcamentoMensagem.create({
            data: { orcamentoId: created.id, userId: null, mensagem: m.conteudo || '', createdAt: m.criado_em || new Date() },
          }).catch(() => {})
        }
      } catch (e) {
        this.log('warn', `Orcamento #${row.numero}: ${(e as Error).message}`)
      }
    }
    this.log('success', `${orcCount} orcamento(s) + ${itensCount} iten(s) importado(s)`)
    return { orcamentos: orcCount, itens: itensCount }
  }

  private async recalcularTotais(orcamentoId: string) {
    const orc = await prisma.orcamento.findUnique({ where: { id: orcamentoId }, include: { itens: true } })
    if (!orc) return
    let totalServicos = 0, totalTaxas = 0, totalDespesas = 0
    for (const item of orc.itens) {
      const sub = Number(item.quantidade) * Number(item.valorUnitario)
      if (item.tipo === 'SERVICO') totalServicos += sub
      else if (item.tipo === 'TAXA') totalTaxas += sub
      else if (item.tipo === 'DESPESA') totalDespesas += sub
    }
    const descPct = Number(orc.descontoPct || 0)
    const descFixo = Number(orc.descontoValor || 0)
    const descAplicado = Math.round((totalServicos * descPct / 100 + descFixo) * 100) / 100
    const totalGeral = Math.max(0, Math.round((totalServicos + totalTaxas + totalDespesas - descAplicado) * 100) / 100)
    await prisma.orcamento.update({
      where: { id: orcamentoId },
      data: { totalServicos: Math.round(totalServicos * 100) / 100, totalTaxas: Math.round(totalTaxas * 100) / 100, totalDespesas: Math.round(totalDespesas * 100) / 100, descontoAplicado: descAplicado, totalGeral },
    })
  }

  // ── FASE 5: Servicos (Templates) ──────────────────────────

  private async importarServicos(conn: any): Promise<number> {
    this.log('info', 'Importando Templates de Servico...')
    const [rows] = await conn.query('SELECT * FROM servicos WHERE ativo = 1 ORDER BY id')
    let count = 0

    for (const row of rows) {
      try {
        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)
        const existing = await prisma.servico.findFirst({ where: { nome: row.nome, empresaId: empresaId || undefined } })
        if (existing) { this.idMap.servicos.set(row.id, existing.id); continue }

        const created = await prisma.servico.create({
          data: {
            nome: row.nome, descricao: row.descricao || null,
            slaHoras: row.sla_geral_horas ? Math.round(Number(row.sla_geral_horas)) : null,
            ativo: true, empresaId,
          },
        })
        this.idMap.servicos.set(row.id, created.id)
        count++

        // Etapas
        const [etapas] = await conn.query('SELECT * FROM servico_etapas WHERE servico_id = ? AND ativo = 1 ORDER BY ordem', [row.id])
        for (const et of etapas) {
          const etCreated = await prisma.servicoEtapa.create({
            data: { servicoId: created.id, nome: et.nome, ordem: et.ordem, slaHoras: et.sla_horas ? Math.round(Number(et.sla_horas)) : null },
          })
          this.idMap.servicoEtapas.set(et.id, etCreated.id)

          // Passos
          const [passos] = await conn.query('SELECT * FROM servico_passos WHERE etapa_id = ? AND ativo = 1 ORDER BY ordem', [et.id])
          for (const p of passos) {
            const pCreated = await prisma.servicoPasso.create({
              data: {
                etapaId: etCreated.id, nome: p.nome, ordem: p.ordem,
                obrigatorio: !!p.obrigatorio,
                slaHoras: p.sla_horas ? Math.round(Number(p.sla_horas)) : null,
                textoOrientativo: p.texto_orientativo || null,
                recorrente: !!p.recorrente, recorrenciaTipo: p.recorrencia_tipo || null,
                enviaEmail: !!p.envia_email, emailAssunto: p.email_assunto || null, emailCorpo: p.email_corpo || null,
              },
            })
            this.idMap.servicoPassos.set(p.id, pCreated.id)
          }
        }
      } catch (e) { this.log('warn', `Servico ${row.nome}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} servico(s) importado(s)`)
    return count
  }

  // ── FASE 6: Execucoes ─────────────────────────────────────

  private async importarExecucoes(conn: any): Promise<number> {
    this.log('info', 'Importando Execucoes de Servico...')
    const [rows] = await conn.query('SELECT * FROM servico_execucoes ORDER BY id')
    let count = 0

    for (const row of rows) {
      try {
        const servicoId = this.idMap.servicos.get(row.servico_id)
        if (!servicoId) continue

        const clienteId = await this.resolverCliente(row.cliente_id, conn)
        if (!clienteId) continue

        const empresaId = await this.resolverEmpresa(row.empresa_id, conn)
        const orcamentoId = row.orcamento_id ? (this.idMap.orcamentos.get(row.orcamento_id) || null) : null
        const status = row.finalizado_em ? 'CONCLUIDO' : 'EM_ANDAMENTO'

        const created = await prisma.servicoExecucao.create({
          data: {
            servicoId, clienteId, orcamentoId, empresaId,
            responsavelId: null, status,
            iniciadoEm: row.iniciado_em || row.criado_em || new Date(),
            concluidoEm: row.finalizado_em || null,
          },
        })
        this.idMap.execucoes.set(row.id, created.id)
        count++

        // Passos da execucao
        const [passos] = await conn.query('SELECT * FROM servico_execucao_passos WHERE execucao_id = ? ORDER BY id', [row.id])
        for (const p of passos) {
          // Buscar nomes da etapa/passo
          let etapaNome = 'Etapa', passoNome = 'Passo'
          try {
            const [etRows] = await conn.query('SELECT se.nome as etapa_nome, sp.nome as passo_nome FROM servico_passos sp JOIN servico_etapas se ON se.id = sp.etapa_id WHERE sp.id = ?', [p.passo_id])
            if (etRows[0]) { etapaNome = etRows[0].etapa_nome; passoNome = etRows[0].passo_nome }
          } catch { /* */ }

          await prisma.servicoExecucaoPasso.create({
            data: {
              execucaoId: created.id,
              passoId: this.idMap.servicoPassos.get(p.passo_id) || p.passo_id?.toString() || '',
              etapaNome, passoNome,
              ordem: p.id, // usar id como ordem
              concluido: !!p.concluido,
              concluidoPor: null,
              concluidoEm: p.data_conclusao || null,
              observacao: p.observacao || null,
            },
          }).catch(() => {})
        }
      } catch (e) { this.log('warn', `Execucao ${row.id}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} execucao(oes) importada(s)`)
    return count
  }

  // ── FASE 7: Pesquisas ─────────────────────────────────────

  private async importarPesquisas(conn: any): Promise<number> {
    this.log('info', 'Importando Pesquisas de Satisfacao...')
    const [rows] = await conn.query('SELECT * FROM pesquisas_satisfacao ORDER BY id')
    let count = 0

    for (const row of rows) {
      try {
        const clienteId = await this.resolverCliente(row.cliente_id, conn)
        if (!clienteId) continue

        const orcamentoId = row.orcamento_id ? (this.idMap.orcamentos.get(row.orcamento_id) || null) : null

        // Verificar duplicata por token
        if (row.token) {
          const existing = await prisma.pesquisaSatisfacao.findFirst({ where: { token: row.token } })
          if (existing) continue
        }

        await prisma.pesquisaSatisfacao.create({
          data: {
            token: row.token || undefined,
            clienteId, orcamentoId,
            enviadaEm: row.enviada_em || null,
            respondidaEm: row.respondida_em || null,
            nota: row.nota || null,
            comentario: row.comentario || null,
            createdAt: row.criado_em || new Date(),
          },
        })
        count++
      } catch (e) { this.log('warn', `Pesquisa ${row.id}: ${(e as Error).message}`) }
    }
    this.log('success', `${count} pesquisa(s) importada(s)`)
    return count
  }
}
