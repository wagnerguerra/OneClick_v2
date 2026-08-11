# Segunda instalação de produção — `oneclick.wpsis.com.br`

Instalação separada do OneClick para outro cliente, na **mesma VPS** da Central
Contábil. Compartilha só a máquina, o nginx e o servidor Postgres; o resto
(banco, redis, uploads, backups, imagens, segredos) é próprio.

Nada aqui foi aplicado na VPS ainda — estes arquivos são o material para revisão.

## Como as duas convivem

|                | Central Contábil                  | wpsis                              |
|----------------|-----------------------------------|------------------------------------|
| Domínio        | app.oneclick.central-rnc.com.br   | oneclick.wpsis.com.br              |
| Portas locais  | 3100 / 4100                       | **3101 / 4101**                    |
| Compose        | `/opt/oneclick`                   | `/opt/oneclick-wpsis`              |
| Fonte          | `/opt/oneclick-src`               | `/opt/oneclick-wpsis-src`          |
| Banco          | `oneclick`                        | `oneclick_wpsis`                   |
| Redis          | `oneclick-redis`                  | `oneclick-wpsis-redis`             |
| Imagens        | `oneclick-{api,web}`              | `oneclick-wpsis-{api,web}`         |
| Backups        | `/var/backups/oneclick`           | `/var/backups/oneclick-wpsis`      |

O nginx do host já serve `wpsis.com.br` e `indicai.wpsis.com.br`, então o DNS
do domínio já aponta para esta VPS — falta só o vhost e o certificado.

## Ordem de instalação

Cada passo é reversível sozinho; nenhum toca a instalação existente.

**1. Banco**

```bash
docker exec -it n8n-postgres-1 psql -U postgres -c "CREATE DATABASE oneclick_wpsis;"
docker exec -it n8n-postgres-1 psql -U postgres -c "CREATE ROLE oneclick_wpsis LOGIN PASSWORD 'TROCAR';"
docker exec -it n8n-postgres-1 psql -U postgres -c "ALTER DATABASE oneclick_wpsis OWNER TO oneclick_wpsis;"
```

> Role própria, não a do `oneclick`. Uma credencial vazada não pode alcançar os
> dois bancos.

**2. Fonte**

```bash
git clone <repo> /opt/oneclick-wpsis-src && cd /opt/oneclick-wpsis-src && git checkout main
```

**3. Diretórios e arquivos**

```bash
mkdir -p /opt/oneclick-wpsis /var/backups/oneclick-wpsis /var/backups/oneclick-wpsis-system
cp docker-compose.yml /opt/oneclick-wpsis/
cp .env.example       /opt/oneclick-wpsis/.env
chmod 600 /opt/oneclick-wpsis/.env
```

Preencher o `.env` — ele está comentado chave a chave, marcando o que é
`[NOVO]`, o que pode ser `[COPIAR]` da instalação atual e o que é `[DECIDIR]`.

**4. Schema**

```bash
cd /opt/oneclick-wpsis && docker compose build api
docker run --rm --network n8n_default --env-file /opt/oneclick-wpsis/.env \
  oneclick-wpsis-api:latest sh -c "cd /app/packages/db && npx prisma db push --skip-generate"
```

> Sem `--accept-data-loss`. O banco está vazio, então não há o que perder — e a
> flag existe justamente para os casos em que haveria.

**5. Subir**

```bash
cd /opt/oneclick-wpsis && docker compose build web && docker compose up -d
curl -s -o /dev/null -w "API:%{http_code}\n" http://127.0.0.1:4101/api/health
```

**6. nginx + TLS**

```bash
cp nginx-oneclick.wpsis.com.br.conf /etc/nginx/sites-available/oneclick.wpsis.com.br
ln -s ../sites-available/oneclick.wpsis.com.br /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d oneclick.wpsis.com.br
```

> `nginx -t` antes de recarregar não é zelo: uma configuração inválida derruba
> a recarga e, com ela, **todos** os sites do host — inclusive a produção atual.

## O que ainda falta (e não é pouco)

**Não existe seed de instalação.** Os `seed-*.ts` do `packages/db/prisma/` são
de conteúdo (segmentos, serviços contábeis, cláusulas, plano de contas), não de
instalação. Depois do `db push` o banco tem as tabelas e nada mais: sem empresa,
sem usuário, sem planos, sem catálogo de permissões, sem cores de módulo. Ou
seja, ao fim dos seis passos acima o sistema **sobe mas não dá para entrar**.

É o maior item pendente e precisa ser escrito.

**O Service Manager publica só em `/opt/oneclick`.** O caminho está escrito no
código do deploy (`scripts/launcher/main.js`). Enquanto não for parametrizado,
esta instalação só é atualizada por SSH na mão — com o risco de, num descuido,
rodar o comando apontando para a instalação errada.

## Decisões que ficaram registradas nos arquivos

- **Imagem web não é compartilhável.** `NEXT_PUBLIC_*` é assado em build-time
  pelo Next; trocar o domínio exige rebuild, não basta reiniciar. A imagem da
  API, essa sim, é toda env-driven.
- **Sem `docker-socket-proxy`.** A instalação atual usa para o painel de
  containers, mas o proxy enxerga o host inteiro: aqui ele mostraria os
  containers do outro cliente.
- **Fora da `fiscal_net`** enquanto este cliente não usar a webapp fiscal.
- **`NFE_DIST_ENABLED` e `NFSE_DIST_ENABLED` começam `false`.** Ligados, o cron
  sai baixando nota em produção no primeiro boot, antes de alguém conferir a
  instalação.
- **`CERTIFICADO_KEK` e `BETTER_AUTH_SECRET` novos.** Com a KEK repetida, um
  dump de um banco abre os certificados digitais do outro; com o segredo de auth
  repetido, um cookie de sessão de lá vale aqui.
