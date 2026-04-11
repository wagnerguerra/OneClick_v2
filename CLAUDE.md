# Projeto: SaaS ERP/CRM — Guia de Contexto para Claude Code

## Visão Geral

Sistema SaaS multi-tenant do tipo ERP/CRM com módulos de Cadastros, Corporativo e Qualidade.
Modelo de pagamento recorrente via Stripe. Interface profissional para uso empresarial.

---

## Stack Definida

### Monorepo
- **Turborepo** — build incremental, cache, scripts compartilhados
- **TypeScript** em toda a stack — strict mode ativado

### Frontend (`apps/web`)
- **Next.js 15** com App Router e React Server Components
- **Tailwind CSS v4** — CSS-first, sem tailwind.config.js para theming
- **shadcn/ui** — componentes copiados no projeto (não dependência)
- **TanStack Table v8** — tabelas com paginação/sort/filtro server-side
- **TanStack Query v5** — cache e estado de servidor (`keepPreviousData`)
- **React Hook Form + Zod** — formulários com validação compartilhada
- **Recharts** — gráficos e dashboards

### Backend (`apps/api`)
- **NestJS** com arquitetura modular (um módulo por domínio)
- **tRPC** — API type-safe entre frontend e backend
- **Better Auth** — autenticação com MFA (TOTP), OAuth, magic link, passkeys
- **CASL + Guards NestJS** — RBAC por tenant

### Dados (`packages/db`)
- **PostgreSQL** — banco principal
- **Prisma ORM** — migrations, client type-safe
- **Multi-tenancy: schema-per-tenant** — cada empresa tem seu próprio schema no Postgres
- **Redis + BullMQ** — cache e filas de jobs assíncronos

### Serviços Externos
- **Stripe Billing** — planos, assinaturas recorrentes, webhooks
- **Resend** — e-mail transacional
- **S3 / Minio** — armazenamento de documentos, certificados, assets
- **Sentry + Pino** — observabilidade e logging estruturado

### Infra / DX
- **Docker + Docker Compose** — ambiente local e produção
- **Zod** — validação compartilhada backend/frontend (mesmo schema)
- **Coolify ou Railway** — deploy

---

## Estrutura do Monorepo

```
apps/
  web/              → Next.js 15 (dashboard)
  api/              → NestJS (backend)
packages/
  db/               → Prisma schema + client gerado
  types/            → Tipos e schemas Zod compartilhados
  ui/               → Componentes shadcn/ui customizados
  config/           → tsconfig base, eslint config
```

---

## Multi-Tenancy

Estratégia: **schema-per-tenant** no PostgreSQL.

- Cada tenant (empresa) tem seu próprio schema: `tenant_<id>`
- Schema `public` contém apenas: `tenants`, `plans`, `subscriptions`
- O `tenantId` é resolvido via subdomínio (`empresa.app.com`) ou header
- Prisma usa `SET search_path = tenant_<id>` por request
- Decorator `@TenantId()` injeta o tenantId resolvido em todos os controllers

---

## Autenticação

Provider: **Better Auth**

Métodos disponíveis para o usuário:
- Login/senha com MFA via TOTP (Google Authenticator)
- OAuth (Google, Microsoft)
- Magic link por e-mail
- Passkeys (WebAuthn)

JWT com claims de `tenantId` e `userId`. Refresh token rotation ativado.

---

## Pagamentos

Provider: **Stripe Billing**

Modelo de dados:
```
Tenant → Subscription → Plan
```

Webhooks obrigatórios a implementar:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `invoice.payment_succeeded`

---

## Módulos do Sistema

### CADASTROS
- Áreas
- Cargos
- Colaboradores
- Clientes
- Empresas
- Fornecedores
- Obrigações Fixas
- Obrigações Sob Demanda
- Sócios
- Usuários

### CORPORATIVO
- Agenda Corporativa
- Coleta e Recebimento de Documentos
- Contatos
- Controle de Ativos
- Controle de Estoque
- CRM
- Gestão de Benefícios Fiscais
- Gestão de Certificados
- Gestão de Contratos
- HelpDesk
- Obrigações e Serviços
- Orçamentos
- Processos
- Projetos
- Quadro Societário

### QUALIDADE
- Painel da Qualidade
- Aquisições
- Análise de Contexto
- Capacitações
- Documentos Internos
- Documentos Externos
- Tabelas de Registros
- Elogios
- Melhorias
- Não Conformidades
- Reclamações
- Reuniões
- Sugestões

### CONFIGURAÇÕES
- Configurações Gerais

---

## Padrões de Código

### Paginação server-side (padrão para todas as listagens)

Schema Zod compartilhado em `packages/types/src/pagination.ts`:
```typescript
export const paginationSchema = z.object({
  page:    z.coerce.number().min(1).default(1),
  limit:   z.coerce.number().min(1).max(100).default(20),
  search:  z.string().optional(),
  sortBy:  z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})

export type PaginatedResponse<T> = {
  data:       T[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
  hasNext:    boolean
  hasPrev:    boolean
}
```

Helper genérico em `packages/db/src/pagination.helper.ts` — usar em todos os services.

### Tabelas no frontend

Sempre usar `useServerTable` + `DataTable` (componentes já definidos).
Nunca implementar paginação client-side para dados do backend.

### Formulários

Sempre `React Hook Form` + `Zod` + componentes `shadcn/ui Form`.
O schema Zod do formulário deve ser o mesmo usado no DTO do NestJS.

### Nomenclatura
- Arquivos: `kebab-case`
- Componentes React: `PascalCase`
- Funções/variáveis: `camelCase`
- Tabelas Prisma: `PascalCase` singular (`Colaborador`, `Cliente`)
- Enums Prisma: `UPPER_SNAKE_CASE`
- Idioma do código: inglês; idioma da UI e comentários: português

### Sub-abas dentro de abas (padrão Card com pills laterais)
Quando um módulo precisa de sub-abas dentro de uma aba principal, usar o padrão **Card com pills verticais à esquerda**:

```
<Card>
  <CardHeader>
    <h5>Título da seção</h5>          ← border-b rgba(0,0,0,0.08)
  </CardHeader>
  <div className="flex min-h-[450px]">
    <!-- Pills laterais -->
    <div className="w-[170px] shrink-0 border-r bg-[#f8f9fa] p-3">
      <button style={{ backgroundColor: COR_DO_MODULO }}>  ← cor do módulo quando ativa
        <Icon /> Label
      </button>
    </div>
    <!-- Conteúdo -->
    <div key={activeTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s' }}>
      <!-- Título interno (full-width) -->
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h4 className="text-[13px] font-semibold text-foreground">Título</h4>
        </div>
      </div>
      <!-- Conteúdo com grid 12 cols -->
      <div className="p-5 grid grid-cols-12 gap-3">...</div>
    </div>
  </div>
</Card>
```

**Regras:**
- Cor da pill ativa = cor do módulo (Cadastros=#10b981, Corporativo=#0ea5e9, Qualidade=#f59e0b, Config=#f97316)
- Títulos internos: `text-[13px] font-semibold text-foreground`, border-b full-width via `-mx-5`
- Sub-títulos de seção: `border-t` apenas (sem border-b), full-width via `-mx-5`
- Textareas usam `<RichEditor>` (TipTap) — nunca textarea puro
- Transição de aba: `animation: fadeSlideIn 0.25s ease-out` via `key={activeTab}`
- Campos usam grid 12 colunas igual ao padrão de formulários

### Estrutura de módulo NestJS
Cada módulo de domínio segue:
```
src/
  [modulo]/
    [modulo].module.ts
    [modulo].controller.ts
    [modulo].service.ts
    dto/
      create-[modulo].dto.ts
      update-[modulo].dto.ts
      list-[modulo].dto.ts
```

---

## MVP — Core Loop (Prioridade)

Fechar o ciclo completo antes de expandir módulos:

1. Setup do monorepo Turborepo
2. Schema Prisma base (Tenant, User, Plan, Subscription)
3. Multi-tenancy middleware (resolução de tenant por subdomínio)
4. Autenticação completa (Better Auth — login, MFA, OAuth)
5. RBAC básico (roles: OWNER, ADMIN, USER)
6. Integração Stripe (criação de subscription no cadastro do tenant)
7. Módulo Colaboradores completo (CRUD + listagem paginada) — validação do padrão
8. Layout do dashboard (sidebar com módulos, header com tenant/user)

---

## Variáveis de Ambiente Necessárias

```env
# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Storage
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Email (SMTP)
RESEND_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sistema@central-rnc.com.br
SMTP_PASS=

# Legacy Database (OneClick Fiscal / SERPRO - MySQL)
LEGACY_DB_HOST=localhost
LEGACY_DB_USER=root
LEGACY_DB_NAME=oneclick_fiscal_serpro
LEGACY_DB_PORT=3001

# ERP SCI (Firebird - Sistema Contábil Integrado)
SCI_DSN=\\192.168.0.2\s\SCI\banco\VSCI.SDB
SCI_USER=INTEGRACOES
SCI_CHARSET=UTF8

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_URL=http://localhost:4000
```

---

## Sistema Legado (Referência)

O projeto é uma reconstrução do sistema legado localizado em:
- **Código-fonte**: `C:\Users\wagner\Desktop\PROJETOS\SERPRO2`
- **Stack legada**: Node.js + Vanilla JS + Bootstrap 5 + MySQL
- **URL local**: `http://192.168.0.58:5173/`
- **Banco legado**: MySQL `oneclick_fiscal_serpro` na porta 3001

### ERP Externo (SCI)
- Sistema contábil integrado (Firebird) em `\\192.168.0.2`
- Usado para importar dados de clientes, tributação, faturamento
- Acesso via DSN com charset UTF8

### Integrações
- **SMTP**: Gmail para envio de e-mails transacionais
- **BrasilAPI**: Consulta de CNPJ e CEP
- **Omie**: ERP de alguns clientes (integração futura)

---

## Comandos Úteis

```bash
# Instalar dependências
pnpm install

# Dev (todos os apps em paralelo)
pnpm dev

# Gerar client Prisma
pnpm --filter @saas/db db:generate

# Rodar migrations
pnpm --filter @saas/db db:migrate

# Build completo
pnpm build

# Lint
pnpm lint
```

---

## Observações Importantes

- **Nunca** usar `any` no TypeScript — ativar `strict: true` em todos os tsconfigs
- **Sempre** validar input com Zod no backend (via `ZodValidationPipe` do `nestjs-zod`)
- **Nunca** expor o `tenantId` em rotas públicas sem autenticação
- Stripe webhooks devem verificar assinatura com `stripe.webhooks.constructEvent`
- Logs estruturados com Pino — nunca `console.log` em produção
- Commits seguem Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
