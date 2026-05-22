/**
 * Copia um texto para a área de transferência com fallback robusto.
 *
 * `navigator.clipboard.writeText` exige contexto seguro (HTTPS ou localhost).
 * Quando o sistema é acessado por IP da rede em HTTP (ex: http://192.168.0.58:3000),
 * o browser bloqueia. Esse helper tenta primeiro a API moderna e, se falhar,
 * cai para `document.execCommand('copy')` (deprecated mas ainda funciona em HTTP).
 *
 * @returns true se conseguiu copiar, false se falhou em ambos os caminhos
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Tentativa 1: Clipboard API moderna (HTTPS / localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* tenta fallback */ }
  }

  // Tentativa 2: textarea temporário + execCommand (HTTP / IPs locais)
  if (typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      ta.setAttribute('readonly', '')
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, text.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { /* sem fallback */ }
  }

  return false
}
