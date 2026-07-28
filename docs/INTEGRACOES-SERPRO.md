# Integrações SERPRO — Mapa de pontos de contato

> Levantamento dos pontos do sistema que consomem a API do SERPRO (Serviço Federal de
> Processamento de Dados). Gerado em 2026-07-28. Fonte: varredura de `apps/api/src/**`.
> Planilha equivalente: `docs/INTEGRACOES-SERPRO.xlsx`.

## Camada de autenticação

Não há **um** serviço central único. O hub de fato é o **`SitfisService`**, que expõe o método
reutilizável `callIntegra()` (`apps/api/src/sitfis/sitfis.service.ts:165`): ele faz o OAuth
(`POST https://autenticacao.sapi.serpro.gov.br/authenticate`) com **certificado digital PFX**
(`uploads/certificado.pfx` + passphrase, header `Role-Type: TERCEIROS`) e chama o gateway
`https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/...`.

- **DCTFWeb** injeta `SitfisService` e reusa `callIntegra()` — não tem HTTP próprio.
- **CaixaPostal, CND, CNPJ, TSA** reimplementam o mesmo OAuth localmente (cada um com sua cópia
  do host e da leitura de credenciais).
- Credenciais lidas do `SystemConfig` (banco) primeiro, `process.env` como fallback
  (`CONSUMER_KEY`, `CONSUMER_SECRET`, `CERTIFICADO_SENHA`, `CNPJ_CONTRATANTE`).

---

## 1. Integra Contador → SITFIS (Situação Fiscal + DARF/SICALC)

- **Serviço:** `apps/api/src/sitfis/sitfis.service.ts`
- **Endpoints (`gateway.apiserpro.serpro.gov.br`, base `/integra-contador/v1`):**
  - Auth: `POST https://autenticacao.sapi.serpro.gov.br/authenticate` (`sitfis.service.ts:126`)
  - Solicitar protocolo: `POST /integra-contador/v1/Apoiar` — SITFIS `SOLICITARPROTOCOLO91` (`:238`)
  - Emitir relatório: `POST /integra-contador/v1/Emitir` — SITFIS `RELATORIOSITFIS92` (`:352`)
  - SICALC — consultar receita: `POST /Apoiar` `CONSULTAAPOIORECEITAS52` (`:923`)
  - SICALC — emitir DARF: `POST /Emitir` `CONSOLIDARGERARDARF51` (`:1008`)
- **Entradas:** tRPC `sitfis.router.ts` → `consultar` (`:13`), `consultarLote` (`:91`),
  `consultarCodigoReceita` (`:163`), `emitirDarf` (`:185`). REST `sitfis.controller.ts` (`:id/pdf`,
  `:id/download-pdf`) só leem PDF do banco.
- **Cron:** não.

## 2. Integra Contador → DCTFWeb / MIT

- **Serviço:** `apps/api/src/dctfweb/dctfweb.service.ts` (via `SitfisService.callIntegra`)
- **Endpoints (`/integra-contador/v1/{Consultar|Emitir}`):**
  - Listar apurações: MIT `LISTAAPURACOES317`, `Consultar` (`:120`)
  - Relatório completo (PDF): DCTFWEB `CONSDECCOMPLETA33`, `Consultar` (`:165`)
  - Recibo (PDF): DCTFWEB `CONSRECIBO32`, `Consultar` (`:193`)
  - Gerar guia DARF (PDF): DCTFWEB `GERARGUIA31`, `Emitir` (`:221`)
- **Entradas:** tRPC `dctfweb.router.ts` → `sincronizar` (`:12`), `sincronizarLote` (`:23`),
  `consultarRelatorio` (`:31`), `consultarRecibo` (`:35`), `gerarGuia` (`:39`).
- **Cron:** não.

## 3. Integra Contador → Caixa Postal (e-CAC / DTE)

- **Serviço:** `apps/api/src/caixapostal/caixapostal.service.ts`
- **Endpoints (`/integra-contador/v1/{Consultar|Monitorar}`):**
  - Auth próprio: `POST .../authenticate` (`:107`)
  - Listar mensagens: CAIXAPOSTAL `MSGCONTRIBUINTE61`, `Consultar` (`:196`)
  - Detalhar: `MSGDETALHAMENTO62`, `Consultar` (`:219`)
  - Indicador de novas: `INNOVAMSG63`, `Monitorar` (`:242`)
- **Entradas:** tRPC `caixapostal.router.ts` → `consultarClassificadas` (`:62`), `detalharMensagem`
  (`:76`), `indicadorNovas` (`:79`), `consultarNovasLote` (`:101`), `classificarLote` (`:104`).
- **Cron:** `caixapostal.scheduler.ts` — diário 6h (`0 6 * * *`).

## 4. CND Federal (Receita / PGFN)

- **Serviço:** `apps/api/src/cnd/cnd.service.ts`
- **Endpoints (`gateway.apiserpro.serpro.gov.br`):**
  - Auth OAuth: `POST /token` (`:115`)
  - Consulta certidão: `POST /consulta-cnd/v1/certidao` (`:154`), com polling em status 7 (`:192`)
- **Entradas:** tRPC `cnd.router.ts` → `consultar` (`:178`), `consultarLote` (`:192`). REST
  `cnd.controller.ts` só lê banco.
- **Cron:** `cnd.scheduler.ts` — segunda 7h (`0 7 * * 1`).

## 5. Consulta CNPJ e Consulta CPF

- **Serviço:** `apps/api/src/cnpj/cnpj.service.ts`
- **Endpoints (`gateway.apiserpro.serpro.gov.br`):**
  - Token: `POST /token` (`:96`)
  - CNPJ v2: `GET /consulta-cnpj-df/v2/empresa/{cnpj}` (`:123`)
  - CPF v2: `GET /consulta-cpf-df/v2/cpf/{cpf}` (`:282`)
- **Fonte híbrida:** `consultarCnpj` (`:390`) só usa SERPRO se o **gate de custo** liberar; senão cai
  em **BrasilAPI** (`GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}`, `:491`).
  `consultarPreferindoBrasilApi` (`:448`) inverte a ordem. **Consulta CPF é exclusivamente SERPRO.**
- **Entradas (consumidores de `CnpjService`):** `socio.router.ts` (`:259/261`), `cliente.router.ts:1002`,
  `cliente/integration.service.ts`, `cliente/cliente-enriquecimento.service.ts:39`, `lead.service.ts:437`,
  `crm.service.ts:347` (CPF), `sitfis.router.ts:41`.
- **Cron:** não (disparado por ação do usuário / enriquecimento).

## 6. Carimbo de Tempo / TSA (RFC 3161)

- **Serviço:** `apps/api/src/contrato/tsa-serpro.service.ts`
- **Endpoints (`gateway.apiserpro.serpro.gov.br`):**
  - Token: `POST /token` (`:36`)
  - Carimbo: `POST /apitimestamp/v1/stamps-asn1` (`Content-Type: application/timestamp-query`, `:94`)
- **Entrada:** consumido por `contrato/pdf-sign.service.ts:220` ao assinar PDF de contrato com
  timestamp PAdES (gate `tsa.isConfigured()`).
- **Cron:** não.

## 7. SERPRO Neo iD / SerproID (assinatura digital gov.br)

- **Serviço:** `apps/api/src/contrato/contrato.service.ts` (`iniciarAssinaturaSerproId`, `:1505`)
- **Endpoints (`https://serproid.serpro.gov.br`, `SERPROID_BASE_URL`):**
  - Authorize: `${base}/oauth/v0/oauth/authorize` (`:1530`)
  - Token: `POST ${base}/oauth/v0/oauth/token` (`:1551`)
  - Assinatura: `POST ${base}/oauth/v0/oauth/signature` (CMS/PKCS#7, `:1581`)
  - Userinfo: `GET ${base}/oauth/v0/oauth/userinfo` (`:1614`)
- **Entradas:** tRPC `contrato.router.ts` → `iniciarAssinaturaSerproId` (`:161`),
  `iniciarAssinaturaSerproIdPublico` (`:166`), `processarCallbackSerproId` (`:174`).
- **Cron:** não.

---

## NÃO são SERPRO (mesmo diretório `cnd/`, outra fonte)

| Serviço | Fonte real |
|---|---|
| `cnd/crf-fgts.service.ts` (FGTS/CRF) | Caixa Econômica (Puppeteer) |
| `cnd/cndt-trabalhista.service.ts` (CNDT) | TST (Puppeteer + 2Captcha) |
| `cnd/cnd-municipal.service.ts` | Prefeituras ES (Puppeteer) |
| `cnd/cnd-estadual.service.ts` | SEFAZ-ES (fetch direto) |
| `cnd/alvara-bombeiros.service.ts` | SIAT/Corpo de Bombeiros ES |
| `cnd/alvara-funcionamento.service.ts` | Prefeituras ES (Puppeteer) |
| `cnd/cgu-certidao.service.ts` | CGU (Puppeteer) |
| `cnpj.service.ts` (fallback) | BrasilAPI (gratuito) |

`compilar-certidoes.service.ts` é só orquestrador (agrega os serviços acima, sem HTTP próprio).

---

## Variáveis de ambiente / configuração

Lidas do `SystemConfig` (banco) primeiro, `process.env` como fallback. Geridas em
`apps/api/src/admin/admin.service.ts` (grupos "SERPRO" `:55` e "SERPRO Neo iD" `:178`).

| Variável | Uso |
|---|---|
| `CONSUMER_KEY` / `CONSUMER_SECRET` | OAuth Basic (Integra / CND / CNPJ / TSA) |
| `CERTIFICADO_SENHA` | passphrase do PFX |
| `CNPJ_CONTRATANTE` | contratante / autorPedidoDados (Integra) |
| `SITFIS_ID_SERVICO_SOLICITAR` / `SITFIS_ID_SERVICO_EMITIR` | idServico SITFIS (defaults `SOLICITARPROTOCOLO91` / `RELATORIOSITFIS92`) |
| `CAIXA_POSTAL_LOTE_DELAY_MS`, `CAIXA_POSTAL_SCHEDULE_*` | throttle + cron da caixa postal |
| `CND_SCHEDULE_CRON` / `CND_SCHEDULE_ENABLED` | cron da CND |
| `SERPROID_CLIENT_ID` / `_CLIENT_SECRET` / `_REDIRECT_URI` / `_BASE_URL` | Neo iD (default base `https://serproid.serpro.gov.br`) |
| `CERTIFICADO_KEK` | KEK para criptografar a senha do PFX |

Certificado PFX físico: `uploads/certificado.pfx`.

---

## Gate de custo / feature flag

- **Migration:** `packages/db/migrations/manual_2026_06_26_serpro_gate_custo.sql`
  - `empresas.serpro_habilitado` (bool) + `empresas.serpro_orcamento_mensal` (double)
  - `api_logs.operation` + `api_logs.custo` (custo congelado por chamada)
  - `api_pricing (source, operation)` — seed `serpro / consulta-cnpj = 1.1717 BRL`
- **Lógica:** `cnpj.service.avaliarGateSerpro()` (`:349`) — checa habilitação + teto mensal vs gasto;
  se estourar, bloqueia SERPRO e cai em BrasilAPI. `precoOperacao()` (`:324`) + `logApi()` (`:376`).
- **Cobertura atual:** apenas **Consulta CNPJ**. SITFIS, DCTFWeb, CaixaPostal, CND, TSA e Neo iD
  **não** passam por esse controle de orçamento.
