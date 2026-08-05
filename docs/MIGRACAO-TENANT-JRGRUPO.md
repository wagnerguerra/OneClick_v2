# Migração do tenant JR Grupo — OneClick v1 (ASP) → OneClick v2

Registro da migração do tenant `jrgrupo`, que rodava em ASP clássico sobre MySQL
`angular_jrgrupo` em `https://oneclick.central-rnc.com.br/jrgrupo`.

Script: `scripts/jrgrupo-migrate.js` · SQL gerado: `scripts/out/jrgrupo-*.sql`

---

## Por que a migração é pequena

O tenant estava **quase dormente**. Das 219 tabelas do banco (o schema completo do v1,
replicado por tenant), só ~15 tinham dados, e a maior parte era histórico congelado:

| Módulo v1 | Tabela | Linhas | Última atividade |
|---|---|---|---|
| Clientes | `ger_cad_cli` | 832 | **vivo** — cadastros em 04/2026 |
| Usuários | `ger_cad_usu` | 538 | vivo |
| Serviços | `cad_ser` | 265 | — |
| Áreas / Cargos | `ger_cad_set` / `ger_cad_car` | 23 / 26 | — |
| Contatos de cliente | `cad_cli_con` | 64 | — |
| Ligações | `ger_lig` | 64.784 | **parou em 2020** |
| Agenda | `ger_cro` | 41.869 | **parou em 2018** |
| Lançamentos fiscais | `fis_lan` | 848 | 2014–2015 |
| Qualidade (bloco inteiro) | `sgq_*` (~60 tabelas) | **0** | nunca usado |

Em 2026 houve 21 logins, de 2 pessoas. **Só o cadastro migrou**; o histórico ficou no
MySQL congelado como backup somente-leitura — são 107 mil linhas de módulos que o v2
nem tem equivalente (`ger_lig` = controle de ligações telefônicas).

---

## Decisões

| Tema | Decisão |
|---|---|
| Destino | Nova `Empresa` na instância v2 existente. **Sem `Tenant`** — ver abaixo |
| Escopo | Só o cadastro vivo (~1.180 linhas de 220 mil) |
| Usuários | Só quadro interno: 50 de 508 "ativos" |
| CNPJs duplicados | Vence o `id` maior; perdedor entra inativo e marcado |
| E-mails colididos | Sintetizados a partir do login (`--email-scheme=login`, default) |

### Não existe `Tenant` para este tenant

O `CLAUDE.md` descreve schema-per-tenant, mas **não é o que roda**:
`apps/api/src/tenant/tenant.middleware.ts` nunca executa `SET search_path`, e os
services filtram por `empresaId` (`apps/api/src/cliente/cliente.service.ts`,
`empresaFilter`). A tabela `tenants` está vazia e as empresas já existentes em
produção não têm linha lá.

Criar um `Tenant` só para "seguir o doc" divergiria do que está em produção. Se um dia
entrar billing Stripe para o JR Grupo, cria-se nesse momento.

---

## Como aplicar

```bash
# 1. gerar (lê o MySQL, não escreve em lugar nenhum)
node scripts/jrgrupo-migrate.js --fase=all

# 2. aplicar NESTA ORDEM — há FK entre elas
for f in empresa areas cargos servicos clientes contatos usuarios; do
  docker exec -i saas-postgres psql -U postgres -d saas_erp < scripts/out/jrgrupo-$f.sql
done

# 3. conferir (sai com código 1 se divergir)
node scripts/jrgrupo-migrate.js --fase=verify
```

Produção: mesmos arquivos, via `/admin/sql-console` ou `psql` na VPS, **só depois de
o dev passar**. Ajustar `DATABASE_URL` antes de rodar o `verify` contra produção.

Todos os arquivos são **idempotentes** (`ON CONFLICT DO UPDATE`, ids determinísticos
`jrg-cli-<id>`, `jrg-usu-<id>`, …). Reaplicar não duplica nem reseta senha já trocada
pelo usuário — `accounts` usa `ON CONFLICT DO NOTHING` de propósito.

Cada arquivo (exceto `jrgrupo-empresa.sql`, que a cria) aborta com `RAISE EXCEPTION`
se a Empresa não existir.

---

## Resultado

```
áreas         23 lidas  →  23
cargos        26 lidos  →  26
serviços     265 lidos  → 264   (1 sem nome, inativo, descartado)
clientes     832 lidos  → 780   (50 descartados na dedup)
contatos      64 lidos  →  62   (1 redirecionado, 1 órfão)
usuários     508 ativos →  50   (elegíveis: com e-mail, login e setor interno)
```

### O que foi descartado, e por quê

- **`ger_cad_cli` id 0 e 1** — id 0 é o placeholder "NÃO INFORMADO"
  (CNPJ `00.000.000/0000-00`); id 1 é a própria JR SERVIÇOS EMPRESARIAIS (`padrao=1`),
  que vira a `Empresa`, não cliente dela mesma.
- **458 dos 508 "usuários ativos"** — 423 não têm e-mail nenhum e 34 não têm login
  (setor nulo, e-mail pessoal em gmail/yahoo/hotmail): são portal do cliente e
  sócios/externos, não quadro interno.
- **A conta `admin`** (`wagner@central-rnc.com.br`) — é o suporte da RNC, não do
  JR Grupo. O master global já tem acesso por fora.
- **`CAD_SET_EMAIL` em 19 das 23 áreas** — estava com `wagner@central-rnc.com.br`,
  preenchido em lote na implantação do v1. Importar faria toda área do tenant
  notificar o suporte. Os 2 e-mails legítimos foram preservados.
- **`1900-01-01` em 102 datas de nascimento** — placeholder do v1, virou `NULL`.

### Normalizações aplicadas

MySQL 5.0.45 não tem `REGEXP_REPLACE` nem CTEs, então tudo acontece em JS:

- **Documento** → só dígitos. 801 CNPJ, 14 CPF, 17 sem documento válido (entram com
  string vazia, que `chaveDocumento()` já trata como "não identifica ninguém").
- **Datas** — `CAD_CLI_DT_INI` é varchar com `dd/mm/yyyy`, `yyyy-mm-dd`, `0000-00-00`,
  `00/00/0000`, `''` e `NULL` misturados. Só data real passa.
- **UF** — o campo é `Char(2)` no v2; a origem tinha `'DF '` com espaço, `'Brasília'`
  por extenso e `'...'`.
- **`grupo` / `origem`** — FK numérica no v1, texto no v2. Resolvidos para o nome,
  senão o cadastro herdaria `"1"` e `"3"`. "Não Informado" vira vazio.
- **Situação / tributação / regime** → enums (`ClienteSituacao`, `TaxRegime`,
  `RegimeContabil`). 56% da base cai em `tributacao = NULL` — é o dado de origem.
- **Observações** — `CAD_CLI_OBS` + as 5 particularidades por área, cada uma rotulada.

---

## Pendências para o JR Grupo

### 1. Os 12 CNPJs em conflito → `scripts/out/jrgrupo-conflitos-cnpj.csv`

12 grupos (15 cadastros) em que o mesmo CNPJ aparece com razões sociais diferentes —
um dos dois tem o documento errado. Exemplo: `31319826000141` está em
"CENTRO DE ASSISTENCIA EM SAUDE E IMAGENS MEDICAS" e em "HUMANA SERVIÇO DE APOIO
ADMINISTRATIVO".

O `id` maior venceu e ficou ativo; os perdedores entraram **inativos**, com
`observacoes` prefixado por `[CONFLITO DE CNPJ — revisar]` apontando o concorrente.
Nada foi perdido — falta alguém dizer qual CNPJ é o certo.

### 2. E-mails sintéticos — 24 contas

`ademar.gerencia@jrgrupo.com.br` estava em **18 contas de 18 pessoas diferentes**
(o campo foi preenchido em lote com o endereço da gerência), e `users.email` é
`UNIQUE`. Como cada uma tem login próprio, o e-mail virou `<login>@jrgrupo.com.br`
(`daiane.silva@jrgrupo.com.br`, `ligia.sousa@jrgrupo.com.br`, …).

> Existe `--email-scheme=numerado` (`ademar1@`, `ademar2@`, …) se a preferência mudar.

**Nenhum desses endereços é caixa real.** Convite por e-mail e recuperação de senha
não funcionam até o JR Grupo informar os endereços verdadeiros. As contas entram com
senha padrão `Acesso@123` e o campo é editável pela UI.

### 3. Senhas

O v1 guardava senha em texto plano (`varchar(50)`), incompatível com o Better Auth.
Todos entram com `Acesso@123` (hash scrypt via `hashPassword`) e **devem trocar no
primeiro acesso**.

---

## Permissões concedidas

Derivadas das flags do v1, restritas ao que o tenant usa: `dashboard`, `clientes`,
`contatos`, `agenda`, `servicos`, `colaboradores` e — só para `profile=ADMIN` —
`areas`, `cargos`, `usuarios`.

Leitura e escrita para todos (o v1 não separava os dois); exclusão só para ADMIN.
**Nada do bloco Qualidade** — as ~60 tabelas `sgq_*` estão zeradas.

`CAD_USU_VINCULO` → `profile`: Administradores→`ADMIN`, Gestores→`GERENTE`,
Colaboradores e Estagiários→`OPERADOR`.

---

## Verificação executada (dev)

| Passo | Resultado |
|---|---|
| Aplicar os 7 SQLs na ordem | OK, sem erro |
| `--fase=verify` (contagens origem × destino) | OK em 8 checagens |
| Reaplicar tudo e reconferir | **idempotente** — contagens idênticas |
| Hash de senha após reaplicar | **preservado** (não reseta quem já trocou) |
| Amostra de 20 clientes, campo a campo | 20/20 conferem |
| Login `daiane.silva@jrgrupo.com.br` / `Acesso@123` | autentica |
| Trava de duplicidade num CNPJ em conflito | encontra os 2 cadastros e avisa |

---

## Corte do legado (pendente)

1. `mysqldump` do `angular_jrgrupo` arquivado
2. MySQL somente-leitura para esse schema
3. Desligar o vhost `/jrgrupo` do ASP
4. `sis_par.SIS_LINK` → URL do v2, para quem acessar o link antigo

---

## Fontes

- Código v1: `\\192.168.0.7\wwwroot\jrgrupo\` (ASP clássico)
- Banco v1: MySQL 5.0.45 `angular_jrgrupo` em 192.168.0.7 (credenciais `OCK_V1_DB_*`
  ou `JRG_DB_*` em `apps/api/.env`)
- Padrão do importador: `scripts/legacy-orc-import.js`
- Schema do v1 em geral: `docs/LEGACY-DB-ONECLICK-V1.md`
