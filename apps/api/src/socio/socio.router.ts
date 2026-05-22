import { z } from 'zod'
import { router, readProcedure, writeProcedure, deleteProcedure } from '../trpc/trpc.service'
import { createSocioSchema, updateSocioSchema, listSocioSchema } from '@saas/types'
import { SocioService } from './socio.service'
import { CnpjService } from '../cnpj/cnpj.service'
import { SitfisService } from '../sitfis/sitfis.service'
import { prisma, scoped } from '@saas/db'

const MODULE = 'socios'

export function createSocioRouter(socioService: SocioService, cnpjService: CnpjService, sitfisService?: SitfisService) {
  return router({
    list: readProcedure(MODULE)
      .input(listSocioSchema)
      .query(({ input, ctx }) => socioService.list(input, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getById: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input, ctx }) => socioService.getById(input.id, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    // Socios por cliente (para aba Legalizacao)
    listByCliente: readProcedure(MODULE)
      .input(z.object({ clienteId: z.string() }))
      .query(({ input }) => socioService.listByCliente(input.clienteId)),

    create: writeProcedure(MODULE)
      .input(createSocioSchema)
      .mutation(({ input, ctx }) => socioService.create(input, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    update: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), data: updateSocioSchema }))
      .mutation(({ input, ctx }) => socioService.update(input.id, input.data, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    delete: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => socioService.delete(input.id, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    listForSelect: readProcedure(MODULE)
      .query(({ ctx }) => socioService.listForSelect(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    getEvents: readProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .query(({ input }) => socioService.getEvents(input.id)),

    exportAll: readProcedure(MODULE)
      .query(({ ctx }) => socioService.exportAll(ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importBulk: writeProcedure(MODULE)
      .input(z.object({ items: z.array(createSocioSchema) }))
      .mutation(({ input, ctx }) => socioService.bulkCreate(input.items, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)),

    importQsa: writeProcedure(MODULE)
      .input(z.object({ clienteId: z.string(), documento: z.string(), force: z.boolean().default(false) }))
      .mutation(async ({ input, ctx }) => {
        const doc = input.documento.replace(/\D/g, '')
        const result = await cnpjService.consultarCnpj(doc)

        if (!result.qsa || result.qsa.length === 0) {
          return { imported: 0, message: 'Nenhum sócio encontrado no QSA' }
        }

        // Se force=true, deletar todos os sócios existentes deste cliente
        if (input.force) {
          await scoped(ctx.tenantSchema, (db) => db.socio.deleteMany({ where: { clienteId: input.clienteId } }))
        }

        // Salvar capital social no cliente
        if (result.capitalSocial != null) {
          await scoped(ctx.tenantSchema, (db) => db.$executeRawUnsafe(
            `UPDATE clientes SET capital_social = $1 WHERE id = $2`, result.capitalSocial, input.clienteId,
          )).catch(() => {})
        }

        // Tentar extrair percentuais do PDF da Situação Fiscal (se existir)
        const percentuaisMap = new Map<string, number>()
        try {
          let sitfisRows = await scoped(ctx.tenantSchema, (db) => db.$queryRawUnsafe<Array<{ pdf_base64: string }>>(
            `SELECT pdf_base64 FROM situacao_fiscal WHERE cliente_id = $1 AND pdf_base64 IS NOT NULL AND pdf_base64 != '' ORDER BY created_at DESC LIMIT 1`, input.clienteId,
          ))

          // Se não houver PDF, consultar a Situação Fiscal via SERPRO automaticamente
          if (sitfisRows.length === 0 && sitfisService) {
            console.log(`[QSA] Nenhum PDF encontrado. Consultando Situação Fiscal via SERPRO para ${doc}...`)
            try {
              const sfResult = await sitfisService.consultar(doc, { clienteId: input.clienteId, userId: ctx.userId, empresaId: ctx.empresaId })
              if (sfResult.sucesso && sfResult.temPdf) {
                console.log(`[QSA] Situação Fiscal consultada com sucesso (id=${sfResult.id}). Buscando PDF...`)
                sitfisRows = await scoped(ctx.tenantSchema, (db) => db.$queryRawUnsafe<Array<{ pdf_base64: string }>>(
                  `SELECT pdf_base64 FROM situacao_fiscal WHERE id = $1 AND pdf_base64 IS NOT NULL AND pdf_base64 != ''`, sfResult.id,
                ))
              } else {
                console.log(`[QSA] Consulta Situação Fiscal: sucesso=${sfResult.sucesso}, temPdf=${sfResult.temPdf}, erro=${sfResult.erro}`)
              }
            } catch (sfErr) {
              console.warn(`[QSA] Falha ao consultar Situação Fiscal via SERPRO:`, (sfErr as Error).message)
            }
          }

          console.log(`[QSA] PDF da Situação Fiscal encontrado: ${sitfisRows.length > 0 ? 'SIM' : 'NÃO'} (clienteId=${input.clienteId})`)
          if (sitfisRows[0]?.pdf_base64) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const pdfParse = require('pdf-parse')
            const buf = Buffer.from(sitfisRows[0].pdf_base64, 'base64')
            const parsed = await pdfParse(buf)
            const texto = (parsed.text || '').replace(/\r\n/g, '\n')

            console.log(`[QSA] PDF texto extraído: ${texto.length} chars`)

            // Formato real do PDF Integra Contador:
            // "Sócios e Administradores ____...CPF/CNPJ\nNome\nQualificação\n...\n115.312.767-92\nLUCAS GERING\nSÓCIO-ADMINISTRADOR\nREGULAR\n100,00%\n"
            // O título pode ser "Sócios e Administradores" (sem "Quadro de")
            const idxQsa = texto.search(/S[óo]cios\s+e\s+Administradores/i)
            console.log(`[QSA] Seção QSA encontrada: ${idxQsa >= 0 ? 'SIM (pos=' + idxQsa + ')' : 'NÃO'}`)
            if (idxQsa >= 0) {
              const depoisQsa = texto.slice(idxQsa)
              const fimQsa = depoisQsa.search(/(?:Certid[ãa]o\s+Emitida|Diagn[oó]stico\s+Fiscal)/i)
              const secaoQsa = fimQsa > 0 ? depoisQsa.slice(0, fimQsa) : depoisQsa.slice(0, 3000)

              console.log(`[QSA] Seção QSA (${secaoQsa.length} chars):\n${secaoQsa.slice(0, 500)}`)

              // Extrair blocos: CPF/CNPJ seguido de Nome na próxima linha
              const cpfRegex = /(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*\n\s*([^\n]+)/g
              // Aceita percentuais com e sem decimais: 50%, 2,00%, 98.5%, 100,00%
              const pctRegex2 = /([\d]+(?:[,.][\d]+)?)\s*%/g
              let m: RegExpExecArray | null

              // Associar percentuais aos sócios por posição no texto
              const socioPositions: Array<{ nome: string; pos: number }> = []
              while ((m = cpfRegex.exec(secaoQsa)) !== null) {
                const nome = m[2]!.trim()
                // Ignorar headers e labels do PDF
                if (nome.length > 2 && !/^(Nome|Qualifica|Situa|Cap\.|CPF|Resp\.|Procurad)/i.test(nome)) {
                  socioPositions.push({ nome, pos: m.index })
                }
              }
              console.log(`[QSA] Sócios encontrados no PDF: ${socioPositions.length}`, socioPositions.map(s => s.nome))

              // Pular percentuais que aparecem no header (antes do primeiro sócio)
              const firstSocioPos = socioPositions.length > 0 ? socioPositions[0]!.pos : secaoQsa.length
              const pctPositions: Array<{ pct: number; pos: number }> = []
              while ((m = pctRegex2.exec(secaoQsa)) !== null) {
                if (m.index < firstSocioPos) continue // pular headers
                const raw = String(m[1]).replace(/\./g, '').replace(',', '.')
                const p = parseFloat(raw)
                if (Number.isFinite(p) && p > 0 && p <= 100) pctPositions.push({ pct: p, pos: m.index })
              }
              console.log(`[QSA] Percentuais encontrados no PDF: ${pctPositions.length}`, pctPositions.map(p => `${p.pct}%`))

              // Para cada percentual, achar o sócio mais próximo anterior
              for (const pp of pctPositions) {
                let closest: string | null = null
                for (const sp of socioPositions) {
                  if (sp.pos < pp.pos) closest = sp.nome
                }
                if (closest) percentuaisMap.set(closest.toUpperCase(), pp.pct)
              }

              if (percentuaisMap.size > 0) console.log(`[QSA] Percentuais mapeados: ${percentuaisMap.size} sócio(s):`, [...percentuaisMap.entries()].map(([n, p]) => `${n}: ${p}%`).join(', '))
              else console.log(`[QSA] Nenhum percentual mapeado a sócios`)
            }
          }
        } catch (err) { console.error(`[QSA] Erro ao extrair percentuais do PDF:`, err) }

        const qualifToTipo: Record<string, string> = {
          'Sócio-Administrador': 'SOCIO_ADMINISTRADOR',
          'Sócio': 'SOCIO_QUOTISTA',
          'Administrador': 'SOCIO_ADMINISTRADOR',
          'Diretor': 'SOCIO_DIRETOR',
          'Presidente': 'SOCIO_DIRETOR',
          'Titular': 'TITULAR',
          'Representante Legal': 'REPRESENTANTE_LEGAL',
          'Procurador': 'REPRESENTANTE_LEGAL',
        }

        let imported = 0
        let skipped = 0

        for (const s of result.qsa) {
          const existing = await socioService.findByNameAndCliente(s.nome, input.clienteId)
          if (existing) { skipped++; continue }

          let tipoSocio = 'SOCIO_QUOTISTA'
          for (const [key, val] of Object.entries(qualifToTipo)) {
            if (s.qualificacao.toLowerCase().includes(key.toLowerCase())) { tipoSocio = val; break }
          }

          // Percentual: API > PDF da Situação Fiscal > null
          const pctApi = s.percentualCapital
          const pctPdf = percentuaisMap.get(s.nome.toUpperCase()) ?? null
          const participacao = pctApi ?? pctPdf ?? undefined

          await socioService.create({
            nomeCompleto: s.nome,
            cpf: s.cpfCnpj || '',
            tipoSocio: tipoSocio as 'SOCIO_ADMINISTRADOR' | 'SOCIO_DIRETOR' | 'REPRESENTANTE_LEGAL' | 'SOCIO_QUOTISTA' | 'TITULAR',
            participacao,
            clienteId: input.clienteId,
            observacoes: `Importado via ${result.fonte} — ${s.qualificacao}${pctPdf != null ? ' (% do PDF Sitfis)' : ''}`,
          }, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)
          imported++
        }

        const capitalMsg = result.capitalSocial != null ? ` | Capital social: R$ ${Number(result.capitalSocial).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''
        return { imported, skipped, total: result.qsa.length, message: `${imported} sócio(s) importado(s)${skipped > 0 ? `, ${skipped} já existente(s)` : ''} — fonte: ${result.fonte}${capitalMsg}` }
      }),

    // ── ARQUIVOS ──────────────────────────────────────────────
    listArquivos: readProcedure(MODULE)
      .input(z.object({ socioId: z.string() }))
      .query(({ input, ctx }) => socioService.listArquivos(input.socioId, ctx.tenantSchema)),

    addArquivo: writeProcedure(MODULE)
      .input(z.object({
        socioId: z.string(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        vencimento: z.string().optional(),
      }))
      .mutation(({ input, ctx }) => socioService.addArquivo(input.socioId, input, ctx.userId, ctx.tenantSchema)),

    renameArquivo: writeProcedure(MODULE)
      .input(z.object({ arquivoId: z.string(), fileName: z.string().min(1) }))
      .mutation(({ input, ctx }) => socioService.renameArquivo(input.arquivoId, input.fileName, ctx.tenantSchema)),

    removeArquivo: deleteProcedure(MODULE)
      .input(z.object({ arquivoId: z.string() }))
      .mutation(({ input, ctx }) => socioService.removeArquivo(input.arquivoId, ctx.tenantSchema)),

    // ── MENSAGENS ───────────────────────────────────────────
    listMensagens: readProcedure(MODULE)
      .input(z.object({ socioId: z.string() }))
      .query(({ input, ctx }) => socioService.listMensagens(input.socioId, ctx.tenantSchema)),

    createMensagem: writeProcedure(MODULE)
      .input(z.object({
        socioId: z.string(),
        mensagem: z.string().min(1),
        tipo: z.enum(['interna', 'socio']).default('interna'),
      }))
      .mutation(({ input, ctx }) => socioService.createMensagem(input.socioId, ctx.userId, input.mensagem, input.tipo, ctx.tenantSchema)),

    updateMensagem: writeProcedure(MODULE)
      .input(z.object({ id: z.string(), mensagem: z.string().min(1) }))
      .mutation(({ input, ctx }) => socioService.updateMensagem(input.id, input.mensagem, ctx.tenantSchema)),

    deleteMensagem: deleteProcedure(MODULE)
      .input(z.object({ id: z.string() }))
      .mutation(({ input, ctx }) => socioService.deleteMensagem(input.id, ctx.tenantSchema)),

    // ── Consulta CNPJ (retorna dados + QSA) ─────────────────
    consultarCnpj: readProcedure(MODULE)
      .input(z.object({ cnpj: z.string().min(14) }))
      .query(({ input }) => cnpjService.consultarCnpj(input.cnpj)),

    // ── Importar QSA de um CNPJ ─────────────────────────────
    // Consulta o CNPJ, extrai o QSA e cria os sócios vinculados ao cliente
    importarQsa: writeProcedure(MODULE)
      .input(z.object({
        cnpj: z.string().min(14),
        clienteId: z.string().optional(),
        substituir: z.boolean().default(false),
      }))
      .mutation(async ({ input, ctx }) => {
        // 1. Consultar CNPJ
        const resultado = await cnpjService.consultarCnpj(input.cnpj)

        if (!resultado.qsa.length) {
          return { importados: 0, total: 0, erros: [], razaoSocial: resultado.razaoSocial, message: 'Nenhum sócio encontrado no QSA deste CNPJ.' }
        }

        // 2. Se substituir=true, remover sócios existentes do cliente
        if (input.substituir && input.clienteId) {
          await socioService.deleteByClienteId(input.clienteId, ctx.tenantSchema)
        }

        // 3. Importar cada sócio do QSA
        const erros: string[] = []
        let importados = 0

        for (const qsaSocio of resultado.qsa) {
          try {
            const cpfLimpo = qsaSocio.cpfCnpj.replace(/\D/g, '')

            // Ignorar CPF zerado (representante legal placeholder)
            if (!cpfLimpo || cpfLimpo === '00000000000') continue

            const tipoSocio = cnpjService.mapQualificacaoToTipoSocio(qsaSocio.codigoQualificacao)

            await socioService.create({
              nomeCompleto: qsaSocio.nome,
              cpf: cpfLimpo,
              tipoSocio: tipoSocio as 'SOCIO_QUOTISTA',
              participacao: qsaSocio.percentualCapital,
              dataEntrada: qsaSocio.dataEntrada || '',
              clienteId: input.clienteId || '',
              isActive: true,
              assinaNaEmpresa: tipoSocio === 'SOCIO_ADMINISTRADOR',
              responsavelLegal: tipoSocio === 'REPRESENTANTE_LEGAL',
              observacoes: `Importado do QSA (${resultado.fonte === 'serpro' ? 'SERPRO' : 'BrasilAPI'}) — Qualificação: ${qsaSocio.qualificacao}`,
            }, ctx.userId, ctx.isMaster ?? false, ctx.empresaId, ctx.tenantSchema)

            importados++
          } catch (e) {
            erros.push(`${qsaSocio.nome}: ${(e as Error).message}`)
          }
        }

        return {
          importados,
          total: resultado.qsa.length,
          erros,
          razaoSocial: resultado.razaoSocial,
          message: erros.length
            ? `${importados} de ${resultado.qsa.length} sócio(s) importado(s). ${erros.length} erro(s).`
            : `${importados} sócio(s) importado(s) com sucesso.`,
        }
      }),
  })
}
