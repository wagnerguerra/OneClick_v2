/**
 * Schedulers automáticos (cron/intervalos) só rodam em PRODUÇÃO (a VPS).
 *
 * Em dev/local eles ficam desativados pra não disparar efeitos reais: e-mails
 * (mesmo SMTP de produção), integrações externas (SEFAZ/SERPRO), backups do
 * Drive, notificações em massa, etc. — que aconteceriam ao rodar a API local.
 *
 * Override opcional pra testar um scheduler localmente: `SCHEDULERS_LOCAL=on`.
 */
export function schedulersAtivos(): boolean {
  if (process.env.SCHEDULERS_LOCAL === 'on') return true
  return process.env.NODE_ENV === 'production'
}
