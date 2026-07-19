import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { FolhaBiUpload } from '@saas/types'
import { Pool } from 'pg'
import * as XLSX from 'xlsx'

// Conexao dedicada ao folha_dash (ETL) p/ ler/editar a config de agrupamento de verbas
// ao vivo. O painel Verbas pivota no cliente a partir das verbas cruas do snapshot +
// deste agrupamento; editar + resolver reflete na hora (sem reenviar snapshots).
const FOLHA_DASH_URL = process.env.FOLHA_DASH_URL || 'postgres://folha:folha_local_2026@127.0.0.1:5433/folha_dash_db'
let _folhaPool: Pool | null = null
function folhaDash(): Pool {
  if (!_folhaPool) _folhaPool = new Pool({ connectionString: FOLHA_DASH_URL, max: 4 })
  return _folhaPool
}
async function fq<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const r = await folhaDash().query(sql, params)
  return r.rows as T[]
}

@Injectable()
export class FolhaBiService {
  // Upsert de um snapshot (cliente/CNPJ/competencia) vindo da ETL.
  async upsertCache(data: FolhaBiUpload) {
    const { clienteId, cnpj, ref, fonte, totalLinhas, payload } = data
    return prisma.folhaBiCache.upsert({
      where: { clienteId_cnpj_ref_fonte: { clienteId, cnpj, ref, fonte } },
      create: { clienteId, cnpj, ref, fonte, totalLinhas, payload, atualizadoEm: new Date() },
      update: { totalLinhas, payload, atualizadoEm: new Date() },
      select: {
        id: true, clienteId: true, cnpj: true, ref: true,
        fonte: true, totalLinhas: true, atualizadoEm: true,
      },
    })
  }

  // Competencias em cache de um cliente (verificacao/status).
  async status(clienteId: string) {
    const rows = await prisma.folhaBiCache.findMany({
      where: { clienteId },
      select: { cnpj: true, ref: true, fonte: true, totalLinhas: true, atualizadoEm: true },
      orderBy: [{ cnpj: 'asc' }, { ref: 'desc' }],
    })
    return { clienteId, total: rows.length, competencias: rows }
  }

  // Lista tudo que esta em cache (metadados + razao da empresa) — seletor da UI
  // enquanto nao ha clientes reais cadastrados no tenant. A razao sai do payload
  // (payload->>'razao') sem carregar o Json inteiro.
  async list() {
    // PONTE DE CLIENTE: resolve o CNPJ do cache -> Cliente real do OneClick, AO VIVO —
    // por folha_filiais (matriz+filiais) ou clientes.documento (normalizando p/ so digitos).
    // clienteRealId/clienteRazao ficam null enquanto nao houver Cliente com o CNPJ cadastrado;
    // ao cadastrar, o vinculo aparece na proxima carga (sem re-sync dos snapshots).
    return prisma.$queryRaw`
      select fbc.id,
             fbc.cliente_id        as "clienteId",
             fbc.cnpj,
             fbc.ref,
             fbc.fonte,
             fbc.total_linhas      as "totalLinhas",
             fbc.atualizado_em     as "atualizadoEm",
             fbc.payload->>'razao' as "razao",
             coalesce(ff.cliente_id, c2.id)              as "clienteRealId",
             coalesce(c1.razao_social, c2.razao_social)  as "clienteRazao",
             coalesce(c1.grupo, c2.grupo)                as "clienteGrupo"
        from folha_bi_cache fbc
        left join lateral (
          select cliente_id from folha_filiais
           where regexp_replace(cnpj, '[^0-9]', '', 'g') = regexp_replace(fbc.cnpj, '[^0-9]', '', 'g') limit 1
        ) ff on true
        left join clientes c1 on c1.id = ff.cliente_id
        left join lateral (
          select id, razao_social, grupo from clientes
           where regexp_replace(documento, '[^0-9]', '', 'g') = regexp_replace(fbc.cnpj, '[^0-9]', '', 'g') limit 1
        ) c2 on true
       order by coalesce(c1.razao_social, c2.razao_social, fbc.payload->>'razao') asc nulls last, fbc.cnpj asc, fbc.ref desc`
  }

  // Snapshot (payload apurado) de uma competencia.
  async snapshot(clienteId: string, cnpj: string, ref: number, fonte = 'python-etl') {
    return prisma.folhaBiCache.findUnique({
      where: { clienteId_cnpj_ref_fonte: { clienteId, cnpj, ref, fonte } },
      select: {
        clienteId: true, cnpj: true, ref: true, fonte: true,
        totalLinhas: true, atualizadoEm: true, payload: true,
      },
    })
  }

  // ===== Config de agrupamento de verbas (folha_dash, ao vivo) =====

  // Snapshot da config: esquemas + grupos (arvore) + regras (prefixo de classe -> grupo).
  async classifSnapshot() {
    const [esquemas, grupos, regras] = await Promise.all([
      fq(`select id,nome,descricao,escopo,ativo from folha_dash.classif_esquema order by id`),
      fq(`select id,esquema_id,parent_id,nome,ordem,cor from folha_dash.classif_grupo order by ordem,nome`),
      fq(`select r.id,r.grupo_id,r.prefixo,r.prioridade,c.descricao as classe_desc
            from folha_dash.classif_regra r
            left join folha_dash.dim_classe c on c.cod=r.prefixo order by r.prefixo`),
    ])
    return { esquemas, grupos, regras }
  }

  // Mapa verba -> subgrupo(folha) de uma empresa/esquema (p/ o pivot do painel Verbas).
  async verbaLeaf(empresa: number, esquemaId: number) {
    const rows = await fq<{ cod_verba: number; grupo_id: number }>(
      `select cod_verba, grupo_id from folha_dash.dim_verba_grupo where cod_emp=$1 and esquema_id=$2`,
      [empresa, esquemaId])
    const map: Record<string, number> = {}
    for (const r of rows) map[String(r.cod_verba)] = Number(r.grupo_id)
    return map
  }

  // Busca de classes do SCI (p/ criar regras).
  async buscarClasses(termo: string) {
    return fq(`select cod,nivel,descricao,classe2_desc,grupo1_desc from folha_dash.dim_classe
                where cod ilike $1 or descricao ilike $2 order by cod limit 80`, [`${termo}%`, `%${termo}%`])
  }

  // --- mutacoes (espelham /api/classif do dashboard Folhas) ---
  async esquemaCreate(nome: string, escopo: string, descricao?: string) {
    const r = await fq(`insert into folha_dash.classif_esquema (nome,descricao,escopo) values ($1,$2,$3) returning id`,
      [nome, descricao ?? null, escopo])
    return { id: Number(r[0].id) }
  }
  async esquemaDelete(id: number) { await fq(`delete from folha_dash.classif_esquema where id=$1`, [id]); return { ok: true } }

  async grupoCreate(esquemaId: number, parentId: number | null, nome: string, cor?: string | null) {
    const r = await fq(
      `insert into folha_dash.classif_grupo (esquema_id,parent_id,nome,cor,ordem)
       values ($1,$2,$3,$4,coalesce((select max(ordem)+1 from folha_dash.classif_grupo
                where esquema_id=$1 and parent_id is not distinct from $2),0)) returning id`,
      [esquemaId, parentId ?? null, nome, cor ?? null])
    return { id: Number(r[0].id) }
  }
  async grupoRename(id: number, nome: string) { await fq(`update folha_dash.classif_grupo set nome=$2 where id=$1`, [id, nome]); return { ok: true } }
  async grupoDelete(id: number) { await fq(`delete from folha_dash.classif_grupo where id=$1`, [id]); return { ok: true } }
  async grupoMove(id: number, dir: 'up' | 'down') {
    const g = (await fq(`select id, esquema_id, parent_id from folha_dash.classif_grupo where id=$1`, [id]))[0]
    if (!g) return { ok: false, moved: false }
    const sibs = await fq(`select id from folha_dash.classif_grupo
        where esquema_id=$1 and parent_id is not distinct from $2 order by ordem, nome, id`, [g.esquema_id, g.parent_id])
    const ids = sibs.map((s: any) => Number(s.id))
    const i = ids.indexOf(Number(id)), j = i + (dir === 'up' ? -1 : 1)
    if (i < 0 || j < 0 || j >= ids.length) return { ok: true, moved: false }
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    for (let k = 0; k < ids.length; k++) await fq(`update folha_dash.classif_grupo set ordem=$2 where id=$1`, [ids[k], k])
    return { ok: true, moved: true }
  }

  async regraAdd(grupoId: number, prefixo: string, prioridade = 0) {
    const r = await fq(`insert into folha_dash.classif_regra (grupo_id,prefixo,prioridade) values ($1,$2,$3) returning id`,
      [grupoId, prefixo, prioridade])
    return { id: Number(r[0].id) }
  }
  async regraDelete(id: number) { await fq(`delete from folha_dash.classif_regra where id=$1`, [id]); return { ok: true } }

  // Relatorio SCI detalhado de provisao (ferias/13o), lido AO VIVO do folha_dash (pesado,
  // ~1500 linhas/empresa/mes — fora do snapshot). Devolve as linhas do ref + o saldo inicial
  // por colaborador (saldo do MES ANTERIOR: linha 3 ferias / linha 5 13o) p/ o "movimento da conta".
  async provDetalhe(empresa: number, ref: number, tipo: 'ferias' | 'decimo') {
    const n = (x: any) => (x == null ? 0 : Number(x))
    const isFer = tipo === 'ferias'
    const tbl = isFer ? 'folha_prov_ferias_det' : 'folha_prov_13_det'
    const saldoLinha = isFer ? 3 : 5
    const colsFer = `cod_col, colaborador, cod_centro, setor, data_admissao, ini_per_aquis, dt_venc, linha,
                     pr, sd, medias, faltas, rescisao, base_inss, ferias, abono, fgts, inss, terc, rat, rat_apo, pis, total`
    const cols13 = `cod_col, colaborador, cod_centro, setor, data_admissao, linha,
                    medias, rescisao, base_inss, principal, fgts, inss, terc, rat, rat_apo, pis, total`
    const rows = await fq(`select ${isFer ? colsFer : cols13} from public.${tbl}
        where cod_emp=$1 and ref=$2 order by cod_col, ${isFer ? 'ini_per_aquis,' : ''} linha`, [empresa, ref])

    const prev = (await fq<{ pr: number }>(`select max(ref) as pr from public.${tbl} where cod_emp=$1 and ref < $2`, [empresa, ref]))[0]?.pr ?? null
    const iniByCol: Record<string, any> = {}
    if (prev != null) {
      const ini = await fq(`select ${isFer ? colsFer : cols13} from public.${tbl}
          where cod_emp=$1 and ref=$2 and linha=$3`, [empresa, prev, saldoLinha])
      for (const r of ini as any[]) {
        const cod = String(r.cod_col)
        const v = iniByCol[cod] ?? (isFer ? { fer: 0, fgts: 0, inss: 0, pis: 0, tot: 0 } : { prin: 0, fgts: 0, inss: 0, pis: 0, tot: 0 })
        if (isFer) v.fer += n(r.ferias) + n(r.abono); else v.prin += n(r.principal)
        v.fgts += n(r.fgts); v.inss += n(r.inss) + n(r.terc) + n(r.rat) + n(r.rat_apo); v.pis += n(r.pis); v.tot += n(r.total)
        iniByCol[cod] = v
      }
    }
    return { tipo, rows, iniByCol, prevRef: prev, prevRefFaltando: prev == null }
  }

  // Serie multi-mes p/ os graficos do Resumo (ao vivo do folha_dash): resumo por verba
  // categorizado (folha_resumo_verba), impostos da empresa e provisoes por competencia.
  async resumoSerie(empresa: number) {
    const [resumo, impostos, provisao] = await Promise.all([
      fq(`select ref, categoria, cod_verba, descricao, valor from public.folha_resumo_verba where cod_emp=$1`, [empresa]),
      fq(`select ref, inss_emp, inss_patronal, fgts_mensal, fgts_rescisorio, n_colab from public.folha_impostos_empresa where cod_emp=$1`, [empresa]),
      fq(`select ref, tipo, total from public.folha_provisao where cod_emp=$1`, [empresa]),
    ])
    return { resumo, impostos, provisao }
  }

  // Gera a "Planilha de Custos" (mesmo layout do relatorio SCI) em XLSX, lendo o folha_dash
  // ao vivo (folha_colaborador/verba_det/fgts_col/inss_col/provisao_col + inss_param).
  // Devolve o arquivo em base64 p/ download no cliente. Porta o gerarPlanilhaCustos do dashboard.
  async planilhaCustos(empresa: number, ref: number) {
    const num = (x: any) => (x == null ? 0 : Number(x))
    const round = (n: number) => Math.round(n * 100) / 100
    const fmtData = (s: any) => (typeof s === 'string' && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '')
    const [colabs, verbas, fgts, inss, prov] = await Promise.all([
      fq(`select * from public.folha_colaborador where cod_emp=$1`, [empresa]),
      fq(`select * from public.folha_verba_det where cod_emp=$1 and ref=$2`, [empresa, ref]),
      fq(`select * from public.folha_fgts_col where cod_emp=$1 and ref=$2`, [empresa, ref]),
      fq(`select * from public.folha_inss_col where cod_emp=$1 and ref=$2`, [empresa, ref]),
      fq(`select * from public.folha_provisao_col where cod_emp=$1 and ref=$2`, [empresa, ref]),
    ])
    const param = (await fq(`select * from public.folha_inss_param where cod_emp=$1 and ref=$2`, [empresa, ref]))[0] as any
    const patronal = num(param?.patronal_pct) / 100, gilrat = num(param?.gilrat_pct) / 100, terc = num(param?.terc_pct) / 100, prop = num(param?.prop_anexo4) || 1

    const vmeta = new Map<number, { desc: string; tipo: string; ordem: number }>()
    for (const v of verbas as any[]) {
      const cv = Number(v.cod_verba)
      if (!vmeta.has(cv)) vmeta.set(cv, { desc: String(v.descricao ?? `Verba ${cv}`), tipo: String(v.tipo_desc ?? ''), ordem: num(v.ordem) || 9999 })
    }
    const ord = (a: [number, { ordem: number }], b: [number, { ordem: number }]) => a[1].ordem - b[1].ordem || a[0] - b[0]
    const provCols = [...vmeta.entries()].filter(([, m]) => m.tipo === 'Provento' || m.tipo === 'Informativa').sort(ord)
    const descCols = [...vmeta.entries()].filter(([, m]) => m.tipo === 'Desconto').sort(ord)

    const byCol = new Map<number, Map<number, number>>()
    for (const v of verbas as any[]) {
      const c = Number(v.cod_col); if (!byCol.has(c)) byCol.set(c, new Map())
      byCol.get(c)!.set(Number(v.cod_verba), (byCol.get(c)!.get(Number(v.cod_verba)) ?? 0) + num(v.valor))
    }
    const fgtsMap = new Map<number, number>(); const temFgts = new Set<number>()
    for (const f of fgts as any[]) {
      const fgtsMensal = f.resc_antecipada ? 0 : num(f.fgts_mes) + num(f.fgts_a13) + num(f.fgts_13)
      fgtsMap.set(Number(f.cod_col), fgtsMensal)
      if (num(f.base_mes) + num(f.base_13) + num(f.base_ind) + num(f.base_a13) > 0) temFgts.add(Number(f.cod_col))
    }
    const baseInssMap = new Map<number, number>(); const dedFpasMap = new Map<number, number>(); const salBaseMap = new Map<number, number>()
    for (const i of inss as any[]) {
      baseInssMap.set(Number(i.cod_col), num(i.base_gps ?? i.base_inss))
      dedFpasMap.set(Number(i.cod_col), num(i.deducoes_fpas))
      salBaseMap.set(Number(i.cod_col), num(i.salario_base))
    }
    const provMap = new Map<number, { fer: number; dec: number }>()
    for (const p of prov as any[]) {
      const c = Number(p.cod_col), cur = provMap.get(c) ?? { fer: 0, dec: 0 }
      if (p.tipo === 'ferias') cur.fer += num(p.prov_mes); else if (p.tipo === 'decimo') cur.dec += num(p.prov_mes)
      provMap.set(c, cur)
    }

    const header = [
      'Empresa', 'Centro Custo', 'Descrição Centro Custo', 'CPF', 'Cadastro Colaborador', 'Nome Colaborador', 'Data Admissão', 'Salário base',
      ...provCols.map(([, m]) => m.desc), 'Total de proventos',
      ...descCols.map(([, m]) => m.desc), 'Total Descontos', 'Líquidos',
      'FGTS', 'Base INSS', 'INSS Empresa', 'INSS Outras Entidades', 'RAT', 'Deduções FPAS', 'Provisões Férias', 'Provisões 13º Salário',
    ]
    const aoa: (string | number)[][] = [header]
    const colabsOrd = [...(colabs as any[])].sort((a, b) => String(a.nome ?? '').localeCompare(String(b.nome ?? '')))
    for (const c of colabsOrd) {
      const cod = Number(c.cod_col)
      const vals = byCol.get(cod)
      if (!vals && !fgtsMap.has(cod) && !baseInssMap.has(cod)) continue
      const provVals = provCols.map(([cv]) => vals?.get(cv) ?? 0)
      const descVals = descCols.map(([cv]) => vals?.get(cv) ?? 0)
      const totProv = provCols.reduce((a, [cv, m]) => a + (m.tipo === 'Provento' ? (vals?.get(cv) ?? 0) : 0), 0)
      const totDesc = descVals.reduce((a, x) => a + x, 0)
      const baseInss = baseInssMap.get(cod) ?? 0
      const baseEmpreg = temFgts.has(cod) ? baseInss : 0
      const pr = provMap.get(cod) ?? { fer: 0, dec: 0 }
      aoa.push([
        String(empresa), c.cod_tpcc == null ? '' : String(c.cod_tpcc), String(c.setor ?? ''), String(c.cpf ?? ''),
        cod, String(c.nome ?? ''), fmtData(c.data_admissao), round(salBaseMap.get(cod) ?? 0),
        ...provVals.map(round), round(totProv),
        ...descVals.map(round), round(totDesc), round(totProv - totDesc),
        round(fgtsMap.get(cod) ?? 0), round(baseInss),
        round(baseInss * patronal * prop), round(baseEmpreg * terc), round(baseEmpreg * gilrat * prop), round(dedFpasMap.get(cod) ?? 0),
        round(pr.fer), round(pr.dec),
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha1')
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const mm = String(ref % 100).padStart(2, '0'), aaaa = Math.floor(ref / 100)
    return { filename: `Planilha_Custos_${mm}${aaaa}_0${empresa}.xlsx`, base64: buffer.toString('base64') }
  }

  // Aplica o agrupamento (materializa dim_verba_grupo). Reflete imediatamente no painel Verbas.
  async aplicar(esquemaId?: number) {
    const r = esquemaId
      ? await fq(`select folha_dash.resolver_esquema($1) as n`, [esquemaId])
      : await fq(`select folha_dash.resolver_todos() as n`)
    return { resolvidas: Number(r[0].n) }
  }
}
