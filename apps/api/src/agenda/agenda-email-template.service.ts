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
  larguraMax: number
  logoUrl: string
  logoLargura: number
  headerHtml: string
  introHtml: string
  footerHtml: string
  eventoLinhaHtml: string
  semEventosHtml: string
  cardModo: string
  cardElementos: string
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
// Hero do topo (gradiente + tile de data + saudação). Full-bleed; editável em HTML.
const DEFAULT_HEADER = `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="color:#ffffff;background:linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);background-image:url({{assetBg}}),linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%);background-repeat:repeat,no-repeat;background-size:260px 260px,100% 100%">
  <tr><td style="padding:28px 28px 24px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
      <td width="78" valign="top" style="padding-right:18px">
        <table cellpadding="0" cellspacing="0" border="0" width="78" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.18);overflow:hidden">
          <tr><td style="padding:5px 0;text-align:center;font-size:11px;font-weight:800;color:#ffffff;text-transform:uppercase;letter-spacing:2px;background:#0f172a">{{mesAbrev}}</td></tr>
          <tr><td style="padding:8px 0 2px;text-align:center;font-size:34px;font-weight:800;color:#0f172a;line-height:1">{{diaNum}}</td></tr>
          <tr><td style="padding:0 0 8px;text-align:center;font-size:10px;color:#64748b;letter-spacing:1px;font-weight:600">{{anoNum}}</td></tr>
        </table>
      </td>
      <td valign="middle">
        <div style="font-size:11px;color:rgba(255,255,255,0.95);text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:6px">{{saudacao}}, {{nomePrimeiro}}</div>
        <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;line-height:1.15">Sua agenda do dia</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.9);margin-top:6px;text-transform:capitalize">{{diaSemana}}</div>
      </td>
    </tr></table>
  </td></tr>
</table>`
const DEFAULT_INTRO = `<p style="margin:0 0 8px;font-size:14px;color:#334155">Olá {{usuario.name}}, você tem <strong>{{totalEventos}}</strong> compromisso(s) hoje:</p>`
// Cabeçalho default ANTIGO (h1 simples) — usado só pra migração automática p/ o hero.
const OLD_DEFAULT_HEADER = `<h1 style="margin:0;font-size:20px;color:#0f172a">Agenda do dia</h1>
<p style="margin:4px 0 0;font-size:13px;color:#64748b">{{diaSemana}}, {{dataDisplay}}</p>`
const DEFAULT_FOOTER = `<p style="margin:16px 0 0;font-size:11px;color:#94a3b8">Enviado automaticamente pela Agenda Corporativa.</p>`
const DEFAULT_SEM_EVENTOS = `<p style="font-size:13px;color:#94a3b8;font-style:italic">Nenhum compromisso para hoje.</p>`

// ── Builder do card: ordem + visibilidade dos elementos. O default reproduz
//    EXATAMENTE o card original (título → categoria+modalidade+local → link →
//    participantes → criador), pra ser possível voltar a ele a qualquer momento. ──
export type CardElemento = { key: string; visivel: boolean }
const DEFAULT_CARD_ELEMENTOS: CardElemento[] = [
  { key: 'titulo', visivel: true },
  { key: 'categoria', visivel: true },
  { key: 'modalidade', visivel: true },
  { key: 'local', visivel: true },
  { key: 'link', visivel: true },
  { key: 'participantes', visivel: true },
  { key: 'criador', visivel: true },
  { key: 'data', visivel: false },
  { key: 'contato', visivel: false },
  { key: 'descricao', visivel: false },
]
// inline = flui na mesma linha quando vizinhos; block = ocupa a própria linha.
const CARD_EL_INLINE = new Set(['categoria', 'modalidade', 'local', 'data'])

function tplDefaults(): Omit<EmailTemplate, 'id' | 'empresaId'> {
  return {
    ativo: false,
    assunto: 'Agenda do dia · {{dataDisplay}}',
    accent: '#38bdf8',
    larguraMax: 600,
    logoUrl: '',
    logoLargura: 0,
    headerHtml: DEFAULT_HEADER,
    introHtml: DEFAULT_INTRO,
    footerHtml: DEFAULT_FOOTER,
    eventoLinhaHtml: '', // só usado no modo HTML; vazio = builder cuida do card
    semEventosHtml: DEFAULT_SEM_EVENTOS,
    cardModo: 'builder',
    cardElementos: JSON.stringify(DEFAULT_CARD_ELEMENTOS),
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
      `SELECT id, empresa_id AS "empresaId", ativo, assunto, accent, largura_max AS "larguraMax", logo_url AS "logoUrl", logo_largura AS "logoLargura",
              header_html AS "headerHtml", intro_html AS "introHtml", footer_html AS "footerHtml",
              evento_linha_html AS "eventoLinhaHtml", sem_eventos_html AS "semEventosHtml",
              card_modo AS "cardModo", card_elementos AS "cardElementos",
              mostrar_outros AS "mostrarOutros", nome_grupo_outros AS "nomeGrupoOutros",
              nome_grupo_particulares AS "nomeGrupoParticulares", cor_particulares AS "corParticulares"
         FROM agenda_email_template WHERE ($1::text IS NULL OR empresa_id = $1) ORDER BY created_at ASC LIMIT 1`,
      empresaId ?? null,
    )) as EmailTemplate[]
    let template = rows[0]
    if (!template) {
      const id = randomUUID(); const d = tplDefaults()
      await prisma.$executeRawUnsafe(
        `INSERT INTO agenda_email_template (id, empresa_id, ativo, assunto, accent, header_html, intro_html, footer_html, evento_linha_html, sem_eventos_html, mostrar_outros, nome_grupo_outros, nome_grupo_particulares, cor_particulares, logo_url, largura_max, card_modo, card_elementos, logo_largura, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, now(), now())`,
        id, empresaId ?? null, d.ativo, d.assunto, d.accent, d.headerHtml, d.introHtml, d.footerHtml,
        d.eventoLinhaHtml, d.semEventosHtml, d.mostrarOutros, d.nomeGrupoOutros, d.nomeGrupoParticulares, d.corParticulares, d.logoUrl, d.larguraMax, d.cardModo, d.cardElementos, d.logoLargura,
      )
      template = { id, empresaId: empresaId ?? null, ...d }
    }
    // Migração: cabeçalho default ANTIGO (h1 simples) → hero novo, uma vez só.
    if ((template.headerHtml || '').trim() === OLD_DEFAULT_HEADER.trim()) {
      await prisma.$executeRawUnsafe(`UPDATE agenda_email_template SET header_html = $2, updated_at = now() WHERE id = $1`, template.id, DEFAULT_HEADER)
      template.headerHtml = DEFAULT_HEADER
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
         logo_url = COALESCE($14, logo_url), largura_max = COALESCE($15, largura_max),
         card_modo = COALESCE($16, card_modo), card_elementos = COALESCE($17, card_elementos),
         logo_largura = COALESCE($18, logo_largura),
         updated_at = now()
       WHERE id = $1`,
      template.id, patch.ativo ?? null, patch.assunto ?? null, patch.accent ?? null,
      patch.headerHtml ?? null, patch.introHtml ?? null, patch.footerHtml ?? null,
      patch.eventoLinhaHtml ?? null, patch.semEventosHtml ?? null, patch.mostrarOutros ?? null,
      patch.nomeGrupoOutros ?? null, patch.nomeGrupoParticulares ?? null, patch.corParticulares ?? null,
      patch.logoUrl ?? null, patch.larguraMax ?? null, patch.cardModo ?? null, patch.cardElementos ?? null,
      patch.logoLargura ?? null,
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
    ctx: { usuarioNome: string; dataDisplay: string; diaSemana: string; temLogo: boolean; saudacao?: string },
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

    // Base da API (uploads /api/upload) e base do app web (assets estáticos: marca d'água SVG).
    const base = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')
    const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
    const [diaNum = '', mmStr = '', anoNum = ''] = (ctx.dataDisplay || '').split('/')
    const mesAbrev = MESES[(parseInt(mmStr, 10) || 1) - 1] || ''
    const nomePrimeiro = (ctx.usuarioNome || '').split(' ')[0] || ctx.usuarioNome || ''

    const globalVars = {
      usuario: { name: ctx.usuarioNome },
      nomePrimeiro,
      saudacao: ctx.saudacao || 'Olá',
      dataDisplay: ctx.dataDisplay,
      diaSemana: ctx.diaSemana,
      diaNum,
      mesAbrev,
      anoNum,
      assetBg: `${appBase}/email-bg-agenda.svg`,
      accent: template.accent,
      totalEventos: eventos.length,
    }

    // Elementos do builder (ordem + visibilidade). Default = card original.
    let elementos: CardElemento[] = DEFAULT_CARD_ELEMENTOS
    try {
      const parsed = JSON.parse(template.cardElementos || '[]')
      if (Array.isArray(parsed) && parsed.length) elementos = parsed
    } catch { /* usa default */ }

    // Monta o conjunto de fragmentos HTML por chave de elemento (string vazia = sem conteúdo).
    const fragmentosDoEvento = (ev: any) => {
      const cor = ev.tipo?.cor || template.accent
      const modalidadeLabel = ev.presenca === 'ONLINE' ? 'Online' : ev.presenca === 'HIBRIDO' ? 'Híbrido' : 'Presencial'
      const modalidadeIcon = ev.presenca === 'ONLINE' ? '💻' : ev.presenca === 'HIBRIDO' ? '🔄' : '🏢'
      const local = ev.salaRef?.nome || ev.sala || ev.local || ''
      const textoNaPill = contrastarTexto(cor)
      const corEscura = escurecer(cor, 0.25)
      const nomes = ((ev.participantes ?? []) as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso).filter(Boolean) as string[]

      const pillCategoria = `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;background:${cor};color:${textoNaPill};border:1px solid ${corEscura};box-shadow:0 1px 2px rgba(15,23,42,0.08)">${esc(ev.tipo?.nome ?? '')}</span>`
      const participantesHtml = nomes.length > 0
        ? `<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #e2e8f0">
             <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">👥 Participantes</div>
             <div style="line-height:1.9">${nomes.map(n => `<span style="display:inline-block;padding:2px 9px;margin:0 4px 4px 0;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:500;border:1px solid #e2e8f0">${esc(n)}</span>`).join('')}</div>
           </div>` : ''
      const linkHtml = ev.link
        ? `<div style="margin-top:10px;font-size:11px;color:#64748b"><strong style="color:#475569">🔗 Link:</strong> <a href="${escAttr(ev.link)}" style="color:${template.accent};text-decoration:none;word-break:break-all">${esc(ev.link)}</a></div>` : ''
      const criadorHtml = ev.criador?.name
        ? `<div style="margin-top:12px;padding-top:8px;border-top:1px solid #f1f5f9;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Agendado por ${esc(ev.criador.name)}</div>` : ''
      const descricaoHtml = ev.descricao
        ? `<div style="margin-top:10px;font-size:12px;color:#475569;line-height:1.5">${String(ev.descricao)}</div>` : ''
      const contatoHtml = ev.contato
        ? `<div style="margin-top:8px;font-size:11px;color:#64748b"><strong style="color:#475569">📇 Contato:</strong> ${esc(ev.contato)}</div>` : ''

      return {
        cor,
        frags: {
          titulo: `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;line-height:1.3">${esc(ev.titulo)}</div>`,
          categoria: pillCategoria,
          modalidade: `<span style="font-size:11px;color:#64748b">${modalidadeIcon} ${modalidadeLabel}</span>`,
          local: local ? `<span style="font-size:11px;color:#64748b">📍 ${esc(local)}</span>` : '',
          data: ev.data ? `<span style="font-size:11px;color:#64748b">📅 ${esc(this.formatDateBrFromAny(ev.data))}</span>` : '',
          link: linkHtml,
          participantes: participantesHtml,
          criador: criadorHtml,
          descricao: descricaoHtml,
          contato: contatoHtml,
        } as Record<string, string>,
      }
    }

    // Variáveis pro modo HTML livre (controle total do card).
    const buildVars = (ev: any) => {
      const { cor, frags } = fragmentosDoEvento(ev)
      const horario = ev.diaInteiro ? 'Dia inteiro' : [ev.horaInicio, ev.horaFim].filter(Boolean).join(' — ') || ev.horaInicio || ''
      const local = ev.salaRef?.nome || ev.sala || ev.local || ''
      const modalidade = ev.presenca === 'ONLINE' ? 'Online' : ev.presenca === 'HIBRIDO' ? 'Híbrido' : 'Presencial'
      const nomes = ((ev.participantes ?? []) as Array<{ usuario?: { name: string } | null; nomeAvulso?: string | null }>)
        .map(p => p.usuario?.name ?? p.nomeAvulso).filter(Boolean) as string[]
      return {
        ...globalVars,
        evento: {
          titulo: esc(ev.titulo), horario: esc(horario), horaInicio: esc(ev.horaInicio ?? ''), horaFim: esc(ev.horaFim ?? ''),
          data: ev.data ? esc(this.formatDateBrFromAny(ev.data)) : '',
          local: esc(local), sala: esc(ev.salaRef?.nome || ev.sala || ''), contato: esc(ev.contato ?? ''),
          link: esc(ev.link ?? ''), presenca: esc(ev.presenca ?? ''), modalidade: esc(modalidade),
          tipoNome: esc(ev.tipo?.nome ?? ''), tipoCor: cor, criador: esc(ev.criador?.name ?? ''),
          descricao: ev.descricao ? String(ev.descricao) : '',
          participantes: nomes.map(esc).join(', '),
          // convenções prontas (HTML) pra não precisar montar na mão:
          pillCategoria: frags.categoria, participantesHtml: frags.participantes, linkHtml: frags.link, criadorHtml: frags.criador,
        },
      }
    }

    // ── Builder: monta o corpo do card respeitando ordem/visibilidade; elementos
    //    inline vizinhos fluem na mesma linha (preserva o visual original). ──
    const renderCardBuilder = (ev: any) => {
      const { cor, frags } = fragmentosDoEvento(ev)
      const horarioBlock = ev.diaInteiro
        ? `<span style="font-weight:700;color:${cor}">Dia inteiro</span>`
        : `<div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.1">${esc(ev.horaInicio ?? '')}</div>
           <div style="font-weight:500;font-size:11px;color:#94a3b8;line-height:1;margin-top:2px">${esc(ev.horaFim ?? '')}</div>`

      const partes: string[] = []
      let inlineBuf: string[] = []
      const flush = () => { if (inlineBuf.length) { partes.push(`<div style="margin-bottom:4px">${inlineBuf.join(' &nbsp; ')}</div>`); inlineBuf = [] } }
      for (const el of elementos) {
        if (!el.visivel) continue
        const html = frags[el.key]
        if (!html) continue
        if (CARD_EL_INLINE.has(el.key)) inlineBuf.push(html)
        else { flush(); partes.push(html) }
      }
      flush()

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
          ${partes.join('\n          ')}
        </td>
      </tr>
    </table>
  </td></tr>
</table>`
    }

    const renderCard = (ev: any) =>
      template.cardModo === 'html' && (template.eventoLinhaHtml || '').trim()
        ? interpolate(template.eventoLinhaHtml, buildVars(ev))
        : renderCardBuilder(ev)

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
    const footer = interpolate(template.footerHtml, globalVars)

    // Logomarca do topo: usa a enviada no template (URL absoluta); senão a logo
    // padrão embarcada (cid:logo) quando disponível.
    const logoSrc = template.logoUrl
      ? (template.logoUrl.startsWith('http') ? template.logoUrl : `${base}${template.logoUrl}`)
      : (ctx.temLogo ? 'cid:logo' : '')
    // Faixa branca da logo no topo (acima do hero), bleed-to-edge. Largura configurável
    // (logoLargura px); 0 = tamanho original. max-width:100% evita estourar o corpo.
    const logoW = Number(template.logoLargura) || 0
    const logoStyle = logoW > 0
      ? `width:${logoW}px;max-width:100%;height:auto`
      : `max-width:100%;height:auto`
    const logoBar = logoSrc
      ? `<tr><td align="center" style="padding:20px 28px;background:#ffffff;text-align:center"><img src="${logoSrc}" alt="logo" width="${logoW > 0 ? logoW : ''}" style="${logoStyle};display:block;margin:0 auto;border:0" /></td></tr>`
      : ''

    // Largura máxima do corpo (px), configurável — clamp defensivo.
    const larguraMax = Math.min(1000, Math.max(440, Number(template.larguraMax) || 600))

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0"><tr><td align="center" style="padding:0 12px">
<table width="${larguraMax}" cellpadding="0" cellspacing="0" style="max-width:${larguraMax}px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.06)">
  ${logoBar}
  <tr><td style="padding:0">${header}</td></tr>
  <tr><td style="padding:22px 28px 26px">
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

  /** dd/mm/aaaa a partir de Date ou string (campo `data` do evento, em UTC). */
  formatDateBrFromAny(d: Date | string): string {
    const dt = d instanceof Date ? d : new Date(d)
    if (Number.isNaN(dt.getTime())) return ''
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`
  }

  /** Cabeçalho (hero) padrão — pra restaurar pelo editor. */
  defaultHeaderHtml(): string { return DEFAULT_HEADER }

  /** HTML padrão do card pro modo HTML livre — espelha o card do builder (chrome + corpo). */
  defaultCardHtml(): string {
    return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 14px">
  <tr><td bgcolor="#cbd5e1" style="background-color:#cbd5e1;padding:1px;border-radius:10px">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#ffffff;border-radius:9px;overflow:hidden">
      <tr>
        <td width="4" bgcolor="{{evento.tipoCor}}" style="background-color:{{evento.tipoCor}};width:4px;padding:0;line-height:0;font-size:0">&nbsp;</td>
        <td width="68" valign="middle" style="padding:14px 10px 14px 14px;text-align:center;border-right:1px solid #f1f5f9;vertical-align:middle;background:#f8fafc">
          <div style="font-weight:700;font-size:14px;color:#0f172a;line-height:1.1">{{evento.horaInicio}}</div>
          <div style="font-weight:500;font-size:11px;color:#94a3b8;line-height:1;margin-top:2px">{{evento.horaFim}}</div>
        </td>
        <td valign="top" style="padding:14px 16px;vertical-align:top">
          <div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;line-height:1.3">{{evento.titulo}}</div>
          <div style="margin-bottom:4px">{{evento.pillCategoria}} &nbsp; <span style="font-size:11px;color:#64748b">{{evento.modalidade}}</span></div>
          {{evento.linkHtml}}
          {{evento.participantesHtml}}
          {{evento.criadorHtml}}
        </td>
      </tr>
    </table>
  </td></tr>
</table>`
  }
}
