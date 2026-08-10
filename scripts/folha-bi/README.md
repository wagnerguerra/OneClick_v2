# Seed da config de agrupamentos da Folha (`folha_dash`)

`seed-agrupamentos.sql` recria o esquema de agrupamento de verbas **"Verbas Fixos/Variáveis"**
no banco intermediário **`folha_dash`** (o Postgres que o backend do folha-bi lê via
`FOLHA_DASH_URL`). Sem esse esquema, a matriz de Verbas cai tudo em `(outros)` e a
classificação Fixo/Variável/Informativo não aparece.

Contém **67 grupos** (18 de topo) e **689 regras** (prefixo de classe SCI → grupo).

## Como aplicar

Depois de o schema do `folha_dash` já existir (tabelas `classif_esquema` / `classif_grupo` /
`classif_regra` do motor de esquemas), rode o seed contra o `folha_dash`:

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
