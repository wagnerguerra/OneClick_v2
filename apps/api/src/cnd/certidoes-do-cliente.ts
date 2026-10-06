import { prisma } from '@saas/db'

/**
 * Última certidão/alvará de cada tipo de UM cliente — fonte única da aba
 * Legalização (interna) e do quadro "Certidões e alvarás" do portal do
 * cliente (06/10/2026). Duas cópias da mesma consulta acabariam mostrando
 * coisas diferentes ao escritório e ao cliente.
 *
 * Tudo recortado por empresa (tenant) E cliente.
 */
export interface CertidaoDoCliente {
  id: string
  /** Chave da rota de PDF (`alvara_func` para o alvará de funcionamento). */
  tipo: string
  label: string
  situacao: string | null
  dataValidade: string | null
  dataConsulta: string | null
  sucesso: boolean
  temPdf: boolean
}

/** Tabela de cada tipo — mapa FIXO: o nome da tabela nunca vem do usuário. */
export const TABELA_DA_CERTIDAO: Record<string, string> = {
  federal: 'certidoes_cnd', estadual: 'certidoes_cnd_estadual', municipal: 'certidoes_cnd_municipal',
  trabalhista: 'certidoes_cndt', fgts: 'certidoes_crf_fgts', cgu: 'certidoes_cgu',
  alvara_bombeiros: 'alvaras_bombeiros', alvara_func: 'alvaras_funcionamento',
}

type Linha = Record<string, unknown>
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : null)
const dia = (v: unknown) => (v instanceof Date ? v.toISOString().split('T')[0] ?? null : null)

export async function certidoesDoCliente(empresaId: string, clienteId: string): Promise<CertidaoDoCliente[]> {
  const rows: CertidaoDoCliente[] = []
  const ultima = (sql: string) => prisma.$queryRawUnsafe<Linha[]>(sql, clienteId, empresaId).catch(() => [] as Linha[])
  const temPdf = `(pdf_base64 IS NOT NULL AND pdf_base64 != '') AS tem_pdf`
  const filtro = `WHERE cliente_id = $1 AND empresa_id = $2`

  const [fed, est, mun, trb, fgts, cgu, alv, alvFunc] = await Promise.all([
    ultima(`SELECT id, tipo_certidao, data_validade, created_at, sucesso, ${temPdf} FROM certidoes_cnd ${filtro} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, sucesso, mensagem, created_at, ${temPdf} FROM certidoes_cnd_estadual ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, tipo_certidao, municipio, data_validade, created_at, sucesso, ${temPdf} FROM certidoes_cnd_municipal ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, tipo_certidao, data_validade, created_at, sucesso, ${temPdf} FROM certidoes_cndt ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, tipo_certidao, data_validade, created_at, sucesso, ${temPdf} FROM certidoes_crf_fgts ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, tipo_certidao, created_at, sucesso, ${temPdf} FROM certidoes_cgu ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, status, data_fim_validade, created_at, ${temPdf} FROM alvaras_bombeiros ${filtro} ORDER BY created_at DESC LIMIT 1`),
    ultima(`SELECT id, sucesso, municipio, mensagem, created_at, ${temPdf} FROM alvaras_funcionamento ${filtro} ORDER BY created_at DESC LIMIT 1`),
  ])

  const f = fed[0]; if (f) rows.push({ id: f.id as string, tipo: 'federal', label: 'CND Federal (PGFN/RFB)', situacao: f.tipo_certidao as string | null, dataValidade: dia(f.data_validade), dataConsulta: iso(f.created_at), sucesso: f.sucesso as boolean, temPdf: !!f.tem_pdf })
  const e = est[0]; if (e) rows.push({ id: e.id as string, tipo: 'estadual', label: 'CND Estadual (SEFAZ ES)', situacao: e.sucesso ? 'Negativa' : ((e.mensagem as string) || 'Não emitida'), dataValidade: null, dataConsulta: iso(e.created_at), sucesso: e.sucesso as boolean, temPdf: !!e.tem_pdf })
  const m = mun[0]; if (m) rows.push({ id: m.id as string, tipo: 'municipal', label: `CND Municipal (${(m.municipio as string) || ''})`, situacao: m.tipo_certidao as string | null, dataValidade: dia(m.data_validade), dataConsulta: iso(m.created_at), sucesso: m.sucesso as boolean, temPdf: !!m.tem_pdf })
  const t = trb[0]; if (t) rows.push({ id: t.id as string, tipo: 'trabalhista', label: 'CNDT Trabalhista (TST)', situacao: t.tipo_certidao as string | null, dataValidade: dia(t.data_validade), dataConsulta: iso(t.created_at), sucesso: t.sucesso as boolean, temPdf: !!t.tem_pdf })
  const g = fgts[0]; if (g) rows.push({ id: g.id as string, tipo: 'fgts', label: 'CRF/FGTS (Caixa)', situacao: g.tipo_certidao as string | null, dataValidade: dia(g.data_validade), dataConsulta: iso(g.created_at), sucesso: g.sucesso as boolean, temPdf: !!g.tem_pdf })
  const c = cgu[0]; if (c) rows.push({ id: c.id as string, tipo: 'cgu', label: 'CGU (Certidão Correcional)', situacao: c.tipo_certidao as string | null, dataValidade: null, dataConsulta: iso(c.created_at), sucesso: c.sucesso as boolean, temPdf: !!c.tem_pdf })
  const a = alv[0]; if (a) rows.push({ id: a.id as string, tipo: 'alvara_bombeiros', label: 'Alvará Bombeiros (CBMES)', situacao: a.status as string | null, dataValidade: a.data_fim_validade ? String(a.data_fim_validade).slice(0, 10) : null, dataConsulta: iso(a.created_at), sucesso: (a.status as string) === 'Regular', temPdf: !!a.tem_pdf })
  const af = alvFunc[0]; if (af) rows.push({ id: af.id as string, tipo: 'alvara_func', label: `Alvará de Funcionamento (${(af.municipio as string) || ''})`, situacao: af.sucesso ? 'Emitido' : ((af.mensagem as string) || 'Não emitido'), dataValidade: null, dataConsulta: iso(af.created_at), sucesso: af.sucesso as boolean, temPdf: !!af.tem_pdf })
  return rows
}

/**
 * PDF de uma certidão desta empresa. Com `clienteId`, exige também que o
 * registro seja DESTE cliente — o portal só baixa o que é do próprio cliente.
 */
export async function pdfDaCertidao(empresaId: string, tipo: string, id: string, clienteId?: string): Promise<string | null> {
  const tabela = TABELA_DA_CERTIDAO[tipo]
  if (!tabela) return null
  const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
    clienteId
      ? `SELECT pdf_base64 FROM ${tabela} WHERE id = $1 AND empresa_id = $2 AND cliente_id = $3`
      : `SELECT pdf_base64 FROM ${tabela} WHERE id = $1 AND empresa_id = $2`,
    ...(clienteId ? [id, empresaId, clienteId] : [id, empresaId]),
  ).catch(() => [])
  return rows[0]?.pdf_base64 || null
}
