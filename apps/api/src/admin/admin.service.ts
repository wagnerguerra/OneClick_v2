import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { execSync, spawnSync } from 'child_process'
import { EmailService } from '../common/email.service'
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
  'CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CERTIFICADO_PF_SENHA',
  'DB_PASSWORD', 'BETTER_AUTH_SECRET',
  'SCI_PASSWORD',
  'ONECLICK_DB_PASSWORD',
  'OMIE_APP_SECRET_CENTRAL', 'OMIE_APP_SECRET_LL',
  'SMTP_PASS',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'S3_ACCESS_KEY', 'S3_SECRET_KEY',
  'LEADS_API_KEY', 'CRM_EXTERNO_API_KEY',
  'TWILIO_AUTH_TOKEN',
  'CAPTCHA_2CAPTCHA_API_KEY', 'CAPTCHA_FREECAPTCHA_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'TSA_BASIC_PASS',
  'GOVBR_CLIENT_SECRET',
  'SERPROID_CLIENT_SECRET',
])

// Chaves que não devem ser apagadas mesmo se vierem vazias
const PRESERVE_IF_EMPTY = new Set(['SCI_DSN', 'SCI_USER', 'DB_HOST', 'DB_USER', 'DB_NAME'])

const CONFIG_FIELDS: ConfigField[] = [
  // SERPRO
  { key: 'CNPJ_CONTRATANTE', label: 'CNPJ do Contratante', group: 'SERPRO', type: 'text', placeholder: '00000000000000', help: 'CNPJ 14 digitos do contratante SERPRO' },
  { key: 'PUBLIC_BASE_URL', label: 'URL Publica', group: 'SERPRO', type: 'text', placeholder: 'http://192.168.0.108:5176/' },
  { key: 'CONSUMER_KEY', label: 'Consumer Key', group: 'SERPRO', type: 'password', secret: true },
  { key: 'CONSUMER_SECRET', label: 'Consumer Secret', group: 'SERPRO', type: 'password', secret: true },
  { key: 'CERTIFICADO_SENHA', label: 'Senha do Certificado PJ (PFX)', group: 'SERPRO', type: 'password', secret: true },
  { key: 'CERTIFICADO_PF_SENHA', label: 'Senha do Certificado PF (Contador)', group: 'SERPRO', type: 'password', secret: true },

  // Banco de Dados — PostgreSQL (subgroup: postgresql)
  { key: 'DATABASE_URL', label: 'URL PostgreSQL', group: 'Banco de Dados', type: 'text', placeholder: 'postgresql://user:pass@localhost:5432/db', subgroup: 'postgresql' },
  { key: 'REDIS_URL', label: 'URL Redis', group: 'Banco de Dados', type: 'text', placeholder: 'redis://localhost:6379', subgroup: 'postgresql' },

  // Banco de Dados — OneClick v2 (subgroup: oneclick_v2)
  { key: 'LEGACY_DB_HOST', label: 'Host', group: 'Banco de Dados', type: 'text', placeholder: 'localhost', subgroup: 'oneclick_v2' },
  { key: 'LEGACY_DB_PORT', label: 'Porta', group: 'Banco de Dados', type: 'number', placeholder: '3306', subgroup: 'oneclick_v2' },
  { key: 'LEGACY_DB_USER', label: 'Usuário', group: 'Banco de Dados', type: 'text', subgroup: 'oneclick_v2' },
  { key: 'LEGACY_DB_PASSWORD', label: 'Senha', group: 'Banco de Dados', type: 'password', secret: true, subgroup: 'oneclick_v2' },
  { key: 'LEGACY_DB_NAME', label: 'Database', group: 'Banco de Dados', type: 'text', subgroup: 'oneclick_v2' },

  // Banco de Dados — OneClick v1 (subgroup: oneclick_v1)
  { key: 'OCK_V1_DB_HOST', label: 'Host', group: 'Banco de Dados', type: 'text', placeholder: 'localhost', subgroup: 'oneclick_v1' },
  { key: 'OCK_V1_DB_PORT', label: 'Porta', group: 'Banco de Dados', type: 'number', placeholder: '3306', subgroup: 'oneclick_v1' },
  { key: 'OCK_V1_DB_USER', label: 'Usuário', group: 'Banco de Dados', type: 'text', subgroup: 'oneclick_v1' },
  { key: 'OCK_V1_DB_PASSWORD', label: 'Senha', group: 'Banco de Dados', type: 'password', secret: true, subgroup: 'oneclick_v1' },
  { key: 'OCK_V1_DB_NAME', label: 'Database', group: 'Banco de Dados', type: 'text', placeholder: 'db_intranet', subgroup: 'oneclick_v1' },

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
  { key: 'SMTP_HOST', label: 'Host SMTP', group: 'E-mail (SMTP)', type: 'text', placeholder: 'smtp.gmail.com', help: 'Servidor de envio de e-mails' },
  { key: 'SMTP_PORT', label: 'Porta SMTP', group: 'E-mail (SMTP)', type: 'number', placeholder: '587', help: 'Porta do servidor (587 para TLS, 465 para SSL)' },
  { key: 'SMTP_SECURE', label: 'Conexão segura (SSL)', group: 'E-mail (SMTP)', type: 'text', placeholder: 'false', help: 'Use "true" para porta 465 (SSL direto)' },
  { key: 'SMTP_USER', label: 'Usuário SMTP', group: 'E-mail (SMTP)', type: 'text', placeholder: 'sistema@empresa.com.br', help: 'E-mail usado para autenticação' },
  { key: 'SMTP_PASS', label: 'Senha SMTP', group: 'E-mail (SMTP)', type: 'password', secret: true, help: 'Senha ou senha de app do e-mail' },
  { key: 'SMTP_FROM', label: 'Remetente', group: 'E-mail (SMTP)', type: 'text', placeholder: 'Sistema OneClick <sistema@empresa.com.br>', help: 'Nome e e-mail que aparece como remetente' },

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

  // Captcha Providers
  { key: 'CAPTCHA_2CAPTCHA_API_KEY', label: 'API Key (2Captcha)', group: 'Captcha', type: 'password', secret: true, help: 'Chave da API do 2captcha.com — usado para resolver hCaptcha, reCAPTCHA e captchas de imagem' },
  { key: 'CAPTCHA_FREECAPTCHA_API_KEY', label: 'API Key (FreeCaptchaBypass)', group: 'Captcha', type: 'password', secret: true, help: 'Chave da API do freecaptchabypass — alternativa ao 2Captcha para hCaptcha' },

  // OpenAI
  { key: 'OPENAI_API_KEY', label: 'API Key', group: 'OpenAI (ChatGPT)', type: 'password', secret: true },
  { key: 'OPENAI_MODEL', label: 'Modelo', group: 'OpenAI (ChatGPT)', type: 'text', default: 'gpt-4o-mini' },

  // Google → OAuth Principal (geral, usado pelo auth do sistema)
  { key: 'GOOGLE_CLIENT_ID', label: 'Client ID', group: 'Google', subgroup: 'oauth', type: 'text' },
  { key: 'GOOGLE_CLIENT_SECRET', label: 'Client Secret', group: 'Google', subgroup: 'oauth', type: 'password', secret: true },

  // Google → Calendar
  { key: 'GOOGLE_CALENDAR_CLIENT_ID', label: 'Client ID', group: 'Google', subgroup: 'calendar', type: 'text', placeholder: 'xxxx.apps.googleusercontent.com', help: 'ID do cliente OAuth2 do Google Cloud Console' },
  { key: 'GOOGLE_CALENDAR_CLIENT_SECRET', label: 'Client Secret', group: 'Google', subgroup: 'calendar', type: 'password', secret: true, help: 'Segredo do cliente OAuth2' },
  { key: 'GOOGLE_CALENDAR_REDIRECT_URI', label: 'URI de Redirecionamento', group: 'Google', subgroup: 'calendar', type: 'text', placeholder: 'http://localhost:3000/agenda/google-callback', help: 'URL de callback do OAuth2 (deve ser registrada no Google Cloud Console)' },

  // Google → Drive (ingestão automática de XMLs por cliente)
  { key: 'GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE', label: 'Credentials.json (caminho)', group: 'Google', subgroup: 'drive', type: 'text', placeholder: './google/credentials.json', help: 'Caminho pro JSON do OAuth Client (Desktop/installed). Relativo à raiz do monorepo.', colSpan: 12 },
  { key: 'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN', label: 'Refresh Token (OAuth)', group: 'Google', subgroup: 'drive', type: 'password', secret: true, help: 'Refresh token de uma conta Google autorizada. Extrair com scripts/extract-google-refresh-token.py.', colSpan: 12 },
  { key: 'GOOGLE_DRIVE_SA_JSON_FILE', label: 'Service Account JSON (caminho)', group: 'Google', subgroup: 'drive', type: 'text', placeholder: './google/service-account.json', help: 'Alternativa ao OAuth: caminho pro JSON da Service Account. Deixe vazio se usa OAuth acima.', colSpan: 12 },
  { key: 'GOOGLE_DRIVE_SYNC_ENABLED', label: 'Sync automático ativo', group: 'Google', subgroup: 'drive', type: 'text', placeholder: 'true', help: 'true | false. Liga o cron de sincronização periódica.', colSpan: 6 },
  { key: 'GOOGLE_DRIVE_SYNC_CRON', label: 'Cron de sync', group: 'Google', subgroup: 'drive', type: 'text', placeholder: '*/15 * * * *', help: 'Expressão cron (default: a cada 15 min). Timezone: America/Sao_Paulo.', colSpan: 6 },

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

  // Abas (Sistema de tabs Chrome-like)
  { key: 'tabs.max_tabs', label: 'Limite de abas por usuário', group: 'Abas', type: 'number', placeholder: '10', help: 'Máximo de abas simultâneas que cada usuário pode ter abertas (1-50). Padrão: 10.' },

  // TSA
  { key: 'TSA_URL', label: 'URL TSA', group: 'Carimbo de Tempo (TSA)', type: 'text' },
  { key: 'TSA_AUTH', label: 'Tipo Auth', group: 'Carimbo de Tempo (TSA)', type: 'text', help: 'none | basic | serpro_oauth' },
  { key: 'TSA_HASH_ALGO', label: 'Algoritmo Hash', group: 'Carimbo de Tempo (TSA)', type: 'text', default: 'SHA-256' },
  { key: 'TSA_TIMEOUT_MS', label: 'Timeout (ms)', group: 'Carimbo de Tempo (TSA)', type: 'number', default: '30000' },

  // gov.br Assinatura — usado para o cliente assinar contratos via portal gov.br.
  // Cadastre a aplicação em https://sso.staging.acesso.gov.br (homologação)
  // ou https://sso.acesso.gov.br (produção) com scope "sign".
  { key: 'GOVBR_CLIENT_ID', label: 'Client ID', group: 'gov.br Assinatura', type: 'text', help: 'Identificador da aplicação cadastrada no portal gov.br' },
  { key: 'GOVBR_CLIENT_SECRET', label: 'Client Secret', group: 'gov.br Assinatura', type: 'password', secret: true, help: 'Segredo emitido após aprovação do cadastro' },
  { key: 'GOVBR_REDIRECT_URI', label: 'URI de Redirecionamento', group: 'gov.br Assinatura', type: 'text', placeholder: 'https://app.central-rnc.com.br/contratos/publico/[token]', help: 'URL pública para onde o gov.br devolve o code após autorização' },
  { key: 'GOVBR_BASE_URL_SSO', label: 'Base URL SSO', group: 'gov.br Assinatura', type: 'text', default: 'https://sso.staging.acesso.gov.br', help: 'Use sso.staging.acesso.gov.br em homologação e sso.acesso.gov.br em produção' },
  { key: 'GOVBR_BASE_URL_ASSINATURA', label: 'Base URL Assinatura', group: 'gov.br Assinatura', type: 'text', default: 'https://assinatura-api.staging.iti.br', help: 'Use assinatura-api.staging.iti.br em homologação e assinatura-api.iti.br em produção' },

  // SERPRO Neo iD Assinatura — alternativa nacional ao gov.br para assinar contratos.
  // Documentacao: https://neoid.estaleiro.serpro.gov.br/manual-integracao/utilizacao-certificado/assinatura-digital/
  // Aplicacao deve ser cadastrada junto ao SERPRO com scope "signature".
  { key: 'SERPROID_CLIENT_ID', label: 'Client ID', group: 'SERPRO Neo iD', type: 'text', help: 'Identificador da aplicação cadastrada junto ao SERPRO' },
  { key: 'SERPROID_CLIENT_SECRET', label: 'Client Secret', group: 'SERPRO Neo iD', type: 'password', secret: true, help: 'Segredo emitido pelo SERPRO' },
  { key: 'SERPROID_REDIRECT_URI', label: 'URI de Redirecionamento', group: 'SERPRO Neo iD', type: 'text', placeholder: 'https://app.central-rnc.com.br/contratos/publico/[token]', help: 'URL pública para onde o SERPRO devolve o code após autorização. Mesma página do contrato (detect ?code=&state=).' },
  { key: 'SERPROID_BASE_URL', label: 'Base URL', group: 'SERPRO Neo iD', type: 'text', default: 'https://serproid.serpro.gov.br', help: 'Endpoint base do SerproID (homologação e produção compartilham)' },

  // Acessórias — integração pra dar baixa automática nas rotinas mensais.
  // API REST com Bearer Token (gerado em Configurações → API Token no Acessórias).
  // Documentação: https://api.acessorias.com/documentation
  { key: 'ACESSORIAS_API_URL', label: 'URL Base da API', group: 'Acessórias', type: 'text', default: 'https://api.acessorias.com', placeholder: 'https://api.acessorias.com', help: 'Endpoint REST do Acessórias (sem /v1 ou afins)' },
  { key: 'ACESSORIAS_API_TOKEN', label: 'API Token', group: 'Acessórias', type: 'password', secret: true, help: 'Bearer Token gerado em Configurações → API Token no Acessórias. Rate limit 100 req/min.' },
  { key: 'ACESSORIAS_USER', label: 'Usuário (e-mail)', group: 'Acessórias', type: 'text', placeholder: 'usuario@empresa.com.br', help: 'E-mail do usuário no Acessórias (auditoria/identificação)' },
  { key: 'ACESSORIAS_PASSWORD', label: 'Senha', group: 'Acessórias', type: 'password', secret: true, help: 'Mantida só pra fallback ou geração programática de token, se necessário' },
]

@Injectable()
export class AdminService {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

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

  async generateBackup(options: { includeEnv?: boolean }) {
    const backupDir = this.getBackupDir()
    const root = this.getProjectRoot()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename = `backup-${timestamp}.zip`
    const filepath = path.join(backupDir, filename)

    // 1. Dump do PostgreSQL
    const dbDumpPath = path.join(backupDir, `db-${timestamp}.sql`)
    let dbDumpOk = false

    // Tentar: Docker > pg_dump local > pg_dump em Program Files
    const dumpCommands = [
      'docker exec saas-postgres pg_dump --no-owner --no-acl -U postgres saas_erp',
      `pg_dump --no-owner --no-acl "postgresql://postgres:postgres@localhost:5432/saas_erp"`,
      ...[17, 16, 15, 14].map(v => `"C:\\Program Files\\PostgreSQL\\${v}\\bin\\pg_dump.exe" --no-owner --no-acl "postgresql://postgres:postgres@localhost:5432/saas_erp"`),
    ]

    for (const cmd of dumpCommands) {
      try {
        const dump = execSync(cmd, { timeout: 120000, encoding: 'utf8', windowsHide: true })
        if (dump && dump.length > 100) {
          fs.writeFileSync(dbDumpPath, dump, 'utf8')
          dbDumpOk = true
          break
        }
      } catch { /* proximo metodo */ }
    }

    if (!dbDumpOk) {
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
echo  [ETAPA 11/12] Configurando Launcher / Service Manager...
echo ═══════════════════════════════════════════════════════════
cd /d "%ROOT%OneClick_Code\\scripts\\launcher"
if not exist "node_modules" (
  echo  Instalando dependencias do Launcher...
  call npm install
)
echo  OK
cd /d "%ROOT%OneClick_Code"
echo.

echo ═══════════════════════════════════════════════════════════
echo  [ETAPA 12/12] Iniciando o sistema...
echo ═══════════════════════════════════════════════════════════
echo  Iniciando Launcher / Service Manager...
start "OneClick Launcher" cmd /c "cd /d \\"%ROOT%OneClick_Code\\scripts\\launcher\\" && npm start"
timeout /t 3 /nobreak >nul

echo  Launcher iniciado.

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║              INSTALACAO CONCLUIDA!                      ║
echo  ╠══════════════════════════════════════════════════════════╣
echo  ║                                                        ║
echo  ║  O Launcher / Service Manager foi iniciado.             ║
echo  ║  Clique em "Iniciar Todos" para subir API e Web.       ║
echo  ║                                                        ║
echo  ║  URLs do sistema:                                      ║
echo  ║    Launcher:        aplicativo desktop                  ║
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
   - Iniciar o Launcher / Service Manager
4. No Launcher / Service Manager, clique "Iniciar Todos"
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
   Opcao A: cd scripts/launcher && npm install && npm start
   Opcao B: pnpm dev

## URLs do sistema
- Frontend:        http://localhost:3000
- API:             http://localhost:4000
- Launcher / Service Manager: aplicativo desktop

## Estrutura do projeto
OneClick_Code/
  apps/web/        - Frontend (Next.js 15)
  apps/api/        - Backend (NestJS + tRPC)
  packages/db/     - Prisma schema + client
  packages/types/  - Schemas Zod compartilhados
  packages/ui/     - Componentes shadcn/ui
  scripts/launcher - Launcher / Service Manager
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
    if (!filename || filename.includes('..') || !filename.endsWith('.zip')) {
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
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f))
        return { filename: f, size: stats.size, createdAt: stats.mtime.toISOString() }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
  // CERTIFICADO DIGITAL
  // ============================================================

  private getCertificadoPath(): string {
    return path.resolve(process.cwd(), 'uploads', 'certificado.pfx')
  }

  async getCertificadoInfo(): Promise<{
    exists: boolean
    fileName: string | null
    fileSize: number | null
    uploadedAt: string | null
    validFrom: string | null
    validTo: string | null
    subject: string | null
    issuer: string | null
    serialNumber: string | null
    daysRemaining: number | null
    expired: boolean
    senha: boolean
    consumerKey: boolean
    consumerSecret: boolean
    cnpjContratante: string | null
  }> {
    const certPath = this.getCertificadoPath()
    const { values } = this.parseEnvFile()

    let exists = false
    let fileSize: number | null = null
    let uploadedAt: string | null = null
    let validFrom: string | null = null
    let validTo: string | null = null
    let subject: string | null = null
    let issuer: string | null = null
    let serialNumber: string | null = null
    let daysRemaining: number | null = null
    let expired = false

    if (fs.existsSync(certPath)) {
      exists = true
      const stat = fs.statSync(certPath)
      fileSize = stat.size
      uploadedAt = stat.mtime.toISOString()

      // Ler info do certificado PFX via Node.js crypto (X509Certificate)
      const senha = values.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''
      try {
        // Extrair PEM do PFX via openssl (tentar com e sem -legacy para OpenSSL 3.x)
        let output = ''
        for (const extraArgs of [[], ['-legacy']]) {
          const result = spawnSync('openssl', [
            'pkcs12', '-in', certPath, '-passin', `pass:${senha}`,
            '-nokeys', '-clcerts', '-nodes', ...extraArgs,
          ], { encoding: 'utf8', timeout: 10000 })
          output = (result.stdout || '') + (result.stderr || '')
          if (output.includes('BEGIN CERTIFICATE')) break
        }

        // Extrair bloco PEM do certificado
        const pemMatch = output.match(/(-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----)/m)

        if (pemMatch) {
          const x509 = new crypto.X509Certificate(pemMatch[1]!)
          validFrom = new Date(x509.validFrom).toISOString()
          validTo = new Date(x509.validTo).toISOString()
          subject = x509.subject.split('\n').find(l => l.startsWith('CN='))?.slice(3) || x509.subject
          issuer = x509.issuer.split('\n').find(l => l.startsWith('CN='))?.slice(3) || x509.issuer
          serialNumber = x509.serialNumber

          const expDate = new Date(x509.validTo)
          daysRemaining = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          expired = daysRemaining < 0
        } else {
          // Fallback: parsear texto do openssl
          const notAfterMatch = output.match(/Not After\s*:\s*(.+)/i)
          const subjectMatch = output.match(/subject\s*=\s*(.+)/i)
          const issuerMatch = output.match(/issuer\s*=\s*(.+)/i)

          if (notAfterMatch) {
            const expDate = new Date(notAfterMatch[1]!.trim())
            validTo = expDate.toISOString()
            daysRemaining = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            expired = daysRemaining < 0
          }
          if (subjectMatch) subject = subjectMatch[1]!.trim()
          if (issuerMatch) issuer = issuerMatch[1]!.trim()
        }
      } catch {
        // Não foi possível ler o certificado (senha incorreta, openssl ausente, ou formato inválido)
      }
    }

    return {
      exists,
      fileName: exists ? 'certificado.pfx' : null,
      fileSize,
      uploadedAt,
      validFrom,
      validTo,
      subject,
      issuer,
      serialNumber,
      daysRemaining,
      expired,
      senha: !!(values.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA),
      consumerKey: !!(values.get('CONSUMER_KEY') || process.env.CONSUMER_KEY),
      consumerSecret: !!(values.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET),
      cnpjContratante: values.get('CNPJ_CONTRATANTE') || process.env.CNPJ_CONTRATANTE || null,
    }
  }

  async deleteCertificado(): Promise<{ ok: boolean; message: string }> {
    const certPath = this.getCertificadoPath()
    if (fs.existsSync(certPath)) {
      fs.unlinkSync(certPath)
      return { ok: true, message: 'Certificado removido com sucesso.' }
    }
    return { ok: false, message: 'Nenhum certificado encontrado.' }
  }

  // ============================================================
  // CERTIFICADO DIGITAL PF (Pessoa Física do Contador)
  // ============================================================

  private getCertificadoPfPath(): string {
    return path.resolve(process.cwd(), 'uploads', 'certificado-pf.pfx')
  }

  async getCertificadoPfInfo(): Promise<{
    exists: boolean; fileName: string | null; fileSize: number | null; uploadedAt: string | null
    validFrom: string | null; validTo: string | null; subject: string | null; issuer: string | null
    daysRemaining: number | null; expired: boolean; senha: boolean
  }> {
    const certPath = this.getCertificadoPfPath()
    const { values } = this.parseEnvFile()
    let exists = false, fileSize: number | null = null, uploadedAt: string | null = null
    let validFrom: string | null = null, validTo: string | null = null
    let subject: string | null = null, issuer: string | null = null
    let daysRemaining: number | null = null, expired = false

    if (fs.existsSync(certPath)) {
      exists = true
      const stat = fs.statSync(certPath)
      fileSize = stat.size
      uploadedAt = stat.mtime.toISOString()

      const senha = values.get('CERTIFICADO_PF_SENHA') || process.env.CERTIFICADO_PF_SENHA || ''
      try {
        let output = ''
        for (const extraArgs of [[], ['-legacy']]) {
          const result = spawnSync('openssl', [
            'pkcs12', '-in', certPath, '-passin', `pass:${senha}`,
            '-nokeys', '-clcerts', '-nodes', ...extraArgs,
          ], { encoding: 'utf8', timeout: 10000 })
          output = (result.stdout || '') + (result.stderr || '')
          if (output.includes('BEGIN CERTIFICATE')) break
        }
        const pemMatch = output.match(/(-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----)/m)
        if (pemMatch) {
          const x509 = new crypto.X509Certificate(pemMatch[1]!)
          validFrom = new Date(x509.validFrom).toISOString()
          validTo = new Date(x509.validTo).toISOString()
          subject = x509.subject.split('\n').find(l => l.startsWith('CN='))?.slice(3) || x509.subject
          issuer = x509.issuer.split('\n').find(l => l.startsWith('CN='))?.slice(3) || x509.issuer
          const expDate = new Date(x509.validTo)
          daysRemaining = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          expired = daysRemaining < 0
        }
      } catch { /* */ }
    }

    return {
      exists, fileName: exists ? 'certificado-pf.pfx' : null, fileSize, uploadedAt,
      validFrom, validTo, subject, issuer, daysRemaining, expired,
      senha: !!(values.get('CERTIFICADO_PF_SENHA') || process.env.CERTIFICADO_PF_SENHA),
    }
  }

  async deleteCertificadoPf(): Promise<{ ok: boolean; message: string }> {
    const certPath = this.getCertificadoPfPath()
    if (fs.existsSync(certPath)) {
      fs.unlinkSync(certPath)
      return { ok: true, message: 'Certificado PF removido com sucesso.' }
    }
    return { ok: false, message: 'Nenhum certificado PF encontrado.' }
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

  async testOneclickV1(): Promise<{ ok: boolean; message: string; details?: string }> {
    const { values } = this.parseEnvFile()
    const host = values.get('OCK_V1_DB_HOST') || process.env.OCK_V1_DB_HOST
    const port = values.get('OCK_V1_DB_PORT') || process.env.OCK_V1_DB_PORT || '3306'
    const user = values.get('OCK_V1_DB_USER') || process.env.OCK_V1_DB_USER
    const password = values.get('OCK_V1_DB_PASSWORD') || process.env.OCK_V1_DB_PASSWORD
    const database = values.get('OCK_V1_DB_NAME') || process.env.OCK_V1_DB_NAME

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
      return { ok: true, message: `Conexão bem-sucedida (${ms}ms)`, details: `MySQL ${version} — ${database}` }
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

    const scriptPath = path.resolve(process.cwd(), 'apps', 'api', 'src', 'admin', 'test_firebird.py')
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

  async testStripe(): Promise<{ ok: boolean; message: string; details?: string }> {
    const { values } = this.parseEnvFile()
    const secretKey = values.get('STRIPE_SECRET_KEY') || process.env.STRIPE_SECRET_KEY

    if (!secretKey) {
      return { ok: false, message: 'STRIPE_SECRET_KEY não configurada. Preencha a chave secreta.' }
    }

    const start = Date.now()
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const StripeLib = require('stripe')
      const stripe = new StripeLib(secretKey)
      const account = await stripe.accounts.retrieve()
      const ms = Date.now() - start
      const name = account.settings?.dashboard?.display_name || account.business_profile?.name || account.id
      return {
        ok: true,
        message: `Conexão bem-sucedida (${ms}ms)`,
        details: `Conta: ${name} | Modo: ${secretKey.startsWith('sk_live_') ? 'Produção' : 'Teste'}`,
      }
    } catch (e) {
      const ms = Date.now() - start
      const msg = (e as Error).message || 'Erro desconhecido'
      if (msg.includes('Invalid API Key')) {
        return { ok: false, message: `Chave de API inválida (${ms}ms). Verifique se a chave está correta.` }
      }
      return { ok: false, message: `Falha na conexão (${ms}ms): ${msg}` }
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

  async execSqlOneclickV1(sql: string): Promise<{ ok: boolean; columns: string[]; rows: unknown[][]; rowCount: number; ms: number; error?: string }> {
    const { values } = this.parseEnvFile()
    const host = values.get('OCK_V1_DB_HOST') || process.env.OCK_V1_DB_HOST
    const port = values.get('OCK_V1_DB_PORT') || process.env.OCK_V1_DB_PORT || '3306'
    const user = values.get('OCK_V1_DB_USER') || process.env.OCK_V1_DB_USER
    const password = values.get('OCK_V1_DB_PASSWORD') || process.env.OCK_V1_DB_PASSWORD
    const database = values.get('OCK_V1_DB_NAME') || process.env.OCK_V1_DB_NAME

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

    const scriptPath = path.resolve(process.cwd(), 'apps', 'api', 'src', 'admin', 'exec_firebird.py')
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

  // ============================================================
  // Teste de E-mail SMTP
  // ============================================================

  async testSmtp(destinatario: string) {
    const ok = await this.emailService.sendMail({
      to: destinatario,
      subject: '✅ Teste SMTP — OneClick ERP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px">
          <h2 style="color:#10b981">Teste de E-mail</h2>
          <p>Se você está lendo esta mensagem, a configuração SMTP está funcionando corretamente.</p>
          <p style="color:#6b7280;font-size:12px">Enviado em ${new Date().toLocaleString('pt-BR')} pelo OneClick ERP.</p>
        </div>
      `,
    })
    return { ok, message: ok ? 'E-mail de teste enviado com sucesso!' : 'Falha ao enviar. Verifique as configurações SMTP.' }
  }
}
