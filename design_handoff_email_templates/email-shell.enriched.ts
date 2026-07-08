/**
 * email-shell.enriched — versão ENRIQUECIDA e EMAIL-SAFE do shell de e-mail.
 *
 * Traduz o protótipo (Flexbox/SVG/box-shadow, só para preview) para HTML de e-mail
 * real: <table> + estilos inline + <img> PNG para ícones + fallback bgcolor nos
 * gradientes. Serve tanto para o backend (`buildEmailLayout` em
 * apps/api/src/orcamento/orcamento.service.ts) quanto para o espelho do front
 * (`renderEmailShell` em .../email-templates/_lib/email-shell.ts).
 *
 * ⚠️ Backend e front precisam ficar IDÊNTICOS. Se editar um, edite o outro.
 */

export type EmailAccent = 'green' | 'orange' | 'cyan' | 'indigo' | 'rose'

/** accent -> { destaque (eyebrow/badge icon), tint do badge } */
export const ACCENTS: Record<EmailAccent, { color: string; tint: string; icon: string }> = {
  green:  { color: '#10b981', tint: '#ecfdf5', icon: '#059669' },
  orange: { color: '#fb923c', tint: '#fff7ed', icon: '#f97316' },
  cyan:   { color: '#22d3ee', tint: '#ecfeff', icon: '#06b6d4' },
  indigo: { color: '#818cf8', tint: '#eef2ff', icon: '#6366f1' },
  rose:   { color: '#f43f5e', tint: '#fff1f2', icon: '#f43f5e' },
}

export interface EmailShellParams {
  empresaNome: string
  logoUrl: string | null | undefined
  preheader: string
  accent: EmailAccent
  /** URL absoluta de um PNG ~26px do ícone, já na cor de destaque. Opcional. */
  iconUrl?: string | null
  heroTitle: string
  heroSubtitle?: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  /** linha extra no rodapé (endereço/CNPJ etc.) */
  footerExtra?: string
  /** links do rodapé: [{ label, url }] */
  footerLinks?: Array<{ label: string; url: string }>
}

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

export function renderEmailShell(p: EmailShellParams): string {
  const a = ACCENTS[p.accent] ?? ACCENTS.green

  const logoBlock = p.logoUrl
    ? `<img src="${p.logoUrl}" alt="${p.empresaNome}" height="38" style="max-height:38px;max-width:190px;display:inline-block;border:0;outline:none;text-decoration:none;" />`
    : `<span style="display:inline-block;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${p.empresaNome}</span>`

  // Badge de ícone (PNG). Sem iconUrl, o badge é omitido.
  const badgeBlock = p.iconUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
        <tr>
          <td width="54" height="54" align="center" valign="middle" bgcolor="${a.tint}" style="width:54px;height:54px;background:${a.tint};border-radius:15px;">
            <img src="${p.iconUrl}" alt="" width="26" height="26" style="display:block;border:0;" />
          </td>
        </tr>
      </table>`
    : ''

  const ctaBlock = p.ctaLabel && p.ctaUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;">
        <tr>
          <td align="center" bgcolor="#10b981" style="border-radius:9px;background:#10b981;background:linear-gradient(135deg,#10b981,#059669);">
            <a href="${p.ctaUrl}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">
              ${p.ctaLabel}&nbsp;&rarr;
            </a>
          </td>
        </tr>
      </table>`
    : ''

  const footerLinks = (p.footerLinks && p.footerLinks.length)
    ? `<p style="margin:0 0 14px;font-size:12.5px;color:#6b7280;">` +
      p.footerLinks
        .map(l => `<a href="${l.url}" style="color:#6b7280;font-weight:500;text-decoration:none;">${l.label}</a>`)
        .join(' &nbsp;&middot;&nbsp; ') +
      `</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${p.heroTitle}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; }
    .px-32 { padding-left: 20px !important; padding-right: 20px !important; }
    .hero-title { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};-webkit-font-smoothing:antialiased;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${p.preheader}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 10px 30px -10px rgba(16,24,40,0.18);">

        <!-- Header verde com logo -->
        <tr>
          <td bgcolor="#10b981" align="center" style="background:#10b981;background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:30px 32px;">
            ${logoBlock}
          </td>
        </tr>
        <!-- barra de brilho na base do header (decorativa) -->
        <tr><td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,rgba(16,185,129,0),#34d399,rgba(16,185,129,0));">&nbsp;</td></tr>

        <!-- Hero: badge + eyebrow + título + subtítulo -->
        <tr>
          <td class="px-32" style="padding:32px 32px 14px;">
            ${badgeBlock}
            <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${a.color};">${p.empresaNome}</p>
            <h1 class="hero-title" style="margin:0;font-size:26px;font-weight:700;color:#0f172a;line-height:1.25;">${p.heroTitle}</h1>
            ${p.heroSubtitle ? `<p style="margin:9px 0 0;font-size:14px;color:#6b7280;line-height:1.5;">${p.heroSubtitle}</p>` : ''}
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td class="px-32" style="padding:6px 32px 30px;font-size:14px;line-height:1.6;color:#374151;">
            ${p.bodyHtml}
            ${ctaBlock}
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e7eb;">&nbsp;</div></td></tr>

        <!-- Rodapé -->
        <tr>
          <td class="px-32" style="padding:20px 32px 28px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
            ${footerLinks}
            ${p.footerExtra ? `<p style="margin:0 0 8px;color:#6b7280;">${p.footerExtra}</p>` : ''}
            <p style="margin:0;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.</p>
            <p style="margin:10px 0 0;font-weight:700;color:#10b981;letter-spacing:0.2px;">${p.empresaNome} &middot; ${new Date().getFullYear()}</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/* ---------------------------------------------------------------------------
   Snippets email-safe para o corpo (bodyHtml). Use <table>, nunca flex/SVG.
   --------------------------------------------------------------------------- */

/** Card de detalhe (chave/valor). rows: [label, value, isTotal?] */
export function detailCard(rows: Array<[string, string, boolean?]>): string {
  const trs = rows.map(([k, v, total]) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #f0f1f3;font-size:13px;color:${total ? '#065f46' : '#6b7280'};${total ? 'background:#f0fdf4;font-weight:600;' : ''}">${k}</td>
      <td align="right" style="padding:12px 16px;border-bottom:1px solid #f0f1f3;font-size:13.5px;font-weight:${total ? '700' : '600'};color:${total ? '#065f46' : '#111827'};${total ? 'background:#f0fdf4;' : ''}">${v}</td>
    </tr>`).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin:8px 0 14px;">${trs}</table>`
}

/** Caixa de código de verificação (1b). */
export function codeBox(code: string, legenda = 'código de verificação'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 12px;">
    <tr><td align="center" bgcolor="#f0fdf4" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:22px;">
      <div style="font-size:36px;font-weight:700;letter-spacing:12px;color:#065f46;padding-left:12px;">${code}</div>
      <div style="font-size:11.5px;letter-spacing:.5px;text-transform:uppercase;color:#10b981;font-weight:600;margin-top:8px;">${legenda}</div>
    </td></tr></table>`
}

/** Caixa de alerta (1c senha / 1h falha). tone: 'warn' | 'error' */
export function alertBox(html: string, tone: 'warn' | 'error' = 'error'): string {
  const t = tone === 'warn'
    ? { bg: '#fff7ed', bd: '#fed7aa', fg: '#9a3412' }
    : { bg: '#fff1f2', bd: '#fecdd3', fg: '#be123c' }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:6px 0 14px;">
    <tr><td bgcolor="${t.bg}" style="background:${t.bg};border:1px solid ${t.bd};border-radius:12px;padding:14px 16px;font-size:13px;color:${t.fg};">${html}</td></tr></table>`
}
