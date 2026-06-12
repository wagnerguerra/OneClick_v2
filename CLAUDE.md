# Projeto: SaaS ERP/CRM — Guia de Contexto para Claude Code

## Visão Geral

SaaS multi-tenant ERP/CRM (Cadastros, Corporativo, Fiscal, Qualidade) para escritórios contábeis.
Pagamento recorrente via Stripe. Reconstrução modernizada do legado **OneClick v1 (SERPRO2)**.

**Documentos referenciados (sob demanda):**
- `docs/MODULOS.md` — lista canônica de módulos por bloco + slugs de cor
- `docs/ENV.md` — variáveis de ambiente completas + integrações externas
- `docs/error-registry.md` — registry de erros + gate obrigatório de entrega
- `docs/PADRAO_MODULOS.md`, `docs/PADRAO_MASCARAS.md`, `docs/PADRAO_KANBAN_DND.md` — padrões específicos

---

## Stack

### Monorepo (Turborepo + TypeScript strict)
```
apps/
  web/              → Next.js 15 (App Router, RSC)
  api/              → NestJS + tRPC
packages/
  db/               → Prisma + cliente gerado
  types/            → Schemas Zod compartilhados
  ui/               → shadcn/ui customizado
  config/           → tsconfig/eslint base
```

### Frontend (`apps/web`)
- **Next.js 15** + App Router + React Server Components
- **Tailwind v4** (CSS-first, sem `tailwind.config.js` para theming)
- **shadcn/ui** copiado no projeto
- **TanStack Table v8** (server-side) + **TanStack Query v5** (`keepPreviousData`)
- **React Hook Form + Zod** (schema compartilhado com DTO)
- **Recharts**

### Backend (`apps/api`)
- **NestJS** modular (um módulo por domínio)
- **tRPC** type-safe
- **Better Auth** (senha+MFA TOTP, OAuth Google/Microsoft, magic link, passkeys)
- **CASL + Guards** RBAC por tenant

### Dados (`packages/db`)
- **PostgreSQL** + **Prisma**
- **Multi-tenancy: schema-per-tenant** (`tenant_<id>`); schema `public` só guarda `tenants/plans/subscriptions`
- `tenantId` resolvido via subdomínio ou header → `SET search_path` por request → decorator `@TenantId()`
- **Redis + BullMQ** (cache + filas)

### Serviços
- **Stripe Billing** (webhooks: `customer.subscription.{created,updated,deleted}`, `invoice.payment_{failed,succeeded}`)
- **Resend** (e-mail transacional)
- **S3/Minio** (documentos, certificados, assets)
- **Sentry + Pino** (observabilidade)

### Infra
- Docker Compose local e produção
- Deploy: Coolify ou Railway

---

## Padrões de Código

### Nomenclatura
- Arquivos: `kebab-case` · Componentes: `PascalCase` · Funções/vars: `camelCase`
- Prisma: tabelas `PascalCase` singular (`Cliente`, `Colaborador`); enums `UPPER_SNAKE_CASE`
- Idioma: **código em inglês, UI e comentários em português**

### Paginação server-side (padrão)
Schema em `packages/types/src/pagination.ts`:
```ts
export const paginationSchema = z.object({
  page:    z.coerce.number().min(1).default(1),
  limit:   z.coerce.number().min(1).max(100).default(20),
  search:  z.string().optional(),
  sortBy:  z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
})
```
Helper em `packages/db/src/pagination.helper.ts` — usar em todos os services.
No frontend: sempre `useServerTable + DataTable`. Nunca paginação client-side de dados do backend.

### Formulários
`React Hook Form + Zod + shadcn/ui Form`. Schema do form = schema do DTO Nest. Campos: `h-9 text-sm`, label `text-[13px] font-semibold`, espaçamento `space-y-1.5`.

### Modais — `DialogHeaderIcon` obrigatório
Todo modal usa `<DialogHeaderIcon icon={X} color="Y">` (componente em `apps/web/src/components/ui/dialog-header-icon.tsx`). Cores: `sky | emerald | rose | amber | violet | indigo | cyan | orange | fuchsia | lime | slate | red | purple | blue`.

Por contexto: Criar=`emerald` · Editar=`sky`/`blue` · Excluir=`rose`/`red` · Avisos=`amber` · Config=`slate`/`violet` · Import/Export=`emerald`/`sky`.

**Proibido:** `<DialogHeader>` cru, ícone inline no `<DialogTitle>`, divs com bg colorido manual.
Doc viva: `/admin/design-system` → aba "Modais".

### Sub-abas (Card com pills laterais)
Wrapper `<Card>` + `flex min-h-[450px]` + sidebar de pills `w-[170px] bg-muted/40 border-r border-border`. Pill ativa = cor do módulo (CSS var). Conteúdo com `key={activeTab}` + `animation: fadeSlideIn 0.25s`. Títulos internos `text-[13px] font-semibold text-foreground` com `border-b` full-width via `-mx-5`. Textareas = `<RichEditor>` (TipTap), nunca textarea puro. Grid 12 colunas.

### Tokens semânticos de tema (CRÍTICO para dark mode)
**Sempre** `bg-muted/40`, `border-border`, `text-foreground`. **Nunca** `bg-[#f8f9fa]`, `border-[rgba(0,0,0,0.08)]`. Hex hardcoded quebra dark mode.

### Cores de módulo (dinâmicas)
Editáveis em `/admin/design-system → Tokens & cores`, persistidas em `module_colors`, injetadas como CSS vars em `:root` via `ModuleColorsProvider`. Slugs em `docs/MODULOS.md`.

Uso:
```tsx
// 1) CSS var (preferencial)
const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

// 2) Hook (quando precisa hex puro)
import { useModuleColor } from '@/components/theme/module-colors'
const moduleColor = useModuleColor('cadastros')
```
Nunca hardcoded `const MODULE_COLOR = '#10b981'`. Nova cor: adicionar em `DEFAULT_MODULE_COLORS` em `apps/api/src/theme/theme.service.ts` + mirror em `apps/web/src/components/theme/module-colors.tsx`.

### Estrutura de módulo NestJS
```
src/[modulo]/
  [modulo].module.ts
  [modulo].controller.ts  (ou .router.ts se tRPC puro)
  [modulo].service.ts
  dto/  (create | update | list)
```

### Coluna "Ações" em tabelas
Sempre dropdown `⋮` (`MoreVertical`) — nunca botões inline.

### Header de páginas de detalhe — componente `PageHeader` (PADRÃO FIXO)
**SEMPRE** use `<PageHeader>` (`apps/web/src/components/page-header.tsx`) para o cabeçalho de páginas de detalhe/módulo. **Nunca recrie a capa na mão.** Ele já entrega o wrapper bleed-edge (sangra com `-mx/-mt`) + capa em gradiente da cor do módulo + ícone (lucide via `icon` OU imagem de `/materiais` via `iconImg`) + título/subtítulo + `breadcrumb` + `actions` (botões à direita) + `children` (abas/pills abaixo).

```tsx
import { PageHeader } from '@/components/page-header'
<PageHeader color={MODULE_COLOR} icon={Icon} title="Título" subtitle="..."
  breadcrumb={<>...</>} actions={<Button>...</Button>}>
  {/* abas/pills opcionais */}
</PageHeader>
```
Para abas, use `SlidingTabsList` dentro de `children`. Ícone do módulo via imagem: `iconImg="/materiais/icon_x.png"` (copiar de `materiais/` p/ `apps/web/public/materiais/`). Páginas antigas com capa inline devem migrar pra esse componente quando tocadas.

---

## Observações Críticas

- **Nunca** `any` em TypeScript (strict em todos os tsconfigs)
- **Sempre** Zod no backend via `ZodValidationPipe` do `nestjs-zod`
- **Nunca** expor `tenantId` em rotas públicas sem auth
- Stripe webhooks: `stripe.webhooks.constructEvent` para verificar assinatura
- Logs: Pino estruturado, nunca `console.log` em produção
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, ...)
- **Prisma destrutivo**: NUNCA `--accept-data-loss`, `migrate reset`, ou aceitar reset em drift sem mostrar a lista pro usuário
- **Avatares**: `user.image` + fallback de iniciais, sempre via `useCurrentUserProfile()` reativo
- **Node 22 + IPv6**: `DATABASE_URL` e `REDIS_URL` com `127.0.0.1`, não `localhost`

---

## 🚨 Gate de entrega — testar API antes de reportar concluído

Toda alteração em `apps/api/` (especialmente constructor de service, novo módulo, ou DI) **DEVE** passar pelo gate de `docs/error-registry.md` (seção "GATE OBRIGATÓRIO ANTES DE ENTREGAR"):

1. `cd apps/api && npx tsc --noEmit 2>&1 | grep -E "<arquivos editados>"` — typecheck filtrado
2. `curl -s -o /dev/null -w "HTTP %{http_code}\n" http://192.168.0.58:4000/api/health` — espera **HTTP 200**. 000/502 = API morreu no boot
3. Boot falhou? `cd apps/api && timeout 12 node --enable-source-maps dist/main 2>&1 | grep -E "ERROR|UnknownDependencies|Error:" | head -10`. Erro típico: `UnknownDependenciesException` (service injetado sem importar o módulo dono — ver §6.5 do error-registry).

**Typecheck NÃO detecta DI quebrada do Nest** — só o boot pega. "Compilou" não é prova de que sobe.

---

## Comandos Úteis

```bash
pnpm install                              # instalar deps
pnpm dev                                  # todos os apps em paralelo
pnpm --filter @saas/db db:generate        # gerar client Prisma
pnpm --filter @saas/db db:migrate         # rodar migrations
pnpm build                                # build completo
pnpm lint
```

---

## MVP — Core Loop

1. Setup monorepo Turborepo
2. Schema base (Tenant, User, Plan, Subscription)
3. Multi-tenancy middleware
4. Better Auth completo (login, MFA, OAuth)
5. RBAC (OWNER, ADMIN, USER)
6. Stripe (subscription no cadastro do tenant)
7. Módulo Colaboradores (validação do padrão)
8. Dashboard (sidebar + header)
