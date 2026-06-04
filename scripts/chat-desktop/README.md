# OneClick Chat — Desktop

Aplicativo desktop Electron do chat interno do OneClick. Roda no system tray do
Windows, mostra notificações nativas, mantém a sessão logada entre execuções.

## Arquitetura

- **main.js** — main process: BrowserWindow, tray, IPC, single-instance lock,
  protocolo `oneclick-chat://` pro fluxo de auth via browser externo (Fase 3).
- **preload.js** — bridge IPC exposta como `window.chatDesktop` no renderer.
- **assets/** — ícones (.ico Windows, tray PNG).

A janela aponta pra `https://app.oneclick.central-rnc.com.br/chat-desktop`,
que renderiza o `<ChatHeaderButton embed />` em fullscreen. UI 100%
compartilhada com a versão web.

## Desenvolvimento

```bash
cd scripts/chat-desktop
npm install
npm start
```

Por padrão aponta pra produção. Pra dev local, sobreescreva via env:

```bash
ONECLICK_APP_URL=http://localhost:3000 npm start
```

## Build do instalador

```bash
npm run build
# → dist/OneClick-Chat-Setup-0.1.0.exe
```

`electron-builder` gera NSIS installer (~80MB) com auto-update via
`electron-updater` apontado pra `/api/chat-desktop-updates` (endpoint
similar ao `/api/launcher-updates` que já existe).

## Distribuição

Após o build, copiar o `.exe` e `latest.yml` pra pasta servida pelo endpoint
`/api/chat-desktop-updates` na VPS (a implementar — Fase 5).
