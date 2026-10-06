// Barra o build do Service Manager se main.js, preload ou algum <script>
// embutido no index.html tiver erro de sintaxe. Em 05/10/2026 uma string com
// quebra de linha real deixou a tela de deploy presa em "Carregando status...".
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')

const checar = (arquivo, rotulo) => {
  const r = spawnSync(process.execPath, ['--check', arquivo], { encoding: 'utf8' })
  if (r.status !== 0) { console.error(`✗ Erro de sintaxe em ${rotulo}:\n${r.stderr}`); process.exit(1) }
}

for (const f of fs.readdirSync(__dirname).filter(f => /^(main|preload.*)\.js$/.test(f))) checar(path.join(__dirname, f), f)

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
const blocos = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
blocos.forEach((codigo, i) => {
  const tmp = path.join(os.tmpdir(), `sm-index-bloco-${i}.js`)
  fs.writeFileSync(tmp, codigo)
  checar(tmp, `index.html (<script> nº ${i + 1})`)
})
console.log(`✓ Sintaxe ok (main/preload + ${blocos.length} scripts do index.html)`)
