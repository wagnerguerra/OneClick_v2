// Depois de cada build: mantém só os 2 instaladores mais recentes em dist/.
// Cada versão do SM gera um .exe de ~80 MB; em 06/10/2026 eram 85 versões
// acumuladas (6,9 GB) e o disco D: lotou. Os .blockmap (minúsculos) ficam
// todos — o auto-update usa o da versão instalada para baixar só a diferença.
const fs = require('fs')
const path = require('path')
const dist = path.join(__dirname, 'dist')
if (!fs.existsSync(dist)) process.exit(0)
const versao = (n) => (n.match(/(\d+)\.(\d+)\.(\d+)\.exe$/) || []).slice(1).map(Number)
const cmp = (a, b) => { const x = versao(a), y = versao(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0 }
const exes = fs.readdirSync(dist).filter(n => /^OneClick-ERP-Setup-\d+\.\d+\.\d+\.exe$/.test(n)).sort(cmp)
const apagar = exes.slice(2)
for (const n of apagar) fs.rmSync(path.join(dist, n), { force: true })
console.log(`✓ dist/: mantidos ${exes.slice(0, 2).join(', ') || 'nenhum'}${apagar.length ? ` — ${apagar.length} instalador(es) antigo(s) removido(s)` : ''}`)
