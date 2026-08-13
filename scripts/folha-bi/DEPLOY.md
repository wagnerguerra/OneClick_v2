# Deploy do `folha_dash` em produção (folha-bi)

> **Por que este doc existe:** ao publicar o OneClick, a pasta do app foi copiada, mas o banco
> **`folha_dash`** (o Postgres separado que o backend lê via `FOLHA_DASH_URL`) **não foi
> recriado**. Sintoma: matriz/INSS/FGTS/IRRF funcionam (leem o *cache* `folha_bi_cache`), mas a
> **configuração de agrupamento de verbas** e a **planilha de custos (Excel)** falham com
> `connect ECONNREFUSED …:5433` — porque esses dois leem o `folha_dash` direto.

## Os dois bancos (por que só dois painéis quebram)

```
ETL (importar_empresa)                                   OneClick (backend)
  Firebird/SCI ─►  folha_dash  ─(oneclick_upload)─►  folha_bi_cache  ◄─ matriz/INSS/FGTS/IRRF
                 (Postgres, FOLHA_DASH_URL)           (saas_erp)
                      ▲
                      └── config de agrupamento (classif_*) + planilha Excel (views folha_*) ◄─ backend
```

- **`folha_bi_cache`** (dentro do `saas_erp`): snapshots enviados pelo upload → alimenta os painéis principais.
- **`folha_dash`** (Postgres dedicado, `FOLHA_DASH_URL`): **config de agrupamento** e **planilha de custos**
  leem daqui. É este que faltou criar em produção.

## Passo a passo (produção)

Ordem: **schema → classes → config (#39) → dados por empresa → resolver**.

### 1) Criar o schema  ·  `folha_dash_schema.sql`

Num Postgres alcançável pelo backend na URL do `FOLHA_DASH_URL`:

```bash
createdb folha_dash_db        # se ainda não existe
psql "$FOLHA_DASH_URL" -f scripts/folha-bi/folha_dash_schema.sql
```

Idempotente. Cria o schema `folha_dash` (`dim_*`/`fato_*`/`classif_*`/`inss_*`), as views
`public.folha_*` que o backend consome, e a engine de agrupamento
(`resolver_todos()`/`resolver_esquema()` + a ponte `dim_verba_grupo`).

> Alternativa (se houver Python + `psycopg` num host que alcança o `folha_dash`): no **repo do ETL**
> `SUPABASE_DB_URL=$FOLHA_DASH_URL python setup_supabase.py` — faz o schema **e** já carrega
> `dim_classe` (passo 2) de uma vez.

### 2) Carregar a lista mestra de classes  ·  `dim_classe`

Necessária para o agrupamento resolver. Se usou `setup_supabase.py` no passo 1, já veio junto. Senão,
no **repo do ETL** (Folhas_Pagamento):

```bash
SUPABASE_DB_URL=$FOLHA_DASH_URL python carregar_classes.py
```

### 3) Semear a config de agrupamento (#39)  ·  `seed-agrupamentos.sql`

```bash
psql "$FOLHA_DASH_URL" -f scripts/folha-bi/seed-agrupamentos.sql
```

### 4) Popular os dados por empresa  ·  `dim_*`/`fato_*`

Pelo ETL, **apontando `SUPABASE_DB_URL` para o MESMO `folha_dash` que o backend lê**:

```bash
SUPABASE_DB_URL=$FOLHA_DASH_URL SCI_PASSWORD=… python importar_empresa.py --todas 202607
# (ou pelo launcher/Service Manager, contanto que ele escreva neste mesmo folha_dash)
```

### 5) Materializar a ponte verba→grupo

Depois que houver empresas (passo 4) e a config (passo 3):

```sql
select folha_dash.resolver_todos();      -- ou clique "Aplicar (resolver)" no painel de Verbas
select count(*) from folha_dash.dim_verba_grupo;   -- deve ter linhas
```

## ⚠ Ponto de infra que provavelmente causou o problema

O backend lê o `folha_dash` em `process.env.FOLHA_DASH_URL` (default `…@127.0.0.1:5433/folha_dash_db`).
**Dois requisitos que precisam ser verdadeiros ao mesmo tempo:**

1. `FOLHA_DASH_URL` (no ambiente do backend) aponta para um Postgres que **existe e está de pé**.
2. O **ETL escreve nesse mesmo Postgres** (mesma `SUPABASE_DB_URL`). Se o ETL/launcher rodou contra
   um `folha_dash` local (na máquina da LAN) e o backend lê outro, os painéis de grupo/Excel ficam
   vazios **mesmo com o schema criado**.

Conferência rápida em produção:

```bash
psql "$FOLHA_DASH_URL" -c "select nome from folha_dash.classif_esquema;"    # 'Verbas Fixos/Variáveis'
psql "$FOLHA_DASH_URL" -c "select count(*) from public.folha_verba_det;"    # > 0 (tem dados de empresa)
psql "$FOLHA_DASH_URL" -c "select count(*) from folha_dash.dim_verba_grupo;"  # > 0 (ponte resolvida)
```

## Diagnóstico do bug do Excel (silencioso)

O botão da planilha usa `folhaBi.planilhaCustos`, que lê as views `public.folha_*` do `folha_dash`.
Hoje o front engole o erro (`catch {}`), então quando o endpoint falha o botão "não faz nada". Com o
`folha_dash` criado e populado (passos acima), volta a funcionar. Melhoria opcional (fora do escopo
deste deploy): trocar o `catch {}` por uma mensagem visível para não esconder falhas futuras.

## Como o `folha_dash_schema.sql` é gerado

No repo do ETL: `python gerar_schema_sql.py` — concatena, na ordem do `setup_supabase.py`:
roles → `supabase_modelo_dimensional.sql` → deltas de tabelas → views `folha_*`
→ `supabase_classificacao_v2.sql` → `supabase_classif_v3.sql`. Regenere e re-commite se o schema mudar.
