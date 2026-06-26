// Gera o APK de release assinado e o coloca em scripts/mobile-dist/ com o nome
// que o backend (/api/mobile-app) entende: OneClick-ERP-{version}-{versionCode}.apk.
//
// Esse é o fluxo da "Frente 1": gerar APKs de teste a cada iteração até a versão
// estabilizar. O arquivo final entra na pasta mobile-dist (gitignored) e, depois,
// vai pra VPS via scp pra aparecer em /downloads.
//
// Uso:
//   node scripts/build-apk.mjs               # arm64 (padrão, ~35 MB)
//   node scripts/build-apk.mjs --universal   # todas as ABIs (~85 MB, p/ x86/emulador)
//   node scripts/build-apk.mjs --prebuild    # roda `expo prebuild --clean` antes
//   node scripts/build-apk.mjs --publish      # scp pra VPS se MOBILE_VPS_TARGET setado
//
// Versão e versionCode são lidos do app.json. Bump lá antes de gerar uma release.
// EXPO_PUBLIC_API_URL default = produção (o bundle JS aponta pra API certa).
// MOBILE_VPS_TARGET (opcional) = destino do scp, ex.: "user@host:/repo-src/scripts/mobile-dist/".

import { readFileSync, copyFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = path.join(root, 'android')
const isWin = process.platform === 'win32'
const args = new Set(process.argv.slice(2))

function run(cmd, cmdArgs, extraEnv = {}) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: androidDir,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: isWin, // necessário p/ executar .bat no Windows
  })
  if (res.status !== 0) {
    console.error(`\n✖ Comando falhou (${cmd} ${cmdArgs.join(' ')}) — código ${res.status}`)
    process.exit(res.status ?? 1)
  }
}

// 1. Versão a partir do app.json (fonte única).
const appJson = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8'))
const version = appJson?.expo?.version
const versionCode = appJson?.expo?.android?.versionCode
if (!version || !versionCode) {
  console.error('✖ Não achei expo.version / expo.android.versionCode no app.json.')
  process.exit(1)
}
const apkName = `OneClick-ERP-${version}-${versionCode}.apk`
console.log(`\n▶ Gerando ${apkName} (${args.has('--universal') ? 'universal' : 'arm64-v8a'})...\n`)

// 2. (Opcional) Regenera o nativo — necessário após mudar deps/config/SDK.
if (args.has('--prebuild')) {
  console.log('▶ expo prebuild --clean -p android...')
  spawnSync(isWin ? 'npx.cmd' : 'npx', ['expo', 'prebuild', '--clean', '-p', 'android'], {
    cwd: root, stdio: 'inherit', shell: isWin,
  })
}

// 3. Build do APK assinado (release). arm64 por padrão; --universal inclui todas as ABIs.
const env = {
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'https://app.oneclick.central-rnc.com.br',
}
const gradleArgs = [':app:assembleRelease', '--console=plain']
if (!args.has('--universal')) {
  gradleArgs.push('-PreactNativeArchitectures=arm64-v8a', '-PdistAbi=arm64-v8a')
}
run(isWin ? 'gradlew.bat' : './gradlew', gradleArgs, env)

// 4. Copia o artefato pra mobile-dist com o nome versionado.
const built = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')
if (!existsSync(built)) {
  console.error(`✖ APK não encontrado em ${built}`)
  process.exit(1)
}
const dest = path.join(root, 'scripts', 'mobile-dist', apkName)
copyFileSync(built, dest)
const sizeMb = Math.round((statSync(dest).size / (1024 * 1024)) * 10) / 10
console.log(`\n✔ APK pronto: scripts/mobile-dist/${apkName} (${sizeMb} MB)`)

// 5. Publicação (opcional) — scp pra VPS se MOBILE_VPS_TARGET estiver setado.
const target = process.env.MOBILE_VPS_TARGET
if (args.has('--publish')) {
  if (!target) {
    console.error('✖ --publish exige a env MOBILE_VPS_TARGET (ex.: user@host:/repo-src/scripts/mobile-dist/).')
    process.exit(1)
  }
  console.log(`\n▶ Publicando na VPS: ${target}`)
  const scp = spawnSync('scp', [dest, target], { stdio: 'inherit', shell: isWin })
  if (scp.status !== 0) process.exit(scp.status ?? 1)
  console.log('✔ Publicado — já aparece em /downloads.')
} else {
  console.log('\nPara publicar em /downloads, envie pra VPS:')
  console.log(`  scp "${dest}" ${target ?? '<usuario>@<host-vps>:/repo-src/scripts/mobile-dist/'}`)
}
