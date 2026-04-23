import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import { FolhaParserService } from './folha-parser.service'

@Injectable()
export class FolhaService {
  constructor(private readonly parser: FolhaParserService) {}

  // ══════════════════════════════════════════════════════════════
  // CRUD Filiais
  // ══════════════════════════════════════════════════════════════

  async listarFiliais(clienteId: string) {
    return prisma.folhaFilial.findMany({
      where: { clienteId },
      include: { setores: true },
      orderBy: { codigoFilial: 'asc' },
    })
  }

  async criarFilial(data: { clienteId: string; cnpj: string; codigoFilial: string; endereco?: string; contaLiquido?: number; contaLiquidoAlt?: number | null }) {
    return prisma.folhaFilial.create({ data })
  }

  async atualizarFilial(id: string, data: Partial<{ cnpj: string; codigoFilial: string; endereco: string; contaLiquido: number; contaLiquidoAlt: number | null; ativo: boolean }>) {
    return prisma.folhaFilial.update({ where: { id }, data })
  }

  async excluirFilial(id: string) {
    return prisma.folhaFilial.delete({ where: { id } })
  }

  // ══════════════════════════════════════════════════════════════
  // CRUD Setores
  // ══════════════════════════════════════════════════════════════

  async criarSetor(data: { filialId: string; nome: string; tipoContabil: string }) {
    return prisma.folhaSetor.create({ data })
  }

  async excluirSetor(id: string) {
    return prisma.folhaSetor.delete({ where: { id } })
  }

  // ══════════════════════════════════════════════════════════════
  // CRUD Evento -> Conta (tabela de-para)
  // ══════════════════════════════════════════════════════════════

  async listarEventoContas(clienteId: string) {
    return prisma.folhaEventoConta.findMany({
      where: { clienteId },
      orderBy: [{ tipo: 'asc' }, { codigoEvento: 'asc' }],
    })
  }

  async salvarEventoConta(data: {
    clienteId: string; codigoEvento: number; descricao?: string; tipo: string
    contaCustoDebito?: number | null; contaCustoCredito?: number | null
    contaDespesaDebito?: number | null; contaDespesaCredito?: number | null
    geraLancamento?: boolean
  }) {
    return prisma.folhaEventoConta.upsert({
      where: { clienteId_codigoEvento_tipo: { clienteId: data.clienteId, codigoEvento: data.codigoEvento, tipo: data.tipo } },
      create: data as any,
      update: {
        descricao: data.descricao,
        contaCustoDebito: data.contaCustoDebito,
        contaCustoCredito: data.contaCustoCredito,
        contaDespesaDebito: data.contaDespesaDebito,
        contaDespesaCredito: data.contaDespesaCredito,
        geraLancamento: data.geraLancamento,
      },
    })
  }

  async salvarEventoContasBulk(clienteId: string, items: Array<{
    codigoEvento: number; descricao?: string; tipo: string
    contaCustoDebito?: number | null; contaCustoCredito?: number | null
    contaDespesaDebito?: number | null; contaDespesaCredito?: number | null
    geraLancamento?: boolean
  }>) {
    let saved = 0
    for (const item of items) {
      await this.salvarEventoConta({ clienteId, ...item })
      saved++
    }
    return { saved }
  }

  async excluirEventoConta(id: string) {
    return prisma.folhaEventoConta.delete({ where: { id } })
  }

  // ══════════════════════════════════════════════════════════════
  // Importação + Contabilização
  // ══════════════════════════════════════════════════════════════

  async importarTxt(clienteId: string, competencia: string, conteudo: string, nomeArquivo?: string) {
    // 1. Parsear o TXT
    const secoes = this.parser.parse(conteudo)
    if (secoes.length === 0) throw new Error('Nenhuma seção encontrada no arquivo.')

    // 2. Criar registro de importação
    const totalLinhas = secoes.reduce((s, sec) => s + sec.eventos.length, 0)
    const importacao = await prisma.folhaImportacao.create({
      data: { clienteId, competencia, arquivoOrigem: nomeArquivo, totalLinhas },
    })

    // 3. Salvar dados parseados
    for (const secao of secoes) {
      await prisma.folhaImportacaoDado.createMany({
        data: secao.eventos.map(evt => ({
          importacaoId: importacao.id,
          endereco: evt.endereco,
          setor: evt.setor,
          cnpj: evt.cnpj,
          competencia: evt.competencia,
          codDebito: evt.codDebito ?? null,
          descDebito: evt.descDebito ?? null,
          valorDebito: evt.valorDebito ?? null,
          codCredito: evt.codCredito ?? null,
          descCredito: evt.descCredito ?? null,
          valorCredito: evt.valorCredito ?? null,
        })),
      })
    }

    // 4. Criar/atualizar filiais e setores a partir das seções do TXT
    const filiais = await prisma.folhaFilial.findMany({ where: { clienteId }, include: { setores: true } })
    for (const secao of secoes) {
      const cnpjLimpo = secao.cnpj.replace(/\D/g, '')
      let filial = filiais.find(f => f.cnpj.replace(/\D/g, '') === cnpjLimpo)

      if (!filial) {
        // Tentar match por endereço parcial (normalizar espaços e pontuação)
        const normEnd = (s: string) => s.trim().toUpperCase().replace(/[,.\s]+/g, ' ').substring(0, 15)
        const endNorm = normEnd(secao.endereco)
        filial = filiais.find(f => normEnd(f.endereco) === endNorm && endNorm.length > 5)

        if (filial) {
          // Atualizar CNPJ real da filial encontrada por endereço
          await prisma.folhaFilial.update({ where: { id: filial.id }, data: { cnpj: secao.cnpj, endereco: secao.endereco } })
          filial.cnpj = secao.cnpj
          filial.endereco = secao.endereco
        } else {
          // Criar filial automaticamente
          const codigoFilial = secao.secao.replace('.', '').substring(0, 3).toUpperCase() || `F${cnpjLimpo.slice(-4)}`
          const novaFilial = await prisma.folhaFilial.create({
            data: { clienteId, cnpj: secao.cnpj, codigoFilial, endereco: secao.endereco },
          })
          const novaFilialComSetores = { ...novaFilial, setores: [] as Array<{ id: string; nome: string; tipoContabil: string }> }
          filiais.push(novaFilialComSetores as any)
          filial = novaFilialComSetores as any
        }
      } else if (filial.endereco !== secao.endereco && secao.endereco) {
        await prisma.folhaFilial.update({ where: { id: filial.id }, data: { endereco: secao.endereco } })
        filial.endereco = secao.endereco
      }

      // Criar setor se não existir
      if (secao.setor && filial) {
        const setorExiste = filial.setores.find(s => s.nome === secao.setor)
        if (!setorExiste) {
          const tipoContabil = secao.setor.toUpperCase().includes('DOCENTE') ? 'CUSTO' : 'DESPESA'
          const novoSetor = await prisma.folhaSetor.create({
            data: { filialId: filial.id, nome: secao.setor, tipoContabil },
          })
          filial.setores.push(novoSetor as any)
        }
      }
    }

    return {
      importacaoId: importacao.id,
      secoes: secoes.length,
      totalLinhas,
      secoesDetalhes: secoes.map(s => ({ cnpj: s.cnpj, setor: s.setor, secao: s.secao, eventos: s.eventos.length })),
    }
  }

  async contabilizar(importacaoId: string) {
    const importacao = await prisma.folhaImportacao.findUniqueOrThrow({
      where: { id: importacaoId },
      include: { dados: true },
    })

    const clienteId = importacao.clienteId

    // Carregar configurações
    const filiais = await prisma.folhaFilial.findMany({ where: { clienteId, ativo: true }, include: { setores: true } })
    const eventosContas = await prisma.folhaEventoConta.findMany({ where: { clienteId } })
    const eventoMap = new Map(eventosContas.map(e => [`${e.codigoEvento}_${e.tipo}`, e]))

    // Calcular data do lançamento (último dia do mês da competência)
    const [mes, ano] = importacao.competencia.split('/').map(Number)
    const dataLancamento = new Date(ano!, mes!, 0) // Último dia do mês

    const lancamentos: Array<Prisma.FolhaLancamentoCreateManyInput> = []
    const alertas: string[] = []
    const eventosNovos = new Set<string>() // Rastrear eventos auto-criados (dedup)

    for (const dado of importacao.dados) {
      const cnpjLimpo = dado.cnpj.replace(/\D/g, '')
      const filial = filiais.find(f => f.cnpj.replace(/\D/g, '') === cnpjLimpo)
      if (!filial) { alertas.push(`Filial não encontrada: CNPJ ${dado.cnpj}`); continue }

      const setor = filial.setores.find(s => s.nome === dado.setor)
      const tipoContabil = setor?.tipoContabil ?? 'DESPESA'
      const codigoFilial = filial.codigoFilial
      const setorAbrev = dado.setor.substring(0, 3).toUpperCase()
      const historico = `VR REF FOLHA DE PAGAMENTO MÊS ${importacao.competencia} ${setorAbrev} - ${codigoFilial}`

      // Processar DÉBITO (provento)
      if (dado.codDebito && dado.valorDebito) {
        // Caso especial: código 237 (LÍQUIDO SALARIAL) — sempre gera lançamento de crédito na conta líquido
        if (dado.codDebito === 237) {
          const contaLiq = filial.contaLiquidoAlt ?? filial.contaLiquido
          if (contaLiq) {
            lancamentos.push({
              importacaoId, filialId: filial.id, setorId: setor?.id,
              dataLancamento, contaDebito: null, contaCredito: contaLiq,
              valor: dado.valorDebito, historico, tipo: 'DEBITO',
              codigoEvento: 237, descricaoEvento: 'LIQUIDO SALARIAL',
            })
          }
        } else {
          let evtCfg = eventoMap.get(`${dado.codDebito}_PROVENTO`)
          if (!evtCfg) {
            // Auto-criar evento na tabela de-para como placeholder (sem conta, sem lançamento)
            const key = `${dado.codDebito}_PROVENTO`
            if (!eventosNovos.has(key)) {
              eventosNovos.add(key)
              await prisma.folhaEventoConta.upsert({
                where: { clienteId_codigoEvento_tipo: { clienteId, codigoEvento: dado.codDebito, tipo: 'PROVENTO' } },
                create: { clienteId, codigoEvento: dado.codDebito, descricao: dado.descDebito ?? `Evento ${dado.codDebito}`, tipo: 'PROVENTO', geraLancamento: false },
                update: {},
              })
              alertas.push(`Evento provento ${dado.codDebito} (${dado.descDebito ?? ''}) — adicionado à tabela de-para (sem conta configurada)`)
            }
          } else if (evtCfg.geraLancamento) {
            const contaDebito = tipoContabil === 'CUSTO' ? evtCfg.contaCustoDebito : evtCfg.contaDespesaDebito
            if (contaDebito) {
              lancamentos.push({
                importacaoId, filialId: filial.id, setorId: setor?.id,
                dataLancamento, contaDebito, contaCredito: null,
                valor: dado.valorDebito, historico, tipo: 'DEBITO',
                codigoEvento: dado.codDebito, descricaoEvento: dado.descDebito ?? '',
              })
            }
          }
        }
      }

      // Processar CRÉDITO (desconto)
      if (dado.codCredito && dado.valorCredito) {
        let evtCfg = eventoMap.get(`${dado.codCredito}_DESCONTO`)
        if (!evtCfg) {
          // Auto-criar evento na tabela de-para como placeholder
          const key = `${dado.codCredito}_DESCONTO`
          if (!eventosNovos.has(key)) {
            eventosNovos.add(key)
            await prisma.folhaEventoConta.upsert({
              where: { clienteId_codigoEvento_tipo: { clienteId, codigoEvento: dado.codCredito, tipo: 'DESCONTO' } },
              create: { clienteId, codigoEvento: dado.codCredito, descricao: dado.descCredito ?? `Evento ${dado.codCredito}`, tipo: 'DESCONTO', geraLancamento: false },
              update: {},
            })
            alertas.push(`Evento desconto ${dado.codCredito} (${dado.descCredito ?? ''}) — adicionado à tabela de-para (sem conta configurada)`)
          }
        } else if (evtCfg.geraLancamento) {
          const contaCredito = tipoContabil === 'CUSTO' ? evtCfg.contaCustoCredito : evtCfg.contaDespesaCredito
          if (contaCredito) {
            lancamentos.push({
              importacaoId, filialId: filial.id, setorId: setor?.id,
              dataLancamento, contaDebito: null, contaCredito,
              valor: dado.valorCredito, historico, tipo: 'CREDITO',
              codigoEvento: dado.codCredito, descricaoEvento: dado.descCredito ?? '',
            })
          }
        }
      }
    }

    // Salvar lançamentos
    await prisma.folhaLancamento.deleteMany({ where: { importacaoId } }) // Limpar anteriores
    if (lancamentos.length > 0) {
      await prisma.folhaLancamento.createMany({ data: lancamentos })
    }

    // Atualizar importação
    await prisma.folhaImportacao.update({
      where: { id: importacaoId },
      data: { status: 'contabilizado', totalLancamentos: lancamentos.length, erros: alertas.length > 0 ? alertas : undefined },
    })

    return { lancamentos: lancamentos.length, alertas }
  }

  // ══════════════════════════════════════════════════════════════
  // Listar importações e lançamentos
  // ══════════════════════════════════════════════════════════════

  async listarImportacoes(clienteId: string) {
    return prisma.folhaImportacao.findMany({
      where: { clienteId },
      orderBy: { dataImportacao: 'desc' },
      select: {
        id: true, competencia: true, dataImportacao: true, arquivoOrigem: true,
        status: true, totalLinhas: true, totalLancamentos: true, erros: true,
      },
    })
  }

  async listarLancamentos(importacaoId: string) {
    return prisma.folhaLancamento.findMany({
      where: { importacaoId },
      include: { filial: { select: { codigoFilial: true } }, setor: { select: { nome: true } } },
      orderBy: [{ tipo: 'asc' }, { codigoEvento: 'asc' }],
    })
  }

  async listarDadosImportados(importacaoId: string) {
    return prisma.folhaImportacaoDado.findMany({
      where: { importacaoId },
      orderBy: { id: 'asc' },
    })
  }

  // ══════════════════════════════════════════════════════════════
  // Exportação TXT
  // ══════════════════════════════════════════════════════════════

  async listarFiliaisImportacao(importacaoId: string) {
    const filiais = await prisma.folhaLancamento.findMany({
      where: { importacaoId },
      select: { filialId: true, filial: { select: { id: true, codigoFilial: true, cnpj: true } } },
      distinct: ['filialId'],
    })
    return filiais.map(f => f.filial)
  }

  async exportarTxt(importacaoId: string, tipo: 'DEBITO' | 'CREDITO', filialId?: string) {
    const importacao = await prisma.folhaImportacao.findUniqueOrThrow({ where: { id: importacaoId } })

    const where: Prisma.FolhaLancamentoWhereInput = { importacaoId, tipo }
    if (filialId) where.filialId = filialId

    const lancamentos = await prisma.folhaLancamento.findMany({
      where,
      include: { filial: { select: { codigoFilial: true } }, setor: { select: { nome: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const [mesStr, anoStr] = importacao.competencia.split('/')
    const dataLanc = new Date(Number(anoStr), Number(mesStr), 0) // Último dia do mês
    const dataFmt = `${anoStr}${mesStr}${String(dataLanc.getDate()).padStart(2, '0')}`

    // Nome do arquivo: se filtrado por filial, incluir o código
    const filialSuffix = filialId && lancamentos.length > 0 ? `-${lancamentos[0]?.filial?.codigoFilial ?? filialId}` : ''
    const nomeArquivo = `${mesStr}${anoStr}-${tipo}${filialSuffix}.TXT`

    const linhas: string[] = []
    let loteNum = 0

    const mkLine = (debito: string, credito: string, valor: string, historico: string) => {
      loteNum++
      return `${String(loteNum).padStart(5, '0')},${dataFmt},${debito},${credito},${valor},,${historico},DCTO,`
    }

    // Agrupar por filial+setor para manter ordem por bloco
    const grupos = new Map<string, typeof lancamentos>()
    for (const lanc of lancamentos) {
      const key = `${lanc.filialId}_${lanc.setorId ?? ''}`
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(lanc)
    }

    for (const [, grp] of grupos) {
      const proventos = grp.filter(l => l.contaDebito !== null)
      const liquidos = grp.filter(l => l.contaDebito === null && l.contaCredito !== null)

      for (const lanc of proventos) {
        linhas.push(mkLine(lanc.contaDebito!.toString(), '', Number(lanc.valor).toFixed(2), lanc.historico))
      }
      for (const lanc of liquidos) {
        linhas.push(mkLine('', lanc.contaCredito!.toString(), Number(lanc.valor).toFixed(2), lanc.historico))
      }
    }

    // Atualizar lotes apenas dos lançamentos exportados
    for (let i = 0; i < lancamentos.length; i++) {
      await prisma.folhaLancamento.update({ where: { id: lancamentos[i]!.id }, data: { lote: i + 1 } })
    }

    if (!filialId) {
      await prisma.folhaImportacao.update({ where: { id: importacaoId }, data: { status: 'exportado' } })
    }

    return { nomeArquivo, conteudo: linhas.join('\n'), totalLinhas: linhas.length }
  }

  // ══════════════════════════════════════════════════════════════
  // Excluir importação
  // ══════════════════════════════════════════════════════════════

  async excluirImportacao(id: string) {
    await prisma.folhaImportacao.delete({ where: { id } })
    return { ok: true }
  }

  // ══════════════════════════════════════════════════════════════
  // Importar configuração do XLSM (aba CONTAS)
  // ══════════════════════════════════════════════════════════════
  async importarXlsm(clienteId: string, buffer: Buffer) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const ws = wb.Sheets['CONTAS']
    if (!ws) throw new Error('Aba "CONTAS" não encontrada na planilha.')

    const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v ?? null

    // 1. Importar filiais (linhas 3-6 = rows index 2-5, cols A-D)
    const filiaisImportadas: Array<{ endereco: string; codigo: string; setorCusto: string; setorDespesa: string }> = []
    for (let r = 2; r <= 10; r++) {
      const endereco = String(cell(r, 0) ?? '').trim()
      const codigo = String(cell(r, 1) ?? '').trim()
      if (!endereco || !codigo) break
      const setorCusto = String(cell(r, 2) ?? '').trim()
      const setorDespesa = String(cell(r, 3) ?? '').trim()
      filiaisImportadas.push({ endereco, codigo, setorCusto, setorDespesa })
    }

    let filiaisCriadas = 0
    let setoresCriados = 0
    for (const fi of filiaisImportadas) {
      // Criar filial (cnpj será preenchido na importação do TXT)
      const filial = await prisma.folhaFilial.upsert({
        where: { clienteId_cnpj: { clienteId, cnpj: fi.codigo } }, // Usa código como placeholder de CNPJ
        create: { clienteId, cnpj: fi.codigo, codigoFilial: fi.codigo, endereco: fi.endereco },
        update: { endereco: fi.endereco },
      })
      filiaisCriadas++

      // Criar setores
      const setoresUnicos = new Set<string>()
      if (fi.setorCusto) setoresUnicos.add(fi.setorCusto)
      if (fi.setorDespesa && fi.setorDespesa !== fi.setorCusto) setoresUnicos.add(fi.setorDespesa)

      for (const nome of setoresUnicos) {
        // Determinar tipo contábil: DOCENTE = CUSTO, ADMINISTRATIVO/ADMINISTRAÇÃO = DESPESA
        const tipoContabil = nome.toUpperCase().includes('DOCENTE') ? 'CUSTO' : 'DESPESA'
        await prisma.folhaSetor.upsert({
          where: { filialId_nome: { filialId: filial.id, nome } },
          create: { filialId: filial.id, nome, tipoContabil },
          update: { tipoContabil },
        })
        setoresCriados++
      }
    }

    // 2. Importar tabela de-para (eventos)
    // Custo Débito: cols F(5), G(6), H(7) — linha 2+ (row index 1+, pular header)
    // Custo Crédito: cols J(9), K(10), L(11)
    // Despesa Débito: cols N(13), O(14), P(15)
    // Despesa Crédito: cols R(17), S(18), T(19)

    const readEventos = (colCod: number, colDesc: number, colConta: number): Array<{ codigo: number; descricao: string; conta: number }> => {
      const result: Array<{ codigo: number; descricao: string; conta: number }> = []
      for (let r = 2; r <= 200; r++) {
        let cod = cell(r, colCod)
        const descRaw = String(cell(r, colDesc) ?? '').trim()
        const contaRaw = cell(r, colConta)

        // Se nenhuma das 3 colunas tem valor, pular
        if ((cod === null || cod === '') && !descRaw && contaRaw === null) continue

        let codigo: number
        let descricao: string
        let conta: number

        if (cod !== null && cod !== '') {
          // Caso normal: código na coluna F/J/N/R
          codigo = Number(cod)
          descricao = descRaw
          conta = Number(contaRaw ?? 0)
        } else {
          // Linhas com F=null são informativas (LIQUIDO SALARIAL, DIAS AFASTAMENTO, etc.)
          // O valor em H é o código do evento informativo — IGNORAR para não sobrescrever eventos reais
          continue
        }

        if (!Number.isFinite(codigo) || codigo <= 0) continue
        result.push({ codigo, descricao, conta: Number.isFinite(conta) ? conta : 0 })
      }
      return result
    }

    const custoDebito = readEventos(5, 6, 7)
    const custoCredito = readEventos(9, 10, 11)
    const despesaDebito = readEventos(13, 14, 15)
    const despesaCredito = readEventos(17, 18, 19)

    // Merge proventos (custo deb + despesa deb)
    const proventosMap = new Map<number, { descricao: string; contaCustoDebito: number | null; contaDespesaDebito: number | null; geraLancamento: boolean }>()
    for (const e of custoDebito) {
      const isInfo = e.conta === e.codigo || e.conta <= 0
      proventosMap.set(e.codigo, {
        descricao: e.descricao,
        contaCustoDebito: isInfo ? null : e.conta,
        contaDespesaDebito: null,
        geraLancamento: !isInfo,
      })
    }
    for (const e of despesaDebito) {
      const isInfo = e.conta === e.codigo || e.conta <= 0
      const existing = proventosMap.get(e.codigo)
      if (existing) {
        existing.contaDespesaDebito = isInfo ? null : e.conta
        if (isInfo) existing.geraLancamento = false
      } else {
        proventosMap.set(e.codigo, {
          descricao: e.descricao,
          contaCustoDebito: null,
          contaDespesaDebito: isInfo ? null : e.conta,
          geraLancamento: !isInfo,
        })
      }
    }

    // Merge descontos (custo cred + despesa cred)
    const descontosMap = new Map<number, { descricao: string; contaCustoCredito: number | null; contaDespesaCredito: number | null }>()
    for (const e of custoCredito) {
      descontosMap.set(e.codigo, { descricao: e.descricao, contaCustoCredito: e.conta > 0 ? e.conta : null, contaDespesaCredito: null })
    }
    for (const e of despesaCredito) {
      const existing = descontosMap.get(e.codigo)
      if (existing) {
        existing.contaDespesaCredito = e.conta > 0 ? e.conta : null
      } else {
        descontosMap.set(e.codigo, { descricao: e.descricao, contaCustoCredito: null, contaDespesaCredito: e.conta > 0 ? e.conta : null })
      }
    }

    // Salvar proventos
    let eventosSalvos = 0
    for (const [codigo, data] of proventosMap) {
      await prisma.folhaEventoConta.upsert({
        where: { clienteId_codigoEvento_tipo: { clienteId, codigoEvento: codigo, tipo: 'PROVENTO' } },
        create: { clienteId, codigoEvento: codigo, descricao: data.descricao, tipo: 'PROVENTO', contaCustoDebito: data.contaCustoDebito, contaDespesaDebito: data.contaDespesaDebito, geraLancamento: data.geraLancamento },
        update: { descricao: data.descricao, contaCustoDebito: data.contaCustoDebito, contaDespesaDebito: data.contaDespesaDebito, geraLancamento: data.geraLancamento },
      })
      eventosSalvos++
    }

    // Salvar descontos
    for (const [codigo, data] of descontosMap) {
      await prisma.folhaEventoConta.upsert({
        where: { clienteId_codigoEvento_tipo: { clienteId, codigoEvento: codigo, tipo: 'DESCONTO' } },
        create: { clienteId, codigoEvento: codigo, descricao: data.descricao, tipo: 'DESCONTO', contaCustoCredito: data.contaCustoCredito, contaDespesaCredito: data.contaDespesaCredito, geraLancamento: true },
        update: { descricao: data.descricao, contaCustoCredito: data.contaCustoCredito, contaDespesaCredito: data.contaDespesaCredito },
      })
      eventosSalvos++
    }

    // 3. Importar líquido (V:X)
    const codLiquido = Number(cell(2, 21) ?? 0)
    const contaLiquido = Number(cell(2, 23) ?? 1287)
    if (codLiquido === 237 && contaLiquido > 0) {
      // Atualizar conta líquido nas filiais
      await prisma.folhaFilial.updateMany({ where: { clienteId }, data: { contaLiquido } })
    }

    return { filiaisCriadas, setoresCriados, eventosSalvos, filiaisDetalhes: filiaisImportadas }
  }
}
