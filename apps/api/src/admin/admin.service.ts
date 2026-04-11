import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawnSync } from 'child_process'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver')

// ============================================================
// Definição dos campos de configuração
// ============================================================

export interface ConfigField {
  key: string
  label: string
  group: string
  type: 'text' | 'number' | 'password' | 'textarea'
  required?: boolean
  placeholder?: string
  help?: string
  secret?: boolean
  default?: string
  subgroup?: string
  colSpan?: number
}

const SECRET_KEYS = new Set([
  'CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA',
  'DB_PASSWORD', 'BETTER_AUTH_SECRET',
  'SCI_PASSWORD',
  'ONECLICK_DB_PASSWORD',
  'OMIE_APP_SECRET_CENTRAL', 'OMIE_APP_SECRET_LL',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'S3_ACCESS_KEY', 'S3_SECRET_KEY',
  'LEADS_API_KEY', 'CRM_EXTERNO_API_KEY',
  'TWILIO_AUTH_TOKEN',
  'CAPTCHA_2CAPTCHA_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'TSA_BASIC_PASS',
])

// Chaves que não devem ser apagadas mesmo se vierem vazias
const PRESERVE_IF_EMPTY = new Set(['SCI_DSN', 'SCI_USER', 'DB_HOST', 'DB_USER', 'DB_NAME'])

const CONFIG_FIELDS: ConfigField[] = [
  // SERPRO
  { key: 'CNPJ_CONTRATANTE', label: 'CNPJ do Contratante', group: 'SERPRO', type: 'text', placeholder: '00000000000000', help: 'CNPJ 14 digitos do contratante SERPRO' },
  { key: 'PUBLIC_BASE_URL', label: 'URL Publica', group: 'SERPRO', type: 'text', placeholder: 'http://192.168.0.108:5176/' },
  { key: 'CONSUMER_KEY', label: 'Consumer Key', group: 'SERPRO', type: 'password', secret: true },
  { key: 'CONSUMER_SECRET', label: 'Consumer Secret', group: 'SERPRO', type: 'password', secret: true },
  { key: 'CERTIFICADO_SENHA', label: 'Senha do Certificado PFX', group: 'SERPRO', type: 'password', secret: true },

  // Banco de Dados — PostgreSQL (subgroup: postgresql)
  { key: 'DATABASE_URL', label: 'URL PostgreSQL', group: 'Banco de Dados', type: 'text', placeholder: 'postgresql://user:pass@localhost:5432/db', subgroup: 'postgresql' },
  { key: 'REDIS_URL', label: 'URL Redis', group: 'Banco de Dados', type: 'text', placeholder: 'redis://localhost:6379', subgroup: 'postgresql' },

  // Banco de Dados — MySQL Legado (subgroup: mysql)
  { key: 'LEGACY_DB_HOST', label: 'Host', group: 'Banco de Dados', type: 'text', placeholder: 'localhost', subgroup: 'mysql' },
  { key: 'LEGACY_DB_PORT', label: 'Porta', group: 'Banco de Dados', type: 'number', placeholder: '3306', subgroup: 'mysql' },
  { key: 'LEGACY_DB_USER', label: 'Usuário', group: 'Banco de Dados', type: 'text', subgroup: 'mysql' },
  { key: 'LEGACY_DB_PASSWORD', label: 'Senha', group: 'Banco de Dados', type: 'password', secret: true, subgroup: 'mysql' },
  { key: 'LEGACY_DB_NAME', label: 'Database', group: 'Banco de Dados', type: 'text', subgroup: 'mysql' },

  // Banco de Dados — ERP SCI Firebird (subgroup: firebird)
  { key: 'SCI_DSN', label: 'DSN Firebird', group: 'Banco de Dados', type: 'text', help: 'Formato: \\\\host\\share\\path\\banco.SDB', subgroup: 'firebird', colSpan: 6 },
  { key: 'SCI_USER', label: 'Usuário', group: 'Banco de Dados', type: 'text', subgroup: 'firebird', colSpan: 3 },
  { key: 'SCI_PASSWORD', label: 'Senha', group: 'Banco de Dados', type: 'password', secret: true, subgroup: 'firebird', colSpan: 3 },
  { key: 'SCI_CHARSET', label: 'Charset', group: 'Banco de Dados', type: 'text', default: 'UTF8', subgroup: 'firebird', colSpan: 2 },
  { key: 'SCI_TIMEOUT_MS', label: 'Timeout (ms)', group: 'Banco de Dados', type: 'number', default: '30000', subgroup: 'firebird', colSpan: 2 },

  // Auth
  { key: 'BETTER_AUTH_SECRET', label: 'JWT Secret', group: 'Autenticacao', type: 'password', secret: true, help: 'Minimo 32 caracteres' },
  { key: 'BETTER_AUTH_URL', label: 'Auth URL', group: 'Autenticacao', type: 'text', placeholder: 'http://localhost:4000' },

  // SMTP
  { key: 'SMTP_HOST', label: 'Host SMTP', group: 'E-mail (SMTP)', type: 'text', placeholder: 'smtp.gmail.com' },
  { key: 'SMTP_PORT', label: 'Porta SMTP', group: 'E-mail (SMTP)', type: 'number', placeholder: '587' },
  { key: 'SMTP_USER', label: 'Usuario SMTP', group: 'E-mail (SMTP)', type: 'text' },
  { key: 'SMTP_PASS', label: 'Senha SMTP', group: 'E-mail (SMTP)', type: 'password', secret: true },

  // Omie
  { key: 'OMIE_APP_KEY_CENTRAL', label: 'App Key (Central)', group: 'Omie ERP', type: 'text' },
  { key: 'OMIE_APP_SECRET_CENTRAL', label: 'App Secret (Central)', group: 'Omie ERP', type: 'password', secret: true },
  { key: 'OMIE_APP_KEY_LL', label: 'App Key (L&L)', group: 'Omie ERP', type: 'text' },
  { key: 'OMIE_APP_SECRET_LL', label: 'App Secret (L&L)', group: 'Omie ERP', type: 'password', secret: true },
  { key: 'OMIE_SYNC_ENABLED', label: 'Sync Habilitado', group: 'Omie ERP', type: 'text', default: '0' },

  // WhatsApp
  { key: 'WHATSAPP_API_TYPE', label: 'Tipo API', group: 'WhatsApp (Twilio)', type: 'text', default: 'twilio' },
  { key: 'TWILIO_ACCOUNT_SID', label: 'Account SID', group: 'WhatsApp (Twilio)', type: 'text' },
  { key: 'TWILIO_AUTH_TOKEN', label: 'Auth Token', group: 'WhatsApp (Twilio)', type: 'password', secret: true },
  { key: 'TWILIO_WHATSAPP_FROM', label: 'Numero WhatsApp', group: 'WhatsApp (Twilio)', type: 'text', placeholder: '+5527999078863' },

  // 2Captcha
  { key: 'CAPTCHA_2CAPTCHA_API_KEY', label: 'API Key', group: '2Captcha', type: 'password', secret: true },

  // OpenAI
  { key: 'OPENAI_API_KEY', label: 'API Key', group: 'OpenAI (ChatGPT)', type: 'password', secret: true },
  { key: 'OPENAI_MODEL', label: 'Modelo', group: 'OpenAI (ChatGPT)', type: 'text', default: 'gpt-4o-mini' },

  // Google
  { key: 'GOOGLE_CLIENT_ID', label: 'Client ID', group: 'Google', type: 'text' },
  { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret', group: 'Google', type: 'password', secret: true },

  // Stripe
  { key: 'STRIPE_SECRET_KEY', label: 'Secret Key', group: 'Stripe', type: 'password', secret: true },
  { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook Secret', group: 'Stripe', type: 'password', secret: true },

  // Storage
  { key: 'S3_BUCKET', label: 'Bucket', group: 'Armazenamento (S3)', type: 'text' },
  { key: 'S3_REGION', label: 'Region', group: 'Armazenamento (S3)', type: 'text' },
  { key: 'S3_ACCESS_KEY', label: 'Access Key', group: 'Armazenamento (S3)', type: 'password', secret: true },
  { key: 'S3_SECRET_KEY', label: 'Secret Key', group: 'Armazenamento (S3)', type: 'password', secret: true },

  // App
  { key: 'NEXT_PUBLIC_APP_URL', label: 'URL Frontend', group: 'Servidor', type: 'text', placeholder: 'http://localhost:3000' },
  { key: 'API_URL', label: 'URL API', group: 'Servidor', type: 'text', placeholder: 'http://localhost:4000' },

  // TSA
  { key: 'TSA_URL', label: 'URL TSA', group: 'Carimbo de Tempo (TSA)', type: 'text' },
  { key: 'TSA_AUTH', label: 'Tipo Auth', group: 'Carimbo de Tempo (TSA)', type: 'text', help: 'none | basic | serpro_oauth' },
  { key: 'TSA_HASH_ALGO', label: 'Algoritmo Hash', group: 'Carimbo de Tempo (TSA)', type: 'text', default: 'SHA-256' },
  { key: 'TSA_TIMEOUT_MS', label: 'Timeout (ms)', group: 'Carimbo de Tempo (TSA)', type: 'number', default: '30000' },
]

@Injectable()
export class AdminService {

  private getEnvPath(): string {
    return path.resolve(process.cwd(), '.env')
  }

  private parseEnvFile(): { lines: string[]; values: Map<string, string> } {
    const envPath = this.getEnvPath()
    const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
    const lines = content.split('\n')
    const values = new Map<string, string>()

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      // Remove aspas
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      values.set(key, val)
    }

    return { lines, values }
  }

  private writeEnvFile(updates: Map<string, string | null>) {
    const envPath = this.getEnvPath()
    const { lines } = this.parseEnvFile()
    const written = new Set<string>()
    const newLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        newLines.push(line)
        continue
      }
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) { newLines.push(line); continue }
      const key = trimmed.slice(0, eqIdx).trim()

      if (updates.has(key)) {
        const newVal = updates.get(key)
        if (newVal === null) {
          // Remover a chave (não incluir na saida)
        } else {
          newLines.push(`${key}=${newVal}`)
        }
        written.add(key)
      } else {
        newLines.push(line)
      }
    }

    // Append novas chaves
    for (const [key, val] of updates) {
      if (!written.has(key) && val !== null) {
        newLines.push(`${key}=${val}`)
      }
    }

    fs.writeFileSync(envPath, newLines.join('\n'))

    // Recarregar process.env
    for (const [key, val] of updates) {
      if (val === null) {
        delete process.env[key]
      } else {
        process.env[key] = val
      }
    }
  }

  // ============================================================
  // CONFIGURAÇÕES
  // ============================================================

  async getCampos() {
    const groups = [...new Set(CONFIG_FIELDS.map(f => f.group))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { groups, fields: CONFIG_FIELDS }
  }

  async getConfigs() {
    const { values } = this.parseEnvFile()
    const result: Array<{ key: string; value: string }> = []

    for (const field of CONFIG_FIELDS) {
      const rawValue = values.get(field.key) || ''
      result.push({
        key: field.key,
        value: (field.secret || SECRET_KEYS.has(field.key)) ? '' : rawValue,
      })
    }

    return result
  }

  async saveConfigs(items: Record<string, string>) {
    const updates = new Map<string, string | null>()
    let saved = 0

    for (const [key, value] of Object.entries(items)) {
      const field = CONFIG_FIELDS.find(f => f.key === key)
      if (!field) continue

      // __CLEAR__ = limpar o valor
      if (value === '__CLEAR__') {
        updates.set(key, '')
        saved++
        continue
      }

      // Segredo vazio = não alterar
      if (field.secret && value === '') continue

      // Chave preservada se vazia
      if (PRESERVE_IF_EMPTY.has(key) && !value) continue

      // Validações
      if (key === 'CNPJ_CONTRATANTE' && value && !/^\d{14}$/.test(value.replace(/\D/g, ''))) {
        throw new Error('CNPJ do contratante deve ter 14 digitos')
      }
      if (field.type === 'number' && value && isNaN(Number(value))) {
        throw new Error(`${field.label} deve ser um numero`)
      }

      updates.set(key, value)
      saved++
    }

    if (updates.size > 0) {
      this.writeEnvFile(updates)
    }

    return { saved }
  }

  // ============================================================
  // MÉTRICAS DE API
  // ============================================================

  async getMetrics(filters: { startDate?: string; endDate?: string; source?: string }) {
    const where: Record<string, unknown> = {}
    if (filters.source) where.source = filters.source
    if (filters.startDate || filters.endDate) {
      where.createdAt = {}
      if (filters.startDate) (where.createdAt as Record<string, unknown>).gte = new Date(filters.startDate)
      if (filters.endDate) (where.createdAt as Record<string, unknown>).lte = new Date(filters.endDate + 'T23:59:59')
    }

    const [logs, sources, pricing] = await Promise.all([
      prisma.apiLog.findMany({ where: where as never, orderBy: { createdAt: 'desc' }, take: 5000 }),
      prisma.apiLog.findMany({ select: { source: true }, distinct: ['source'] }),
      prisma.apiPricing.findMany(),
    ])

    const dailyMap = new Map<string, { date: string; unique: number; total: number; docs: Set<string> }>()
    for (const log of logs) {
      const day = log.createdAt.toISOString().slice(0, 10)
      let entry = dailyMap.get(day)
      if (!entry) { entry = { date: day, unique: 0, total: 0, docs: new Set() }; dailyMap.set(day, entry) }
      entry.total++
      if (log.documento && !entry.docs.has(log.documento)) { entry.docs.add(log.documento); entry.unique++ }
    }

    const priceMap = new Map(pricing.map(p => [p.source, p]))
    const daily = Array.from(dailyMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(d => ({ date: d.date, unique: d.unique, total: d.total }))

    const totalRequests = logs.length
    const uniqueDocs = new Set(logs.filter(l => l.documento).map(l => l.documento)).size
    const totalCost = logs.reduce((sum, l) => {
      const p = priceMap.get(l.source)
      return sum + (p ? p.unitPrice * p.multiplier : 0)
    }, 0)

    return { totalRequests, uniqueDocuments: uniqueDocs, totalCost: Math.round(totalCost * 100) / 100, sources: sources.map(s => s.source), pricing, daily }
  }

  async savePricing(source: string, unitPrice: number, multiplier: number, currency: string) {
    return prisma.apiPricing.upsert({
      where: { source },
      create: { source, unitPrice, multiplier, currency },
      update: { unitPrice, multiplier, currency },
    })
  }

  // ============================================================
  // BACKUP E RESTORE
  // ============================================================

  getBackupDir() {
    // Navegar de apps/api para a raiz do monorepo
    const root = path.resolve(process.cwd(), '..', '..')
    const dir = path.join(root, 'backups')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  getProjectRoot() {
    return path.resolve(process.cwd(), '..', '..')
  }

  /** Executa pg_dump e retorna o conteúdo SQL ou null */
  private runPgDump(): string | null {
    const { values: envValues } = this.parseEnvFile()
    const dbUrl = envValues.get('DATABASE_URL') || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/saas_erp'
    const pgFlags = '--no-owner --no-acl --clean --if-exists --create'

    const dumpCommands = [
      `docker exec saas-postgres pg_dump ${pgFlags} -U postgres saas_erp`,
      `pg_dump ${pgFlags} "${dbUrl}"`,
      ...[17, 16, 15, 14].map(v => `"C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe" ${pgFlags} "${dbUrl}"`),
    ]

    for (const cmd of dumpCommands) {
      try {
        const dump = execSync(cmd, { timeout: 300000, maxBuffer: 200 * 1024 * 1024, encoding: 'utf8', windowsHide: true })
        if (dump && dump.length > 100) return dump
      } catch { /* proximo metodo */ }
    }
    return null
  }

  async exportDatabase(): Promise<{ filename: string; filepath: string; size: number }> {
    const backupDir = this.getBackupDir()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `database-${timestamp}.sql`
    const filepath = path.join(backupDir, filename)

    const dump = this.runPgDump()
    if (!dump) {
      throw new Error('Não foi possível gerar o dump do banco. Verifique se o pg_dump está disponível (Docker, PATH ou Program Files).')
    }

    fs.writeFileSync(filepath, dump, 'utf8')
    const stats = fs.statSync(filepath)
    return { filename, filepath, size: stats.size }
  }

  async generateBackup(options: { includeEnv?: boolean }) {
    const backupDir = this.getBackupDir()
    const root = this.getProjectRoot()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `backup-${timestamp}.zip`
    const filepath = path.join(backupDir, filename)

    // 1. Dump do PostgreSQL
    const dbDumpPath = path.join(backupDir, `db-${timestamp}.sql`)
    const dump = this.runPgDump()
    const dbDumpOk = !!dump

    if (dump) {
      fs.writeFileSync(dbDumpPath, dump, 'utf8')
    } else {
      fs.writeFileSync(dbDumpPath, '-- pg_dump nao disponivel. Tente: docker exec saas-postgres pg_dump -U postgres saas_erp > backup.sql\n')
    }

    // 2. Gerar ZIP
    return new Promise<{ filename: string; filepath: string; size: number; dbDumpOk: boolean }>((resolve, reject) => {
      const output = fs.createWriteStream(filepath)
      const archive = archiver('zip', { zlib: { level: 6 } })

      output.on('close', () => {
        // Limpar dump temporario
        try { fs.unlinkSync(dbDumpPath) } catch {}
        resolve({ filename, filepath, size: archive.pointer(), dbDumpOk })
      })

      archive.on('error', (err: Error) => reject(err))
      archive.pipe(output)

      // Database dump
      if (fs.existsSync(dbDumpPath)) {
        archive.file(dbDumpPath, { name: 'database.sql' })
      }

      // Script de instalacao completo
      const installBat = `@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title OneClick ERP - Instalador
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║         OneClick ERP - Instalador Automatico            ║
echo  ║                                                        ║
echo  ║   Este script ira:                                     ║
echo  ║   - Detectar e instalar pre-requisitos                 ║
echo  ║   - Configurar o ambiente                              ║
echo  ║   - Restaurar o banco de dados                         ║
echo  ║   - Iniciar todos os servicos                          ║
echo  ║   - Abrir o sistema no navegador                       ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Pressione qualquer tecla para iniciar...
pause >nul

set "ERRORS=0"
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 1/12] Detectando sistema operacional...
echo ═══════════════════════════════════════════════════════════
echo  OS: Windows
for /f "tokens=4-5 delims=. " %%i in ('ver') do set VERSION=%%i.%%j
echo  Versao: %VERSION%
echo  Arquitetura: %PROCESSOR_ARCHITECTURE%
echo  OK
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 2/12] Verificando e instalando Node.js...
echo ═══════════════════════════════════════════════════════════
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo  Node.js NAO encontrado. Instalando via winget...
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements 2>nul
  if %errorlevel% neq 0 (
    echo  ERRO: Nao foi possivel instalar Node.js automaticamente.
    echo  Baixe manualmente: https://nodejs.org/
    echo  Apos instalar, execute este script novamente.
    set /a ERRORS+=1
    pause
    exit /b 1
  )
  echo  Node.js instalado. Recarregando PATH...
  set "PATH=%PATH%;C:\\Program Files\\nodejs"
) else (
  for /f "tokens=*" %%v in ('node --version') do echo  Node.js encontrado: %%v
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 3/12] Verificando e instalando pnpm...
echo ═══════════════════════════════════════════════════════════
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
  echo  pnpm NAO encontrado. Instalando...
  call npm install -g pnpm
  if %errorlevel% neq 0 (
    echo  Tentando via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
  )
) else (
  for /f "tokens=*" %%v in ('pnpm --version') do echo  pnpm encontrado: v%%v
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 4/12] Verificando Docker Desktop...
echo ═══════════════════════════════════════════════════════════
where docker >nul 2>&1
if %errorlevel% neq 0 (
  echo  Docker NAO encontrado. Instalando via winget...
  winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements 2>nul
  if %errorlevel% neq 0 (
    echo  ERRO: Instale o Docker Desktop manualmente:
    echo  https://www.docker.com/products/docker-desktop/
    set /a ERRORS+=1
  ) else (
    echo  Docker Desktop instalado. Inicie-o antes de continuar.
    echo  Aguardando Docker iniciar...
    timeout /t 30 /nobreak >nul
  )
) else (
  echo  Docker encontrado.
  docker --version
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 5/12] Verificando Python (para integracao SCI)...
echo ═══════════════════════════════════════════════════════════
where python >nul 2>&1
if %errorlevel% neq 0 (
  echo  Python NAO encontrado. Instalando via winget...
  winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements 2>nul
  if %errorlevel% neq 0 (
    echo  AVISO: Instale Python 3.12+ manualmente para integracao SCI.
    echo  https://www.python.org/downloads/
  ) else (
    echo  Python instalado.
    set "PATH=%PATH%;%LOCALAPPDATA%\\Programs\\Python\\Python312;%LOCALAPPDATA%\\Programs\\Python\\Python312\\Scripts"
  )
) else (
  for /f "tokens=*" %%v in ('python --version') do echo  %%v encontrado.
)
:: Instalar fdb para Firebird/SCI
where python >nul 2>&1
if %errorlevel% equ 0 (
  echo  Instalando driver Firebird (fdb)...
  pip install fdb 2>nul || echo  AVISO: fdb nao instalado (opcional, necessario para SCI)
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 6/12] Iniciando PostgreSQL via Docker...
echo ═══════════════════════════════════════════════════════════
docker ps --filter "name=saas-postgres" --format "{{.Names}}" 2>nul | findstr /c:"saas-postgres" >nul 2>&1
if %errorlevel% neq 0 (
  echo  Criando container PostgreSQL...
  docker run -d --name saas-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas_erp --restart unless-stopped postgres:16-alpine 2>nul
  if %errorlevel% neq 0 (
    echo  Tentando iniciar container existente...
    docker start saas-postgres 2>nul
  )
  echo  Aguardando PostgreSQL inicializar...
  timeout /t 8 /nobreak >nul
) else (
  echo  PostgreSQL ja esta rodando.
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 7/12] Iniciando Redis via Docker...
echo ═══════════════════════════════════════════════════════════
docker ps --filter "name=saas-redis" --format "{{.Names}}" 2>nul | findstr /c:"saas-redis" >nul 2>&1
if %errorlevel% neq 0 (
  echo  Criando container Redis...
  docker run -d --name saas-redis -p 6379:6379 --restart unless-stopped redis:7-alpine 2>nul
  if %errorlevel% neq 0 (
    echo  Tentando iniciar container existente...
    docker start saas-redis 2>nul
  )
  timeout /t 3 /nobreak >nul
) else (
  echo  Redis ja esta rodando.
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 8/12] Instalando dependencias do projeto...
echo ═══════════════════════════════════════════════════════════
cd /d "%ROOT%OneClick_Code"
if not exist "node_modules" (
  echo  Executando pnpm install (pode demorar alguns minutos)...
  call pnpm install
) else (
  echo  Dependencias ja instaladas. Atualizando...
  call pnpm install --frozen-lockfile 2>nul || call pnpm install
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 9/12] Configurando banco de dados (Prisma)...
echo ═══════════════════════════════════════════════════════════
:: Copiar .env se existir no backup
if not exist "apps\\api\\.env" (
  if exist "%ROOT%.env" (
    echo  Copiando .env do backup...
    copy "%ROOT%.env" "apps\\api\\.env" >nul
  ) else (
    echo  Criando .env padrao...
    (
      echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/saas_erp?schema=public
      echo REDIS_URL=redis://localhost:6379
      echo BETTER_AUTH_SECRET=dev-secret-change-in-production-min-32-chars!!
      echo BETTER_AUTH_URL=http://localhost:4000
      echo NEXT_PUBLIC_APP_URL=http://localhost:3000
      echo NEXT_PUBLIC_API_URL=http://localhost:4000
      echo API_URL=http://localhost:4000
    ) > "apps\\api\\.env"
  )
)
:: Copiar .env para packages/db tambem
if not exist "packages\\db\\.env" (
  copy "apps\\api\\.env" "packages\\db\\.env" >nul 2>&1
)
echo  Gerando Prisma Client...
call pnpm --filter @saas/db db:generate
echo  Sincronizando schema com o banco...
cd packages\\db
call npx prisma db push --accept-data-loss 2>nul || call npx prisma db push
cd /d "%ROOT%OneClick_Code"
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 10/12] Restaurando dump do banco de dados...
echo ═══════════════════════════════════════════════════════════
if exist "%ROOT%database.sql" (
  echo  Importando database.sql no PostgreSQL...
  docker exec -i saas-postgres psql -U postgres -d saas_erp < "%ROOT%database.sql"
  if %errorlevel% equ 0 (
    echo  Banco restaurado com sucesso!
  ) else (
    echo  AVISO: Houve erros na importacao. Verifique o banco manualmente.
  )
) else (
  echo  database.sql nao encontrado no backup.
  echo  O banco foi criado vazio com o schema mais recente.
)
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 11/12] Configurando Service Manager...
echo ═══════════════════════════════════════════════════════════
cd /d "%ROOT%OneClick_Code\\scripts\\service-manager"
if not exist "node_modules" (
  echo  Instalando dependencias do Service Manager...
  call npm install
)
echo  OK
cd /d "%ROOT%OneClick_Code"
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 12/12] Iniciando o sistema...
echo ═══════════════════════════════════════════════════════════
echo  Iniciando Service Manager na porta 9000...
start "OneClick SM" cmd /c "cd /d \\"%ROOT%OneClick_Code\\scripts\\service-manager\\" && node server.js"
timeout /t 3 /nobreak >nul

echo  Abrindo Service Manager no navegador...
start "" "http://localhost:9000"

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║              INSTALACAO CONCLUIDA!                      ║
echo  ╠══════════════════════════════════════════════════════════╣
echo  ║                                                        ║
echo  ║  O Service Manager foi aberto no navegador.            ║
echo  ║  Clique em "Iniciar Todos" para subir API e Web.       ║
echo  ║                                                        ║
echo  ║  URLs do sistema:                                      ║
echo  ║    Service Manager: http://localhost:9000               ║
echo  ║    Frontend:        http://localhost:3000               ║
echo  ║    API:             http://localhost:4000               ║
echo  ║                                                        ║
if %ERRORS% gtr 0 (
echo  ║  ATENCAO: %ERRORS% erro(s) detectado(s). Verifique acima.    ║
) else (
echo  ║  Nenhum erro detectado.                                ║
)
echo  ║                                                        ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Pressione qualquer tecla para fechar esta janela...
pause >nul
`
      archive.append(installBat, { name: 'install.bat' })

      // README de restauracao
      const readmeRestore = `# OneClick ERP - Backup
Gerado em: ${new Date().toLocaleString('pt-BR')}

## Conteudo do backup
- install.bat     - Instalador automatico (execute como Administrador)
- database.sql    - Dump completo do banco de dados PostgreSQL
- OneClick_Code/  - Codigo-fonte completo do projeto (monorepo)
- README.md       - Este arquivo
- .env            - Variaveis de ambiente (se incluido no backup)

## Instalacao automatica (recomendado)
1. Extraia o ZIP em qualquer pasta
2. Clique com botao direito em install.bat > "Executar como administrador"
3. O script ira:
   - Detectar e instalar Node.js, pnpm, Docker, Python automaticamente
   - Criar containers PostgreSQL e Redis
   - Instalar dependencias do projeto (pnpm install)
   - Configurar Prisma e sincronizar o schema
   - Restaurar o dump do banco de dados
   - Iniciar o Service Manager
   - Abrir o sistema no navegador
4. No Service Manager (http://localhost:9000), clique "Iniciar Todos"
5. Acesse http://localhost:3000

## Instalacao manual (se o script falhar)

### Pre-requisitos
- Node.js 20+ (https://nodejs.org/)
- pnpm 9+ (npm install -g pnpm)
- Docker Desktop (https://docker.com/)
- Python 3.12+ com fdb (pip install fdb) - opcional, para integracao SCI/Firebird

### Passo a passo
1. Iniciar PostgreSQL:
   docker run -d --name saas-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas_erp --restart unless-stopped postgres:16-alpine

2. Iniciar Redis:
   docker run -d --name saas-redis -p 6379:6379 --restart unless-stopped redis:7-alpine

3. Instalar dependencias:
   cd OneClick_Code
   pnpm install

4. Configurar .env:
   Copie o .env do backup para apps/api/.env e packages/db/.env

5. Gerar Prisma e sincronizar banco:
   pnpm --filter @saas/db db:generate
   cd packages/db && npx prisma db push && cd ../..

6. Restaurar banco:
   docker exec -i saas-postgres psql -U postgres -d saas_erp < database.sql

7. Iniciar o sistema:
   Opcao A: cd scripts/service-manager && npm install && node server.js (depois abra localhost:9000)
   Opcao B: pnpm dev

## URLs do sistema
- Frontend:        http://localhost:3000
- API:             http://localhost:4000
- Service Manager: http://localhost:9000

## Estrutura do projeto
OneClick_Code/
  apps/web/        - Frontend (Next.js 15)
  apps/api/        - Backend (NestJS + tRPC)
  packages/db/     - Prisma schema + client
  packages/types/  - Schemas Zod compartilhados
  packages/ui/     - Componentes shadcn/ui
  scripts/         - Service Manager
  uploads/         - Arquivos enviados pelos usuarios
`
      archive.append(readmeRestore, { name: 'README.md' })

      // Projeto completo (excluindo pastas pesadas/desnecessarias)
      archive.glob('**/*', {
        cwd: root,
        ignore: [
          '**/node_modules/**',
          '**/.next/**',
          '**/dist/**',
          '**/.git/**',
          '**/.turbo/**',
          '**/backups/**',
          '**/.venv/**',
          '**/__pycache__/**',
          '**/.cache/**',
          ...(!options.includeEnv ? ['**/.env'] : []),
        ],
        dot: true,
      }, { prefix: 'OneClick_Code' })

      archive.finalize()
    })
  }

  async deleteBackup(filename: string) {
    if (!filename || filename.includes('..') || (!filename.endsWith('.zip') && !filename.endsWith('.sql'))) {
      throw new Error('Nome de arquivo invalido')
    }
    const filepath = path.join(this.getBackupDir(), filename)
    if (!fs.existsSync(filepath)) throw new Error('Arquivo nao encontrado')
    fs.unlinkSync(filepath)
    return { ok: true, filename }
  }

  getBackupFilePath(filename: string): string | null {
    const filepath = path.join(this.getBackupDir(), filename)
    if (!fs.existsSync(filepath)) return null
    // Seguranca: nao permitir path traversal
    if (!filepath.startsWith(this.getBackupDir())) return null
    return filepath
  }

  async listBackups() {
    const backupDir = path.resolve(process.cwd(), '..', '..', 'backups')
    if (!fs.existsSync(backupDir)) return []
    return fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.zip') || f.endsWith('.sql'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f))
        return { filename: f, size: stats.size, createdAt: stats.mtime.toISOString() }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  // ============================================================
  // DEPLOY — STATUS GIT + PACOTE DE DEPLOY
  // ============================================================

  private gitExec(cmd: string): string {
    const root = this.getProjectRoot()
    try {
      return execSync(cmd, { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true }).trim()
    } catch (e) {
      const err = e as { stderr?: string; message?: string }
      throw new Error(err.stderr || err.message || 'Erro ao executar git')
    }
  }

  async getGitStatus() {
    const root = this.getProjectRoot()
    try {
      const branch = this.gitExec('git rev-parse --abbrev-ref HEAD')
      const lastCommitHash = this.gitExec('git log -1 --format=%H')
      const lastCommitMsg = this.gitExec('git log -1 --format=%s')
      const lastCommitDate = this.gitExec('git log -1 --format=%ci')
      const lastCommitAuthor = this.gitExec('git log -1 --format=%an')

      // Arquivos modificados (staged + unstaged)
      const statusRaw = this.gitExec('git status --porcelain')
      const changedFiles = statusRaw
        ? statusRaw.split('\n').map(line => ({
            status: line.substring(0, 2).trim(),
            file: line.substring(3),
          }))
        : []

      // Verificar se tem remote
      let remote = ''
      let remoteUrl = ''
      let ahead = 0
      let behind = 0
      try {
        remote = this.gitExec('git remote').split('\n')[0] || ''
        if (remote) {
          remoteUrl = this.gitExec(`git remote get-url ${remote}`)
          // Atualizar refs do remote (silencioso)
          try { execSync(`git fetch ${remote} --quiet`, { cwd: root, timeout: 15000, windowsHide: true }) } catch { /* offline */ }
          try {
            const counts = this.gitExec(`git rev-list --left-right --count ${remote}/${branch}...HEAD`)
            const parts = counts.split(/\s+/)
            behind = parseInt(parts[0] || '0', 10)
            ahead = parseInt(parts[1] || '0', 10)
          } catch { /* branch sem tracking */ }
        }
      } catch { /* sem remote */ }

      // Total de commits
      const totalCommits = parseInt(this.gitExec('git rev-list --count HEAD'), 10)

      // Verificar migrations pendentes
      let pendingMigrations: string[] = []
      const migrationsDir = path.join(root, 'packages', 'db', 'prisma', 'migrations')
      if (fs.existsSync(migrationsDir)) {
        pendingMigrations = fs.readdirSync(migrationsDir)
          .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
          .sort()
      }

      return {
        ok: true,
        branch,
        lastCommit: {
          hash: lastCommitHash,
          shortHash: lastCommitHash.substring(0, 7),
          message: lastCommitMsg,
          date: lastCommitDate,
          author: lastCommitAuthor,
        },
        totalCommits,
        changedFiles,
        uncommittedChanges: changedFiles.length,
        remote: remote || null,
        remoteUrl: remoteUrl || null,
        ahead,
        behind,
        pendingMigrations,
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  async getGitLog(limit = 20) {
    try {
      const lines = this.gitExec(`git log -${limit} --format=%H|||%h|||%s|||%an|||%ci`)
      return lines.split('\n').filter(Boolean).map(line => {
        const [hash, shortHash, message, author, date] = line.split('|||')
        return { hash, shortHash, message, author, date }
      })
    } catch {
      return []
    }
  }

  async generateDeployPackage(options: { fromCommit?: string; includeDb?: boolean }) {
    const backupDir = this.getBackupDir()
    const root = this.getProjectRoot()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const branch = this.gitExec('git rev-parse --abbrev-ref HEAD')
    const headHash = this.gitExec('git log -1 --format=%h')
    const filename = `deploy-${branch}-${headHash}-${timestamp}.zip`
    const filepath = path.join(backupDir, filename)

    // Coletar info do pacote
    const fromCommit = options.fromCommit || ''
    let changedFilesRaw: string

    if (fromCommit) {
      // Diff entre um commit e HEAD
      changedFilesRaw = this.gitExec(`git diff --name-only ${fromCommit} HEAD`)
    } else {
      // Tudo que está commitado mas não no remote, ou todos os arquivos tracked
      try {
        const remote = this.gitExec('git remote').split('\n')[0]
        changedFilesRaw = this.gitExec(`git diff --name-only ${remote}/${branch}...HEAD`)
      } catch {
        // Sem remote: pega os últimos 10 commits
        changedFilesRaw = this.gitExec('git diff --name-only HEAD~10 HEAD 2>/dev/null || git ls-files')
      }
    }

    const changedFiles = changedFilesRaw.split('\n').filter(Boolean)

    // Gerar o pacote
    return new Promise<{ filename: string; filepath: string; size: number; filesCount: number; includesDb: boolean }>((resolve, reject) => {
      const output = fs.createWriteStream(filepath)
      const archive = archiver('zip', { zlib: { level: 6 } })

      output.on('close', () => {
        const stats = fs.statSync(filepath)
        resolve({ filename, filepath, size: stats.size, filesCount: changedFiles.length, includesDb: !!options.includeDb })
      })
      archive.on('error', reject)
      archive.pipe(output)

      // Manifesto
      const manifest = {
        type: 'oneclick-deploy',
        version: '1.0',
        createdAt: new Date().toISOString(),
        branch,
        headCommit: this.gitExec('git log -1 --format=%H'),
        headMessage: this.gitExec('git log -1 --format=%s'),
        fromCommit: fromCommit || 'remote/HEAD',
        filesCount: changedFiles.length,
        includesDb: !!options.includeDb,
        files: changedFiles,
      }
      archive.append(JSON.stringify(manifest, null, 2), { name: 'deploy-manifest.json' })

      // Arquivos alterados
      for (const file of changedFiles) {
        const fullPath = path.join(root, file)
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          archive.file(fullPath, { name: `files/${file}` })
        }
      }

      // Prisma migrations (sempre inclui)
      const migrationsDir = path.join(root, 'packages', 'db', 'prisma', 'migrations')
      if (fs.existsSync(migrationsDir)) {
        archive.directory(migrationsDir, 'migrations')
      }

      // Schema Prisma (sempre inclui)
      const schemaPath = path.join(root, 'packages', 'db', 'prisma', 'schema.prisma')
      if (fs.existsSync(schemaPath)) {
        archive.file(schemaPath, { name: 'schema.prisma' })
      }

      // Dump do banco (opcional)
      if (options.includeDb) {
        const dump = this.runPgDump()
        if (dump) {
          archive.append(dump, { name: 'database.sql' })
        }
      }

      // Script de aplicação
      const applyScript = `#!/bin/bash
# OneClick ERP — Script de Deploy
# Gerado em: ${new Date().toLocaleString('pt-BR')}
# Branch: ${branch} | Commit: ${headHash}

echo "=== OneClick Deploy ==="
echo "Aplicando ${changedFiles.length} arquivo(s)..."

# 1. Copiar arquivos alterados
if [ -d "files" ]; then
  cp -rv files/* ../OneClick_Code/ 2>/dev/null
  echo "Arquivos copiados."
fi

# 2. Instalar dependencias (se package.json mudou)
cd ../OneClick_Code
if echo "${changedFiles.join(' ')}" | grep -q "package.json\\|pnpm-lock"; then
  echo "Instalando dependencias..."
  pnpm install
fi

# 3. Aplicar migrations
echo "Aplicando migrations..."
pnpm --filter @saas/db db:generate
cd packages/db && npx prisma migrate deploy && cd ../..

# 4. Rebuild
echo "Rebuild..."
pnpm build

echo "=== Deploy concluido! ==="
echo "Reinicie os servicos (Service Manager ou pnpm dev)"
`
      archive.append(applyScript, { name: 'apply-deploy.sh' })

      // Script Windows
      const applyBat = `@echo off
REM OneClick ERP - Script de Deploy
REM Gerado em: ${new Date().toLocaleString('pt-BR')}
REM Branch: ${branch} | Commit: ${headHash}

echo === OneClick Deploy ===
echo Aplicando ${changedFiles.length} arquivo(s)...

REM 1. Copiar arquivos
if exist "files" (
  xcopy /s /y /q files\\* ..\\OneClick_Code\\ >nul 2>&1
  echo Arquivos copiados.
)

REM 2. Dependencias
cd /d ..\\OneClick_Code
call pnpm install

REM 3. Migrations
echo Aplicando migrations...
call pnpm --filter @saas/db db:generate
cd packages\\db
call npx prisma migrate deploy
cd /d ..\\..

REM 4. Rebuild
echo Rebuild...
call pnpm build

echo === Deploy concluido! ===
echo Reinicie os servicos (Service Manager ou pnpm dev)
pause
`
      archive.append(applyBat, { name: 'apply-deploy.bat' })

      archive.finalize()
    })
  }

  async applyDeployPackage(zipPath: string): Promise<{ ok: boolean; filesApplied: number; migrationsApplied: boolean; message: string }> {
    const root = this.getProjectRoot()
    const AdmZip = require('adm-zip')
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()

    // Ler manifesto
    const manifestEntry = entries.find((e: { entryName: string }) => e.entryName === 'deploy-manifest.json')
    if (!manifestEntry) {
      throw new Error('Pacote inválido: deploy-manifest.json não encontrado.')
    }
    // Validar manifesto
    JSON.parse(manifestEntry.getData().toString('utf8'))

    // Aplicar arquivos
    let filesApplied = 0
    for (const entry of entries) {
      const name = entry.entryName as string
      if (name.startsWith('files/') && !entry.isDirectory) {
        const relativePath = name.substring(6) // remove 'files/'
        const destPath = path.join(root, relativePath)
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
        fs.writeFileSync(destPath, entry.getData())
        filesApplied++
      }
    }

    // Aplicar schema.prisma
    const schemaEntry = entries.find((e: { entryName: string }) => e.entryName === 'schema.prisma')
    if (schemaEntry) {
      const schemaPath = path.join(root, 'packages', 'db', 'prisma', 'schema.prisma')
      fs.writeFileSync(schemaPath, schemaEntry.getData())
    }

    // Aplicar migrations
    let migrationsApplied = false
    const migrationEntries = entries.filter((e: { entryName: string; isDirectory: boolean }) => e.entryName.startsWith('migrations/') && !e.isDirectory)
    if (migrationEntries.length > 0) {
      const migrationsDir = path.join(root, 'packages', 'db', 'prisma', 'migrations')
      for (const entry of migrationEntries) {
        const destPath = path.join(migrationsDir, (entry.entryName as string).substring(11))
        const destDir = path.dirname(destPath)
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
        fs.writeFileSync(destPath, entry.getData())
      }

      // Rodar prisma generate + migrate deploy
      try {
        execSync('npx prisma generate', { cwd: path.join(root, 'packages', 'db'), timeout: 60000, windowsHide: true })
        execSync('npx prisma migrate deploy', { cwd: path.join(root, 'packages', 'db'), timeout: 60000, windowsHide: true })
        migrationsApplied = true
      } catch (e) {
        const err = e as { stderr?: string }
        return { ok: true, filesApplied, migrationsApplied: false, message: `Arquivos aplicados, mas migrations falharam: ${err.stderr?.substring(0, 200) || 'erro desconhecido'}` }
      }
    }

    // Aplicar dump do banco se incluído
    const dbEntry = entries.find((e: { entryName: string }) => e.entryName === 'database.sql')
    if (dbEntry) {
      const tmpSql = path.join(this.getBackupDir(), `deploy-import-${Date.now()}.sql`)
      fs.writeFileSync(tmpSql, dbEntry.getData())
      try {
        const { values: envValues } = this.parseEnvFile()
        const dbUrl = envValues.get('DATABASE_URL') || process.env.DATABASE_URL || ''
        if (dbUrl) {
          execSync(`psql "${dbUrl}" < "${tmpSql}"`, { timeout: 300000, windowsHide: true })
        } else {
          execSync(`docker exec -i saas-postgres psql -U postgres -d saas_erp < "${tmpSql}"`, { timeout: 300000, windowsHide: true })
        }
      } catch { /* silencioso - dump é complementar */ }
      try { fs.unlinkSync(tmpSql) } catch { /* ok */ }
    }

    return {
      ok: true,
      filesApplied,
      migrationsApplied,
      message: `Deploy aplicado: ${filesApplied} arquivo(s)${migrationsApplied ? ' + migrations' : ''}`,
    }
  }

  // ============================================================
  // CONSULTAS SQL SALVAS
  // ============================================================

  async listSavedQueries(dbType?: string) {
    const where = dbType ? { dbType } : {}
    return prisma.savedQuery.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, sql: true, dbType: true, createdAt: true, updatedAt: true },
    })
  }

  async saveQuery(data: { name: string; sql: string; dbType: string }) {
    return prisma.savedQuery.create({
      data: { name: data.name, sql: data.sql, dbType: data.dbType },
    })
  }

  async updateSavedQuery(id: string, data: { name?: string; sql?: string }) {
    return prisma.savedQuery.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sql !== undefined ? { sql: data.sql } : {}),
      },
    })
  }

  async deleteSavedQuery(id: string) {
    await prisma.savedQuery.delete({ where: { id } })
    return { ok: true }
  }

  // ============================================================
  // TESTES DE CONEXÃO COM BANCOS DE DADOS
  // ============================================================

  async testPostgresql(): Promise<{ ok: boolean; message: string; details?: string }> {
    const start = Date.now()
    try {
      const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version() as version`
      const ms = Date.now() - start
      const version = (result[0]?.version || '').split(' ').slice(0, 2).join(' ')
      return { ok: true, message: `Conexão bem-sucedida (${ms}ms)`, details: version }
    } catch (e) {
      return { ok: false, message: `Falha na conexão: ${(e as Error).message}` }
    }
  }

  async testMysql(): Promise<{ ok: boolean; message: string; details?: string }> {
    const { values } = this.parseEnvFile()
    const host = values.get('LEGACY_DB_HOST') || process.env.LEGACY_DB_HOST
    const port = values.get('LEGACY_DB_PORT') || process.env.LEGACY_DB_PORT || '3306'
    const user = values.get('LEGACY_DB_USER') || process.env.LEGACY_DB_USER
    const password = values.get('LEGACY_DB_PASSWORD') || process.env.LEGACY_DB_PASSWORD
    const database = values.get('LEGACY_DB_NAME') || process.env.LEGACY_DB_NAME

    if (!host || !user || !database) {
      return { ok: false, message: 'Configuração incompleta. Preencha Host, Usuário e Database.' }
    }

    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mysql2 = require('mysql2/promise')
      const conn = await mysql2.createConnection({ host, port: Number(port), user, password, database, connectTimeout: 10000 })
      const [rows] = await conn.query('SELECT VERSION() as version')
      await conn.end()
      const ms = Date.now() - start
      const version = (rows as Array<{ version: string }>)[0]?.version || 'MySQL'
      return { ok: true, message: `Conexão bem-sucedida (${ms}ms)`, details: `MySQL ${version}` }
    } catch (e) {
      return { ok: false, message: `Falha na conexão: ${(e as Error).message}` }
    }
  }

  async testFirebird(): Promise<{ ok: boolean; message: string; details?: string }> {
    const { values } = this.parseEnvFile()
    const dsn = values.get('SCI_DSN') || process.env.SCI_DSN
    const user = values.get('SCI_USER') || process.env.SCI_USER
    const password = values.get('SCI_PASSWORD') || process.env.SCI_PASSWORD
    const charset = values.get('SCI_CHARSET') || process.env.SCI_CHARSET || 'UTF8'

    if (!dsn || !user) {
      return { ok: false, message: 'Configuração incompleta. Preencha DSN e Usuário.' }
    }

    const scriptPath = path.resolve(process.cwd(), 'src', 'admin', 'test_firebird.py')
    try {
      const result = spawnSync('python', [scriptPath, dsn, user, password || '', charset], {
        encoding: 'utf8',
        timeout: 30000,
      })
      if (result.stdout) {
        try {
          return JSON.parse(result.stdout.trim())
        } catch {
          return { ok: false, message: `Resposta inesperada: ${result.stdout.substring(0, 200)}` }
        }
      }
      return { ok: false, message: result.stderr ? result.stderr.substring(0, 300) : 'Sem resposta do script Python' }
    } catch (e) {
      return { ok: false, message: `Erro ao executar Python: ${(e as Error).message}` }
    }
  }

  // ============================================================
  // EXECUÇÃO DE SQL
  // ============================================================

  async execSqlPostgresql(sql: string): Promise<{ ok: boolean; columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }> {
    const start = Date.now()
    try {
      const result = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(sql)
      const ms = Date.now() - start
      if (!result || !Array.isArray(result) || result.length === 0) {
        return { ok: true, columns: [], rows: [], rowCount: 0, ms }
      }
      const columns = Object.keys(result[0]!)
      const rows = result.map(r => columns.map(c => r[c]))
      return { ok: true, columns, rows, rowCount: result.length, ms }
    } catch (e) {
      return { ok: false, columns: [], rows: [], rowCount: 0, ms: Date.now() - start, error: (e as Error).message }
    }
  }

  async execSqlMysql(sql: string): Promise<{ ok: boolean; columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }> {
    const { values } = this.parseEnvFile()
    const host = values.get('LEGACY_DB_HOST') || process.env.LEGACY_DB_HOST
    const port = values.get('LEGACY_DB_PORT') || process.env.LEGACY_DB_PORT || '3306'
    const user = values.get('LEGACY_DB_USER') || process.env.LEGACY_DB_USER
    const password = values.get('LEGACY_DB_PASSWORD') || process.env.LEGACY_DB_PASSWORD
    const database = values.get('LEGACY_DB_NAME') || process.env.LEGACY_DB_NAME

    if (!host || !user || !database) {
      return { ok: false, columns: [], rows: [], rowCount: 0, ms: 0, error: 'Configuração incompleta.' }
    }

    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mysql2 = require('mysql2/promise')
      const conn = await mysql2.createConnection({ host, port: Number(port), user, password, database, connectTimeout: 10000 })
      const [result, fields] = await conn.query(sql)
      await conn.end()
      const ms = Date.now() - start

      if (!Array.isArray(result)) {
        const info = result as { affectedRows?: number; changedRows?: number }
        return { ok: true, columns: ['affectedRows', 'changedRows'], rows: [[info.affectedRows ?? 0, info.changedRows ?? 0]], rowCount: 1, ms }
      }

      const columns = (fields as Array<{ name: string }>).map((f) => f.name)
      const rows = (result as Record<string, unknown>[]).map(r => columns.map(c => r[c]))
      return { ok: true, columns, rows, rowCount: rows.length, ms }
    } catch (e) {
      return { ok: false, columns: [], rows: [], rowCount: 0, ms: Date.now() - start, error: (e as Error).message }
    }
  }

  async execSqlFirebird(sql: string): Promise<{ ok: boolean; columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }> {
    const { values } = this.parseEnvFile()
    const dsn = values.get('SCI_DSN') || process.env.SCI_DSN
    const user = values.get('SCI_USER') || process.env.SCI_USER
    const password = values.get('SCI_PASSWORD') || process.env.SCI_PASSWORD
    const charset = values.get('SCI_CHARSET') || process.env.SCI_CHARSET || 'UTF8'

    if (!dsn || !user) {
      return { ok: false, columns: [], rows: [], rowCount: 0, ms: 0, error: 'Configuração incompleta.' }
    }

    const scriptPath = path.resolve(process.cwd(), 'src', 'admin', 'exec_firebird.py')
    const start = Date.now()
    try {
      const result = spawnSync('python', [scriptPath, dsn, user, password || '', charset, sql], {
        encoding: 'utf8',
        timeout: 60000,
      })
      const ms = Date.now() - start
      if (result.stdout) {
        try {
          const parsed = JSON.parse(result.stdout.trim())
          return { ...parsed, ms }
        } catch {
          return { ok: false, columns: [], rows: [], rowCount: 0, ms, error: `Resposta inesperada: ${result.stdout.substring(0, 300)}` }
        }
      }
      return { ok: false, columns: [], rows: [], rowCount: 0, ms, error: result.stderr ? result.stderr.substring(0, 500) : 'Sem resposta do script Python' }
    } catch (e) {
      return { ok: false, columns: [], rows: [], rowCount: 0, ms: Date.now() - start, error: (e as Error).message }
    }
  }
}
