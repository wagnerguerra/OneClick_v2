# `/folha-bi` em produção — o banco `folha_dash`

Runbook para provisionar o banco do ETL da folha na VPS e ligar a escrita do ETL nele.
Levantado em 13/08/2026, a partir do erro `connect ECONNREFUSED 127.0.0.1:5433` no modal
"Configurar agrupamento de verbas".

---

## 1. O diagnóstico

O painel bebe de **duas fontes**, e só uma delas chega na produção:

| Fonte | O que entrega | Estado em produção |
|---|---|---|
| `folha_bi_cache` (banco do app) | snapshot por competência: colaboradores, verbas cruas, totais | ✅ funciona — o Service Manager envia por HTTPS |
| `folha_dash` (banco do ETL, ao vivo) | agrupamento de verbas, classes do SCI, provisões detalhadas, série multi-mês do Resumo, Planilha de Custos | ❌ inalcançável |

O `folha_dash` **existe só na máquina do Wagner** — dentro do container `saas-postgres`,
banco `folha_dash_db` em `127.0.0.1:5432`. Na VPS não há nenhum Postgres nessa função, e a
API não tinha `FOLHA_DASH_URL` no ambiente: caía num default embutido apontando para
`127.0.0.1:5433` *de dentro do próprio container*, onde não há nada. Daí o `ECONNREFUSED`.

Não é dado corrompido nem esquema perdido. O banco inteiro tem **40 MB** e está íntegro:
1 esquema ("Verbas Fixos/Variáveis"), 67 grupos, 689 regras, 2.435 classes do SCI,
818 verbas resolvidas em 7 empresas, competências até 07/2026.

**Consequência hoje:** a matriz de Verbas joga tudo em `(OUTROS)`, o modal de agrupamento
abre vazio, e as abas que leem o `folha_dash` ao vivo (Provisões detalhadas, gráficos do
Resumo, Planilha de Custos) falham do mesmo jeito.

> Achado lateral, sem impacto: sobrou em `%APPDATA%\OneClick ERP\launcher-settings.json`
> uma configuração antiga apontando para um projeto Supabase que **não existe mais** (o host
> nem resolve em DNS). O Service Manager em uso lê a pasta `oneclick-launcher`, que já aponta
> para o Postgres local — por isso as importações continuaram funcionando. Vale apagar a pasta
> velha para não confundir um diagnóstico futuro.

---

## 2. Provisionar o `folha_dash` na VPS

> **Feito em 13/08/2026.** Banco `folha_dash_db` criado no `n8n-postgres-1`, restaurado sem
> erros e conferido pelo caminho do app: 67 grupos, 689 regras, 239 verbas da FORMASET (294).
> A seção fica como referência — para refazer, para o segundo ambiente, ou se o banco cair.

O `oneclick-api` já conversa com `n8n-postgres-1` (é onde mora o banco `oneclick`), então o
caminho mais curto é criar ali um banco ao lado — sem container novo, sem porta nova, sem
volume novo. São 40 MB.

### 2.1. Gerar o dump (na máquina do Wagner)

```bash
docker exec saas-postgres pg_dump -U postgres -d folha_dash_db --no-owner --no-privileges \
  | gzip > folha_dash_db.sql.gz          # ~2 MB
```

> Já validado: o restore desse dump num banco limpo roda **sem um único erro**, e
> `select folha_dash.resolver_todos()` devolve as 818 verbas — ou seja, o botão
> "Aplicar (resolver)" funciona do outro lado.

### 2.2. Criar banco e usuário na VPS

```bash
scp -i ~/.ssh/oneclick_deploy folha_dash_db.sql.gz root@72.60.155.69:/tmp/

ssh -i ~/.ssh/oneclick_deploy root@72.60.155.69
docker exec -i n8n-postgres-1 psql -U postgres <<'SQL'
create user folha with password '<SENHA_FORTE>';
create database folha_dash_db owner folha;
SQL
```

### 2.3. Restaurar

```bash
gunzip -c /tmp/folha_dash_db.sql.gz | docker exec -i n8n-postgres-1 psql -U postgres -d folha_dash_db
docker exec -i n8n-postgres-1 psql -U postgres -d folha_dash_db -c \
  "select count(*) from folha_dash.classif_grupo;"     # espera 67
rm /tmp/folha_dash_db.sql.gz
```

### 2.4. Apontar a API

Em `/opt/oneclick/.env` (é o `env_file` do serviço `api`):

```env
FOLHA_DASH_URL=postgres://folha:<SENHA_FORTE>@n8n-postgres-1:5432/folha_dash_db
```

O host é o **nome do container** — a API está na rede `n8n_default` e já resolve por lá.

> ⚠️ **`docker restart` não serve aqui.** `env_file` é lido na *criação* do container; um
> restart mantém o ambiente antigo e a variável nova é ignorada — o erro volta idêntico e
> parece que a linha não pegou. Recrie: `cd /opt/oneclick && docker compose up -d api`.

**Conferência**, pelo caminho exato que o app usa (não por `psql`, que prova outra coisa):

```bash
docker exec oneclick-api node -e "const{Pool}=require('pg');new Pool({connectionString:process.env.FOLHA_DASH_URL}).query('select count(*) from folha_dash.classif_grupo').then(r=>console.log('grupos:',r.rows[0].count)).catch(e=>console.log('ERRO:',e.message))"
```

Esperado: `grupos: 67`. Na tela: abrir `/folha-bi` → Verbas → "Configurar agrupamento" — o
aviso some, "Verbas Fixos/Variáveis" aparece no seletor e a matriz deixa de ser uma coluna
`(OUTROS)` só.

### 2.5. Se der `password authentication failed`

Sinal de que a senha da role e a do `.env` divergiram — acontece quando um `\password folha`
roda depois de a linha já estar gravada. Alinhe a role ao que o `.env` tem:

```bash
PW=$(grep '^FOLHA_DASH_URL=' /opt/oneclick/.env | sed -E 's#.*://folha:([^@]+)@.*#\1#')
docker exec -i n8n-postgres-1 psql -U postgres -v pw="$PW" <<'SQL'
alter user folha with password :'pw';
SQL
unset PW
```

> `psql -c` **não** expande `:'pw'` — daí o heredoc. Com `-c` o comando vai cru ao servidor e
> o erro é um `syntax error at or near ":"`, que não parece o que é.

---

## 3. Manter atualizado — o caminho de escrita do ETL

Depois do passo 2 a produção tem uma **cópia do dia da restauração**. Cada nova importação
continuaria gravando só na máquina do Wagner, e a cópia da VPS envelheceria em silêncio —
o agrupamento seguiria certo (muda pouco), mas verbas novas de empresas novas cairiam em
`(OUTROS)` de novo, e as Provisões detalhadas ficariam presas no passado.

A arquitetura já prevista no repo do ETL (`MIGRACAO_DOCKER.md`) resolve isso: **o ETL roda
na LAN** (precisa do Firebird) e **grava no Postgres da VPS por túnel SSH**, sem expor a
porta na internet.

```bash
ssh -i ~/.ssh/oneclick_deploy -N -L 5433:127.0.0.1:54322 root@72.60.155.69
```

`54322` é onde o `n8n-postgres-1` está publicado no host da VPS. Com o túnel de pé, o ETL
aponta para `postgres://folha:<SENHA>@127.0.0.1:5433/folha_dash_db` — na aba
**Configurações → Folha** do Service Manager (campo do banco), que já sobrepõe o `.dbenv`
do repo do ETL.

Fica decidir **quem sobe o túnel**: hoje seria manual. O Service Manager já dá spawn no
Python da importação; abrir o túnel antes e derrubar no fim é uma mudança contida em
`scripts/launcher/main.js`, e vale fazer antes de trocar o destino do ETL — senão uma
importação com o túnel fechado falha inteira.

**Enquanto isso não existe**, o passo 2 pode ser repetido a cada rodada grande: é um dump de
2 MB e um restore de segundos.

---

## 4. Ambiente de desenvolvimento

O `apps/api/.env` local recebeu a mesma variável, apontando para o banco da própria máquina:

```env
FOLHA_DASH_URL=postgres://<usuario>:<senha>@127.0.0.1:5432/folha_dash_db
```

Sem ela o dev exibia exatamente o mesmo erro da produção — o default embutido apontava para
a porta `5433`, que era do container dedicado `folha_db` planejado no `MIGRACAO_DOCKER.md` e
nunca subiu. O default foi **removido** do código: faltando a variável, a API agora responde
"FOLHA_DASH_URL nao configurada" em vez de um erro de socket sem contexto.
