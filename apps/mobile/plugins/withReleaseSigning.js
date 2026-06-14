// Config plugin — torna o signing de RELEASE permanente (sobrevive ao `expo prebuild`).
//
// O diretório android/ é CNG (regenerado/gitignored), então qualquer edição manual
// no build.gradle some no próximo prebuild. Este plugin reinjeta, a cada prebuild:
//   1. um signingConfig `release` lendo as credenciais de apps/mobile/credentials.json
//      (gitignored — a senha NÃO vai pro código versionado);
//   2. aponta o buildType release p/ esse signingConfig (em vez da debug key);
//   3. um abiFilters CONDICIONAL: só restringe ABIs quando o build passa
//      `-PdistAbi=arm64-v8a` (ou lista). Sem a flag, o build inclui todas as ABIs
//      (dev/emulador seguem funcionando). Isso evita o APK que "instala e crasha"
//      em device não-arm64 quando se publica um build single-arch.
//
// Build de DISTRIBUIÇÃO (arm64 limpo):
//   gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a -PdistAbi=arm64-v8a
//
// Se credentials.json não existir, o release cai na debug key (warn) — assim um
// clone sem a keystore ainda consegue prebuild/dev.

const { withAppBuildGradle } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

function readKeystore(projectRoot) {
  const p = path.join(projectRoot, 'credentials.json')
  if (!fs.existsSync(p)) return null
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'))
    const ks = json && json.android && json.android.keystore
    if (!ks || !ks.keystorePath) return null
    // O keystorePath em credentials.json é relativo à raiz do app (apps/mobile);
    // no build.gradle (android/app) precisamos subir dois níveis.
    const storeFile = ('../../' + ks.keystorePath).replace(/\\/g, '/')
    return { storeFile, storePassword: ks.keystorePassword, keyAlias: ks.keyAlias, keyPassword: ks.keyPassword }
  } catch (e) {
    return null
  }
}

const withReleaseSigning = (config) =>
  withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg
    let src = cfg.modResults.contents
    if (src.includes('signingConfigs.release')) return cfg // idempotente

    const ks = readKeystore(cfg.modRequest.projectRoot)
    if (!ks) {
      console.warn('[withReleaseSigning] credentials.json ausente — release usará a debug key.')
      return cfg
    }

    // 1. injeta o signingConfig release dentro de signingConfigs { ... }
    const releaseSigning =
      `        release {\n` +
      `            storeFile file('${ks.storeFile}')\n` +
      `            storePassword '${ks.storePassword}'\n` +
      `            keyAlias '${ks.keyAlias}'\n` +
      `            keyPassword '${ks.keyPassword}'\n` +
      `        }\n`
    src = src.replace(/(signingConfigs\s*\{\s*\n)/, `$1${releaseSigning}`)

    // 2. release buildType usa a release key (em vez da debug)
    src = src.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      '$1signingConfig signingConfigs.release',
    )

    // 3. abiFilters condicional (só com -PdistAbi=...)
    const abiBlock =
      `\n        if (project.hasProperty('distAbi')) {\n` +
      `            ndk { abiFilters(*project.property('distAbi').split(',')) }\n` +
      `        }`
    src = src.replace(
      /(defaultConfig\s*\{[\s\S]*?applicationId[^\n]*\n)/,
      `$1${abiBlock}\n`,
    )

    cfg.modResults.contents = src
    return cfg
  })

module.exports = withReleaseSigning
