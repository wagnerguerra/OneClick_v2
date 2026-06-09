/**
 * email-shell — espelho fiel (no front) do `buildEmailLayout` do backend.
 *
 * Fonte de verdade: `apps/api/src/orcamento/orcamento.service.ts`, método
 * privado `buildEmailLayout` (~linha 954). Replicamos AQUI o mesmo HTML/CSS
 * inline (header com logo, faixa de destaque com heroTitle/heroSubtitle, corpo,
 * botão CTA, rodapé) para que o preview do simulador fique IDÊNTICO ao e-mail
 * realmente enviado pelo sistema.
 *
 * ⚠️ Se `buildEmailLayout` mudar no backend, atualize esta função também.
 *
 * NOTA: os estilos inline e hex hardcoded abaixo são E-MAIL real (HTML for
 * email clients), não chrome do app. Eles são isolados no <iframe> do preview,
 * então NÃO quebram o dark mode da aplicação.
 */

export interface EmailShellParams {
  empresaNome: string
  logoUrl: string | null | undefined
  preheader: string
  /** cor de destaque (label do hero) — espelha `heroAccent` */
  heroAccent: string
  heroTitle: string
  heroSubtitle?: string
  bodyHtml: string
  ctaLabel?: string
  ctaUrl?: string
  footerExtra?: string
}

/** Renderiza o HTML completo do e-mail, fiel ao `buildEmailLayout` do backend. */
export function renderEmailShell(params: EmailShellParams): string {
  const {
    empresaNome, logoUrl, preheader, heroAccent, heroTitle, heroSubtitle,
    bodyHtml, ctaLabel, ctaUrl, footerExtra,
  } = params

  // Logomarca: se houver URL → img; senao → texto branco grande sobre faixa verde
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${empresaNome}" style="max-height:48px;max-width:200px;display:inline-block;border:0;outline:none;text-decoration:none;" />`
    : `<span style="display:inline-block;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${empresaNome}</span>`

  const ctaBlock = ctaLabel && ctaUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 8px;">
        <tr>
          <td align="center" bgcolor="#10b981" style="border-radius:8px;background:#10b981;">
            <a href="${ctaUrl}" style="display:inline-block;padding:14px 36px;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>`
    : ''

  return `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${heroTitle}</title>
<style>
  @media only screen and (max-width: 620px) {
    .container { width: 100% !important; padding: 0 !important; }
    .px-32 { padding-left: 20px !important; padding-right: 20px !important; }
    .hero-title { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1f2937;">
  <!-- Pre-header (oculto, aparece na preview do inbox) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;">${preheader}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.06);">

          <!-- Header verde com logo -->
          <tr>
            <td bgcolor="#10b981" align="center" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:28px 32px;">
              ${logoBlock}
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="px-32" style="padding:36px 32px 16px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${heroAccent};">${empresaNome}</p>
              <h1 class="hero-title" style="margin:0;font-size:26px;font-weight:700;color:#0f172a;line-height:1.25;">${heroTitle}</h1>
              ${heroSubtitle ? `<p style="margin:8px 0 0;font-size:14px;color:#6b7280;">${heroSubtitle}</p>` : ''}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="px-32" style="padding:8px 32px 32px;font-size:14px;line-height:1.6;color:#374151;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#e5e7eb;margin:0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="px-32" style="padding:20px 32px 28px;text-align:center;font-size:12px;color:#9ca3af;line-height:1.6;">
              ${footerExtra ? `<p style="margin:0 0 8px;color:#6b7280;">${footerExtra}</p>` : ''}
              <p style="margin:0;">Este é um e-mail automático. Por favor, não responda diretamente a esta mensagem.</p>
              <p style="margin:8px 0 0;font-weight:600;color:#10b981;">${empresaNome} &middot; ${new Date().getFullYear()}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
