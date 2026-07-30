import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'

/**
 * Mesclagem de cadastros de cliente repetidos (Fase B da limpeza).
 *
 * Junta dois cadastros do MESMO cliente num só: move todo o histórico do
 * cadastro que será descartado (origem) para o que fica (destino), completa os
 * campos que faltam no destino e inativa a origem.
 *
 * ── Por que a varredura é pelas COLUNAS e não pelas chaves estrangeiras ──
 * `cliente_id` aparece em 52 tabelas, mas só 43 têm FK declarada. As 9 restantes
 * — incluindo `orcamentos`, que é justamente o sintoma que originou esta
 * limpeza — ficariam para trás numa varredura por `pg_constraint`. Por isso
 * lemos `information_schema.columns`: pega tudo, inclusive tabela criada depois.
 *
 * ── Colisão de unicidade ──
 * 19 dessas tabelas têm índice único envolvendo `cliente_id`
 * (ex.: `cliente_areas_contratadas(cliente_id, area_id)`). Se os dois cadastros
 * têm a mesma área, mover estoura. Então cada UPDATE é condicionado a NÃO
 * existir a linha equivalente no destino; o que colide FICA NA ORIGEM, que será
 * inativada. Nada é apagado — o dado do destino prevalece e o da origem
 * permanece recuperável.
 */

/**
 * Campos que o destino herda quando está vazio e a origem tem.
 *
 * A gravação é feita pelo Prisma (e não por SQL cru) de propósito: `idAcessorias`
 * é INTEGER e os demais são TEXT. Montar o UPDATE à mão exigiria acertar o cast
 * de cada coluna — e errar um só aborta a transação inteira no Postgres, que
 * então recusa todo o resto com "current transaction is aborted". O Prisma
 * conhece os tipos do schema e resolve isso sozinho.
 */
const CAMPOS_HERDAVEIS = [
  { campo: 'idOneClick', coluna: 'id_oneclick' },
  { campo: 'idAcessorias', coluna: 'id_acessorias' },
  { campo: 'cnpjAcessorias', coluna: 'cnpj_acessorias' },
  { campo: 'idSistema', coluna: 'id_sistema' },
  { campo: 'idOmie', coluna: 'id_omie' },
  { campo: 'omieEmpresa', coluna: 'omie_empresa' },
  { campo: 'driveFolderId', coluna: 'drive_folder_id' },
  { campo: 'driveFolderName', coluna: 'drive_folder_name' },
  { campo: 'nomeFantasia', coluna: 'nome_fantasia' },
  { campo: 'email', coluna: 'email' },
  { campo: 'telefone', coluna: 'telefone' },
  { campo: 'inscricaoEstadual', coluna: 'inscricao_estadual' },
  { campo: 'inscricaoMunicipal', coluna: 'inscricao_municipal' },
] as const

interface TabelaAlvo {
  tabela: string
  /** Colunas que, junto de cliente_id, formam um índice único. */
  chavesUnicas: string[][]
}

export interface LinhaPlano {
  tabela: string
  mover: number
  colidem: number
}

export interface PlanoMesclagem {
  origem: { id: string; code: number; razaoSocial: string; documento: string }
  destino: { id: string; code: number; razaoSocial: string; documento: string }
  linhas: LinhaPlano[]
  totalMover: number
  totalColidem: number
  /** `valor` é para exibir; `bruto`/`prismaField` são o que a gravação usa. */
  camposHerdados: Array<{ campo: string; valor: string; bruto: unknown; prismaField: string }>
}

@Injectable()
export class MesclagemService {
  /** Cache do mapa de tabelas — o catálogo não muda entre requisições. */
  private tabelasCache: TabelaAlvo[] | null = null

  private async mapearTabelas(): Promise<TabelaAlvo[]> {
    if (this.tabelasCache) return this.tabelasCache

    // Só tabelas de verdade: `information_schema.columns` também lista VIEWS, e
    // um UPDATE numa view quebraria a transação inteira.
    const cols = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT c.table_name
         FROM information_schema.columns c
         JOIN information_schema.tables t
           ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.column_name = 'cliente_id'
          AND c.table_schema = 'public'
          AND c.table_name <> 'clientes'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name`,
    ).catch(() => [])

    const uniques = await prisma.$queryRawUnsafe<Array<{ tabela: string; colunas: string }>>(
      `SELECT t.relname AS tabela,
              string_agg(a.attname, ',' ORDER BY a.attnum) AS colunas
         FROM pg_index ix
         JOIN pg_class t ON t.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
         JOIN unnest(ix.indkey) WITH ORDINALITY k(attnum, ord) ON true
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE ix.indisunique
        GROUP BY t.relname, ix.indexrelid
       HAVING bool_or(a.attname = 'cliente_id')`,
    ).catch(() => [])

    const porTabela = new Map<string, string[][]>()
    for (const u of uniques) {
      const outras = u.colunas.split(',').filter((c) => c && c !== 'cliente_id')
      if (!outras.length) continue // único só por cliente_id — tratado abaixo
      const arr = porTabela.get(u.tabela) ?? []
      arr.push(outras)
      porTabela.set(u.tabela, arr)
    }
    // Índice único SÓ em cliente_id (ex.: cliente_bi_links): o destino só pode
    // ter uma linha, então mover exige que ele ainda não tenha nenhuma.
    for (const u of uniques) {
      const outras = u.colunas.split(',').filter((c) => c && c !== 'cliente_id')
      if (outras.length) continue
      const arr = porTabela.get(u.tabela) ?? []
      arr.push([])
      porTabela.set(u.tabela, arr)
    }

    this.tabelasCache = cols.map((c) => ({
      tabela: c.table_name,
      chavesUnicas: porTabela.get(c.table_name) ?? [],
    }))
    return this.tabelasCache
  }

  /** `WHERE` que exclui as linhas cuja equivalente já existe no destino. */
  private condicaoSemColisao(t: TabelaAlvo, destinoParam: string): string {
    if (!t.chavesUnicas.length) return ''
    const partes = t.chavesUnicas.map((cols) => {
      const iguais = cols.map((c) => `d."${c}" IS NOT DISTINCT FROM o."${c}"`).join(' AND ')
      return `NOT EXISTS (SELECT 1 FROM "${t.tabela}" d WHERE d.cliente_id = ${destinoParam}`
        + (iguais ? ` AND ${iguais}` : '') + ')'
    })
    return ' AND ' + partes.join(' AND ')
  }

  private async carregarPar(origemId: string, destinoId: string, isMaster: boolean, empresaId?: string) {
    if (origemId === destinoId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Origem e destino são o mesmo cadastro.' })
    }
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; code: number; razao_social: string; documento: string; empresa_id: string | null
      doc: string; deleted_at: Date | null; is_active: boolean
    }>>(
      `SELECT id, code, razao_social, documento, empresa_id, deleted_at, is_active,
              upper(regexp_replace(documento, '[^0-9A-Za-z]', '', 'g')) AS doc
         FROM clientes WHERE id IN ($1, $2)`,
      origemId, destinoId,
    ).catch(() => [])

    const origem = rows.find((r) => r.id === origemId)
    const destino = rows.find((r) => r.id === destinoId)
    if (!origem || !destino) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Cadastro não encontrado.' })
    }
    if (origem.deleted_at || destino.deleted_at) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Um dos cadastros está na lixeira.' })
    }
    if (!isMaster && empresaId && (origem.empresa_id !== empresaId || destino.empresa_id !== empresaId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Cadastro de outra empresa.' })
    }
    if (origem.empresa_id !== destino.empresa_id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Os cadastros são de empresas diferentes.' })
    }
    // Exige o MESMO documento. Sem isso, um clique errado juntaria dois clientes
    // que nada têm a ver — e mesclagem não tem desfazer.
    if (!origem.doc || origem.doc !== destino.doc) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Só é possível mesclar cadastros com exatamente o mesmo CNPJ/CPF.',
      })
    }
    // PRIORIDADE ABSOLUTA DO CADASTRO ATIVO. O cadastro que o time usa hoje é o
    // que vale — é ele que aparece nas listagens, nos vínculos e nas rotinas.
    // Mesclar o ativo dentro de um inativo tiraria o cliente de circulação, que
    // é o oposto do que a limpeza quer.
    if (origem.is_active && !destino.is_active) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `O cadastro #${destino.code} está inativo e o #${origem.code} está ativo. `
          + 'O cadastro ativo é o que deve ficar — inverta a escolha.',
      })
    }
    return { origem, destino }
  }

  /** O que aconteceria — sem gravar nada. */
  async previsualizar(
    origemId: string, destinoId: string, isMaster: boolean, empresaId?: string,
  ): Promise<PlanoMesclagem> {
    const { origem, destino } = await this.carregarPar(origemId, destinoId, isMaster, empresaId)
    const tabelas = await this.mapearTabelas()

    const linhas: LinhaPlano[] = []
    for (const t of tabelas) {
      const cond = this.condicaoSemColisao(t, '$2')
      const r = await prisma.$queryRawUnsafe<Array<{ total: bigint; mover: bigint }>>(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE true${cond}) AS mover
           FROM "${t.tabela}" o WHERE o.cliente_id = $1`,
        origemId, destinoId,
      ).catch(() => [])
      const total = Number(r[0]?.total ?? 0)
      const mover = Number(r[0]?.mover ?? 0)
      if (total > 0) linhas.push({ tabela: t.tabela, mover, colidem: total - mover })
    }

    const camposHerdados = await this.camposHerdaveis(origemId, destinoId)

    return {
      origem: { id: origem.id, code: origem.code, razaoSocial: origem.razao_social, documento: origem.documento },
      destino: { id: destino.id, code: destino.code, razaoSocial: destino.razao_social, documento: destino.documento },
      linhas: linhas.sort((a, b) => b.mover - a.mover),
      totalMover: linhas.reduce((s, l) => s + l.mover, 0),
      totalColidem: linhas.reduce((s, l) => s + l.colidem, 0),
      camposHerdados,
    }
  }

  /** Campos vazios no destino que a origem consegue preencher. */
  private async camposHerdaveis(origemId: string, destinoId: string) {
    const selecao = Object.fromEntries(CAMPOS_HERDAVEIS.map((c) => [c.campo, true]))
    const [o, d] = await Promise.all([
      prisma.cliente.findUnique({ where: { id: origemId }, select: selecao }),
      prisma.cliente.findUnique({ where: { id: destinoId }, select: selecao }),
    ])
    if (!o || !d) return []
    const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
    const origem = o as Record<string, unknown>
    const destino = d as Record<string, unknown>
    return CAMPOS_HERDAVEIS
      .filter((c) => vazio(destino[c.campo]) && !vazio(origem[c.campo]))
      // `valor` é só para exibir na pré-visualização; a gravação usa `bruto`,
      // que preserva o tipo original (importa para o idAcessorias, que é número).
      .map((c) => ({ campo: c.coluna, valor: String(origem[c.campo]), bruto: origem[c.campo], prismaField: c.campo }))
  }

  /**
   * Executa a mesclagem. Tudo numa transação: ou move o histórico inteiro e
   * inativa a origem, ou não muda nada.
   */
  async executar(
    origemId: string, destinoId: string, userId: string | undefined, isMaster: boolean, empresaId?: string,
  ) {
    const plano = await this.previsualizar(origemId, destinoId, isMaster, empresaId)
    const tabelas = await this.mapearTabelas()

    const movidos: LinhaPlano[] = []

    await prisma.$transaction(async (tx) => {
      for (const t of tabelas) {
        const cond = this.condicaoSemColisao(t, '$2')
        // SEM catch aqui, de propósito. No Postgres, um comando que falha aborta
        // a transação inteira: tudo que vier depois responde 25P02 ("current
        // transaction is aborted"). Engolir o erro só troca a causa real por
        // esse eco, e foi exatamente o que escondeu o problema do idAcessorias.
        // Deixando estourar, a transação desfaz tudo e o usuário vê o motivo.
        let n = 0
        try {
          n = await tx.$executeRawUnsafe(
            `UPDATE "${t.tabela}" o SET cliente_id = $2 WHERE o.cliente_id = $1${cond}`,
            origemId, destinoId,
          )
        } catch (e) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao mover os registros de "${t.tabela}": ${(e as Error).message}. `
              + 'Nenhuma alteração foi gravada.',
          })
        }
        if (n > 0) movidos.push({ tabela: t.tabela, mover: n, colidem: 0 })
      }

      // Destino herda o que não tinha (chaves de integração, contato). Via
      // Prisma: `idAcessorias` é INTEGER e o resto TEXT — montar o UPDATE à mão
      // exigiria o cast certo em cada coluna.
      if (plano.camposHerdados.length) {
        const data = Object.fromEntries(
          plano.camposHerdados.map((c) => [c.prismaField, c.bruto]),
        )
        try {
          await tx.cliente.update({ where: { id: destinoId }, data: data as never })
        } catch (e) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `Falha ao completar os dados do cadastro mantido: ${(e as Error).message}. `
              + 'Nenhuma alteração foi gravada.',
          })
        }
      }

      // Origem sai de cena: inativada e marcada na lixeira, com o rastro de para
      // onde foi. Soft delete de propósito — mesclagem não tem desfazer, então o
      // cadastro precisa continuar recuperável.
      const marca = `[MESCLADO] Cadastro unificado no cliente #${plano.destino.code} — ${plano.destino.razaoSocial}.`
      await tx.$executeRawUnsafe(
        `UPDATE clientes
            SET is_active = false,
                deleted_at = NOW(),
                observacoes = CASE WHEN COALESCE(observacoes, '') = '' THEN $2
                                   ELSE observacoes || E'\\n' || $2 END
          WHERE id = $1`,
        origemId, marca,
      )

      // Histórico no destino, para quem abrir o cadastro depois entender de onde
      // veio aquele orçamento antigo. Via Prisma (e não SQL cru) para o id sair
      // no mesmo padrão cuid do resto da tabela.
      const atual = await tx.cliente.findUnique({ where: { id: destinoId }, select: { version: true } })
      await tx.clienteEvent.create({
        data: {
          clienteId: destinoId,
          userId: userId ?? null,
          type: 'updated',
          version: atual?.version ?? 0,
          changes: {
            mesclagem: {
              origemId,
              origemCode: plano.origem.code,
              origemRazaoSocial: plano.origem.razaoSocial,
              registrosMovidos: movidos.reduce((s, m) => s + m.mover, 0),
              registrosMantidosNaOrigem: plano.totalColidem,
            },
          },
        },
      })
    }, { timeout: 120_000, maxWait: 20_000 })

    return {
      origem: plano.origem,
      destino: plano.destino,
      movidos: movidos.sort((a, b) => b.mover - a.mover),
      totalMovidos: movidos.reduce((s, m) => s + m.mover, 0),
      mantidosNaOrigem: plano.totalColidem,
      camposHerdados: plano.camposHerdados.map((c) => c.campo),
    }
  }
}
