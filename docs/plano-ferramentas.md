# Plano de Implementação — Módulo "Ferramentas" (integração webapp → OneClick V2)

> Status: aprovado, pronto para executar. Guiado por **TDD**. Última atualização aterrada no código em 2026-06-26.
> Fonte original: sessão Claude `c0c68d8f`. Memória: `plano-integracao-ferramentas-oneclick`.

## 0. Objetivo e decisões

Trazer as **10 ferramentas fiscais** de `D:\aplicativos\webapp` para dentro do OneClick V2, no padrão da casa
(`/novo-modulo` + `/padroniza-modulo`), com **auth + multi-tenant + RBAC + histórico de jobs por empresa**,
**sem perder nenhuma funcionalidade** e **sem reescrever as engines**.

Decisões firmes:
1. **Arquitetura híbrida (técnica):**
   - **8 ferramentas job-based** → módulo *gateway* no OneClick que faz **proxy server-to-server** para a API Fastify do webapp (`/api/v1`). O browser nunca fala com o webapp.
   - **2 browser-only** (`nfse-pdf`, `extrato-edit`) → **port nativo** da lógica TS para `apps/web`.
2. **Distribuição no menu por BLOCO/área (NÃO há bloco "Ferramentas" separado):** cada bloco existente ganha um **subitem "Ferramentas" expansível** (`NavItem` com `subItems`) listando as ferramentas **daquela categoria**. A categoria segue `webapp/docs/ARCHITECTURE.md`:
   - Bloco **Fiscal** → `nfe`, `sped`, `sped-merge`, `sci-consolidado`, `comparacao-planilhas`, `comparacao-nfse`, `sci-portal-nacional`, `nfse-pdf` (8)
   - Bloco **Contábil** → `gnre`, `extrato-edit` (2)
   - Futuras ferramentas de outras áreas entram no subitem "Ferramentas" do **bloco correspondente**.
   Reaproveita a **cor do bloco** (`--mod-fiscal`/`--mod-contabil`); **não** cria slug/cor "ferramentas". ⚠️ Categoria (menu) ≠ arquitetura técnica: `gnre` é Contábil porém job-based; `nfse-pdf` é Fiscal porém browser-only.
3. **RBAC por área:** uma permissão umbrella **por bloco** — `ferramentas-fiscal`, `ferramentas-contabil` (controla o subitem "Ferramentas" na sidebar daquele bloco), com **sub-permissões por ferramenta** (`writeSubProcedure('ferramentas-fiscal','sped','SPED → XLSX')`). Novas áreas = novo slug `ferramentas-<area>`.
4. **Webapp coexiste** como backend de processamento (engines/workers/Docker seguem rodando). A UI Vite antiga é aposentada aos poucos.
5. **Piloto primeiro:** bootar testes + integrar **SPED** ponta-a-ponta (no bloco Fiscal), validar o padrão, depois replicar.
6. **Standalone agora:** sobe arquivo → baixa resultado, só dentro do OneClick com auth/permissão/histórico por tenant. Ligação com entidades (clientes/certificados) fica para fase 2.

---

## 1. Mapa do que já existe (validado no código)

### 1.1 OneClick V2 — `D:\aplicativos\ONECLICK V2`

**Service multi-tenant** (ref. `apps/api/src/area/area.service.ts`, `cliente/cliente.service.ts`):
- Acesso ao banco por tenant via `scoped(tenantSchema, async (db) => …)` de `@saas/db`
  (`packages/db/src/scoped.ts` → `withTenant` faz `SET LOCAL search_path TO "<tenant>","public"` dentro de `$transaction`). `packages/db/src/tenant-prisma.ts:25`. **Valida `^tenant_[a-zA-Z0-9_]+$`.**
- `empresaFilter(isMaster, empresaId)` → `{}` p/ master, `{ empresaId }` p/ resto (cliente usa `{ empresaId: '__none__' }` p/ órfãos).
- Paginação: `getPrismaSkipTake(page, limit)` + `buildPaginatedResponse(data, total, page, limit)` (`packages/db/src/pagination.helper.ts`).
- Soft-delete: `deletedAt` + model `*Event` de auditoria (`type: created|updated|deleted|restored`, `version`). `listTrash` filtra `deletedAt: { not: null }`. `restore` zera `deletedAt`.

**Router tRPC** (ref. `area.router.ts`): `createXRouter(service)` retorna `router({...})`; `readProcedure(MODULE)/writeProcedure/deleteProcedure/writeSubProcedure(MODULE, subKey, label)` de `../trpc/trpc.service`. Procedures passam `ctx.isMaster, ctx.empresaId, ctx.tenantSchema` (e `ctx.userId`) ao service. Input Zod de `@saas/types`.

**Wiring (3 pontos):**
1. `apps/api/src/<mod>/<mod>.module.ts`: `@Module({ providers:[Svc], exports:[Svc] })`.
2. `apps/api/src/trpc/trpc.module.ts`: adicionar `XModule` em `imports`.
3. `apps/api/src/trpc/trpc.service.ts`: `@Inject(XService) private readonly xService` no constructor **e** `x: createXRouter(this.xService)` em `createRouter()`. ⚠️ **DI não é pega por typecheck** — só quebra no boot.

**Prisma** (`packages/db/prisma/schema.prisma`): models de domínio vivem nos **schemas de tenant** (não `public`; `public` só tem Tenant/User/Plan/Subscription/ModuleColor). Campos comuns: `id @default(cuid())`, `code Int @default(autoincrement())`, `empresaId`, `deletedAt`, `version`, `createdAt`, `updatedAt`, `@@map`. Migração: `pnpm --filter @saas/db db:push` (NUNCA `migrate deploy`/reset/`--accept-data-loss` — ver memória `projeto-oneclick-v2`).

**HTTP externo** (ref. `apps/api/src/cnpj/cnpj.service.ts`): `fetch()` nativo; checa `res.ok`, trata 404/erro com `res.text()`; lê env de `process.env` (há helper que também lê `.env` do cwd). Loga em `prisma.apiLog`.

**Upload REST** (`apps/api/src/upload/upload.controller.ts`): `@Controller('api/upload')`, `FileInterceptor('file')` + Multer `diskStorage` em `<cwd>/uploads`, **limite 20MB**, bloqueia `.exe/.bat/.cmd/.sh/.msi/.dll`, retorna `{ url, filename }`. GET serve com sanitização anti path-traversal.

**Frontend** (`apps/web`):
- tRPC client em `src/lib/trpc.ts`: `createTRPCClient<AppRouter>` com `httpLink({ url:'/be/trpc', fetch: credentials:'include' })`. `next.config.ts` rewrite `'/be/:path*' → '${NEXT_PUBLIC_API_URL||http://localhost:8050}/:path*'`.
- Upload existente (`clientes/_components/cliente-form.tsx`): `fetch(`${getApiUrl()}/api/upload`, { method:'POST', body: FormData, credentials:'include' })` → `{ url, filename }`.
- Header das páginas de módulo: **`<PageHeader>` é o padrão FIXO** (`apps/web/src/components/page-header.tsx`) — CLAUDE.md: "SEMPRE use PageHeader… Nunca recrie a capa na mão" (capa bleed-edge + gradiente da cor + ícone + título/subtítulo + `breadcrumb`/`actions` + `children` p/ abas via `SlidingTabsList`). ⚠️ Há tensão: a *listagem* de `orcamentos` usa header inline no código atual, mas CLAUDE.md manda PageHeader para páginas de módulo/detalhe → **as páginas de ferramenta usam `PageHeader`** (form de upload + aba "Histórico" como `children`).
- `DialogHeaderIcon` (`src/components/ui/dialog-header-icon.tsx`): `icon`, `color` (emerald=criar, sky/blue=editar, rose/red=excluir…).
- Tabela padrão: `Table` shadcn, `SortHead` p/ ordenação server-side, loading overlay, barra de page-size/filtros (`bg-muted/20`), rodapé de paginação, ações em `DropdownMenu` (⋮).
- Menu: `src/lib/navigation.ts` (`NavGroup[]` + `GROUP_HEX` = hex do grupo). `NavItem` suporta `subItems` (ex.: CRM → Funil) → é assim que entra o subitem **"Ferramentas"** em cada bloco existente. **Não criamos `NavGroup`/`GROUP_HEX`/slug de cor novos** — reaproveitamos a cor do bloco (`--mod-fiscal`/`--mod-contabil`), já definida em `apps/api/src/theme/theme.service.ts` (`DEFAULT_MODULE_COLORS`) + mirror `apps/web/src/components/theme/module-colors.tsx`.
- Permissão: `src/hooks/use-user-permissions.ts` → `{ isMaster, isEmpresaMaster, role, empresaId, permissions, allowedSlugs }`; sidebar filtra por `allowedSlugs`; sub-perm via `permissions.find(p=>p.moduleSlug===…).subPermissions[subKey]`.
- **Infra de teste: NÃO existe** (sem jest/vitest/`*.spec.ts`/script `test` em api e web) → Fase 0 bloqueante.

### 1.2 Webapp — API Fastify `/api/v1` (porta **8000**, `webapp-01/apps/api/src/server.ts`)

> **Conformidade verificada 2026-06-26** contra `webapp/docs/ARCHITECTURE.md` (mapa autoritativo), `webapp/docs/TOOLS.md`, `webapp/docs/EXPORT-STANDARD.md` e `webapp-01/README.md` (atualizados 24-26/06). Sem contradições com este plano. Mapa autoritativo das peças (engine↔worker↔rota↔id↔profile↔Dockerfile): `webapp/docs/ARCHITECTURE.md` §"Registro de ferramentas". Frontend Vite do webapp = porta **5176** (irrelevante p/ o gateway; OneClick tem frontend próprio). **Sempre subir com `--build`** (imagens pré-refactor `engines/` de 2026-06-22 quebram com `spawn node ENOENT`).
>
> **Detalhes novos a preservar (dos docs atualizados):**
> - **SPED** agora exporta a coluna **`_LINHA`** (nº da linha no `.txt` original); o **`sped-merge` EXIGE** o XLSX com `_LINHA` (mescla de volta preservando linhas fora da planilha). A página SPED do OneClick deve manter esse comportamento de ponta a ponta.
> - **`EXPORT-STANDARD.md`** (novo, autoritativo): todo `.xlsx` do sistema segue um padrão visual único (cabeçalho **Azul Royal `4169E1`** branco negrito, dados `1A1A1F`, Calibri 11, tudo centralizado, alturas **30/30 cabeçalho / 22 dados**, bordas `thin CECECE` nos 4 lados, gridlines off, freeze da linha 1, números/datas como valor real, nome de arquivo `<Relatório> - <id> - <AAAA-MM-DD>.xlsx`). Ref. = `webapp-01/frontend/src/extratoEdit/exportExtrato.ts`. **As engines job-based já conformam** (output passa intacto pelo proxy). **Relevante na Fase 3**: qualquer export ExcelJS portado (relatório de retenção do `nfse-pdf`, export do `extrato-edit`) deve continuar conforme.
> - **`extrato-edit` ampliou escopo**: além do parse/export no navegador, importa cadastro reconhecendo **exports Totvs/Winthor PC** (`PCCLIENT`/`PC_FORNEC`: `CODCLI`/`CODFORNEC`, `CLIENTE`/`FORNECEDOR`, `CGCENT`/`CGC`, cabeçalho multi-linha, dados a partir da 5ª linha) **ou** planilha simples Código/Nome/CNPJ, com **tipo auto-detectado**; guarda só `(tipo, código, nome, CNPJ)` (PK `(tipo,código)`). Processa relatório **"Contas Pagas" do SIST**: colapsa células mescladas, **explode a data das linhas `DT. PAGAMENTO:`** numa coluna à esquerda, descarta preâmbulo/totais, reordena colunas por arrasto, vincula **CNPJ pelo `Cód. Cliente`/`Cód. Fornecedor`**. O port da Fase 3 precisa carregar tudo isso (`parseExtrato.ts`, `parseRegistry.ts`, `exportExtrato.ts`, `registryApi.ts`, `RegistryModal.tsx`).

Padrão geral de job: `POST … /jobs` (multipart) → `{ id, status:"queued" }` (202) → `GET …/jobs/:id` → `{ status, progress?, downloadToken?, fileName?, error?, result? }` → `GET …/jobs/:id/download?token=<jwt>` → stream do arquivo.

- **Status** ∈ `queued | running | done | failed | not_found`. `downloadToken` só aparece quando `status==="done"`.
- **Token** (`webapp-01/apps/api/src/tokens.ts`): JWT **HS256**, payload `{ jobId, fileName, tool }`, **exp 15min**, assinado com `JWT_SECRET`. `tool` é enum (`nfe|sped|sped-merge|sci-consolidado|comparacao-planilhas|comparacao-nfse|gnre|sci-portal-nacional`). Download valida `tool` da rota == `tool` do token.
- **Limites:** `MAX_UPLOAD_MB=50` (nfe/sped/sci/comparacao-planilhas/sci-portal), `MAX_UPLOAD_NFSE_MB=300` (comparacao-nfse/gnre), `MAX_XML_FILES=5000`.
- **Health:** `/api/v1/health`, `/api/v1/ready`; `comparacao-nfse` tem `/api/v1/tools/comparacao-nfse/health` (circuit breaker).
- **Manifest:** `GET /api/v1/tools`.

#### Inventário das 8 job-based (rota, campos, particularidades)

| tool | criar job | campos multipart | pré-passos / extras | output | profile docker |
|---|---|---|---|---|---|
| **nfe** | `POST /api/v1/jobs` *(genérica, sem `/tools/`)* | arquivos `.xml`/`.zip` (sem nome de campo) | — | xlsx multi-aba | core (sempre) |
| **sped** | `POST /api/v1/tools/sped/jobs` | `file` `.txt` + fields `sheets` (CSV REGs), `presentRegs` (JSON) | `POST /tools/sped/inspect` (valida REGs); `GET /tools/sped/reg-meta` (descrições p/ UI) | `SPED_<razao>_<data>.xlsx`, ~11 abas | `sped` |
| **sped-merge** | `POST /api/v1/tools/sped-merge/jobs` | `xlsx` (.xlsx/.xlsm) + `sped` (.txt, às vezes exigido) | `POST /tools/sped-merge/inspect-xlsx` (síncrono; detecta planilha dinâmica → `requiresOriginal`) | `SPED_mesclado.txt` | `sped` |
| **sci-consolidado** | `POST /api/v1/tools/sci-consolidado/jobs?sheet=<nome>` | 1 arquivo `.csv/.txt/.xlsx/.xls` | query `sheet` opcional | `ProdutosSCI.xlsx`, 3 abas | core (sempre) |
| **comparacao-planilhas** | `POST /api/v1/tools/comparacao-planilhas/jobs` | `sefaz` (1+ arq) + `sci` (1+ arq) | exige ≥1 em cada | `Notas Faltantes.xlsx` | `comparacao` |
| **comparacao-nfse** | **multi-step:** `POST …/jobs` → `{id}` (201); `POST …/jobs/:id/chunk` (envia `pdfs`+`xmls` em lotes, até 300MB/chunk); `POST …/jobs/:id/start` | `pdfs` (.pdf/.jpg/.png) + `xmls` (.xml) | **Gemini OCR** + **circuit-breaker** (`/health`); dedupe; `result` rico | `Comparacao NFSE - <tomador> - <data>.xlsx` | `nfse` (+ `GEMINI_API_KEY`) |
| **gnre** | `POST /api/v1/tools/gnre/jobs` | múltiplos `.pdf` (até 300MB) | **dedupe SQLite** (volume `gnre-data`) | `GNRE_Extracao.xlsx`, 2 abas (Lançamentos/Falhas) | `gnre` |
| **sci-portal-nacional** | `POST /api/v1/tools/sci-portal-nacional/jobs` | `sci` (1 arq) + `portal` (1 arq) | engine Node puro | `Conciliacao SCI x Portal Nacional.xlsx`, 6 abas | `comparacao` |

> ⚠️ **Heterogeneidade**: `nfe` usa rota genérica; `comparacao-nfse` é multi-step (init/chunk/start); `sped`/`sped-merge` têm pré-passo de inspeção. O gateway precisa ser **config-driven por ferramenta** (ver §3.3).

#### As 2 browser-only

- **nfse-pdf** (`webapp-01/frontend/src/nfsePdf/`): TS puro com PDFMake. Módulos: `parseNfse.ts`, `danfseDoc.ts`, `eventoDoc.ts`, `pdf.ts`, `generateZip.ts` (JSZip), `format.ts`, `qr.ts`, `retencaoReport.ts`, `municipios.ts/json`, `nfseEnums.ts`, `logoData.ts`. **Sem backend.**
- **extrato-edit** (`webapp-01/frontend/src/extratoEdit/`): `parseExtrato.ts`, `parseRegistry.ts`, `registryApi.ts`, `exportExtrato.ts` (OFX/XLSX via ExcelJS), `RegistryModal.tsx`. Usa **SQLite no servidor** via endpoints `/api/v1/tools/extrato-edit/{entidades,entidades/counts,entidades/import,lookup,entidades/item}` (`webapp-01/apps/api/src/extrato-db.ts`, volume `extrato-data`). Fase 1: manter o registro via proxy; portar SQLite→Prisma fica p/ depois.

#### Subir o webapp
```
cd D:\aplicativos\webapp
docker compose --profile sped --profile comparacao --profile nfse --profile gnre up -d
```

---

## 2. Arquitetura alvo

```
Browser (OneClick web, Next.js)
  │  fetch + FormData (upload) / polling de status / download
  ▼  via rewrite /be/* → API
OneClick API (NestJS, :8050)
  │  ferramentas.controller.ts (REST multipart) — auth + permissão da ÁREA do tool (ferramentas-fiscal/-contabil) + tenancy
  │  cria/atualiza ToolJob (Prisma, escopo empresaId/userId)         [histórico/auditoria]
  │  webapp-gateway.service.ts — fetch() server-to-server, config-driven por tool
  ▼
Webapp API (Fastify, :8000, /api/v1) → BullMQ/Redis → worker → engine (Python/Node)
  ▲  GET status (recebe downloadToken JWT) → OneClick faz STREAM do download ao browser
```

Pontos-chave:
- O **downloadToken nunca vaza** ao browser: OneClick recebe do webapp e usa server-side para puxar o arquivo e repassar em stream.
- OneClick **não** instala BullMQ; só guarda `ToolJob` por tenant. Fila real fica no webapp.
- Um único `WEBAPP_API_URL` (default `http://192.168.0.47:8000`) no `.env` + `docs/ENV.md`.
- **nfse-pdf** e **extrato-edit** são páginas nativas (sem gateway), exceto o registro SQLite do extrato (proxiado na fase 1).

---

## 3. Plano por fases (TDD: red → green → refactor)

### Fase 0 — Bootstrap de testes (BLOQUEANTE)

**apps/api (Jest):** add `jest ts-jest @types/jest @nestjs/testing`; `apps/api/jest.config.js` (`preset: ts-jest`, `testRegex: '.*\\.spec\\.ts$'`, `testEnvironment: node`, `moduleNameMapper` p/ `@saas/*`); scripts `test`, `test:watch`, `test:cov`. Smoke spec verde.
**apps/web (Vitest + RTL):** add `vitest @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react`; `apps/web/vitest.config.ts` (`environment: jsdom`, alias `@/`, setup com jest-dom); script `test`. Smoke spec verde.
**Turbo:** task `test` em `turbo.json` (`"test": { "dependsOn": ["^build"], "outputs": [] }` ou sem deps p/ unit).
**Gate:** documentar em `docs/error-registry.md` que entrega agora exige `pnpm test` verde **além** de `tsc --noEmit` + `curl health` 200.

✅ **Saída:** `pnpm test` verde em api e web com specs-exemplo.

---

### Fase 1 — Piloto gateway ponta-a-ponta: **SPED**

SPED é o caso mais completo (upload + campos opcionais + pré-passo inspect + progresso + download) → vira template das outras 7.

**Ordem TDD:**

1. **`packages/types/src/ferramentas.ts`** — Zod compartilhado:
   `toolIdSchema` (enum dos 10 ids), `toolJobStatusSchema` (`queued|running|done|failed|not_found`),
   `toolJobResponseSchema` (`{ id, code, tool, status, fileNameIn, fileNameOut?, progress?, errorMessage?, createdAt }`),
   `listToolJobsSchema extends paginationSchema` (`{ tool?, status?, search? }`),
   `spedInspectSchema`, `spedCreateFieldsSchema` (`{ sheets?: string[], presentRegs?: string[] }`).
   Exportar em `packages/types/src/index.ts`.
   **Spec:** parse aceita/rejeita; enum cobre os 10 ids.

2. **Prisma** — em **schema de tenant** (`packages/db/prisma/schema.prisma`):
   ```prisma
   model ToolJob {
     id           String    @id @default(cuid())
     code         Int       @default(autoincrement())
     tool         String
     status       String    @default("queued")
     webappJobId  String?   @map("webapp_job_id")
     fileNameIn   String    @map("file_name_in")
     fileNameOut  String?   @map("file_name_out")
     progress     Int       @default(0)
     errorMessage String?   @map("error_message")
     empresaId    String?   @map("empresa_id")
     userId       String?   @map("user_id")
     version      Int       @default(1)
     deletedAt    DateTime? @map("deleted_at")
     createdAt    DateTime  @default(now()) @map("created_at")
     updatedAt    DateTime  @updatedAt @map("updated_at")
     eventos      ToolJobEvent[]
     @@map("tool_jobs")
   }
   model ToolJobEvent {
     id        String   @id @default(cuid())
     toolJobId String   @map("tool_job_id")
     toolJob   ToolJob  @relation(fields: [toolJobId], references: [id], onDelete: Cascade)
     userId    String?  @map("user_id")
     type      String   // created | status-change | deleted | restored
     status    String?
     version   Int
     createdAt DateTime @default(now()) @map("created_at")
     @@map("tool_job_eventos")
   }
   ```
   `empresaId`/`userId` são **escalares sem `@relation`** (evita editar User/Empresa e bate com o clone por `LIKE`); relação só entre as 2 tabelas novas.
   ⚠️ **Provisionamento multi-tenant (CRÍTICO — não é `multiSchema`):** o `schema.prisma` é único → `db:push` cria as tabelas só no **`public`**. Para os tenants:
   - `pnpm --filter @saas/db db:generate` + `db:push` (mostrar diff; **nunca** reset/`--accept-data-loss`).
   - Adicionar `'tool_jobs'` e `'tool_job_eventos'` (nessa ordem) em `TENANT_TABLES` (`packages/db/src/tenant-manager.ts`) → tenants **NOVOS** recebem via `createTenantSchema`.
   - **Backfill dos tenants EXISTENTES:** script (`packages/db/prisma/backfill-tool-jobs-tenants.ts`) que itera `listTenantSchemas()` e roda `CREATE TABLE (LIKE public.… INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES)` + sequence `tool_jobs_code_seq` por schema. (`LIKE` não copia FK — integridade no app, padrão da casa.)
   **Spec (TDD):** `TENANT_TABLES` contém as 2 tabelas com `tool_jobs` antes de `tool_job_eventos`. Detalhes em memória `oneclick-multitenant-provisioning`.

3. **`apps/api/src/ferramentas/webapp-gateway.service.ts`** — cliente HTTP do webapp (`fetch` nativo, padrão `cnpj.service.ts`). **Config-driven** (ver §3.3): `createJob(tool, files, fields)`, `getStatus(tool, webappJobId)`, `streamDownload(tool, webappJobId, token)`, e suporte a pré-passos (`inspect`/`inspect-xlsx`) e fluxo multi-step (`nfse`). Lê `WEBAPP_API_URL`.
   **Spec (mock global `fetch`):** monta multipart correto por tool; encaminha campos opcionais (sheets/presentRegs); mapeia 4xx/5xx em erro tratado; repassa `downloadToken`; respeita rota genérica do `nfe` vs `/tools/<id>`.

4. **`apps/api/src/ferramentas/ferramentas.service.ts`** — orquestra: cria `ToolJob` (escopo `empresaId/userId`, dentro de `scoped(tenantSchema, …)`), chama gateway, atualiza status + emite `ToolJobEvent`, `list/listTrash/restore/delete` por tenant (padrão `cliente.service.ts`).
   **Spec (`Test.createTestingModule`, gateway+prisma mockados):** isolamento por empresa (`empresaFilter`); criação grava evento `created`; mudança de status grava `status-change`; `list` filtra `deletedAt:null` + empresa.

5. **`apps/api/src/ferramentas/ferramentas.controller.ts`** — REST (Multer, espelha `upload.controller.ts`, **limite elevado** p/ tools grandes — ver §4 risco):
   `POST /api/tools/:tool/jobs` (multipart → service), `GET /api/tools/:tool/jobs/:id` (status), `GET /api/tools/:tool/jobs/:id/download` (stream), `POST /api/tools/:tool/inspect` (pré-passo genérico). Guard de auth + **permissão da ÁREA do tool**: derivar `area` do `:tool` via `TOOL_ADAPTERS` (§3.3) e checar `ferramentas-fiscal`/`ferramentas-contabil` (+ sub-perm do tool). Tool desconhecido → 404.
   **Spec:** rejeita não autenticado / sem permissão da área / sem sub-perm do tool; valida extensão/limite; encaminha ao service.

6. **`apps/api/src/ferramentas/ferramentas.router.ts`** (tRPC, só leitura): `list`, `getById`, `listTrash`, `restore`, `metadata`. Input recebe `area` (ou deriva do `tool`); gateado por `readProcedureAnyOf('ferramentas-fiscal','ferramentas-contabil')` e o service filtra pela área/tool a que o usuário tem acesso. `restore` via `deleteSubProcedure`. Upload/download/inspect ficam no controller REST.
   **Spec:** `createCaller` chama service com `ctx.empresaId/tenantSchema`; respeita área.

7. **Wiring backend** (§1.1, 3 pontos) + registrar controller em `ferramentas.module.ts`. **Gate de boot** (HTTP 200) após.

8. **Frontend** `apps/web/src/app/(dashboard)/ferramentas/fiscal/sped/page.tsx` (rota `/ferramentas/fiscal/sped`):
   - **`<PageHeader>`** com cor do bloco (`var(--mod-fiscal)`), ícone/título; aba "Histórico" via `children`/`SlidingTabsList`.
   - Upload via `fetch + FormData` (`credentials:'include'`) → `/api/tools/sped/jobs` (ou `/be/tools/...` via rewrite); barra de progresso por **polling** de `GET status`; botão download (stream do OneClick).
   - Antes de enviar: chamar `inspect` p/ mostrar REGs presentes e seleção de `sheets` (preserva o `SpedHomePage.tsx`; manter coluna `_LINHA` no fluxo).
   - Aba **Histórico de jobs** (tabela padrão: `SortHead`, paginação server-side, ⋮). Modais com `DialogHeaderIcon`.
   **Spec (Vitest+RTL):** render da página; fluxo de upload mockado; render do histórico.

9. **`/padroniza-modulo`** na página da ferramenta — auditar e corrigir não-conformidades 🔴 antes de declarar pronto.

10. **Registro:** em `navigation.ts`, adicionar o **subitem "Ferramentas"** no `NavGroup` **Fiscal** com `subItems` (SPED no piloto), `href` `/ferramentas/fiscal`; permissão `ferramentas-fiscal` + sub-perm `sped` em `docs/MODULOS.md` (sob o bloco Fiscal). **Sem** novo NavGroup/cor.

✅ **Saída Fase 1:** SPED funciona ponta-a-ponta dentro do OneClick (upload→processa no webapp→download), testes verdes, gate de boot 200, `/padroniza-modulo` limpo, webapp rodando em paralelo.

---

### Fase 2 — Replicar gateway para as outras 7 job-based

Mesma espinha; o controller/service/gateway são **genéricos por `tool`** (§3.3). Por ferramenta: ajustar config do adapter (incl. `area`) → página `ferramentas/<area>/<tool>/page.tsx` (migrar UI específica do `*HomePage.tsx`) → adicionar o tool no `subItems` do bloco correto em `navigation.ts` + sub-perm em `docs/MODULOS.md` → specs → `/padroniza-modulo`.

Ordem sugerida (do mais simples ao mais complexo): `sci-consolidado` (Fiscal) → `nfe` (Fiscal) → `comparacao-planilhas` (Fiscal) → `sci-portal-nacional` (Fiscal) → `gnre` (**Contábil** — cria o subitem "Ferramentas" no bloco Contábil + slug `ferramentas-contabil`) → `sped-merge` (Fiscal) → `comparacao-nfse` (Fiscal, multi-step + Gemini, por último).

Particularidades a preservar por tool: ver tabela §1.2. Área (menu) de cada tool: ver §0 decisão 2.

---

### Fase 3 — Port nativo das 2 browser-only

- **nfse-pdf:** (bloco **Fiscal**) copiar `webapp-01/frontend/src/nfsePdf/*` → `apps/web/src/app/(dashboard)/ferramentas/fiscal/nfse-pdf/_lib/`; adaptar imports; re-skinnar a página. Entrada por **pasta** (picker nativo + fallback `webkitdirectory`). Preservar fidelidade NT-008 (DANFSe) / NT-007 (retenções), painel de retenções + relatório `.xlsx` **conforme `EXPORT-STANDARD.md`**. **TDD forte** (lógica pura): specs Vitest sobre `parseNfse`, `format`, `retencaoReport`, geração de nome — antes/junto do port.
- **extrato-edit:** (bloco **Contábil**) copiar `extratoEdit/*` (parse/export/registry/RegistryModal) → `apps/web/src/app/(dashboard)/ferramentas/contabil/extrato-edit/_lib/`; manter o escopo ampliado (import Totvs/Winthor PC + "Contas Pagas" SIST + explosão de data + vínculo de CNPJ por código). Export deve seguir `EXPORT-STANDARD.md`. O registro de entidades continua via **proxy do gateway** p/ os endpoints `/tools/extrato-edit/*` na fase 1 de dados; porte SQLite→Prisma (model `EntidadeExtrato` por tenant, PK `(tipo,código)`) fica p/ fase posterior. Specs sobre `parseExtrato`/`exportExtrato`/`parseRegistry`.

---

## 3.3 Design do gateway (config-driven por ferramenta)

Para absorver a heterogeneidade do webapp sem `if/else` espalhado, definir um mapa `TOOL_ADAPTERS` no gateway:

```ts
type ToolAdapter = {
  area: 'fiscal' | 'contabil'                    // bloco/menu + slug RBAC (ferramentas-<area>) + cor (--mod-<area>)
  // rota de criação relativa a /api/v1
  createPath: (id?: string) => string          // nfe: () => '/jobs'; sped: () => '/tools/sped/jobs'
  basePath: string                              // p/ status/download: '/jobs' ou '/tools/sped/jobs'
  fields: { name: string; multiple: boolean }[] // campos multipart esperados
  query?: (fields) => Record<string,string>     // sci-consolidado: { sheet }
  flow: 'single' | 'multi-step'                 // comparacao-nfse = multi-step (init→chunk→start)
  preStep?: 'sped-inspect' | 'sped-merge-inspect' | null
  uploadLimitMb: 50 | 300
}
// area: fiscal = nfe,sped,sped-merge,sci-consolidado,comparacao-planilhas,comparacao-nfse,sci-portal-nacional,nfse-pdf
// area: contabil = gnre, extrato-edit
// TOOL_ADAPTERS é a fonte única: o controller deriva o slug RBAC dela; a página usa area p/ cor/rota; o menu, p/ o bloco.
```

- **status:** `GET ${basePath}/${webappJobId}` → repassa `status/progress/fileName`; quando `done`, guarda `downloadToken` em memória/registro do job (curto, exp 15min) e marca `ToolJob` done.
- **download:** `GET ${basePath}/${webappJobId}/download?token=${downloadToken}` → **stream** direto ao `Response` do controller (não bufferizar em disco).
- **multi-step (nfse):** `createJob` faz `POST …/jobs` → guarda id → expõe `uploadChunk` → `start`.

Isso mantém **um** service/controller para as 8, parametrizado.

---

## 4. Riscos e atenção

- **Upload grande (até 300MB)**: o Multer atual do OneClick é 20MB e grava em disco. Para o gateway, **elevar o limite** e preferir **streaming** do multipart direto ao webapp (evitar bufferizar 300MB em memória; usar disco temporário + stream, ou `undici`/`form-data` com ReadStream). Validar `MAX_SIZE` por tool via adapter. **Risco técnico principal.**
- **DI do Nest** não é pega por typecheck → **sempre** rodar gate de boot (`curl health` 200) após wiring.
- **Windows: lock da DLL do Prisma** — `prisma generate` falha com `EPERM rename query_engine-windows.dll.node` enquanto a API (`apps/api/dist/main`) está rodando (ela segura a DLL). `db push` em si funciona. Para regenerar o client (necessário quando o schema muda, ex.: passo 4 usar `ToolJob`): parar a API, `pnpm --filter @saas/db exec prisma generate`, deixar o watcher relançar.
- **Prisma schema-per-tenant**: confirmar que `ToolJob`/`ToolJobEvent` entram no schema de **tenant** (onde estão os models de domínio). Usar `db:push`, mostrar diff, **nunca** reset.
- **comparacao-nfse**: precisa `GEMINI_API_KEY` no webapp e tem circuit-breaker → proxiar também `/health`; tratar `429`/circuit aberto com mensagem amigável.
- **Token 15min**: download precisa acontecer dentro da janela; OneClick busca o token no `getStatus` e usa logo.
- **Rede/intranet**: a API do OneClick precisa alcançar `WEBAPP_API_URL` (mesma máquina/intranet). Webapp continua sem auth própria, protegido por estar atrás do OneClick.
- **Não-regressão**: a UI Vite antiga do webapp segue funcionando em paralelo; nenhuma engine/worker é alterada.

---

## 5. Arquivos (novos / tocados)

**Novos — apps/api:** `src/ferramentas/{ferramentas.module,ferramentas.service,ferramentas.router,ferramentas.controller,webapp-gateway.service}.ts` + `*.spec.ts`.
**Novos — packages:** `packages/types/src/ferramentas.ts`; models `ToolJob`/`ToolJobEvent` em `packages/db/prisma/schema.prisma`.
**Novos — apps/web:** `src/app/(dashboard)/ferramentas/<area>/<tool>/page.tsx` (10, ex.: `fiscal/sped`, `contabil/gnre`) + `_components/*` + `_lib/*` (browser tools) + specs. (Opcional: landing `ferramentas/<area>/page.tsx` listando os tools da área.)
**Tocados:** `apps/api/src/trpc/trpc.module.ts`, `trpc.service.ts`; `packages/types/src/index.ts`; `apps/web/src/lib/navigation.ts` (subitem "Ferramentas" + `subItems` nos blocos Fiscal/Contábil — **sem** novo NavGroup/GROUP_HEX/cor); `docs/MODULOS.md` (slugs `ferramentas-fiscal`/`ferramentas-contabil` + sub-perms por tool, sob os blocos respectivos); `docs/ENV.md` + `.env` (`WEBAPP_API_URL`); `turbo.json`; configs de teste (jest/vitest) + `package.json` scripts. **Reaproveita** cor dos blocos (`--mod-fiscal`/`--mod-contabil`) — `theme.service.ts`/`module-colors.tsx` **não mudam**.

**Reuso (não reinventar):** `scoped`/`withTenant`/`empresaFilter`/`getPrismaSkipTake`/`buildPaginatedResponse` (`@saas/db`); `readProcedure`/`writeProcedure`/`writeSubProcedure`/`deleteSubProcedure` (`trpc.service.ts`); Multer (`upload.controller.ts`); `fetch` nativo (`cnpj.service.ts`); no web: `DialogHeaderIcon`, header inline de `orcamentos`, `SortHead`/tabela, `useUserPermissions`, `alerts`.

---

## 6. Verificação (end-to-end)

1. **Unit:** `pnpm test` (api Jest + web Vitest) verde — specs escritos antes (TDD).
2. **Gate api** (`docs/error-registry.md`): `cd apps/api && npx tsc --noEmit | grep ferramentas` limpo; subir API e `curl -s -o /dev/null -w "HTTP %{http_code}\n" http://192.168.0.58:4000/api/health` (ou host/porta reais) → **200**.
3. **Webapp no ar:** `docker compose --profile sped … up -d`; `WEBAPP_API_URL` apontando p/ a API Fastify.
4. **Manual (piloto SPED):** logar com usuário com permissão `ferramentas-fiscal` (sub-perm `sped`) → bloco **Fiscal → Ferramentas → SPED** (`/ferramentas/fiscal/sped`) → inspect → subir `.txt` → progresso → baixar `.xlsx` → job aparece no histórico **escopado à empresa** (outro tenant não vê). Conferir também que o subitem "Ferramentas" **não aparece** p/ usuário sem a permissão da área.
5. **Padronização:** `/padroniza-modulo` na página da ferramenta sem 🔴.
6. **Não-regressão:** UI Vite antiga do webapp segue funcionando em paralelo.
