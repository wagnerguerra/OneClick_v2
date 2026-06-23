# CI — Build das imagens fora da VPS (ghcr.io)

Objetivo: tirar o `next build` (pesado de RAM) da produção. Hoje o Service
Manager builda API e Web **na própria VPS** (via `docker buildx bake`), o que
satura a RAM e trava o deploy na etapa BUILD WEB. Com este pipeline, o build
roda no runner do GitHub e a VPS só faz `docker pull` + `up`.

Workflow: `.github/workflows/build-images.yml` (trigger **manual** por enquanto).

## 1. Configurar no GitHub (uma vez)

**Settings → Secrets and variables → Actions → aba "Variables"** (não Secrets — são `NEXT_PUBLIC_*`, ficam embutidas no bundle, não são segredo):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | o **mesmo** valor que o SM passa hoje no build do web (destino do rewrite `/be/*` → API; em same-host costuma ser a URL interna da API) |
| `NEXT_PUBLIC_APP_URL` | URL pública do app, ex. `https://app.oneclick.central-rnc.com.br` |

> Sem essas variáveis o web é buildado com `http://localhost:4000`/`:3000` (defaults do `next.config.ts`) e os links/rewrites de prod ficam errados.

O push pro `ghcr.io` usa o `GITHUB_TOKEN` embutido — sem secret extra.

## 2. Rodar o build

GitHub → **Actions** → "Build & Push imagens (API + Web)" → **Run workflow** (na branch `oneclick_v2`).

Saída: imagens publicadas em
- `ghcr.io/wagnerguerra/oneclick-api:latest` (+ tag do SHA)
- `ghcr.io/wagnerguerra/oneclick-web:latest` (+ tag do SHA)

Para build automático a cada push, descomente o bloco `push:` no workflow.

## 3. Consumir na VPS (mudança no Service Manager)

Esta parte é no **seu Service Manager / VPS** (fora do repo). No lugar do
`docker buildx bake`, o passo de deploy passa a ser:

```bash
# 1x — autenticar no registry (PAT com escopo read:packages; ou torne os
# pacotes públicos em ghcr e pule o login)
echo "$GHCR_PAT" | docker login ghcr.io -u wagnerguerra --password-stdin

# a cada deploy
docker pull ghcr.io/wagnerguerra/oneclick-api:latest
docker pull ghcr.io/wagnerguerra/oneclick-web:latest
docker compose up -d        # com image: apontando pros ghcr
```

No `compose` de prod (que vive na VPS/SM), trocar `build:` por:
```yaml
  api:
    image: ghcr.io/wagnerguerra/oneclick-api:latest
  web:
    image: ghcr.io/wagnerguerra/oneclick-web:latest
```

Os passos pós-deploy que já existem (SQLs cirúrgicos, restart) seguem iguais.

## Notas

- Cache de build via `type=gha` — builds seguintes ficam rápidos.
- O `next build` no runner do GitHub tem RAM de sobra (não há o risco de OOM/trava da VPS).
- Migração reversível: enquanto o SM ainda buildar local, este workflow só
  publica imagens; nada quebra. Plugue o `pull` quando quiser.
