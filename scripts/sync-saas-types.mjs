// Sincroniza os tipos compartilhados do sistema (D:\oc) pro app standalone.
//
// O app usa `@saas/types` (runtime: HELPDESK_STATUS_FINAIS etc.) e, só no
// typecheck, `@saas/api` (AppRouter — resolvido via tsconfig paths apontando pro
// D:\oc, então não precisa copiar). Rode este script quando o backend mudar os
// contratos de @saas/types:  node scripts/sync-saas-types.mjs
import { cp, rm, access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const ocTypesSrc = resolve(appRoot, '..', 'oc', 'packages', 'types', 'src')
const vendorSrc = resolve(appRoot, 'vendor', 'saas-types', 'src')

try {
  await access(ocTypesSrc)
} catch {
  console.error(`[sync-saas-types] não encontrei ${ocTypesSrc}.`)
  console.error('Confirme que o D:\\oc está ao lado do D:\\app.')
  process.exit(1)
}

await rm(vendorSrc, { recursive: true, force: true })
await cp(ocTypesSrc, vendorSrc, { recursive: true })
console.log(`[sync-saas-types] @saas/types sincronizado de ${ocTypesSrc}`)
