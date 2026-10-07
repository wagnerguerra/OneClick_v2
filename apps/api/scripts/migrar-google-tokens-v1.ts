/**
 * Migra as conexões do Google Agenda do OneClick v1 (MySQL db_intranet,
 * tabela google_tokens) para o v2 (google_calendar_tokens).
 *
 * Só funciona porque o v2 usa o MESMO aplicativo OAuth do v1 — refresh token é
 * preso ao aplicativo. O usuário é casado pelo e-mail (ger_cad_usu.cad_usu_email
 * ↔ users.email). O token entra VENCIDO (expires_at no passado) de propósito: o
 * primeiro uso renova e confirma que ainda vale.
 *
 * Uso (da máquina do escritório — o MySQL do v1 só existe na LAN):
 *   V1_DB_PASSWORD=*** DATABASE_URL=<banco destino> \
 *     npx tsx --env-file=.env scripts/migrar-google-tokens-v1.ts --dry-run
 *   (sem --dry-run grava; usuário que já tem conexão no v2 é mantido)
 * Variáveis opcionais: V1_DB_HOST (192.168.0.7), V1_DB_USER (rose), V1_DB_NAME (db_intranet).
 * Nunca imprime tokens.
 */
import mysql from 'mysql2/promise'
import { prisma } from '@saas/db'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const senha = process.env.V1_DB_PASSWORD
  if (!senha) throw new Error('Defina V1_DB_PASSWORD (senha do MySQL do v1).')
  const v1 = await mysql.createConnection({
    host: process.env.V1_DB_HOST || '192.168.0.7',
    port: 3306,
    user: process.env.V1_DB_USER || 'rose',
    password: senha,
    database: process.env.V1_DB_NAME || 'db_intranet',
  })

  // Último token de cada usuário (o v1 também lê "ORDER BY id DESC LIMIT 1").
  const [linhas] = await v1.query(
    `SELECT t.id_usuario, LOWER(TRIM(u.cad_usu_email)) AS email, t.access_token, t.refresh_token
       FROM google_tokens t
       JOIN (SELECT id_usuario, MAX(id) AS id FROM google_tokens GROUP BY id_usuario) ult ON ult.id = t.id
       LEFT JOIN ger_cad_usu u ON u.CAD_USU_ID = t.id_usuario`,
  ) as unknown as [Array<{ id_usuario: number; email: string | null; access_token: string; refresh_token: string | null }>]
  await v1.end()

  let casou = 0, semEmail = 0, semUsuario = 0, semRefresh = 0, jaConectado = 0, gravados = 0
  for (const l of linhas) {
    if (!l.refresh_token) { semRefresh++; continue }
    if (!l.email) { semEmail++; continue }
    const user = await prisma.user.findFirst({ where: { email: { equals: l.email, mode: 'insensitive' }, isActive: true }, select: { id: true } })
    if (!user) { semUsuario++; continue }
    casou++
    const existe = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM google_calendar_tokens WHERE user_id = $1', user.id)
    if (existe.length > 0) { jaConectado++; continue }
    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO google_calendar_tokens (user_id, access_token, refresh_token, expires_at) VALUES ($1, $2, $3, NOW() - INTERVAL '1 day')`,
        user.id, l.access_token, l.refresh_token,
      )
      gravados++
    }
  }

  console.log(JSON.stringify({
    modo: dryRun ? 'dry-run (nada gravado)' : 'gravação',
    usuariosV1ComToken: linhas.length, casaramComV2: casou, gravados,
    jaConectadosNoV2: jaConectado, semRefreshToken: semRefresh, semEmailNoV1: semEmail, semUsuarioAtivoNoV2: semUsuario,
  }, null, 2))
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('ERRO:', (e as Error).message); await prisma.$disconnect(); process.exit(1) })
