# Sincronizar o banco LOCAL (dev) com os dados de PRODUÇÃO

Objetivo: deixar o dev igual à produção para diagnósticos confiáveis, **sem tocar
na produção de forma nenhuma**.

## Por que é seguro para a produção

O ÚNICO comando que roda na produção é o `pg_dump`, que é **somente-leitura**:
tira um snapshot consistente via MVCC, **não trava escritas** e **não altera nada**.
A produção continua servindo normalmente durante o dump. Todo o resto (drop,
create, restore) acontece **exclusivamente no banco local**.

> Regra de ouro: **nunca** aponte `psql`/`pg_restore` com DROP/CREATE/restore para
> a produção. O `restore-local.ps1` tem uma trava que recusa qualquer host que não
> seja `127.0.0.1`/`localhost`.

---

## Fase 1 — gerar o dump (READ-ONLY)

### Opção A (mais fácil): usar o Backup e Restore do próprio sistema

Em **produção → /backup-restore**: marque **apenas "Banco de dados (PostgreSQL dump)"**
(desmarque `.env` — não precisa e contém credenciais) → **Gerar Backup** → baixe o ZIP.
Isso roda `pg_dump --no-owner --no-acl` (somente-leitura, não afeta a produção) e
empacota o dump como **`database.sql`** (SQL puro) dentro do ZIP. Extraia o
`database.sql` do ZIP e pule para a Fase 3.

### Opção B: pg_dump direto na VPS

SSH na VPS e rode (ajuste o nome do container/DB/usuário se diferentes):

```bash
# 1. Descobrir o container do Postgres de produção
docker ps --format '{{.Names}}' | grep -i postgres

# 2. Dump COMPLETO comprimido — apenas leitura, não afeta a produção
docker exec -t <container_postgres> \
  pg_dump -U postgres -d saas_erp -Fc --no-owner --no-privileges -f /tmp/prod_saas_erp.dump

# 3. Tirar o arquivo de dentro do container
docker cp <container_postgres>:/tmp/prod_saas_erp.dump ./prod_saas_erp.dump

# 4. (opcional) remover o dump do container
docker exec -t <container_postgres> rm -f /tmp/prod_saas_erp.dump
```

## Fase 2 — baixar o dump para a sua máquina

```bash
# Da sua máquina (Windows), via scp:
scp usuario@vps:/caminho/prod_saas_erp.dump C:\dumps\prod_saas_erp.dump
```

## Fase 3 — no LOCAL (Windows): restaurar no banco de dev

```powershell
# Recria o banco LOCAL do zero e restaura o dump da produção.
# A trava interna só deixa rodar em 127.0.0.1/localhost.
# Aceita database.sql (do Backup do sistema) OU *.dump (pg_dump -Fc).
scripts\db\restore-local.ps1 -DumpFile C:\dumps\database.sql
```

Depois (se o schema do Prisma mudou entre os ambientes):

```bash
pnpm --filter @saas/db db:generate
```

---

## Checklist de segurança

- [ ] O dump foi gerado com `pg_dump` (leitura) — nenhum comando de escrita rodou na produção.
- [ ] O restore aponta para `127.0.0.1:5432/saas_erp` (local), confirmado pela trava do script.
- [ ] Nenhum `DROP DATABASE`/`CREATE DATABASE`/`pg_restore` foi executado contra a produção.
- [ ] Versão do `pg_restore` local ≥ versão do Postgres de produção (senão o restore pode falhar).
