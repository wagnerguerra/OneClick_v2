/**
 * `fetch` com guarda de SSRF, para quando a URL vem de fora — do site do
 * cliente, de um resultado de busca, de um campo que alguém digitou.
 *
 * Sem esta guarda, uma URL escolhida por terceiro faria o SERVIDOR bater em
 * `http://169.254.169.254/` (metadados da nuvem) ou em qualquer serviço da rede
 * interna, com a credencial da própria máquina. O bloqueio é por ENDEREÇO
 * resolvido, e não por texto: `interno.exemplo.com` apontando para 10.0.0.5
 * cairia numa checagem só de hostname.
 *
 * Nasceu privado no serviço de logomarca; virou compartilhado quando o dossiê
 * passou a ler o site do cliente para achar as redes sociais dele. Uma cópia da
 * regra em dois lugares é uma cópia que se corrige em um só.
 */

import { lookup as dnsLookup } from 'dns/promises'
import { isIP } from 'net'

const TEMPO_LIMITE_MS = 10_000

export function ipEhPublico(ip: string): boolean {
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase()
    // ::1 (loopback), fc00::/7 (privado), fe80::/10 (link-local)
    return !(v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8')
      || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb'))
  }
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return false
  const [a, b] = p as [number, number, number, number]
  if (a === 10 || a === 127 || a === 0) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 169 && b === 254) return false // link-local / metadata da nuvem
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  return true
}

export async function hostEhPublico(hostname: string): Promise<boolean> {
  try {
    const enderecos = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await dnsLookup(hostname, { all: true })
    if (enderecos.length === 0) return false
    // `every`, e não `some`: um nome que resolve para um endereço público E um
    // interno é justamente o ataque de rebind.
    return enderecos.every(e => ipEhPublico(e.address))
  } catch { return false }
}

/** Devolve `null` — nunca lança — quando a URL é barrada ou a busca falha. */
export async function buscarComGuarda(url: string, init?: RequestInit): Promise<Response | null> {
  let alvo: URL
  try { alvo = new URL(url) } catch { return null }
  if (alvo.protocol !== 'https:') return null
  if (!(await hostEhPublico(alvo.hostname))) return null
  try {
    return await fetch(alvo.toString(), { ...init, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) })
  } catch { return null }
}
