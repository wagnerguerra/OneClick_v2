const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Service management
  getStatus: () => ipcRenderer.invoke('get-status'),
  startService: (id) => ipcRenderer.invoke('start-service', id),
  stopService: (id) => ipcRenderer.invoke('stop-service', id),
  restartService: (id) => ipcRenderer.invoke('restart-service', id),
  startAll: () => ipcRenderer.invoke('start-all'),
  stopAll: () => ipcRenderer.invoke('stop-all'),

  // Docker
  getDockerStatus: () => ipcRenderer.invoke('get-docker-status'),
  startDocker: () => ipcRenderer.invoke('start-docker'),
  stopDocker: () => ipcRenderer.invoke('stop-docker'),

  // Start/Stop everything
  startEverything: () => ipcRenderer.invoke('start-everything'),
  stopEverything: () => ipcRenderer.invoke('stop-everything'),

  // Logs
  getLogs: (id) => ipcRenderer.invoke('get-logs', id),
  clearLogs: (id) => ipcRenderer.invoke('clear-logs', id),
  clearAllLogs: () => ipcRenderer.invoke('clear-all-logs'),
  onLog: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('log-entry', handler);
    return () => ipcRenderer.removeListener('log-entry', handler);
  },

  // Active users
  getActiveUsers: () => ipcRenderer.invoke('get-active-users'),

  // SCI
  getSciStatus: () => ipcRenderer.invoke('get-sci-status'),
  // BI Sync — executa sci_balancete.py local e retorna linhas
  biSyncFetchSci: (payload) => ipcRenderer.invoke('bi-sync-fetch-sci', payload),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Claude Code
  launchClaude: (dir) => ipcRenderer.invoke('launch-claude', dir),

  // Browse folder
  browseFolder: () => ipcRenderer.invoke('browse-folder'),

  // Project root
  getProjectRoot: () => ipcRenderer.invoke('get-project-root'),
  setProjectRoot: (path) => ipcRenderer.invoke('set-project-root', path),

  // Auto-update
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-event', handler);
    return () => ipcRenderer.removeListener('update-event', handler);
  },

  // Events from main
  onStatusUpdate: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('status-update', handler);
    return () => ipcRenderer.removeListener('status-update', handler);
  },
  onNotification: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('notification', handler);
    return () => ipcRenderer.removeListener('notification', handler);
  },

  // NFe Watcher (pasta local)
  nfeWatcherStatus: () => ipcRenderer.invoke('nfe-watcher:status'),
  nfeWatcherRefresh: () => ipcRenderer.invoke('nfe-watcher:refresh'),
  nfeWatcherStart: () => ipcRenderer.invoke('nfe-watcher:start'),
  nfeWatcherStop: () => ipcRenderer.invoke('nfe-watcher:stop'),
  onNfeWatcherLog: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('nfe-watcher:log', handler);
    return () => ipcRenderer.removeListener('nfe-watcher:log', handler);
  },
});
