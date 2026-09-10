# CI — Build das imagens fora da VPS (ghcr.io)

Objetivo: tirar o `next build` (pesado de RAM) da produção. Hoje o Service
Manager builda API e Web **na própria VPS** (via `docker buildx bake`), o que
satura a RAM e trava o deploy na etapa BUILD WEB. Com este pipeline, o build
roda no runner do GitHub e a VPS só faz `docker pull` + `up`.

Workflow: `.github/workflows/build-images.yml` — roda em **todo push na `main`**
(e também manualmente).

> **Estado em 08/09/2026:** as duas Variables já estão cadastradas e o build
> automático está ligado. O que ainda **não** foi feito é a VPS consumir as
> imagens — ela continua buildando local. Enquanto isso, o workflow só publica;
> nada em produção depende dele.

## 1. Configurar no GitHub (uma vez)

**Settings → Secrets and variables → Actions → aba "Variables"** (não Secrets — são `NEXT_PUBLIC_*`, ficam embutidas no bundle, não são segredo):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | o **mesmo** valor que o SM passa hoje no build do web (destino do rewrite `/be/*` → API; em same-host costuma ser a URL interna da API) |
| `NEXT_PUBLIC_APP_URL` | URL pública do app, ex. `https://app.oneclick.central-rnc.com.br` |

> Sem essas variáveis o web é buildado com `http://localhost:4000`/`:3000` (defaults do `next.config.ts`) e os links/rewrites de prod ficam errados.

O push pro `ghcr.io` usa o `GITHUB_TOKEN` embutido — sem secret extra.

## 2. Rodar o build

Automático a cada push na `main`. Para rodar à mão:
GitHub → **Actions** → "Build & Push imagens (API + Web)" → **Run workflow** (na branch `main`).

Saída: imagens publicadas em
- `ghcr.io/wagnerguerra/oneclick-api:latest` (+ tag do SHA)
- `ghcr.io/wagnerguerra/oneclick-web:latest` (+ tag do SHA)

O build **precisa** ser automático: o deploy publica um SHA e logo em seguida
quer a imagem daquele SHA. Se dependesse de clique, o deploy encontraria um
`:latest` de um commit anterior e publicaria o código errado sem avisar.

Não há bloco `concurrency` de propósito — cancelar o build antigo quando chega
push novo deixaria SHAs da `main` sem imagem, e é justamente por SHA que o
deploy vai puxar.

## 3. Consumir na VPS (mudança no Service Manager)

Esta parte é no **Service Manager / VPS**. A escolha aqui é puxar **por SHA** e
**retaguear com o nome local** que o compose já usa:

```bash
# 1x — autenticar no registry (PAT com escopo read:packages; ou torne os
# pacotes públicos em ghcr e pule o login)
echo "$GHCR_PAT" | docker login ghcr.io -u wagnerguerra --password-stdin

# a cada deploy, no lugar do `docker compose build`
docker pull ghcr.io/wagnerguerra/oneclick-api:<sha>
docker tag  ghcr.io/wagnerguerra/oneclick-api:<sha> oneclick-api:latest
docker pull ghcr.io/wagnerguerra/oneclick-web:<sha>
docker tag  ghcr.io/wagnerguerra/oneclick-web:<sha> oneclick-web:latest
```

**Por que retaguear em vez de apontar o compose para o ghcr.** Porque o
`oneclick-api:latest` não é usado só pelo compose: o passo que aplica o
`prisma db push` roda `docker run --rm ... oneclick-api:latest`. Mantendo o
nome local, tudo o que vem depois continua funcionando sem ser tocado. No
compose de produção basta **remover o bloco `build:`** — a linha `image:` fica
como está:

```yaml
  api:
    image: oneclick-api:latest   # o build: sai; a imagem passa a vir do ghcr
  web:
    image: oneclick-web:latest
```

**Por que por SHA e não por `latest`.** `latest` é uma corrida: dois deploys
próximos e você publica a imagem do outro commit sem perceber.

### O passo novo: esperar o build ficar pronto

Com o build fora da VPS, o deploy ganha uma dependência que não tinha — a
imagem do SHA precisa **existir** antes do pull. Então entra um estágio entre o
push e o pull, que consulta

    GET /repos/{repo}/actions/workflows/build-images.yml/runs?head_sha=<sha>

e espera a conclusão. O Service Manager já tem o encanamento: `GITHUB_TOKEN` no
`.deploy.local` e o helper `githubJson()`.

Os passos pós-deploy que já existem (SQLs cirúrgicos, restart) seguem iguais.

## Notas

- Cache de build via `type=gha` — builds seguintes ficam rápidos.
- O `next build` no runner do GitHub tem RAM de sobra (não há o risco de OOM/trava da VPS).
- Migração reversível: enquanto o SM ainda buildar local, este workflow só
  publica imagens; nada quebra. Plugue o `pull` quando quiser.
- **Visibilidade do pacote:** um pacote novo no ghcr nasce privado. Ou se
  autentica na VPS com um PAT de `read:packages`, ou se torna o pacote público.
  As imagens não carregam segredo — o `.env` entra em runtime via `env_file`, e
  os `NEXT_PUBLIC_*` embutidos no bundle são públicos por definição — mas a
  escolha é do Wagner e precisa ser feita antes do primeiro pull.
- **Motivo de fundo:** a VPS tem 2 vCPU e 7,8 GB, com o swap quase cheio e o
  disco em 78%; só o cache de build do Docker ocupa 19 GB (15 GB descartáveis).
  Tirar o build de lá devolve memória, CPU e disco — e dá rollback de graça,
  porque a imagem anterior continua no registry, tagueada pelo SHA.
