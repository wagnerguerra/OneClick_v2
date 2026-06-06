# Build do app mobile (Expo + EAS)

Guia para gerar builds do app `apps/mobile` (Expo SDK 56) usando **EAS Build**.
Os arquivos de configuração já estão prontos (`apps/mobile/eas.json` e `apps/mobile/app.json`).
Os passos abaixo são executados por você (exigem login interativo na conta Expo).

---

## 1. Pré-requisitos

- Conta Expo (https://expo.dev) — crie/entre com a conta da empresa.
- EAS CLI. Use uma das opções:
  - Global: `npm i -g eas-cli`
  - Sem instalar: `npx eas-cli@latest <comando>` (substitua `eas` por `npx eas-cli` nos comandos abaixo).
- Para builds iOS: conta **Apple Developer** (US$ 99/ano) — o EAS gerencia os certificados/perfis.
- Para builds Android: nada além da conta Expo (o EAS gera o keystore automaticamente na primeira build).

---

## 2. Login e inicialização do projeto

```bash
eas login
cd apps/mobile
eas init
```

`eas init` cria o projeto na conta Expo, define o `owner` e grava o `projectId` em
`apps/mobile/app.json` (`expo.extra.eas.projectId`). **Deixe o EAS gravar isso** — não
preenchemos `owner`/`projectId` manualmente de propósito.

> Observação: o `eas.json` está com `cli.appVersionSource: "remote"`. Isso significa que
> o número de versão/build é gerenciado pelo servidor EAS (combina com o `autoIncrement`
> do profile `production`). Na primeira build de produção o EAS pergunta o número inicial.

---

## 3. Monorepo pnpm — atenção à resolução de módulos

Este repositório é um monorepo **pnpm** (Turborepo). Hoje **não existe `.npmrc` na raiz**,
ou seja, o pnpm usa o `node-linker` padrão (`isolated`, com symlinks). O app já builda
localmente via Metro porque as dependências nativas necessárias estão declaradas como
**deps diretas** em `apps/mobile/package.json` (notadamente `react-native-css-interop` e
`expo-network`), então não dependemos de hoisting acidental.

A variável `EAS_NO_VCS` **não é necessária** aqui (o projeto está em git, e o EAS usa o
git para empacotar o source).

**Se** uma build no EAS falhar com erro de resolução de módulo (ex.: "Unable to resolve
module ..." ou alguma dep nativa do monorepo não encontrada), a recomendação oficial é
forçar o hoisting do pnpm:

1. Criar um `.npmrc` na **raiz** do monorepo com:
   ```
   node-linker=hoisted
   ```
2. Reinstalar: `pnpm install` na raiz.

> AVISO: mudar para `node-linker=hoisted` **reinstala todo o monorepo** e muda o layout do
> `node_modules` de todos os apps/packages — pode ter efeitos colaterais em `web`/`api`.
> **Não faça isso sem aprovação.** Só recorra a essa opção se a build EAS realmente
> quebrar na resolução de módulos; hoje o build local funciona sem ela.

Alternativa menos invasiva: declarar a dep faltante como dep direta em
`apps/mobile/package.json` (foi o que já fizemos com `react-native-css-interop`/`expo-network`).

---

## 4. Comandos de build

Os profiles estão definidos em `apps/mobile/eas.json`:

| Profile       | Distribuição | Android   | API apontada                                      |
|---------------|--------------|-----------|---------------------------------------------------|
| `development` | internal     | APK       | `http://192.168.0.58:4000` (LAN dev)              |
| `preview`     | internal     | APK       | `https://app.oneclick.central-rnc.com.br` (prod)  |
| `production`  | store        | AAB       | `https://app.oneclick.central-rnc.com.br` (prod)  |

> Rode os comandos de dentro de `apps/mobile`.

### Preview (APK para instalar direto no celular — recomendado para testes)

```bash
eas build -p android --profile preview
```

Gera um `.apk`. Ao terminar, o EAS devolve um link/QR code — baixe o APK no celular Android
e instale (ative "instalar de fontes desconhecidas").

```bash
eas build -p ios --profile preview
```

Para iOS é necessário conta Apple. Distribuição interna via **TestFlight** ou via dispositivos
registrados (ad-hoc).

### Development (build com dev client, para desenvolvimento com Metro)

```bash
eas build -p android --profile development
```

Gera um APK com o **development client** embutido; depois rode `npx expo start --dev-client`
e abra pelo app instalado. Aponta para a API de dev na LAN (`192.168.0.58:4000`).

### Production (lojas)

```bash
eas build -p android --profile production   # gera .aab para a Play Store
eas build -p ios --profile production       # gera build para a App Store
```

O profile `production` usa `autoIncrement: true` (versão/build gerenciados pelo EAS via
`appVersionSource: remote`).

---

## 5. Como a API é apontada em cada build

O app resolve a URL da API em `apps/mobile/src/lib/api-url.ts`:

- Em primeiro lugar usa `EXPO_PUBLIC_API_URL` (variável de ambiente embutida no build).
- Se não houver, cai no fallback por `__DEV__` (LAN em dev / prod em release).

Cada profile do `eas.json` já injeta `EXPO_PUBLIC_API_URL` no bloco `env`:

- `development` → `http://192.168.0.58:4000`
- `preview` e `production` → `https://app.oneclick.central-rnc.com.br`

Para apontar para outro backend (ex.: staging), edite o `env` do profile correspondente
no `eas.json` ou rode com `--profile` e uma env temporária.

---

## 6. Distribuição interna

- **Android (APK)**: o EAS gera um link público de download ao final da build
  (`https://expo.dev/artifacts/...`). Compartilhe o link/QR; instala direto no aparelho.
- **iOS (TestFlight)**: após `eas build -p ios --profile production` (ou preview com conta
  Apple), use `eas submit -p ios` para enviar ao App Store Connect e distribuir via
  TestFlight aos testadores convidados.
- Builds com `distribution: "internal"` podem ser instaladas sem passar pela loja
  (Android direto pelo APK; iOS exige dispositivos registrados ou TestFlight).

---

## 7. Submit para as lojas (opcional)

O bloco `submit.production` no `eas.json` é um placeholder. Antes de publicar:

```bash
eas submit -p android --profile production   # precisa do JSON da conta de serviço Google Play
eas submit -p ios --profile production       # precisa de credenciais App Store Connect
```

Preencha as credenciais das lojas no `submit.production` (ou siga os prompts do EAS) quando
for de fato publicar.

## Distribuição pelo dashboard (`/baixar-app`)

O dashboard tem uma página de download do app (menu do usuário → "Baixar app mobile"),
servida pelo endpoint `GET /api/mobile-app`.

**Android (APK):**
1. Gere o APK: `cd apps/mobile && eas build -p android --profile preview` (build na nuvem).
2. Baixe o `.apk` e coloque em `scripts/mobile-dist/` (no deploy o repo é montado em
   `/repo-src`, então o controller acha o arquivo lá). O endpoint serve o `.apk` mais recente.
   - Alternativa sem hospedar: defina `MOBILE_ANDROID_URL` apontando pro artefato do EAS.

**iOS:** não há instalador self-hosted pra devices arbitrários. Defina a env
`MOBILE_IOS_URL` com o link do **TestFlight** (teste interno) ou da **App Store** (público).

Sem APK na pasta e sem essas envs, a página mostra os cards como "em breve".
