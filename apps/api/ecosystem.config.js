/**
 * PM2 ecosystem — auto-restart e supervisão da API.
 *
 * Uso (em produção):
 *   pnpm --filter api build           # gera dist/main.js
 *   pnpm --filter api start:pm2       # inicia sob supervisão
 *   pnpm --filter api logs            # acompanha logs
 *   pnpm --filter api stop:pm2        # para
 *
 * Comportamento:
 *  - Se o processo morrer (uncaught, crash, OOM), PM2 reinicia automaticamente.
 *  - max_restarts: 10 reinícios em min_uptime curtos antes de desistir
 *    (evita loop infinito quando o erro é determinístico).
 *  - max_memory_restart: reinicia se passar do limite (proteção contra leak).
 */
module.exports = {
  apps: [
    {
      name: 'oneclick-api',
      script: './dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',

      // Restart automático em caso de crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 1000,

      // Reinicia se passar de 1GB (ajuste conforme seu host)
      max_memory_restart: '1G',

      // Em produção, NUNCA assista arquivos. Watch é só pra dev.
      watch: false,

      env: {
        NODE_ENV: 'production',
      },

      // Logs com timestamp
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
    },
  ],
}
