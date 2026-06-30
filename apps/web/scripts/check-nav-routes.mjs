// Guard de regressão para F-006: garante que todo href ESTÁTICO do menu lateral
// (lib/navigation.ts) resolve para uma rota existente em app/(dashboard).
// Ignora itens marcados `wip: true` (features não publicadas, escondidas do menu).
//
// Sem dependências — roda com `node scripts/check-nav-routes.mjs` (e via
// `pnpm --filter @saas/web check:routes`). Sai com código !=0 se houver href órfão,
// servindo de gate em CI contra desalinhamento config-de-menu × rotas.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const webRoot = join(here, '..')
const navFile = join(webRoot, 'src', 'lib', 'navigation.ts')
const dashboardDir = join(webRoot, 'src', 'app', '(dashboard)')

const src = readFileSync(navFile, 'utf8')

// Cada item/subitem do menu fica em UMA linha, com seu próprio href e flag wip.
const broken = []
const checked = []
for (const rawLine of src.split('\n')) {
  const m = rawLine.match(/href:\s*'([^']+)'/)
  if (!m) continue
  const href = m[1]
  if (rawLine.includes('wip: true')) continue          // feature não publicada
  if (/^https?:\/\//.test(href)) continue              // link externo
  if (!href.startsWith('/')) continue                  // âncoras/relativos
  if (href.includes('[')) continue                     // rota dinâmica

  // Normaliza: remove querystring/hash e a barra inicial.
  const path = href.split('?')[0].split('#')[0].replace(/^\//, '')
  if (path === '' || path === 'dashboard') continue    // raiz / dashboard

  const pageFile = join(dashboardDir, ...path.split('/'), 'page.tsx')
  checked.push(href)
  if (!existsSync(pageFile)) broken.push({ href, expected: `app/(dashboard)/${path}/page.tsx` })
}

if (broken.length > 0) {
  console.error(`\n❌ ${broken.length} href(s) do menu sem rota correspondente:\n`)
  for (const b of broken) console.error(`   ${b.href}  →  faltando ${b.expected}`)
  console.error('\nCorrija o href, implemente a rota, ou marque o item com `wip: true` em lib/navigation.ts.\n')
  process.exit(1)
}

console.log(`✅ Menu OK — ${checked.length} href(s) estático(s) resolvem para rotas existentes.`)
