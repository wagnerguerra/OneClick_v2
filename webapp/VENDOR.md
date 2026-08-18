# webapp — código vendorizado

Backend de processamento das **Ferramentas Fiscais/Contábeis** do OneClick V2
(API Fastify + workers + engines Python/Node). Vive aqui como subpasta
**self-contained**: tem `docker-compose.yml`, `package.json` e `.env` próprios;
**não** faz parte do workspace pnpm/turbo do OneClick (`apps/*`, `packages/*`).

## Origem
- Repositório: https://github.com/Bruno-1990/Webapp
- Commit vendorizado: `afb548d` (branch `main`)
- Data: 2026-08-18

## Como rodar / deployar
Ver `webapp/docs/DEPLOY-VPS.md`. Resumo: `cd webapp && docker compose --profile sped
--profile comparacao --profile nfse --profile gnre up -d --build`. O OneClick
alcança a API por `http://webapp-api:8000` na rede `fiscal_net`.

## Observações
- `webapp/.github/workflows/*` são **inertes** aqui (o GitHub só executa workflows
  do `.github/workflows` na raiz do repositório).
- Para atualizar o vendor: reextrair o `git archive HEAD` do repo de origem sobre
  esta pasta e commitar, registrando o novo commit-fonte acima.
