# Build LOCAL do APK do app Android paralelo.
#
# Pre-requisitos:
#   - JDK 17+.
#   - Android SDK em %LOCALAPPDATA%\Android\Sdk.
#   - Keystore em apps/android-parallel/credentials/oneclick-release.jks.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/build-android-parallel-apk.ps1 -Build 1
param([int]$Build = 1)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot\..").Path
$mobile = Join-Path $repo 'apps\android-parallel'
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

$jdk17 = "$env:LOCALAPPDATA\Programs\jdk17"
if (Test-Path "$jdk17\bin\java.exe") {
  $env:JAVA_HOME = $jdk17
  Write-Host "==> JAVA_HOME = $jdk17 (JDK 17)"
}

$appJson = Get-Content (Join-Path $mobile 'app.json') -Raw | ConvertFrom-Json
$version = $appJson.expo.version
Write-Host "==> Build local OneClick Android Paralelo v$version (build $Build)"

$creds = Get-Content (Join-Path $mobile 'credentials.json') -Raw | ConvertFrom-Json
$ks = (Resolve-Path (Join-Path $mobile $creds.android.keystore.keystorePath)).Path
$storePw = $creds.android.keystore.keystorePassword
$alias = $creds.android.keystore.keyAlias
$keyPw = $creds.android.keystore.keyPassword

Push-Location $mobile
Write-Host "==> expo prebuild (android, clean)"
& npx.cmd --yes expo prebuild -p android --clean --no-install
$prebuildCode = $LASTEXITCODE
Pop-Location
if ($prebuildCode -ne 0) { throw "prebuild falhou (exit $prebuildCode)" }

$gradleProps = Join-Path $mobile 'android\gradle.properties'
$propsText = Get-Content $gradleProps -Raw
$propsText = $propsText -replace 'newArchEnabled=true', 'newArchEnabled=false'
Set-Content -Path $gradleProps -Value $propsText -NoNewline
Write-Host "==> newArchEnabled=false"

Get-ChildItem -Path (Join-Path $repo '.pnpm-store') -Recurse -Directory -Filter '.cxx' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match 'react-native-(screens|worklets|reanimated)' } |
  ForEach-Object {
    Write-Host "==> limpando cache CMake: $($_.FullName)"
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

$gargs = @(
  'assembleRelease',
  "-Pandroid.injected.signing.store.file=$ks",
  "-Pandroid.injected.signing.store.password=$storePw",
  "-Pandroid.injected.signing.key.alias=$alias",
  "-Pandroid.injected.signing.key.password=$keyPw",
  '-Dorg.gradle.java.installations.auto-download=false',
  '--no-daemon'
)

Write-Host "==> gradlew assembleRelease"
Push-Location (Join-Path $mobile 'android')
& .\gradlew.bat @gargs
$gradleCode = $LASTEXITCODE
Pop-Location
if ($gradleCode -ne 0) { throw "gradle assembleRelease falhou (exit $gradleCode)" }

$apk = Join-Path $mobile 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "APK nao encontrado em $apk" }

$distDir = Join-Path $repo 'scripts\mobile-dist'
New-Item -ItemType Directory -Force $distDir | Out-Null
$dest = Join-Path $distDir "OneClick-Android-Paralelo-$version-$Build.apk"
Copy-Item $apk $dest -Force
$mb = [math]::Round((Get-Item $dest).Length / 1MB, 1)
Write-Host ("==> OK: " + $dest + " (" + $mb + " MB)")
