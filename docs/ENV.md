# Variáveis de Ambiente

Referência completa das envs do projeto. O `CLAUDE.md` referencia este arquivo.

## Database
```env
DATABASE_URL=postgresql://...    # use 127.0.0.1, NÃO localhost (Node 22 + IPv6 quebra Docker)
REDIS_URL=redis://...            # idem — 127.0.0.1
```

## Auth (Better Auth)
```env
BETTER_AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

## Stripe Billing
```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Storage (S3 / Minio)
```env
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

## Email (SMTP / Resend)
```env
RESEND_API_KEY=
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=sistema@central-rnc.com.br
SMTP_PASS=
```

## Legacy MySQL (OneClick Fiscal / SERPRO)
```env
LEGACY_DB_HOST=localhost
LEGACY_DB_USER=root
LEGACY_DB_NAME=oneclick_fiscal_serpro
LEGACY_DB_PORT=3001
```

## ERP SCI (Firebird)
```env
SCI_DSN=\\192.168.0.2\s\SCI\banco\VSCI.SDB
SCI_USER=INTEGRACOES
SCI_CHARSET=UTF8
```

## Certificados / Fiscal
```env
CERTIFICADO_KEK=                  # chave KEK para criptografar senha do PFX
NFE_DIST_ENABLED=false            # habilita cron diário NFe SEFAZ (manual sempre roda)
NFE_DIST_CRON=30 3 * * *          # default 03:30 America/Sao_Paulo
NFSE_DIST_ENABLED=false           # habilita cron diário NFS-e Nacional
NFSE_DIST_CRON=45 3 * * *         # default 03:45 America/Sao_Paulo
```

## Ferramentas (gateway do webapp)
As 8 ferramentas *job-based* (SPED, NFe, GNRE, comparadores, SCI…) fazem proxy server-to-server para a
API Fastify do webapp (`/api/v1`) — o browser nunca fala com o webapp. `nfse-pdf`/`extrato-edit` rodam no
browser (extrato-edit usa o webapp só para o cadastro SQLite).
```env
WEBAPP_API_URL=http://webapp-api:8000
```
- **Dev/LAN:** URL do webapp local (ex.: `http://localhost:8000` ou `http://192.168.0.47:8000`).
- **Produção (VPS):** por **nome de container** na rede Docker compartilhada (`fiscal_net`), ex.
  `http://webapp-api:8000` — mesmo padrão do `DATABASE_URL` (`n8n-postgres-1:5432`). **Não** use IP de LAN,
  `host.docker.internal` nem porta de host: o webapp não tem auth própria, fica só atrás do OneClick.
- Se ausente, o gateway (`apps/api/src/ferramentas/webapp-gateway.service.ts`) usa o default
  `http://192.168.0.47:8000`.

## App
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_URL=http://localhost:4000
# Chave do painel de presença global (Service Manager / launcher). Sem ela, a
# visão global de /api/admin/online-users fica indisponível para clientes sem
# sessão — o launcher deve enviar o header `x-admin-key: <ADMIN_API_KEY>`.
# Usuários web logados continuam vendo só a presença da própria empresa (sem PII).
ADMIN_API_KEY=
```

## Painéis de TV — monitor da VPS (fonte `vps`)
Métricas do servidor (CPU/memória/disco/uptime), portas/serviços e containers do
Docker nos Painéis de Gestão à Vista. Só master/empresa-master resolve. Tudo opcional.
```env
# Portas EXTRAS a monitorar por TCP (as core — API/Web/Postgres/Redis — são
# checadas pelas conexões reais do app). Formato "Nome:host:porta" ou "Nome:porta".
PAINEL_VPS_PORTAS=
PAINEL_VPS_HOST=127.0.0.1          # host default das portas extras
PAINEL_VPS_DISK_MOUNT=/            # ponto de montagem lido pelo `df`

# Docker (bloco de containers). RECOMENDADO: docker-socket-proxy READ-ONLY por TCP
# (a API NÃO toca o socket real — só lista containers). Sem isso, cai pro socket
# unix, que exige montar /var/run/docker.sock no container (dá root no host!).
DOCKER_HOST=tcp://docker-proxy:2375
# DOCKER_SOCK=/var/run/docker.sock  # alternativa (menos segura) ao proxy
```
Compose (produção, no serviço `api` — adicionar em `/opt/oneclick/docker-compose.yml`):
```yaml
  docker-proxy:
    image: tecnativa/docker-socket-proxy
    restart: unless-stopped
    environment:
      CONTAINERS: 1            # libera só GET /containers/* (leitura); resto negado
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    # sem `ports:` — fica só na rede interna do compose
  api:
    environment:
      DOCKER_HOST: tcp://docker-proxy:2375
    # (api e docker-proxy precisam estar na MESMA rede docker)
```

## Sistema Legado (referência)
- **Código-fonte**: `C:\Users\wagner\Desktop\PROJETOS\SERPRO2`
- **Stack**: Node.js + Vanilla JS + Bootstrap 5 + MySQL
- **URL local**: `http://192.168.0.58:5173/`
- **Banco**: MySQL `oneclick_fiscal_serpro` na porta 3001

## Integrações Externas
- **SMTP**: Gmail para e-mails transacionais
- **BrasilAPI**: Consulta de CNPJ e CEP
- **Omie**: ERP de alguns clientes (integração futura)
- **SCI (Firebird)**: ERP contábil em `\\192.168.0.2`, charset UTF8
