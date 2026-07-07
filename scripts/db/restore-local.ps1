# ============================================================
# Restaura um dump da PRODUÇÃO no banco LOCAL de dev — NUNCA toca a produção.
#
# Aceita:
#   - database.sql (plain SQL — formato do Backup e Restore do sistema) -> psql -f
#   - *.dump       (formato custom do pg_dump -Fc)                        -> pg_restore
#
# TRAVA DE SEGURANÇA: só executa se o host for 127.0.0.1/localhost. Impossível
# restaurar sobre produção por engano.
#
# Uso:
#   scripts\db\restore-local.ps1 -DumpFile C:\dumps\database.sql
# ============================================================
param(
  [Parameter(Mandatory = $true)][string]$DumpFile,
  [string]$PgBin = ""
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $DumpFile)) { throw "Arquivo não encontrado: $DumpFile" }

# ── Localiza as ferramentas do Postgres (PATH ou Program Files) ──
function Find-PgTool([string]$name) {
  $inPath = (Get-Command $name -ErrorAction SilentlyContinue)
  if ($inPath) { return $inPath.Source }
  if ($PgBin -and (Test-Path (Join-Path $PgBin "$name.exe"))) { return (Join-Path $PgBin "$name.exe") }
  foreach ($v in 17, 16, 15, 14) {
    $p = "C:\Program Files\PostgreSQL\$v\bin\$name.exe"
    if (Test-Path $p) { return $p }
  }
  throw "$name não encontrado. Passe -PgBin 'C:\Program Files\PostgreSQL\<versão>\bin'."
}
$psql = Find-PgTool "psql"

# ── Lê a conexão LOCAL do .env do projeto ──
$envFile = Join-Path $PSScriptRoot "..\..\apps\api\.env"
if (-not (Test-Path $envFile)) { throw ".env não encontrado em $envFile" }
$dbUrl = ((Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', '' -replace '"', '').Trim()
if ($dbUrl -notmatch 'postgres(ql)?://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') { throw "DATABASE_URL inválida no .env" }
$user = $Matches[2]; $pass = $Matches[3]; $dbhost = $Matches[4]; $port = $Matches[5]; $db = $Matches[6]

# ── TRAVA: só localhost ──
if ($dbhost -ne '127.0.0.1' -and $dbhost -ne 'localhost') {
  throw "ABORTADO: host '$dbhost' não é local. Este script só restaura no banco LOCAL de dev."
}

$env:PGPASSWORD = $pass
try {
  Write-Host "Alvo LOCAL: $user@$dbhost`:$port/$db" -ForegroundColor Cyan
  Write-Host "Derrubando conexões e recriando o banco LOCAL..." -ForegroundColor Yellow
  & $psql -U $user -h $dbhost -p $port -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid <> pg_backend_pid();" | Out-Null
  & $psql -U $user -h $dbhost -p $port -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS ""$db"";"
  & $psql -U $user -h $dbhost -p $port -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE ""$db"";"

  if ($DumpFile.ToLower().EndsWith(".dump")) {
    $pgrestore = Find-PgTool "pg_restore"
    Write-Host "Restaurando (custom format) no LOCAL..." -ForegroundColor Yellow
    & $pgrestore -U $user -h $dbhost -p $port -d $db --no-owner --no-privileges $DumpFile
  }
  else {
    Write-Host "Restaurando (plain SQL) no LOCAL..." -ForegroundColor Yellow
    & $psql -U $user -h $dbhost -p $port -d $db -f $DumpFile
  }
  Write-Host "OK — banco LOCAL sincronizado com o dump de produção." -ForegroundColor Green
}
finally {
  $env:PGPASSWORD = $null
}
