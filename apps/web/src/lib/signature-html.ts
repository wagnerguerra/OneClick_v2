/**
 * Builder do HTML da assinatura de email. Usado em /perfil (preview) e
 * /admin/assinatura-template (preview do master).
 *
 * Modo padrão: renderiza um template TABLE-BASED com inline CSS aplicando o
 * `SignatureTemplate` (cores, fonte, posição do logo, visibilidade dos campos).
 *
 * Modo customHtml: interpola placeholders {{user.X}} / {{empresa.X}} /
 * {{template.X}} no HTML fornecido pelo master.
 */

export interface SignatureTemplate {
  backgroundColor: string
  /** Imagem de fundo opcional — render via `background-image` no <table>. Cor
   *  continua como fallback pra clientes que strip-pam (Outlook desktop). */
  backgroundImageUrl: string | null
  accentColor: string
  textColor: string
  subtleColor: string
  fontFamily: string
  showPhoto: boolean
  showName: boolean
  showArea: boolean
  showPhone: boolean
  showAddress: boolean
  showSite: boolean
  showInstagram: boolean
  showLogo: boolean
  showPhotoBackground: boolean
  showIcons: boolean
  customHtmlEnabled: boolean
  customHtml: string | null
}

export const SIGNATURE_TEMPLATE_DEFAULTS: SignatureTemplate = {
  backgroundColor: '#3a3a3a',
  backgroundImageUrl: null,
  accentColor: '#10b981',
  textColor: '#ffffff',
  subtleColor: '#cfd2d4',
  fontFamily: 'Arial, Helvetica, sans-serif',
  showPhoto: true,
  showName: true,
  showArea: true,
  showPhone: true,
  showAddress: true,
  showSite: true,
  showInstagram: true,
  showLogo: true,
  showPhotoBackground: true,
  showIcons: true,
  customHtmlEnabled: false,
  customHtml: null,
}

export interface SignatureData {
  name: string
  email: string
  telefone: string | null
  celular: string | null
  whatsapp: string | null
  instagramUrl: string | null
  linkedinUrl: string | null
  signatureImageUrl: string | null
  area: { name: string } | null
  cargo: { name: string } | null
  empresa: {
    id: string
    razaoSocial: string
    nomeFantasia: string | null
    telefone: string | null
    email: string | null
    site: string | null
    logradouro: string | null
    numero: string | null
    bairro: string | null
    cidade: string | null
    uf: string | null
    logoUrl: string | null
    logoDarkUrl: string | null
  } | null
}

function absoluteUrl(url: string | null | undefined, assetBase: string): string {
  if (!url) return ''
  if (url.startsWith('http') || url.startsWith('data:')) return url
  return `${assetBase}${url}`
}

export function instagramHandle(url: string | null | undefined): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (!trimmed) return null
  const match = trimmed.match(/instagram\.com\/([^/?#]+)/i)
  const handle = match ? match[1] : trimmed.replace(/^@/, '')
  return handle ? `@${handle}` : null
}

/** Resolve um valor a partir de "user.X" / "empresa.X" / "template.X". */
function resolvePlaceholder(
  path: string,
  d: SignatureData,
  template: SignatureTemplate,
  assetBase: string,
): string {
  const empresaEndereco = [
    [d.empresa?.logradouro, d.empresa?.numero].filter(Boolean).join(', '),
    d.empresa?.cidade,
    d.empresa?.uf,
  ].filter(Boolean).join(', ').replace(/, ([A-Z]{2})$/, '-$1')

  const logoFinal = d.empresa?.logoUrl || ''
  const ig = instagramHandle(d.instagramUrl) ?? ''

  const map: Record<string, string> = {
    'user.name':              d.name ?? '',
    'user.nameUpper':         (d.name ?? '').toUpperCase(),
    'user.email':             d.email ?? '',
    'user.area':              d.area?.name ?? d.cargo?.name ?? '',
    'user.cargo':             d.cargo?.name ?? '',
    'user.telefone':          d.telefone ?? '',
    'user.celular':           d.celular ?? '',
    'user.whatsapp':          d.whatsapp ?? '',
    'user.instagramHandle':   ig,
    'user.instagramUrl':      d.instagramUrl ?? '',
    'user.linkedinUrl':       d.linkedinUrl ?? '',
    'user.signatureImageUrl': absoluteUrl(d.signatureImageUrl, assetBase),
    'empresa.razaoSocial':    d.empresa?.razaoSocial ?? '',
    'empresa.nomeFantasia':   d.empresa?.nomeFantasia ?? d.empresa?.razaoSocial ?? '',
    'empresa.telefone':       d.empresa?.telefone ?? '',
    'empresa.email':          d.empresa?.email ?? '',
    'empresa.site':           (d.empresa?.site ?? '').replace(/^https?:\/\//, ''),
    'empresa.endereco':       empresaEndereco,
    'empresa.logoUrl':        absoluteUrl(logoFinal, assetBase),
    'template.backgroundColor': template.backgroundColor,
    'template.backgroundImageUrl': absoluteUrl(template.backgroundImageUrl, assetBase),
    'template.accentColor':     template.accentColor,
    'template.textColor':       template.textColor,
    'template.subtleColor':     template.subtleColor,
    'template.fontFamily':      template.fontFamily,
  }
  return map[path] ?? ''
}

function interpolate(
  html: string,
  d: SignatureData,
  template: SignatureTemplate,
  assetBase: string,
): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) =>
    resolvePlaceholder(key, d, template, assetBase),
  )
}

export function buildSignatureHtml(
  d: SignatureData,
  template: SignatureTemplate = SIGNATURE_TEMPLATE_DEFAULTS,
  assetBase: string = '',
): string {
  // Modo HTML avançado: interpola e devolve direto.
  if (template.customHtmlEnabled && template.customHtml) {
    return interpolate(template.customHtml, d, template, assetBase)
  }

  // Modo visual padrão.
  const accent = template.accentColor
  const bg = template.backgroundColor
  const text = template.textColor
  const subtle = template.subtleColor
  const fontFamily = template.fontFamily

  const fotoUrl = absoluteUrl(d.signatureImageUrl, assetBase)
  const logoUrl = absoluteUrl(d.empresa?.logoUrl, assetBase)
  const nomeUpper = d.name.toUpperCase()
  const area = d.area?.name ?? d.cargo?.name ?? ''
  const tel = d.empresa?.telefone ?? ''
  const cel = d.celular ?? d.whatsapp ?? d.telefone ?? ''
  const telefones = [tel, cel].filter(Boolean).join(' / ')
  const endereco = [
    [d.empresa?.logradouro, d.empresa?.numero].filter(Boolean).join(', '),
    d.empresa?.cidade,
    d.empresa?.uf,
  ].filter(Boolean).join(', ').replace(/, ([A-Z]{2})$/, '-$1')
  const site = (d.empresa?.site ?? '').replace(/^https?:\/\//, '')
  const ig = instagramHandle(d.instagramUrl)

  const linhaIcone = (icon: string, txt: string, show: boolean) => {
    if (!show || !txt) return ''
    const iconSpan = template.showIcons
      ? `<span style="color:${accent};margin-right:8px;font-size:12px;">${icon}</span>`
      : ''
    return `<tr><td style="padding:3px 0;font-size:12px;color:${text};line-height:1.4;">${iconSpan}${txt}</td></tr>`
  }

  // Quando showPhotoBackground=false, a foto do usuário NÃO é renderizada —
  // a célula esquerda fica vazia mantendo seu espaço (220x180), e o background
  // do template (cor + imagem) preenche essa área. Útil quando a imagem de
  // fundo já tem decoração/foto incluída.
  const fotoCell = template.showPhoto
    ? template.showPhotoBackground
      ? `<td valign="middle" style="padding:0;width:220px;line-height:0;border-radius:14px 0 0 14px;">
          ${fotoUrl
        ? `<img src="${fotoUrl}" alt="${d.name}" width="220" height="180" style="display:block;border:0;border-radius:14px 0 0 14px;width:220px;height:180px;object-fit:cover;"/>`
        : `<div style="width:220px;height:180px;background:${bg};display:inline-block;line-height:180px;text-align:center;color:${text};font-size:48px;font-weight:bold;border-radius:14px 0 0 14px;">${(d.name[0] || '?').toUpperCase()}</div>`}
        </td>`
      // Foto OFF mas mantém espaço pro background do template cobrir.
      : `<td valign="middle" style="padding:0;width:220px;line-height:0;">&nbsp;</td>`
    : ''

  const textCell = `<td valign="middle" style="padding:18px 24px;">
      ${template.showName ? `<div style="font-size:18px;font-weight:bold;letter-spacing:1.5px;color:${text};line-height:1.2;">${nomeUpper}</div>` : ''}
      ${template.showArea && area ? `<div style="font-size:13px;color:${subtle};font-weight:600;margin-top:3px;">${area}</div>` : ''}
      <table cellpadding="0" cellspacing="0" border="0" style="margin-top:10px;border-collapse:collapse;">
        ${linhaIcone('&#9742;', telefones, template.showPhone)}
        ${linhaIcone('&#9873;', endereco, template.showAddress)}
        ${linhaIcone('&#127760;', site, template.showSite)}
        ${linhaIcone('&#128247;', ig ?? '', template.showInstagram)}
      </table>
    </td>`

  const logoCell = template.showLogo && logoUrl
    ? `<td valign="middle" style="padding:18px;text-align:center;width:160px;">
        <img src="${logoUrl}" alt="${d.empresa?.razaoSocial ?? ''}" style="max-width:140px;max-height:90px;display:inline-block;border:0;"/>
      </td>`
    : ''

  // Ordem fixa: foto à esquerda, texto no meio, logo à direita.
  const cells = `${fotoCell}${textCell}${logoCell}`

  // Background: cor sólida + opcional background-image. Cor fica como fallback
  // pra Outlook desktop (que strip-pa background-image sem VML).
  const bgImage = absoluteUrl(template.backgroundImageUrl, assetBase)
  const bgStyle = bgImage
    ? `background-color:${bg};background-image:url('${bgImage}');background-size:100% 100%;background-position:center;background-repeat:no-repeat;`
    : `background:${bg};`

  // Dimensão fixa do template: 700x180px (proporção do modelo).
  // width/height no atributo pra Outlook; style pra outros clientes.
  return `<table cellpadding="0" cellspacing="0" border="0" width="700" height="180" style="font-family:${fontFamily};${bgStyle}border-radius:14px;color:${text};width:700px;height:180px;border-collapse:separate;overflow:hidden;">
  <tr style="height:180px;">${cells}</tr>
</table>`
}

/** Lista de placeholders disponíveis pro tooltip/docs do editor. */
export const SIGNATURE_PLACEHOLDERS = [
  { key: 'user.name', label: 'Nome do usuário' },
  { key: 'user.nameUpper', label: 'Nome em MAIÚSCULAS' },
  { key: 'user.email', label: 'E-mail' },
  { key: 'user.area', label: 'Área (fallback pro cargo)' },
  { key: 'user.cargo', label: 'Cargo' },
  { key: 'user.telefone', label: 'Telefone do usuário' },
  { key: 'user.celular', label: 'Celular' },
  { key: 'user.whatsapp', label: 'WhatsApp' },
  { key: 'user.instagramHandle', label: 'Instagram @handle' },
  { key: 'user.signatureImageUrl', label: 'Foto da assinatura (URL absoluta)' },
  { key: 'empresa.razaoSocial', label: 'Razão social' },
  { key: 'empresa.nomeFantasia', label: 'Nome fantasia (fallback razão)' },
  { key: 'empresa.telefone', label: 'Telefone fixo da empresa' },
  { key: 'empresa.site', label: 'Site (sem protocolo)' },
  { key: 'empresa.endereco', label: 'Endereço formatado (Rua, Nº, Cidade-UF)' },
  { key: 'empresa.logoUrl', label: 'Logo da empresa (com override do template)' },
  { key: 'template.backgroundColor', label: 'Cor de fundo do template' },
  { key: 'template.backgroundImageUrl', label: 'URL da imagem de fundo (vazio se só cor)' },
  { key: 'template.accentColor', label: 'Cor accent (verde, ícones)' },
  { key: 'template.textColor', label: 'Cor do texto principal' },
  { key: 'template.fontFamily', label: 'Família de fonte' },
] as const
