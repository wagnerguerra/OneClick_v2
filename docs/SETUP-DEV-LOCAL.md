# Setup do ambiente de dev local — do zero

Guia para levantar o ambiente de desenvolvimento **exatamente** no estado final que
usamos: banco com schema limpo, **sua empresa + usuário** criados via onboarding, o
usuário como **Master + EmpresaMaster** e **sem trial**, os **seeds** de catálogo
populados na sua empresa, e o **`gh`** pronto para abrir PRs.

Serve para humano seguir passo a passo **e** para direcionar o Claude Code a recriar
tudo numa máquina nova. Comandos são para **Git Bash** (o projeto usa Bash como shell
de apoio no Windows); onde for PowerShell, está marcado.

> **Convenção de portas (dev):** API `8050`, Web `5181`, Postgres `5435`, Redis `6380`,
> Mailpit `1025` (SMTP) / `8025` (web). O front assume a API em `host:8050` em dev
> (`apps/web/src/lib/api-url.ts`).

---

## 0. Pré-requisitos

- **Node ≥ 20** (testado com 24) e **Docker Desktop rodando**.
- **Git** e o repositório clonado; entrar na raiz do projeto.
- **pnpm** vem via corepack (passo 1). Não instalar pnpm global à mão.

---

## 1. pnpm (corepack) + o gotcha do `store-dir`

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate   # versão do "packageManager" no package.json
pnpm -v                                     # confirma
```

> ⚠️ **Gotcha (por máquina):** o `.npmrc` versionado fixa `store-dir=D:\.pnpm-store`
> (a máquina original tem um drive `D:`). Se a sua **não tem `D:`**, `pnpm install`
> quebra com `ENOENT: mkdir '\\?'`. **Não** edite o `.npmrc` versionado — sobrescreva
> por variável de ambiente de usuário (maior precedência, persiste, reversível):
>
> ```powershell
> # PowerShell
> New-Item -ItemType Directory -Force -Path "C:\Users\<voce>\.pnpm-store" | Out-Null
> setx npm_config_store_dir "C:\Users\<voce>\.pnpm-store"
> ```
> Abra um novo shell (ou exporte na sessão) e confira: `pnpm config get store-dir`.

---

## 2. Infra (Postgres + Redis + Mailpit)

```bash
docker compose up -d
docker compose ps          # os 3 devem ficar "Up"
```

- Postgres `saas-postgres` → host `5435` (DB `saas_erp`, user/senha `postgres`/`postgres`).
- Redis `saas-redis` → host `6380`.
- Mailpit `saas-mailpit` → SMTP `1025`, interface web em http://localhost:8025
  (captura todos os e-mails de dev — verificação de conta, magic link etc.).

---

## 3. Arquivos `.env` (não versionados)

Crie **`apps/api/.env`**:

```env
# Banco/cache (Docker local; usar 127.0.0.1, não localhost — Node + IPv6)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5435/saas_erp?schema=public
REDIS_URL=redis://127.0.0.1:6380

# Porta da API — 8050 é o que o front assume em dev
PORT=8050

# Auth (Better Auth) — gere um segredo aleatório (comando abaixo)
BETTER_AUTH_SECRET=<cole-aqui>
BETTER_AUTH_URL=http://localhost:8050

# URLs
NEXT_PUBLIC_APP_URL=http://localhost:5181
API_URL=http://localhost:8050

# E-mail via Mailpit (captura local)
SMTP_HOST=127.0.0.1
SMTP_PORT=1025

# Opcionais em dev (deixe vazio para desabilitar): Stripe, S3, Resend, Google, etc.
WEBAPP_API_URL=http://localhost:8000
GOOGLE_DRIVE_SYNC_ENABLED=false
```

Gerar o `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Crie **`apps/web/.env.local`**:

```env
NEXT_PUBLIC_API_URL=http://localhost:8050
NEXT_PUBLIC_APP_URL=http://localhost:5181
```

Referência completa de envs: `docs/ENV.md`.

---

## 4. Dependências + Prisma Client

```bash
pnpm install
pnpm --filter @saas/db exec prisma generate   # gera o client em packages/db/src/generated/client
```

> ⚠️ O `prisma generate` **não** roda sozinho no `pnpm dev`; sem ele a API não compila
> (`Can't resolve './generated/client'`). Rode-o após o install e após qualquer
> mudança no `schema.prisma`.

---

## 5. Schema do banco — **`prisma db push`** (não `migrate deploy`)

```bash
cd packages/db
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5435/saas_erp?schema=public" \
  pnpm exec prisma db push
cd ../..
```

> ⚠️ **Não use `prisma migrate deploy`**: o histórico de migrations do repo é
> incompleto (ex.: a migration `cnd_municipal_extras` altera uma tabela que nenhuma
> migration cria — produção foi construída com `db push`). Num banco limpo,
> `migrate deploy` falha. Em dev, `db push` sincroniza o banco direto com o
> `schema.prisma` (idempotente; num banco vazio não há perda).

Confira: deve haver ~268 tabelas no `public` e zero linhas.

---

## 6. Subir a aplicação

```bash
pnpm dev        # sobe API (:8050) e Web (:5181) — turbo dispara os dois
```

Validação rápida:

```bash
curl -s -o /dev/null -w "API  %{http_code}\n" http://localhost:8050/api/health   # espera 200
curl -s -o /dev/null -w "WEB  %{http_code}\n" http://localhost:5181/login        # espera 200
```

> Daqui pra frente, no dia a dia, com o Docker de pé é **só `pnpm dev`**.

---

## 7. Criar seu login + empresa (onboarding pela interface)

Como o banco está limpo, **não há usuário** — o primeiro acesso é por **cadastro**:

1. Abra http://localhost:5181 → **Cadastrar**. Crie o usuário com o seu e-mail.
2. O e-mail de verificação (e magic link, se usado) cai no **Mailpit**
   (http://localhost:8025) — abra e confirme por lá.
3. Faça o onboarding de **empresa** (razão social + CNPJ). Isso cria o **tenant**,
   a **empresa**, vincula seu usuário como empresa-master e provisiona o schema do
   tenant.

---

## 8. Tornar seu usuário **Master + EmpresaMaster** e **remover o trial**

Ajuste o e-mail e rode contra o Postgres local (via container, sem `psql` instalado):

```bash
EMAIL="voce@empresa.com"
docker exec -e PGPASSWORD=postgres saas-postgres psql -U postgres -d saas_erp -v ON_ERROR_STOP=1 \
  -c "UPDATE users SET is_master=true, is_empresa_master=true WHERE lower(email)=lower('$EMAIL');" \
  -c "UPDATE tenants SET trial_started_at=NULL, trial_ends_at=NULL \
      WHERE id=(SELECT tenant_id FROM users WHERE lower(email)=lower('$EMAIL'));" \
  -c "SELECT email, is_master, is_empresa_master FROM users WHERE lower(email)=lower('$EMAIL');" \
  -c "SELECT name, status, trial_ends_at FROM tenants;"
```

- `is_master` + `is_empresa_master` = master global **e** master da empresa.
- `trial_*` = `NULL` → isento, nunca expira (o padrão é 7 dias de trial no onboarding).
- **Faça logout/login** depois: o `isMaster` é resolvido no contexto no login.

---

## 9. Popular os seeds (catálogo) **na sua empresa**

> **Pré-requisito:** os seeds de serviços/helpdesk foram adaptados ao schema atual
> (o campo `categoria` virou FK `areaId`, e passaram a escopar por empresa via
> `packages/db/prisma/_seed-target.ts`). Isso vive no PR **#43**
> (`fix/seeds-servico-area-empresa`). **Garanta que esse PR já está na `main`**
> antes de seguir; senão os seeds de serviço falham com `Unknown argument categoria`.

Descubra o **id da sua empresa** e rode os seeds apontando pra ele:

```bash
EMAIL="voce@empresa.com"
EMP=$(docker exec -e PGPASSWORD=postgres saas-postgres psql -U postgres -d saas_erp -t -A \
  -c "SELECT empresa_id FROM users WHERE lower(email)=lower('$EMAIL');")
echo "empresaId = $EMP"

cd packages/db
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5435/saas_erp?schema=public"
export SEED_EMPRESA_ID="$EMP"     # sem isso, o helper usa a empresa mais antiga

for f in \
  seed-servicos-contabeis seed-processo-transferencia \
  seed-segmento-atacadista-lucro-real seed-segmento-comercio-varejo-simples \
  seed-segmento-construcao-civil-presumido seed-segmento-educacao-presumido \
  seed-segmento-holding-presumido seed-segmento-industria-lucro-real \
  seed-segmento-tecnologia-presumido seed-segmento-tecnologia-real \
  seed-segmento-telecomunicacoes-lucro-real \
  seed-helpdesk-ti seed-plano-contas-padrao seed-clausulas-contrato seed-templates-extras; do
  echo "== $f =="; pnpm exec tsx "prisma/$f.ts" || echo "FALHOU: $f"
done
cd ../..
```

Notas:
- Todos são **idempotentes** (upsert). `SEED_EMPRESA_ID` garante que nada fica global.
- `seed-plano-contas-padrao` é **global por design** (a tabela não tem coluna de
  empresa — é um template de DRE compartilhado). É a única exceção ao "nada global".
- `seed-helpdesk-ti` cria a área **"Tecnologia da Informação"** (escopada) e vincula
  as categorias a ela.
- Utilitários que **não** são seeds de dados inicial e devem ser **pulados** num banco
  novo: `backfill-tool-jobs-tenants.ts`, `enable-atacadista-lucro-real.ts`.

Conferência esperada (aprox.): ~120 serviços na sua empresa, 8 áreas, 37 categorias de
helpdesk, 142 linhas de plano de contas — **zero** registros globais (fora o plano de
contas).

---

## 10. `gh` (GitHub CLI) para abrir PRs

`main` é protegida — todo trabalho entra por PR. Instale e autentique o `gh`:

```powershell
winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
```

Autenticação (interativa — fluxo web; rode no seu terminal, digitando o código):

```bash
"/c/Program Files/GitHub CLI/gh.exe" auth login --hostname github.com --git-protocol https --web
```

Fluxo padrão de PR (parte SEMPRE da `main` atualizada):

```bash
git checkout main && git pull
git checkout -b feat/minha-mudanca
# ... commits ...
git push -u origin feat/minha-mudanca
gh pr create --base main --fill
```

> Deploy/publish em produção é **exclusivo do Wagner** (Service Manager,
> `scripts/launcher/`), que mescla o PR na `main` ao publicar. Ver `CLAUDE.md`.

---

## 11. (Opcional) Permitir CRUD no banco **local** ao Claude Code

Em auto mode, o classificador de segurança bloqueia escritas em banco. Para o Claude
rodar `UPDATE/DELETE/db push` no **container local** sem atrito quando **você pedir
explicitamente**, crie `.claude/settings.local.json` (já é gitignored):

```json
{
  "permissions": {
    "allow": [
      "Bash(docker exec -e PGPASSWORD=postgres saas-postgres psql:*)"
    ]
  }
}
```

Escopo restrito ao container `saas-postgres`. Produção nunca entra aqui.

---

## 12. Checklist final (estado desejado)

- [ ] `docker compose ps` → postgres/redis/mailpit **Up**.
- [ ] `curl http://localhost:8050/api/health` → **200**; `http://localhost:5181/login` → **200**.
- [ ] Login funciona; seu usuário existe.
- [ ] `is_master` e `is_empresa_master` = **true**; tenant com `trial_ends_at` **NULL**.
- [ ] Serviços/áreas/helpdesk populados **na sua empresa** (zero global, fora plano de contas).
- [ ] `gh auth status` → logado.

---

## Apêndice A — (Opcional) Popular o banco com dados **reais de produção** (READ-ONLY)

Alternativa ao passo 5+7 quando quiser dados realistas em vez do banco limpo. **Só
leitura em produção** — nunca escrever lá.

- O acesso à VPS (IP, senha, host key, nome do container/DB de produção) fica em
  `hostinger-central` (pasta **local, fora do git**; contém segredos). Ver o
  `README-acesso-prod-db.md` dela.
- Método sem `plink` (só OpenSSH nativo), sem expor a senha:
  1. Fixe o host key verificando o fingerprint com `ssh-keyscan` + `ssh-keygen -lf`
     contra o valor conhecido no README do `hostinger-central`.
  2. Alimente a senha via `SSH_ASKPASS` (script que lê `SENHA_VPS` do `.env` do
     `hostinger-central`) + `SSH_ASKPASS_REQUIRE=force` → ssh não-interativo.
  3. `pg_dump --no-owner --no-privileges --clean --if-exists | gzip -c` no lado
     remoto; restaure com `zcat ... | docker exec -i saas-postgres psql -U postgres -d saas_erp`.
- Produção é **Postgres 17**, local é **16**: o restore de dump plano v17→v16 gera **1
  erro inofensivo** (`unrecognized configuration parameter "transaction_timeout"`).
- Ver também `scripts/db/sync-local-from-prod.md` (usa dump do Backup do sistema).

Para voltar ao banco limpo depois: `DROP DATABASE saas_erp; CREATE DATABASE saas_erp;`
(via `docker exec ... psql -d postgres`) e refaça a partir do passo 5.

---

## Para o Claude Code (ordem e armadilhas)

1. **Ordem:** infra (docker) → pnpm/store-dir → `.env` → `pnpm install` +
   `prisma generate` → `prisma db push` → `pnpm dev` → onboarding (humano cria conta) →
   master flags + trial (SQL) → seeds (com `SEED_EMPRESA_ID`) → `gh`.
2. **`prisma db push`/DROP/UPDATE** são bloqueados pelo classificador em auto mode.
   Com a regra do passo 11 e pedido explícito do usuário, rode direto; senão peça
   para o usuário rodar via `!` ou aprovar. Nunca contorne a trava de forma maliciosa.
3. **Onboarding é humano** (cadastro na UI). O Claude não cria a conta — dependa do
   usuário para esse passo, então continue com as flags/seeds.
4. **Portas:** API em `8050` (não 4000) em dev; Web em `5181`.
5. **Tabelas** são `snake_case` via `@@map` (ex.: `User`→`users`, `Tenant`→`tenants`,
   `Servico`→`servicos`) — use os nomes reais no SQL.
6. **Segredos:** o acesso a produção mora em `hostinger-central` (fora do git). Nunca
   commitar credenciais, IP ou fingerprint aqui.
