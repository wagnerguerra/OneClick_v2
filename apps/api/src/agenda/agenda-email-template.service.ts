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
      `SELECT id, nome, cor, ordem, inclui_particulares AS "incluiParticulares", tipos_ids AS "tiposIds"
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
        `INSERT INTO agenda_email_grupos (id, template_id, nome, cor, ordem, inclui_particulares, tipos_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        randomUUID(), template.id, g.nome, g.cor, i, g.incluiParticulares, g.tiposIds,
      )
    }
    return { ok: true }
  }

  // ── Render ──
  /** Monta o HTML final a partir do template + grupos + eventos (já visíveis/filtrados). */
  render(
    template: EmailTemplate,
    grupos: EmailGrupo[],
    eventos: any[],
    ctx: { usuarioNome: string; dataDisplay: string; diaSemana: string; temLogo: boolean },
  ): string {
    const particulares = eventos.filter(e => e.particular)
    const resto = eventos.filter(e => !e.particular)

    const usados = new Set<string>()
    const secoesGrupos = grupos
      .map(g => {
        const items = resto.filter(e => !usados.has(e.id) && (g.tiposIds || []).includes(e.tipoId))
        items.forEach(e => usados.add(e.id))
        return { nome: g.nome, cor: g.cor, items }
      })
      .filter(s => s.items.length > 0)

    const outros = resto.filter(e => !usados.has(e.id))
    const secoes: Array<{ nome: string; cor: string; items: any[] }> = [...secoesGrupos]
    if (particulares.length > 0) secoes.push({ nome: template.nomeGrupoParticulares, cor: template.corParticulares, items: particulares })
    if (template.mostrarOutros && outros.length > 0) secoes.push({ nome: template.nomeGrupoOutros, cor: template.accent, items: outros })

    const globalVars = {
      usuario: { name: ctx.usuarioNome },
      dataDisplay: ctx.dataDisplay,
      diaSemana: ctx.diaSemana,
      totalEventos: eventos.length,
    }

    const renderEvento = (ev: any) => {
      const horario = ev.diaInteiro ? 'Dia inteiro' : [ev.horaInicio, ev.horaFim].filter(Boolean).join(' — ') || ev.horaInicio || ''
      const local = ev.local || ev.salaRef?.nome || ev.sala || ''
      const vars = {
        ...globalVars,
        evento: {
          titulo: esc(ev.titulo),
          horario: esc(horario),
          horaInicio: esc(ev.horaInicio ?? ''),
          horaFim: esc(ev.horaFim ?? ''),
          local: esc(local),
          localSuffix: local ? ` · ${esc(local)}` : '',
          presenca: esc(ev.presenca ?? ''),
          link: esc(ev.link ?? ''),
          tipoNome: esc(ev.tipo?.nome ?? ''),
          tipoCor: ev.tipo?.cor || template.accent,
          criador: esc(ev.criador?.name ?? ''),
        },
      }
      return interpolate(template.eventoLinhaHtml, vars)
    }

    const corpoSecoes = secoes.length === 0
      ? interpolate(template.semEventosHtml, globalVars)
      : secoes.map(s => `
        <div style="margin-top:18px">
          <div style="display:flex;align-items:center;gap:8px;padding:0 0 6px">
            <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.cor}"></span>
            <span style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#0f172a">${esc(s.nome)}</span>
            <span style="font-size:11px;color:#94a3b8">(${s.items.length})</span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
            ${s.items.map(renderEvento).join('')}
          </table>
        </div>`).join('')

    const header = interpolate(template.headerHtml, globalVars)
    const intro = interpolate(template.introHtml, globalVars)
    const footer = interpolate(template.footerHtml, globalVars)

    // Logomarca do topo: usa a enviada no template (URL absoluta); senão a logo
    // padrão embarcada (cid:logo) quando disponível.
    const base = (process.env.API_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
    const logoSrc = template.logoUrl
      ? (template.logoUrl.startsWith('http') ? template.logoUrl : `${base}${template.logoUrl}`)
      : (ctx.temLogo ? 'cid:logo' : '')
    const logoHtml = logoSrc ? `<div style="text-align:center;padding:4px 0 14px"><img src="${logoSrc}" alt="logo" style="max-height:48px;max-width:220px" /></div>` : ''

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
  <tr><td style="height:4px;background:${template.accent}"></td></tr>
  <tr><td style="padding:24px 28px">
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
