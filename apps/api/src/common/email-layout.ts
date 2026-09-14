import * as fs from 'fs'
import * as path from 'path'

/**
 * O visual dos e-mails do sistema.
 *
 * Nasceu privado dentro do `orcamento.service` (#HLP0248, handoff de
 * padronizacao de e-mails) e saiu de la quando a Gestao de Arquivos precisou do
 * MESMO visual: copiar teria criado um segundo lugar para decidir a mesma
 * coisa, e dois lugares divergem — bastaria alguem trocar a cor do rodape num
 * deles para o escritorio passar a receber dois e-mails com cara diferente.
 *
 * Tudo aqui e funcao pura de parametros mais os anexos `cid:`, entao nao
 * depende do Nest e serve a qualquer modulo.
 */

// Logo embutida (cid:logo) no cabeçalho verde dos e-mails do sistema. O header é
// verde (#10b981→#059669), então usa a versão BRANCA do logo; fallback pro logo
// padrão se a branca não existir. (#HLP0248 + handoff de padronização de e-mails.)
const LOGO_PATH = path.resolve(process.cwd(), 'assets', 'email-logo-white.png')
let LOGO_BUFFER: Buffer | null = null
try { LOGO_BUFFER = fs.readFileSync(LOGO_PATH) } catch { /* sem logo branco */ }
if (!LOGO_BUFFER) {
  try { LOGO_BUFFER = fs.readFileSync(path.resolve(process.cwd(), 'assets', 'email-logo.png')) } catch { /* sem logo */ }
}

// Ícones dos badges (PNG lucide recolorido no accent). Embutidos via cid:icon.
// SVG inline não funciona em cliente de e-mail — por isso PNG.
const ICON_DIR = path.resolve(process.cwd(), 'assets', 'email-icons')
const ICON_BUFFERS: Record<string, Buffer> = {}
for (const nome of ['file-plus', 'file-text', 'rotate-ccw', 'circle-check', 'circle-x', 'circle-play', 'flag', 'message-square', 'reply']) {
  try { ICON_BUFFERS[nome] = fs.readFileSync(path.join(ICON_DIR, `${nome}.png`)) } catch { /* ícone ausente */ }
}

// Tint claro do badge por accent (email-safe — sem color-mix). Default cinza claro.
const ACCENT_TINT: Record<string, string> = {
  '#fb7185': '#fff1f2', '#f43f5e': '#fff1f2', '#ef4444': '#fef2f2',
  '#10b981': '#ecfdf5', '#059669': '#ecfdf5', '#0f766e': '#f0fdfa',
  '#f59e0b': '#fffbeb', '#fb923c': '#fff7ed', '#0ea5e9': '#f0f9ff', '#22d3ee': '#ecfeff',
}

/** Wrapper principal do email — header com logo, hero opcional, body, footer.
 *
 * @param params.empresaNome     nome de exibicao da empresa (header e footer)
 * @param params.logoUrl         URL absoluta da logomarca (placeholder caso nao haja)
 * @param params.preheader       texto que aparece no preview do inbox
 * @param params.heroAccent      cor de destaque do hero (badge de status)
 * @param params.heroTitle       titulo grande na cor de destaque
 * @param params.heroSubtitle    subtitulo abaixo do titulo (numero do orcamento, etc)
 * @param params.bodyHtml        conteudo principal (paragrafos + tabela de resumo)
 * @param params.ctaLabel        texto do botao CTA (opcional)
 * @param params.ctaUrl          URL do botao CTA (opcional)
 */
export function buildEmailLayout(params: {
  empresaNome: string
  logoUrl: string | null | undefined
  preheader: string
  heroAccent: string
  heroTitle: string
  heroSubtitle?: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  footerExtra?: string
  /** nome lucide do ícone do badge (PNG via cid:icon). Ver ICON_BUFFERS. */
  iconName?: string
  /** tint claro do badge (email-safe). Default: mapa por accent. */
  accentTint?: string
  /** links do rodapé. Default: Abrir OneClick · Central de Ajuda. */
  footerLinks?: Array<{ label: string; url: string }>
}): string {
  const {
    empresaNome, logoUrl, preheader, heroAccent, heroTitle, heroSubtitle,
    bodyHtml, ctaLabel, ctaUrl, footerExtra, iconName, accentTint, footerLinks,
  } = params
  const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.central-rnc.com.br').replace(/\/$/, '')

  // Logo BRANCO no header verde (cid:logo). Fallback: URL externa; senão texto.
  const logoBlock = LOGO_BUFFER
    ? `<img src="cid:logo" alt="${empresaNome}" height="38" style="max-height:38px;max-width:200px;display:inline-block;border:0;outline:none;text-decoration:none;" />`
    : logoUrl
    ? `<img src="${logoUrl}" alt="${empresaNome}" height="38" style="max-height:38px;max-width:200px;display:inline-block;border:0;outline:none;text-decoration:none;" />`
    : `<span style="display:inline-block;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${empresaNome}</span>`

  // Badge de ícone (54×54, tint do accent, PNG via cid:icon). Só quando há ícone.
  const tint = accentTint || ACCENT_TINT[heroAccent.toLowerCase()] || '#f3f4f6'
  const badgeBlock = (iconName && ICON_BUFFERS[iconName])
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
            <td width="54" height="54" align="center" valign="middle" bgcolor="${tint}" style="width:54px;height:54px;background:${tint};border-radius:15px;">
              <img src="cid:icon" alt="" width="26" height="26" style="display:block;border:0;" />
            </td></tr></table>`
    : ''

  const ctaBlock = ctaLabel && ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px;"><tr>
            <td align="center" bgcolor="#10b981" style="border-radius:9px;background:#10b981;background:linear-gradient(135deg,#10b981,#059669);">
              <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;">${ctaLabel}&nbsp;&rarr;</a>
            </td></tr></table>`
    : ''

  const links = (footerLinks && footerLinks.length) ? footerLinks : [
    { label: 'Abrir OneClick', url: baseUrl },
    { label: 'Central de Ajuda', url: `${baseUrl}/faq` },
  ]
  const footerLinksBlock = `<p style="margin:0 0 14px;font-size:12.5px;color:#6b7280;">` +
    links.map(l => `<a href="${l.url}" style="color:#6b7280;font-weight:500;text-decoration:none;">${l.label}</a>`).join(' &nbsp;&middot;&nbsp; ') +
    `</p>`

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${heroTitle}</title>
<style>
@media only screen and (max-width: 620px) {
  .container { width: 100% !important; }
  .px-32 { padding-left: 20px !important; padding-right: 20px !important; }
  .hero-title { font-size: 22px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};-webkit-font-smoothing:antialiased;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${preheader}</div>

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
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${heroAccent};">${empresaNome}</p>
          <h1 class="hero-title" style="margin:0;font-size:26px;font-weight:700;color:#0f172a;line-height:1.25;">${heroTitle}</h1>
          ${heroSubtitle ? `<p style="margin:9px 0 0;font-size:14px;color:#6b7280;line-height:1.5;">${heroSubtitle}</p>` : ''}
        </td>
      </tr>

      <!-- Corpo -->
      <tr>
        <td class="px-32" style="padding:6px 32px 30px;font-size:14px;line-height:1.6;color:#374151;">
          ${bodyHtml}
          ${ctaBlock}
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 32px;"><div style="height:1px;background:#e5e7eb;">&nbsp;</div></td></tr>

      <!-- Rodapé -->
      <tr>
        <td class="px-32" style="padding:20px 32px 28px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
          ${footerLinksBlock}
          ${footerExtra ? `<p style="margin:0 0 8px;color:#6b7280;">${footerExtra}</p>` : ''}
          <p style="margin:0;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.</p>
          <p style="margin:10px 0 0;font-weight:700;color:#10b981;letter-spacing:0.2px;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

/** Attachments (cid) do shell: logo branco + ícone do badge. Todo sendMail que
 *  usa buildEmailLayout deve espalhar isto pra o cid:logo/cid:icon resolverem. */
export function shellAttachments(iconName?: string): Array<{ filename: string; content: Buffer; cid: string }> | undefined {
  const atts: Array<{ filename: string; content: Buffer; cid: string }> = []
  if (LOGO_BUFFER) atts.push({ filename: 'logo.png', content: LOGO_BUFFER, cid: 'logo' })
  const ib = iconName ? ICON_BUFFERS[iconName] : undefined
  if (ib) atts.push({ filename: 'icon.png', content: ib, cid: 'icon' })
  return atts.length ? atts : undefined
}
