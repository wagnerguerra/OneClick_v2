# Provisionamento do `folha_dash` (folha-bi)

Arquivos para recriar o banco **`folha_dash`** em um ambiente novo (produção/publicação):

| Arquivo | O quê |
|---|---|
| **`folha_dash_schema.sql`** | Schema completo (idempotente): tabelas `dim_*`/`fato_*`/`classif_*`/`inss_*`, views `public.folha_*` e a engine de agrupamento (`resolver_todos()` + `dim_verba_grupo`). **Rode este primeiro.** |
| **`seed-agrupamentos.sql`** | Config do esquema "Verbas Fixos/Variáveis" (67 grupos, 689 regras). Rode **depois** do schema. |
| **`DEPLOY.md`** | Guia completo de deploy (schema → classes → seed → dados → resolver) + o ponto de infra do `FOLHA_DASH_URL`. **Comece por aqui.** |

> Contexto do problema: na publicação, a pasta do app foi copiada mas o `folha_dash` não foi recriado.
> Por isso a **config de agrupamento** e a **planilha Excel** (que leem o `folha_dash` direto) quebram com
> `ECONNREFUSED …:5433`, enquanto matriz/INSS/FGTS/IRRF (que leem o *cache*) funcionam. Ver `DEPLOY.md`.

---

# Seed da config de agrupamentos da Folha (`folha_dash`)

`seed-agrupamentos.sql` recria o esquema de agrupamento de verbas **"Verbas Fixos/Variáveis"**
no banco intermediário **`folha_dash`** (o Postgres que o backend do folha-bi lê via
`FOLHA_DASH_URL`). Sem esse esquema, a matriz de Verbas cai tudo em `(outros)` e a
classificação Fixo/Variável/Informativo não aparece.

Contém **67 grupos** (18 de topo) e **689 regras** (prefixo de classe SCI → grupo).

## Como aplicar

Depois de o schema do `folha_dash` já existir (rode antes o `folha_dash_schema.sql`, que cria as
tabelas `classif_esquema` / `classif_grupo` / `classif_regra` do motor de esquemas), rode o seed
contra o `folha_dash`:

```bash
psql "$FOLHA_DASH_URL" -f scripts/folha-bi/seed-agrupamentos.sql
```

- **Idempotente**: apaga e recria o esquema "Verbas Fixos/Variáveis" (não duplica).
- Não usa IDs fixos (as tabelas usam `identity`), então funciona em qualquer `folha_dash`.
- Não depende de Python nem do Excel de origem.

## Depois de aplicar

A "ponte" `dim_verba_grupo` (que liga cada verba ao grupo) é reconstruída pelo
`resolver_todos()`, que o ETL já chama a cada importação. Para forçar na hora:

```sql
select folha_dash.resolver_todos();
```

> Origem do dado: o esquema é mantido no escritório a partir da planilha de classificação de
> verbas (coluna "Topo / Subgrupo") e carregado pelo `montar_esquema_excel.py` no repo do ETL.
> Este arquivo é um **snapshot exportado** desse esquema, para provisionar um `folha_dash` novo
> sem precisar do Python/Excel.
