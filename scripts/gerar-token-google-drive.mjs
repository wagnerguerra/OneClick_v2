#!/usr/bin/env node
/**
 * Gera um novo refresh token para a integração do Google Drive.
 *
 * QUANDO USAR
 *
 * Quando a API registrar `[DRIVE-EXIGE-ADMIN] … invalid_grant` — o Google
 * invalidou o refresh token (expirou, foi revogado, ou a senha da conta mudou)
 * e documentos, portal e sincronização param de falar com o Drive. Aconteceu em
 * 25/09/2026.
 *
 * O QUE FAZ
 *
 *  1. Abre o navegador na tela de autorização do Google.
 *  2. Você entra com a conta Google DONA das pastas de clientes e autoriza.
 *  3. O script recebe a resposta num endereço local (127.0.0.1), troca pelo
 *     refresh token, CONFIRMA que ele funciona e diz de qual conta ele é.
 *  4. Imprime a linha pronta para o `.env` da VPS.
 *
 * Nada é gravado em lugar nenhum: o token só aparece no terminal.
 *
 * ANTES DE RODAR
 *
 * Precisa do MESMO `credentials.json` que a produção usa — o refresh token fica
 * amarrado ao client_id que o gerou, e um token de outro client não funciona lá.
 * Copie da VPS para a pasta `google/` (que está no .gitignore):
 *
 *     scp -i ~/.ssh/oneclick_deploy root@72.60.155.69:/opt/google/credentials.json google/credentials.json
 *
 * USO
 *
 *     node scripts/gerar-token-google-drive.mjs [caminho/do/credentials.json]
 *
 * RODE NUM TERMINAL SEU, e não pelo prefixo `!` de uma sessão com assistente:
 * o token impresso é uma senha, e ali ele ficaria gravado no histórico da
 * conversa.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { google } from 'googleapis'

/**
 * Escopo COMPLETO do Drive. O modo OAuth da produção envia arquivos, cria
 * pastas, manda para a lixeira e apaga — `drive.readonly` quebraria tudo isso
 * com 403, e o erro só apareceria na primeira tentativa de envio.
 */
const ESCOPOS = ['https://www.googleapis.com/auth/drive']

/** Tempo para a pessoa concluir a autorização no navegador. */
const PRAZO_MS = 5 * 60 * 1000

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function falhar(msg) {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

function lerCredenciais(caminho) {
  if (!fs.existsSync(caminho)) {
    falhar(
      `Não encontrei ${caminho}.\n\n`
      + '  Copie o credentials.json da produção (o token fica amarrado ao client_id dele):\n'
      + '    scp -i ~/.ssh/oneclick_deploy root@72.60.155.69:/opt/google/credentials.json google/credentials.json',
    )
  }
  let json
  try {
    json = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  } catch (e) {
    falhar(`${caminho} não é um JSON válido: ${e.message}`)
  }
  const bloco = json.installed ?? json.web
  if (!bloco?.client_id || !bloco?.client_secret) {
    falhar(`${caminho} não tem client_id/client_secret. Esperado o JSON de um OAuth Client (Desktop).`)
  }
  return { clientId: bloco.client_id, clientSecret: bloco.client_secret, tipo: json.installed ? 'installed' : 'web' }
}

/** Abre a URL no navegador padrão. Se não der, a URL já está impressa. */
function abrirNavegador(url) {
  const [cmd, args] = process.platform === 'win32'
    // `rundll32 … FileProtocolHandler` e não `start`: o `start` do cmd corta a
    // URL no primeiro `&`, e a de autorização tem vários.
    ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
  } catch {
    // Sem navegador disponível: a pessoa copia a URL do terminal.
  }
}

/**
 * Sobe o servidor local ANTES de montar a URL de autorização — a porta, escolhida
 * pelo sistema, faz parte do redirect_uri. Devolve a porta e a promessa do
 * `code` que o Google manda de volta.
 */
async function iniciarServidor(estadoEsperado) {
  let entregar, recusar
  const codigo = new Promise((res, rej) => { entregar = res; recusar = rej })

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/') { res.writeHead(404).end(); return }

    const pagina = (titulo, texto) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>${titulo}</title>`
        + '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;line-height:1.5">'
        + `<h1 style="font-size:1.125rem">${titulo}</h1><p>${texto}</p></body>`)
    }

    const erro = url.searchParams.get('error')
    if (erro) {
      pagina('Autorização não concluída', `O Google respondeu: <code>${erro}</code>. Volte ao terminal.`)
      servidor.close()
      recusar(new Error(`o Google respondeu "${erro}"`))
      return
    }

    // O `state` confere que a resposta é desta execução, e não de uma
    // requisição forjada para o endereço local.
    if (url.searchParams.get('state') !== estadoEsperado) {
      pagina('Resposta inválida', 'O identificador desta autorização não confere. Rode o script de novo.')
      return
    }

    const code = url.searchParams.get('code')
    if (!code) { pagina('Resposta sem código', 'Rode o script de novo.'); return }

    pagina('Pronto', 'Autorização recebida. Pode fechar esta aba e voltar ao terminal.')
    servidor.close()
    entregar(code)
  })

  // Porta 0: o sistema escolhe uma livre. O client "Desktop" aceita qualquer
  // porta de loopback.
  await new Promise(pronto => servidor.listen(0, '127.0.0.1', pronto))

  const prazo = setTimeout(() => {
    servidor.close()
    recusar(new Error('passaram 5 minutos sem a autorização ser concluída'))
  }, PRAZO_MS)
  servidor.on('close', () => clearTimeout(prazo))

  return { porta: servidor.address().port, codigo }
}

async function main() {
  const caminho = path.resolve(
    process.argv[2]
      ?? process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE
      ?? path.join(raiz, 'google', 'credentials.json'),
  )
  const cred = lerCredenciais(caminho)
  if (cred.tipo !== 'installed') {
    console.warn(
      '⚠ Este credentials.json é de um client "web". O fluxo local só funciona se '
      + 'http://127.0.0.1 estiver entre os redirect URIs autorizados dele no Google Cloud.',
    )
  }

  const estado = crypto.randomBytes(16).toString('hex')
  const { porta, codigo } = await iniciarServidor(estado)
  const redirectUri = `http://127.0.0.1:${porta}`

  const oauth = new google.auth.OAuth2(cred.clientId, cred.clientSecret, redirectUri)
  const urlAutorizacao = oauth.generateAuthUrl({
    access_type: 'offline',
    // `consent` força o Google a devolver um refresh token mesmo para quem já
    // tinha autorizado antes — sem isso, a segunda autorização vem sem ele.
    prompt: 'consent',
    scope: ESCOPOS,
    state: estado,
  })

  console.log('\nAbrindo o navegador para autorizar o acesso ao Google Drive.')
  console.log('Entre com a conta Google DONA das pastas de clientes.\n')
  console.log('Se o navegador não abrir, copie este endereço:\n')
  console.log(`  ${urlAutorizacao}\n`)
  abrirNavegador(urlAutorizacao)

  let code
  try {
    code = await codigo
  } catch (e) {
    falhar(`Autorização não concluída: ${e.message}.`)
  }

  const { tokens } = await oauth.getToken(code).catch(e => falhar(`Troca do código falhou: ${e.message}`))
  if (!tokens.refresh_token) {
    falhar(
      'O Google não devolveu um refresh token.\n\n'
      + '  Remova o acesso do app em https://myaccount.google.com/permissions e rode de novo.',
    )
  }

  // Prova de vida: o token novo abre o Drive, e de QUAL conta ele é. Colar na
  // produção um token da conta errada troca um erro claro por pastas vazias.
  const verificador = new google.auth.OAuth2(cred.clientId, cred.clientSecret)
  verificador.setCredentials({ refresh_token: tokens.refresh_token })
  const sobre = await google.drive({ version: 'v3', auth: verificador })
    .about.get({ fields: 'user(emailAddress,displayName)' })
    .catch(e => falhar(`O token foi gerado, mas não abriu o Drive: ${e.message}`))
  const conta = sobre.data.user

  console.log('✓ Token gerado e testado.')
  console.log(`  Conta:  ${conta?.displayName ?? '?'} <${conta?.emailAddress ?? '?'}>`)
  console.log(`  Escopo: ${tokens.scope ?? ESCOPOS.join(' ')}\n`)
  console.log('Troque esta linha em /opt/oneclick/.env na VPS:\n')
  console.log(`GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`)
  console.log('Depois reinicie a API:  docker restart oneclick-api\n')
  console.log(
    'Para não repetir isto daqui a uma semana: se o app OAuth estiver em modo "Testing"\n'
    + 'no Google Cloud Console (APIs & Services → OAuth consent screen), publique-o\n'
    + '("In production"). Em Testing, o Google expira o refresh token a cada 7 dias.\n',
  )
}

main().catch(e => falhar(e.message))
