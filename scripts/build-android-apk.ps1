# Build LOCAL do APK do app mobile (sem EAS/nuvem).
#
# Pre-requisitos (uma vez):
#   - JDK 17+ (temos 21), Android SDK/NDK em %LOCALAPPDATA%\Android\Sdk
#   - keystore em apps/mobile/credentials/oneclick-release.jks + credentials.json
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/build-android-apk.ps1 -Build 1
#
# Saida: scripts/mobile-dist/OneClick-ERP-<version>-<build>.apk (assinado com a
# keystore local; mesma do EAS via credentials.json, garantindo update por cima).
param([int]$Build = 1)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$mobile = Join-Path $repo 'apps\mobile'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

# RN/AGP usam toolchain Java 17. Se houver JDK 17 instalado, usa ele (evita o
# foojay tentar baixar um JDK e quebrar no Gradle 9.x). Senao, segue com o JAVA_HOME atual.
$jdk17 = "$env:LOCALAPPDATA\Programs\jdk17"
if (Test-Path "$jdk17\bin\java.exe") {
  $env:JAVA_HOME = $jdk17
  Write-Host "==> JAVA_HOME = $jdk17 (JDK 17)"
}

# Versao vem do app.json (fonte unica).
$appJson = Get-Content (Join-Path $mobile 'app.json') -Raw | ConvertFrom-Json
$version = $appJson.expo.version
Write-Host "==> Build local OneClick ERP v$version (build $Build)"

# Credenciais de assinatura.
$creds = Get-Content (Join-Path $mobile 'credentials.json') -Raw | ConvertFrom-Json
$ks = (Resolve-Path (Join-Path $mobile $creds.android.keystore.keystorePath)).Path
$storePw = $creds.android.keystore.keystorePassword
$alias = $creds.android.keystore.keyAlias
$keyPw = $creds.android.keystore.keyPassword

# Prebuild (gera android/). Pula se ja existe.
if (Test-Path (Join-Path $mobile 'android\app\build.gradle')) {
  Write-Host "==> android/ ja existe -- pulando prebuild"
} else {
  Write-Host "==> expo prebuild (android)"
  Push-Location $mobile
  & npx.cmd --yes expo prebuild -p android --no-install
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "prebuild falhou" }
}

# Gradle assembleRelease com assinatura injetada (sem editar build.gradle).
$gargs = @(
  'assembleRelease',
  "-Pandroid.injected.signing.store.file=$ks",
  "-Pandroid.injected.signing.store.password=$storePw",
  "-Pandroid.injected.signing.key.alias=$alias",
  "-Pandroid.injected.signing.key.password=$keyPw",
  '-Dorg.gradle.java.installations.auto-download=false',
  '--no-daemon'
)
Write-Host "==> gradlew assembleRelease (assinando com a keystore local)"
Push-Location (Join-Path $mobile 'android')
& .\gradlew.bat @gargs
$gcode = $LASTEXITCODE
Pop-Location
if ($gcode -ne 0) { throw "gradle assembleRelease falhou (exit $gcode)" }

$apk = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK nao encontrado em $apk" }

$distDir = Join-Path $repo 'scripts\mobile-dist'
New-Item -ItemType Directory -Force $distDir | Out-Null
$dest = Join-Path $distDir "OneClick-ERP-$version-$Build.apk"
Copy-Item $apk $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 1)
Write-Host ("==> OK: " + $dest + " (" + $mb + " MB)")
