import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'

// Modelo configurável do e-mail diário da agenda (paralelo ao HTML hardcoded).
// Tabelas via raw SQL (client Prisma não regenera por lock de DLL no Windows;
// models existem no schema p/ build do prod).

export interface EmailTemplate {
  id: string
  empresaId: string | null
  ativo: boolean
  assunto: string
  accent: string
  logoUrl: string
  headerHtml: string
  introHtml: string
  footerHtml: string
  eventoLinhaHtml: string
  semEventosHtml: string
  mostrarOutros: boolean
  nomeGrupoOutros: string
  nomeGrupoParticulares: string
  corParticulares: string
}
export interface EmailGrupo {
  id: string
  nome: string
  cor: string
  icone: string
  ordem: number
  incluiParticulares: boolean
  tiposIds: string[]
}

// ── Defaults (replicam o e-mail atual: nenhum grupo de tipo, particular→pessoais,
//    o resto vira "Compromissos corporativos" via o grupo Outros renomeado). ──
const DEFAULT_HEADER = `<h1 style="margin:0;font-size:20px;color:#0f172a">Agenda do dia</h1>
<p style="margin:4px 0 0;font-size:13px;color:#64748b">{{diaSemana}}, {{dataDisplay}}</p>`
const DEFAULT_INTRO = `<p style="margin:0 0 8px;font-size:14px;color:#334155">Olá {{usuario.name}}, você tem <strong>{{totalEventos}}</strong> compromisso(s) hoje:</p>`
const DEFAULT_FOOTER = `<p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Enviado automaticamente pela Agenda Corporativa.</p>`
const DEFAULT_EVENTO_LINHA = `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;width:80px;vertical-align:top;font-size:13px;font-weight:600;color:{{evento.tipoCor}}">{{evento.horario}}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">
    <div style="font-size:14px;font-weight:600;color:#0f172a">{{evento.titulo}}</div>
    <div style="font-size:12px;color:#64748b">{{evento.tipoNome}}{{evento.localSuffix}}</div>
  </td>
</tr>`
const DEFAULT_SEM_EVENTOS = `<p style="font-size:13px;color:#94a3b8;font-style:italic">Nenhum compromisso para hoje.</p>`

function tplDefaults(): Omit<EmailTemplate, 'id' | 'empresaId'> {
  return {
    ativo: false,
    assunto: 'Agenda do dia · {{dataDisplay}}',
    accent: '#38bdf8',
    logoUrl: '',
    headerHtml: DEFAULT_HEADER,
    introHtml: DEFAULT_INTRO,
    footerHtml: DEFAULT_FOOTER,
    eventoLinhaHtml: DEFAULT_EVENTO_LINHA,
    semEventosHtml: DEFAULT_SEM_EVENTOS,
    mostrarOutros: true,
    nomeGrupoOutros: 'Compromissos corporativos',
    nomeGrupoParticulares: 'Compromissos pessoais',
    corParticulares: '#a855f7',
  }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
const escAttr = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = String(hex || '').replace('#', '')
  const expanded = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  if (expanded.length !== 6) return null
  const n = parseInt(expanded, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
/** Texto escuro/branco conforme o brilho do fundo, pra pill legível mesmo em cor pastel. */
function contrastarTexto(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#ffffff'
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return lum > 0.62 ? '#0f172a' : '#ffffff'
}
/** Versão escurecida da cor (borda da pill). */
function escurecer(hex: string, amount: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const f = Math.max(0, 1 - amount)
  return `#${[rgb.r, rgb.g, rgb.b].map(v => Math.round(v * f).toString(16).padStart(2, '0')).join('')}`
}
function interpolate(html: string, vars: Record<string, unknown>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const val = key.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), vars)
    return val == null ? '' : String(val)
  })
}

@Injectable()
export class AgendaEmailTemplateService {
  // ── CRUD ──
  async getTemplate(empresaId?: string | null): Promise<{ template: EmailTemplate; grupos: EmailGrupo[] }> {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT id, empresa_id AS "empresaId", ativo, assunto, accent, logo_url AS "logoUrl",
              header_html AS "headerHtml", intro_html AS "introHtml", footer_html AS "footerHtml",
              evento_linha_html AS "eventoLinhaHtml", sem_eventos_html AS "semEventosHtml",
              mostrar_outros AS "mostrarOutros", nome_grupo_outros AS "nomeGrupoOutros",
              nome_grupo_particulares AS "nomeGrupoParticulares", cor_particulares AS "corParticulares"
         FROM agenda_email_template WHERE ($1::text IS NULL OR empresa_id = $1) ORDER BY created_at ASC LIMIT 1`,
      empresaId ?? null,
    )) as EmailTemplate[]
    let template = rows[0]
    if (!template) {
      const id = randomUUID(); const d = tplDefaults()
      await prisma.$executeRawUnsafe(
        `INSERT INTO agenda_email_template (id, empresa_id, ativo, assunto, accent, header_html, intro_html, footer_html, evento_linha_html, sem_eventos_html, mostrar_outros, nome_grupo_outros, nome_grupo_particulares, cor_particulares, logo_url, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), now())`,
        id, empresaId ?? null, d.ativo, d.assunto, d.accent, d.headerHtml, d.introHtml, d.footerHtml,
        d.eventoLinhaHtml, d.semEventosHtml, d.mostrarOutros, d.nomeGrupoOutros, d.nomeGrupoParticulares, d.corParticulares, d.logoUrl,
      )
      template = { id, empresaId: empresaId ?? null, ...d }
    }
    const grupos = (await prisma.$queryRawUnsafe(
      `SELECT id, nome, cor, icone, ordem, inclui_particulares AS "incluiParticulares", tipos_ids AS "tiposIds"
         FROM agenda_email_grupos WHERE template_id = $1 ORDER BY ordem ASC`, template.id)) as EmailGrupo[]
    return { template, grupos }
  }

  async saveTemplate(empresaId: string | null, patch: Partial<EmailTemplate>) {
    const { template } = await this.getTemplate(empresaId)
    await prisma.$executeRawUnsafe(
      `UPDATE agenda_email_template SET
         ativo = COALESCE($2, ativo), assunto = COALESCE($3, assunto), accent = COALESCE($4, accent),
         header_html = COALESCE($5, header_html), intro_html = COALESCE($6, intro_html), footer_html = COALESCE($7, footer_html),
         evento_linha_html = COALESCE($8, evento_linha_html), sem_eventos_html = COALESCE($9, sem_eventos_html),
         mostrar_outros = COALESCE($10, mostrar_outros), nome_grupo_outros = COALESCE($11, nome_grupo_outros),
         nome_grupo_particulares = COALESCE($12, nome_grupo_particulares), cor_particulares = COALESCE($13, cor_particulares),
         logo_url = COALESCE($14, logo_url),
         updated_at = now()
       WHERE id = $1`,
      template.id, patch.ativo ?? null, patch.assunto ?? null, patch.accent ?? null,
      patch.headerHtml ?? null, patch.introHtml ?? null, patch.footerHtml ?? null,
      patch.eventoLinhaHtml ?? null, patch.semEventosHtml ?? null, patch.mostrarOutros ?? null,
      patch.nomeGrupoOutros ?? null, patch.nomeGrupoParticulares ?? null, patch.corParticulares ?? null,
      patch.logoUrl ?? null,
    )
    return { id: template.id }
  }

  async saveGrupos(empresaId: string | null, grupos: Array<Omit<EmailGrupo, 'id'>>) {
    const { template } = await this.getTemplate(empresaId)
    await prisma.$executeRawUnsafe(`DELETE FROM agenda_email_grupos WHERE template_id = $1`, template.id)
    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i]
      await prisma.$executeRawUnsafe(
        `INSERT INTO agenda_email_grupos (id, template_id, nome, cor, icone, ordem, inclui_particulares, tipos_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        randomUUID(), template.id, g.nome, g.cor, g.icone ?? '', i, g.incluiParticulares, g.tiposIds,
      )
    }
    return { ok: true }
  }

  // ── Render ──
  /** Monta o HTML final a partir do template + grupos + eventos (já visíveis/filtrados).
   *  Cada evento vira um bloco individualizado (card) e cada grupo um cabeçalho com
   *  ícone + nome + badge de contagem. Cabeçalho/intro/rodapé são prosa configurável. */
  render(
    template: EmailTemplate,
    grupos: EmailGrupo[],
    eventos: any[],
    ctx: { usuarioNome: string; dataDisplay: string; diaSemana: string; temLogo: boolean },
  ): string {
    // Distribui TODOS os eventos visíveis estritamente pelos grupos definidos
    // (pela atribuição de tipos). O que não cair em nenhum grupo vai pro catch-all
    // "Outros" (quando habilitado). Nenhum agrupamento fixo de "particulares".
    const usados = new Set<string>()
    const secoesGrupos = grupos
      .map(g => {
        const items = eventos.filter(e => !usados.has(e.id) && (g.tiposIds || []).includes(e.tipoId))
        items.forEach(e => usados.add(e.id))
        return { nome: g.nome, cor: g.cor, icone: g.icone || '📅', items }
      })
      .filter(s => s.items.length > 0)

    const outros = eventos.filter(e => !usados.has(e.id))
    const secoes: Array<{ nome: string; cor: string; icone: string; items: any[] }> = [...secoesGrupos]
    if (template.mostrarOutros && outros.length > 0) secoes.push({ nome: template.nomeGrupoOutros || 'Outros', cor: template.accent, icone: '📌', items: outros })

    const globalVars = {
      usuario: { name: ctx.usuarioNome },
      dataDisplay: ctx.dataDisplay,
      diaSemana: ctx.diaSemana,
      totalEventos: eventos.length,
    }

    // ── Card individual do evento (espelha o e-mail atual: faixa lateral colorida,
    //    coluna de horário, título, pill da categoria, modalidade/local, participantes
    //    em chips e "agendado por" no rodapé). ──
    const renderCard = (ev: any) => {
      const cor = ev.tipo?.cor || template.accent
      const horarioBlock = ev.diaInteiro
        ? `<span style="font-weight:700;color:${cor}">Dia inteiro</span>`
        : `<div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.1">${esc(ev.horaInicio ?? '')}</div>
           <div style="font-weight:500;font-size:11px;color:#94a3b8;line-height:1;margin-top:2px">${esc(ev.horaFim ?? '')}</div>`
      const modalidadeLabel = ev.presenca === 'ONLINE' ? 'Online' : ev.presenca === 'HIBRIDO' ? 'Híbrido' : 'Presencial'
      const modalidadeIcon = ev.presenca === 'ONLINE' ? '💻' : ev.presenca === 'HIBRIDO' ? '🔄' : '🏢'
      const local = ev.salaRef?.nome || ev.sala || ''

      const textoNaPill = contrastarTexto(cor)
      const corEscura = escurecer(cor, 0.25)
      const linhaInfo: string[] = []
      linhaInfo.push(`<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;background:${cor};color:${textoNaPill};border:1px solid ${corEscura};box-shadow:0 1px 2px rgba(15,23,42,0.08)">${esc(ev.tipo?.nome ?? '')}</span>`)
      linhaInfo.push(`<span style="font-size:11px;color:#64748b">${modalidadeIcon} ${modalidadeLabel}</span>`)
      if (local) linhaInfo.push(`<span style="font-size:11px;color:#64748b">📍 ${esc(local)}</span>`)

      const nomes = ((ev.participantes ?? []) as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso)
        .filter(Boolean) as string[]
      const participantesHtml = nomes.length > 0
        ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #e2e8f0">
             <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">👥 Participantes</div>
             <div style="line-height:1.9">${nomes.map(n => `<span style="display:inline-block;padding:2px 9px;margin:0 4px 4px 0;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:500;border:1px solid #e2e8f0">${esc(n)}</span>`).join('')}</div>
           </div>`
        : ''

      const linkHtml = ev.link
        ? `<div style="margin-top:10px;font-size:11px;color:#64748b">
             <strong style="color:#475569">🔗 Link:</strong>
             <a href="${escAttr(ev.link)}" style="color:${template.accent};text-decoration:none;word-break:break-all">${esc(ev.link)}</a>
           </div>`
        : ''

      const criadorHtml = ev.criador?.name
        ? `<div style="margin-top:12px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Agendado por ${esc(ev.criador.name)}</div>`
        : ''

      return `
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px">
  <tr><td bgcolor="#cbd5e1" style="background-color:#cbd5e1;padding:1px;border-radius:10px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:9px;overflow:hidden">
      <tr>
        <td width="4" bgcolor="${cor}" style="background-color:${cor};width:4px;padding:0;line-height:0;font-size:0">&nbsp;</td>
        <td width="68" valign="middle" style="padding:14px 10px 14px 14px;text-align:center;border-right:1px solid #f1f5f9;vertical-align:middle;background:#f8fafc">
          ${horarioBlock}
        </td>
        <td valign="top" style="padding:14px 16px;vertical-align:top">
          <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;line-height:1.3">${esc(ev.titulo)}</div>
          <div style="margin-bottom:4px">${linhaInfo.join(' &nbsp; ')}</div>
          ${linkHtml}
          ${participantesHtml}
          ${criadorHtml}
        </td>
      </tr>
    </table>
  </td></tr>
</table>`
    }

    // ── Cabeçalho de grupo: ícone + nome em caixa-alta + badge de contagem. ──
    const renderSecao = (s: { nome: string; cor: string; icone: string; items: any[] }) => `
      <table cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 12px">
        <tr>
          <td valign="middle" style="padding-right:10px;font-size:16px;line-height:1">${s.icone}</td>
          <td valign="middle" style="padding-right:10px;font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.8px;line-height:1">${esc(s.nome)}</td>
          <td valign="middle"><span style="display:inline-block;background:#e2e8f0;color:#475569;font-size:10px;padding:2px 9px;border-radius:999px;font-weight:700;line-height:1.4">${s.items.length}</span></td>
        </tr>
      </table>
      ${s.items.map(renderCard).join('')}`

    const corpoSecoes = secoes.length === 0
      ? interpolate(template.semEventosHtml, globalVars)
      : secoes.map(renderSecao).join('')

    const header = interpolate(template.headerHtml, globalVars)
    const intro = interpolate(template.introHtml, globalVars)
    const footer = interpolate(template.footerHtml, globalVars)

    // Logomarca do topo: usa a enviada no template (URL absoluta); senão a logo
    // padrão embarcada (cid:logo) quando disponível.
    const base = (process.env.API_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_API_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')
    const logoSrc = template.logoUrl
      ? (template.logoUrl.startsWith('http') ? template.logoUrl : `${base}${template.logoUrl}`)
      : (ctx.temLogo ? 'cid:logo' : '')
    const logoHtml = logoSrc ? `<div style="text-align:center;padding:6px 0 18px"><img src="${logoSrc}" alt="logo" style="max-height:54px;max-width:240px" /></div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
  <tr><td style="height:4px;background:${template.accent}"></td></tr>
  <tr><td style="padding:22px 28px 26px">
    ${logoHtml}
    ${header}
    ${intro}
    ${corpoSecoes}
    ${footer}
  </td></tr>
</table>
</td></tr></table>
</body></html>`
  }

  /** Assunto interpolado (pra envio/teste). */
  renderAssunto(template: EmailTemplate, ctx: { dataDisplay: string; diaSemana: string }): string {
    return interpolate(template.assunto, { dataDisplay: ctx.dataDisplay, diaSemana: ctx.diaSemana })
  }
}
