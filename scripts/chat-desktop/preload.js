/**
 * Bridge IPC entre o renderer (página /chat-desktop) e o main process.
 * Exposto como `window.chatDesktop` no renderer.
 *
 * A página /chat-desktop pode checar `if (window.chatDesktop)` pra detectar
 * que está rodando dentro do Electron e ativar comportamentos extras
 * (notificações nativas, badge do tray, etc).
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('chatDesktop', {
  /** Dispara notificação nativa do Windows. */
  notify: (payload) => ipcRenderer.invoke('chat:notify', payload),
  /** Atualiza o tooltip/badge do tray com o número de não lidas. */
  setUnread: (count) => ipcRenderer.invoke('chat:set-unread', count),
  /** Flag pra detectar se está rodando no app desktop. */
  isDesktop: true,
})
