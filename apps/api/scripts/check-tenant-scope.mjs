// Guard estático de isolamento multi-tenant (ISO-001).
//
// Varre apps/api/src e sinaliza queries `prisma.<model>.<metodo>(...)` em models
// TENANT-SCOPED (os que têm campo `empresaId` no schema) cujo `where` não tem
// NENHUMA chave de escopo (empresaId/tenantId/clienteId/userId/...). Esse é o
// padrão exato do ISO-001 (listClientesMensal sem `where empresaId`).
//
// - Só inspeciona o cliente GLOBAL `prisma.` — queries via `tx.` (withTenant,
//   schema-per-tenant) já são isoladas pelo search_path e são ignoradas.
// - Métodos de risco: findMany/count/aggregate/groupBy/updateMany/deleteMany.
// - Exceção legítima (query de sistema/cron/master): comente com
//   `// tenant-scope-exempt: <razão>` na linha do call ou na linha anterior.
//
// Sem dependências. Roda com `node scripts/check-tenant-scope.mjs` (e via
// `pnpm --filter @saas/api check:tenant-scope`). Sai !=0 se houver violação.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const apiRoot = join(here, '..')
const repoRoot = join(apiRoot, '..', '..')
const srcRoot = join(apiRoot, 'src')
const schemaPath = join(repoRoot, 'packages', 'db', 'prisma', 'schema.prisma')

// 1) Models tenant-scoped = têm `empresaId` no schema. Accessor = nome com
//    primeira letra minúscula (convenção do Prisma Client).
const schema = readFileSync(schemaPath, 'utf8')
const tenantAccessors = new Set()
for (const m of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
  const name = m[1]
  if (/^\s*empresaId\s+/m.test(m[2])) tenantAccessors.add(name[0].toLowerCase() + name.slice(1))
}

// 2) Métodos que retornam/afetam MÚLTIPLAS linhas (vazam se sem filtro).
const METHODS = ['findMany', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']

// 3) Chaves de escopo aceitas (empresa/tenant/owner/parent tenant-scoped).
const SCOPE_KEY = /\b(empresaId|tenantId|clienteId|colaboradorId|socioId|fornecedorId|userId|criadorId|usuarioId|responsavelId)\b/
const EXEMPT = /tenant-scope-exempt|tenant-exempt/

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) { if (e !== 'node_modules' && e !== 'generated') out.push(...walk(p)) }
    else if (e.endsWith('.ts')) out.push(p)
  }
  return out
}

// Captura o bloco {...} balanceado a partir de um índice de '{'.
function braceBlock(text, braceStart) {
  let depth = 0
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(braceStart, i + 1)
  }
  return text.slice(braceStart)
}

// Verdadeiro se o `where` do call está escopado — inline OU resolvendo a const
// `where`/`where: ident` (padrão comum: `const where = {...}; findMany({ where })`).
function isScoped(text, callText) {
  if (SCOPE_KEY.test(callText)) return true
  let varName = null
  const idMatch = callText.match(/where\s*:\s*([A-Za-z_]\w*)/)  // where: someVar
  if (idMatch) varName = idMatch[1]
  else if (/\{\s*where\b|,\s*where\b/.test(callText)) varName = 'where'  // shorthand { where }
  if (!varName) return false
  const defRe = new RegExp(`(?:const|let|var)\\s+${varName}\\b[^={]*[:=]\\s*\\{`, 'g')
  for (const d of text.matchAll(defRe)) {
    const braceStart = text.indexOf('{', d.index + d[0].length - 1)
    if (braceStart >= 0 && SCOPE_KEY.test(braceBlock(text, braceStart))) return true
  }
  return false
}

const callRe = new RegExp(`\\bprisma\\.(${[...tenantAccessors].join('|')})\\.(${METHODS.join('|')})\\s*\\(`, 'g')
const violations = []

for (const file of walk(srcRoot)) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  let m
  while ((m = callRe.exec(text)) !== null) {
    const [, accessor, method] = m
    const open = m.index + m[0].length - 1
    // captura parênteses balanceados do call
    let depth = 0, end = -1
    for (let i = open; i < text.length; i++) {
      if (text[i] === '(') depth++
      else if (text[i] === ')' && --depth === 0) { end = i; break }
    }
    const callText = text.slice(open, end + 1)
    const lineNo = text.slice(0, m.index).split('\n').length
    const ctx = `${lines[lineNo - 2] ?? ''}\n${lines[lineNo - 1] ?? ''}\n${callText}`
    if (EXEMPT.test(ctx)) continue
    if (isScoped(text, callText)) continue
    violations.push({
      file: file.slice(repoRoot.length + 1).replace(/\\/g, '/'),
      line: lineNo, accessor, method,
    })
  }
}

// ── Baseline ratchet ────────────────────────────────────────
// Código legado tem N violações conhecidas (escopo via relação, queries de
// sistema, ou dívida a auditar). O guard registra esse baseline e FALHA apenas
// em violação NOVA — verde agora, pega reincidência (ex.: um novo
// listClientesMensal sem `where empresaId`). Burn-down do baseline ao longo do
// tempo. Regenerar: `node scripts/check-tenant-scope.mjs --update`.
const baselinePath = join(here, 'tenant-scope-baseline.txt')
const sig = (v) => `${v.file}::prisma.${v.accessor}.${v.method}`

if (process.argv.includes('--update')) {
  const { writeFileSync } = await import('node:fs')
  const lines = violations.map(sig).sort()
  writeFileSync(baselinePath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
  console.log(`📌 Baseline atualizado: ${lines.length} violações conhecidas em ${baselinePath.slice(repoRoot.length + 1)}`)
  process.exit(0)
}

// Multiset do baseline.
let baseline = []
try { baseline = readFileSync(baselinePath, 'utf8').split('\n').filter(Boolean) } catch { /* sem baseline = tudo é novo */ }
const baseCount = new Map()
for (const s of baseline) baseCount.set(s, (baseCount.get(s) ?? 0) + 1)

const used = new Map()
const novos = []
for (const v of violations) {
  const s = sig(v)
  const u = used.get(s) ?? 0
  if (u < (baseCount.get(s) ?? 0)) used.set(s, u + 1)  // coberto pelo baseline
  else novos.push(v)                                    // NOVO
}

if (novos.length) {
  console.error(`\n❌ ${novos.length} query(ies) multi-tenant NOVA(s) sem chave de escopo (não estão no baseline):\n`)
  for (const v of novos) {
    console.error(`   ${v.file}:${v.line}  prisma.${v.accessor}.${v.method}() — where sem empresaId/tenant/owner`)
  }
  console.error('\nAdicione o filtro de empresa ao where, OU `// tenant-scope-exempt: <razão>` se for')
  console.error('query de sistema/master legítima. (Se for dívida pré-existente: `node scripts/check-tenant-scope.mjs --update`.)\n')
  process.exit(1)
}

console.log(`✅ Tenant-scope OK — ${violations.length} violações conhecidas (baseline), 0 novas. ${tenantAccessors.size} models tenant-scoped monitorados.`)
