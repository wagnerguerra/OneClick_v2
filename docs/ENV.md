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

## BI da Folha (`folha_dash`)
Banco do ETL da folha (`Folhas_Pagamento`), lido **ao vivo** pelo módulo `/folha-bi`:
agrupamento de verbas (esquemas/grupos/regras), classes do SCI, provisões detalhadas,
série multi-mês do Resumo e a Planilha de Custos. É um Postgres **separado** do banco
do app — os snapshots por competência (esses sim) ficam em `folha_bi_cache`.

Sem esta variável o painel abre, mas a matriz de Verbas cai tudo em `(outros)` e o modal
"Configurar agrupamento" fica vazio. **Não há default**: faltando, a API responde
"FOLHA_DASH_URL nao configurada" em vez de um `ECONNREFUSED` sem contexto.

```env
FOLHA_DASH_URL=postgres://<usuario>:<senha>@<host>:<porta>/folha_dash_db
```

Provisionamento em produção e o caminho de escrita do ETL: `docs/folha-bi-producao.md`.

## Omie ERP (API REST v1)
Integração do cadastro de clientes: localiza o cliente no Omie pelo CNPJ
(botão "Buscar no Omie" na aba Integrações → preenche ID Omie + Empresa).
Duas empresas: CENTRAL e L&L. Sem estas chaves a integração degrada com aviso.
```env
OMIE_APP_KEY_CENTRAL=
OMIE_APP_SECRET_CENTRAL=
OMIE_APP_KEY_LL=
OMIE_APP_SECRET_LL=
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

## Banco de imagens (capa do cliente)
```env
# Chave gratuita gerada em https://www.pexels.com/api/ (uso comercial liberado,
# sem exigência de crédito). Alimenta "Alterar capa" no detalhe do cliente →
# aba "Sugestões da internet". Sem ela, a aba avisa e o envio manual segue
# funcionando normalmente.
PEXELS_API_KEY=
```

## Dossiê do Cliente (enriquecimento por CNPJ)
```env
# Ordem da cadeia de provedores. Vazio = opencnpj,brasilapi,serpro.
# As duas primeiras são gratuitas e sem token; o SERPRO é pago por consulta e
# só entra quando as públicas falham (usa SERPRO_CONSUMER_KEY/SECRET).
DOSSIE_PROVEDORES=
```
Job diário de situação cadastral: ligado por `system_config`
(`DOSSIE_SITUACAO_ENABLED=true`, `DOSSIE_SITUACAO_CRON` padrão `0 6 * * *`).
Detalhes em `apps/api/src/cliente/dossie/README.md`.

## Integrações Externas
- **SMTP**: Gmail para e-mails transacionais
- **BrasilAPI**: Consulta de CNPJ e CEP
- **OpenCNPJ**: Dossiê do cliente — base da Receita, gratuita e sem token
- **Pexels**: Fotos sugeridas para a capa do cliente (`PEXELS_API_KEY`)
- **Omie**: ERP de alguns clientes (integração futura)
- **SCI (Firebird)**: ERP contábil em `\\192.168.0.2`, charset UTF8
