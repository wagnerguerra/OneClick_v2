/* eslint-disable */
/**
 * Migração do tenant JR GRUPO — OneClick v1 (ASP) → OneClick v2.
 *
 * O v1 do JR Grupo roda em ASP clássico sobre MySQL 5.0.45 (banco `angular_jrgrupo`,
 * um banco por tenant). Das 219 tabelas, só ~15 têm dados e o que continua vivo é o
 * cadastro de clientes. Este script migra SÓ o cadastro vivo — o histórico congelado
 * (ligações pararam em 2020, agenda em 2018) fica no MySQL como backup read-only.
 *
 * Lê o MySQL e GERA .sql idempotente em scripts/out/ — não escreve em lugar nenhum.
 * Ids determinísticos (jrg-area-<id>, jrg-cli-<id>, …) + ON CONFLICT DO UPDATE, então
 * reaplicar o mesmo arquivo é seguro e não duplica nada.
 *
 * A empresa de destino é resolvida por CNPJ em apply-time (subquery), não por cuid —
 * assim o mesmo .sql serve para dev e produção. Cada arquivo aborta com RAISE EXCEPTION
 * se a empresa não existir (Fase 0 do plano não foi feita).
 *
 * MySQL 5.0.45 não tem REGEXP_REPLACE nem CTEs — toda normalização acontece aqui em JS.
 *
 * Uso:
 *   node scripts/jrgrupo-migrate.js --fase=areas|cargos|servicos|clientes|contatos|usuarios|all
 *   node scripts/jrgrupo-migrate.js --fase=usuarios --email-scheme=numerado
 *
 * Aplicar (nesta ordem — há FK entre elas):
 *   areas → cargos → servicos → clientes → contatos → usuarios
 *   docker exec -i saas-postgres psql -U postgres -d saas_erp < scripts/out/jrgrupo-areas.sql
 */
const fs = require('fs')
const path = require('path')
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'))

// ── CNPJ da própria JR SERVIÇOS EMPRESARIAIS LTDA (a Empresa de destino no v2) ──
const EMPRESA_CNPJ = '03536561000106'
const EMPRESA_NOME = 'JR SERVIÇOS EMPRESARIAIS LTDA'
// Domínio usado para sintetizar e-mail de quem não tem endereço próprio no legado.
const DOMINIO = 'jrgrupo.com.br'
const SENHA_PADRAO = 'Acesso@123'

// Áreas que marcam usuário EXTERNO no legado — não são quadro interno.
const SETORES_EXTERNOS = new Set([14, 18]) // 14 = Funcionário de Cliente, 18 = Cliente

// Domínio do operador da plataforma (RNC). Aparece em 19 das 23 áreas e na conta
// `admin` porque foi preenchido em lote na implantação do v1 — é dado NOSSO dentro
// do cadastro do cliente, não do JR Grupo. Migrar faria toda área do tenant notificar
// o suporte, e criaria uma conta de suporte dentro da empresa (o master global já
// tem acesso por fora). Descartado em qualquer campo.
const DOMINIO_PLATAFORMA = 'central-rnc.com.br'
const ehEmailDaPlataforma = (v) => String(v ?? '').toLowerCase().includes(DOMINIO_PLATAFORMA)

// Linhas de ger_cad_cli que não são cliente:
//   id 0 = placeholder "NÃO INFORMADO" (CNPJ 00.000.000/0000-00)
//   id 1 = a própria JR SERVIÇOS EMPRESARIAIS (padrao=1) — vira a Empresa, não cliente dela mesma
const CLIENTES_IGNORADOS = new Set([0, 1])

// Data-placeholder do v1 para "não informado". 102 usuários têm exatamente esta.
const DATA_PLACEHOLDER = '1900-01-01'

// ── credenciais do .env (não hardcoda segredo no script) ──
function readEnv() {
  const env = {}
  const p = path.join(__dirname, '..', 'apps', 'api', '.env')
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[t.slice(0, i).trim()] = v
  }
  return env
}

// ─────────────────────────── helpers de SQL ───────────────────────────

// Literal de texto. O legado usa '' como "vazio" em toda parte, então string vazia
// vira NULL — senão o v2 herda campos em branco que a UI trata como preenchidos.
const esc = (v) => {
  if (v == null) return 'NULL'
  const t = String(v).trim()
  return t === '' ? 'NULL' : `'${t.replace(/'/g, "''")}'`
}
const num = (v) => (v == null || v === '' || isNaN(Number(v))) ? 'NULL' : String(Number(v))
const bool = (v) => (String(v) === '1' || v === 1 || v === true) ? 'true' : 'false'
const digits = (v) => String(v ?? '').replace(/\D/g, '')

/**
 * Datas no legado são varchar com formato misto: 'dd/mm/yyyy', 'yyyy-mm-dd',
 * '0000-00-00', '00/00/0000', '' ou NULL. Só devolve o que é data de verdade.
 */
function parseDataBr(v) {
  if (v == null) return null
  const t = String(v).trim()
  if (!t || t.startsWith('0000') || t === '00/00/0000') return null
  let y, mo, d
  let m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) { d = +m[1]; mo = +m[2]; y = +m[3] }
  else {
    m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    y = +m[1]; mo = +m[2]; d = +m[3]
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return iso === DATA_PLACEHOLDER ? null : iso
}
const dateLit = (v) => { const d = parseDataBr(v); return d ? `'${d}'::timestamp` : 'NULL' }

// `uf` no v2 é Char(2). O legado tem 'DF ' com espaço, 'Brasília' por extenso e '...'.
const UFS = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])
const UF_POR_NOME = { 'BRASILIA': 'DF', 'DISTRITO FEDERAL': 'DF', 'GOIAS': 'GO', 'SAO PAULO': 'SP', 'MINAS GERAIS': 'MG', 'BAHIA': 'BA', 'ESPIRITO SANTO': 'ES' }
function normUf(v) {
  const t = String(v ?? '').trim().toUpperCase()
  if (!t) return null
  if (UFS.has(t)) return t
  const semAcento = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (UFS.has(semAcento)) return semAcento
  return UF_POR_NOME[semAcento] ?? null
}

/**
 * Razão social normalizada para comparar duplicatas: sem acento, sem pontuação e
 * sem sufixo societário. "SOFT CLEAN INDUSTRIA E COMÉRCIO LTDA ME" e
 * "SOFT CLEAN INDUSTRIA E COMERCIO LTDA" viram a mesma chave.
 */
const normNome = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ')
  .replace(/\bFILIAL\s*\d*/g, ' ')
  .replace(/\b(LTDA|ME|EPP|EIRELI|SA|S A|MEI)\b/g, ' ')
  .replace(/\s+/g, ' ').trim()

// Empresa de destino resolvida em apply-time. [^0-9] em vez de \D pra não precisar
// escapar barra invertida atravessando JS → SQL.
const EMP = `(SELECT id FROM empresas WHERE regexp_replace(cnpj, '[^0-9]', '', 'g') = '${EMPRESA_CNPJ}' LIMIT 1)`

function cabecalho(titulo, origem) {
  return [
    `-- ${titulo}`,
    `-- AUTO-GERADO por scripts/jrgrupo-migrate.js — NÃO EDITAR À MÃO.`,
    `-- Origem: MySQL angular_jrgrupo (OneClick v1) · ${origem}`,
    `-- Idempotente: reaplicar não duplica (ON CONFLICT DO UPDATE).`,
    '',
    'BEGIN;',
    '',
    'DO $$ BEGIN',
    `  IF NOT EXISTS (SELECT 1 FROM empresas WHERE regexp_replace(cnpj, '[^0-9]', '', 'g') = '${EMPRESA_CNPJ}') THEN`,
    `    RAISE EXCEPTION 'Empresa ${EMPRESA_NOME} (CNPJ ${EMPRESA_CNPJ}) nao existe. Rode a Fase 0 (criar Empresa + Tenant) antes de aplicar este arquivo.';`,
    '  END IF;',
    'END $$;',
    '',
  ]
}

function gravar(nome, lines) {
  lines.push('', 'COMMIT;')
  const outDir = path.join(__dirname, 'out')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, nome)
  fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8')
  return outFile
}

// ─────────────────────────── fases ───────────────────────────

/**
 * Fase 0 — a Empresa de destino, a partir do cadastro `padrao=1` do próprio legado.
 *
 * Não cria `Tenant`: a tabela `tenants` está vazia e as empresas já existentes não têm
 * um. O isolamento efetivo do v2 é `empresaId` (tenant.middleware nunca faz SET
 * search_path), então criar a linha só para "seguir o doc" divergiria do que está em
 * produção. Se um dia entrar billing por Stripe para este tenant, o Tenant se cria aí.
 *
 * Este é o único arquivo sem o guard de existência da empresa — é ele que a cria.
 */
async function faseEmpresa(conn) {
  const [[e]] = await conn.query(
    `SELECT cad_cli_razao, cad_cli_ie, cad_cli_im, CAD_CLI_END, CAD_CLI_NUM, CAD_CLI_COMPLEMENTO,
            CAD_CLI_BAIRRO, CAD_CLI_CIDADE, CAD_CLI_ESTADO, CAD_CLI_CEP, CAD_CLI_TEL, CAD_CLI_EMAIL
       FROM ger_cad_cli WHERE padrao = '1' LIMIT 1`)
  if (!e) throw new Error('Nenhum cliente com padrao=1 no legado — não dá para deduzir a Empresa.')

  const lines = [
    '-- JR Grupo — Fase 0: Empresa de destino',
    '-- AUTO-GERADO por scripts/jrgrupo-migrate.js — NÃO EDITAR À MÃO.',
    '-- Origem: ger_cad_cli (padrao=1) · APLICAR ANTES DE TODOS OS OUTROS ARQUIVOS.',
    '',
    'BEGIN;',
    '',
    `INSERT INTO empresas (id, razao_social, cnpj, inscricao_estadual, inscricao_municipal,` +
    ` is_active, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email,` +
    ` version, created_at, updated_at) VALUES (` +
    `'jrg-empresa', ${esc(e.cad_cli_razao)}, '${EMPRESA_CNPJ}', ${esc(e.cad_cli_ie)}, ${esc(e.cad_cli_im)},` +
    ` true, ${esc(e.CAD_CLI_CEP)}, ${esc(e.CAD_CLI_END)}, ${esc(e.CAD_CLI_NUM)}, ${esc(e.CAD_CLI_COMPLEMENTO)},` +
    ` ${esc(e.CAD_CLI_BAIRRO)}, ${esc(e.CAD_CLI_CIDADE)}, ${esc(normUf(e.CAD_CLI_ESTADO))},` +
    ` ${esc(e.CAD_CLI_TEL)}, ${esc(e.CAD_CLI_EMAIL)}, 1, now(), now())` +
    ` ON CONFLICT (id) DO UPDATE SET razao_social = EXCLUDED.razao_social,` +
    ` inscricao_estadual = EXCLUDED.inscricao_estadual, cep = EXCLUDED.cep,` +
    ` logradouro = EXCLUDED.logradouro, bairro = EXCLUDED.bairro, cidade = EXCLUDED.cidade,` +
    ` uf = EXCLUDED.uf, updated_at = now();`,
    '',
    `INSERT INTO empresa_events (id, empresa_id, user_id, type, version, created_at) VALUES (` +
    `'jrg-empresa-created', 'jrg-empresa', NULL, 'created', 1, now())` +
    ` ON CONFLICT (id) DO NOTHING;`,
  ]
  const f = gravar('jrgrupo-empresa.sql', lines)
  console.log(`  empresa: ${String(e.cad_cli_razao).trim()} (CNPJ ${EMPRESA_CNPJ}) → ${f}`)
  return 1
}

/** ger_cad_set (23) → areas */
async function faseAreas(conn) {
  const [rows] = await conn.query(
    `SELECT ID, CAD_SET_NOME, CAD_SET_EMAIL, CAD_SET_ATIVO FROM ger_cad_set ORDER BY ID`)
  const lines = cabecalho('JR Grupo — Áreas', 'ger_cad_set')
  for (const r of rows) {
    const nome = String(r.CAD_SET_NOME ?? '').trim()
    if (!nome) continue // `name` é NOT NULL — área sem nome não tem o que migrar
    const email = ehEmailDaPlataforma(r.CAD_SET_EMAIL) ? null : r.CAD_SET_EMAIL
    lines.push(
      `INSERT INTO areas (id, name, email, is_active, empresa_id, created_at, updated_at) VALUES (` +
      `'jrg-area-${r.ID}', ${esc(nome)}, ${esc(email)}, ${bool(r.CAD_SET_ATIVO)}, ${EMP}, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email,` +
      ` is_active = EXCLUDED.is_active, empresa_id = EXCLUDED.empresa_id, updated_at = now();`)
  }
  const f = gravar('jrgrupo-areas.sql', lines)
  console.log(`  áreas: ${rows.length} lidas → ${f}`)
  return rows.length
}

/** ger_cad_car (26) → cargos. Os campos ISO estão vazios no legado; migram como NULL. */
async function faseCargos(conn) {
  const [areas] = await conn.query(`SELECT ID FROM ger_cad_set`)
  const areasValidas = new Set(areas.map(a => a.ID))
  const [rows] = await conn.query(
    `SELECT ID, SETOR, CARGO, DESCRICAO_SINT, RESPONSABILIDADE, AUTORIDADE,
            HABILIDADES, EDUCACAO, TREINAMENTOS, EXPERIENCIAS, ATIVO
       FROM ger_cad_car ORDER BY ID`)
  const lines = cabecalho('JR Grupo — Cargos', 'ger_cad_car')
  let semArea = 0
  for (const r of rows) {
    const nome = String(r.CARGO ?? '').trim()
    if (!nome) continue
    const areaId = areasValidas.has(r.SETOR) ? `'jrg-area-${r.SETOR}'` : 'NULL'
    if (areaId === 'NULL') semArea++
    lines.push(
      `INSERT INTO cargos (id, name, is_active, empresa_id, area_id, descricao_sumaria,` +
      ` responsabilidades, autoridades, habilidades, experiencias, treinamentos, educacao,` +
      ` version, created_at, updated_at) VALUES (` +
      `'jrg-cargo-${r.ID}', ${esc(nome)}, ${bool(r.ATIVO)}, ${EMP}, ${areaId}, ${esc(r.DESCRICAO_SINT)},` +
      ` ${esc(r.RESPONSABILIDADE)}, ${esc(r.AUTORIDADE)}, ${esc(r.HABILIDADES)}, ${esc(r.EXPERIENCIAS)},` +
      ` ${esc(r.TREINAMENTOS)}, ${esc(r.EDUCACAO)}, 1, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_active = EXCLUDED.is_active,` +
      ` empresa_id = EXCLUDED.empresa_id, area_id = EXCLUDED.area_id,` +
      ` descricao_sumaria = EXCLUDED.descricao_sumaria, responsabilidades = EXCLUDED.responsabilidades,` +
      ` autoridades = EXCLUDED.autoridades, habilidades = EXCLUDED.habilidades,` +
      ` experiencias = EXCLUDED.experiencias, treinamentos = EXCLUDED.treinamentos,` +
      ` educacao = EXCLUDED.educacao, updated_at = now();`)
  }
  const f = gravar('jrgrupo-cargos.sql', lines)
  console.log(`  cargos: ${rows.length} lidos${semArea ? ` (${semArea} sem área válida → NULL)` : ''} → ${f}`)
  return rows.length
}

/** cad_ser (265) → servicos. SETOR vira `categoria` (texto livre) via nome da área. */
async function faseServicos(conn) {
  const [areas] = await conn.query(`SELECT ID, CAD_SET_NOME FROM ger_cad_set`)
  const nomeArea = new Map(areas.map(a => [a.ID, String(a.CAD_SET_NOME ?? '').trim()]))
  const [rows] = await conn.query(
    `SELECT ID, SERVICO, OBSERVACOES, SETOR, ATIVO FROM cad_ser ORDER BY ID`)
  const lines = cabecalho('JR Grupo — Serviços', 'cad_ser')
  for (const r of rows) {
    const nome = String(r.SERVICO ?? '').trim()
    if (!nome) continue
    lines.push(
      `INSERT INTO servicos (id, nome, descricao, categoria, ativo, empresa_id, created_at, updated_at) VALUES (` +
      `'jrg-servico-${r.ID}', ${esc(nome)}, ${esc(r.OBSERVACOES)}, ${esc(nomeArea.get(r.SETOR))},` +
      ` ${bool(r.ATIVO)}, ${EMP}, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao,` +
      ` categoria = EXCLUDED.categoria, ativo = EXCLUDED.ativo, empresa_id = EXCLUDED.empresa_id,` +
      ` updated_at = now();`)
  }
  const f = gravar('jrgrupo-servicos.sql', lines)
  console.log(`  serviços: ${rows.length} lidos → ${f}`)
  return rows.length
}

// ── mapas de domínio do legado → enums do v2 ──
// cad_cli_sit.id → ClienteSituacao. "Não Informado" cai em MENSAL, que é o default
// do enum e o caso esmagadoramente majoritário nesta base.
const SITUACAO_POR_ID = {
  1: 'MENSAL', 2: 'MENSAL', 3: 'EM_CONSTITUICAO', 4: 'POTENCIAL',
  5: 'AVULSO', 6: 'PARALIZADO', 7: 'PRE_OPERACIONAL', 8: 'PROSPECT',
}
// cad_tri.id → TaxRegime. 0 e '' = não informado → NULL (56% da base).
const TRIBUTACAO_POR_ID = {
  1: 'LUCRO_PRESUMIDO', 2: 'LUCRO_REAL', 4: 'SIMPLES_NACIONAL',
  5: 'MEI', 6: 'ISENTA', 7: 'IMUNE',
}
// cad_cli_regime.id → RegimeContabil. Praticamente vazio nesta base (1 registro).
const REGIME_POR_ID = { 1: 'CAIXA', 2: 'COMPETENCIA' }

/**
 * Deduplicação por documento. 55 grupos duplicados / 119 linhas na base atual.
 *
 * Regra (aprovada no plano):
 *   - 1 ativo no grupo        → fica o ativo, resto descartado
 *   - 0 ativos                → grupo inteiro descartado
 *   - >1 ativo, mesmo nome    → merge: vence o id maior, perdedores somem
 *   - >1 ativo, nome diferente→ vence o id maior; perdedores entram INATIVOS e
 *                               marcados, porque aí um dos dois tem o CNPJ errado
 *                               e jogar fora seria perder cadastro legítimo.
 */
function dedupClientes(rows) {
  const grupos = new Map()
  const semDocumento = []
  for (const c of rows) {
    if (CLIENTES_IGNORADOS.has(Number(c.id))) continue
    const d = digits(c.cad_cli_cnpj)
    if (d.length !== 14 && d.length !== 11) { semDocumento.push(c); continue }
    if (!grupos.has(d)) grupos.set(d, [])
    grupos.get(d).push(c)
  }

  const manter = []
  const conflitos = []
  const stats = { unicos: 0, umAtivo: 0, semAtivo: 0, mergeMesmoNome: 0, divergentes: 0, descartados: 0 }

  for (const [doc, g] of grupos) {
    if (g.length === 1) { manter.push({ row: g[0], conflitoCom: null }); stats.unicos++; continue }
    const ativos = g.filter(c => String(c.CAD_CLI_ATIVO) === '1')
    if (ativos.length === 0) { stats.semAtivo++; stats.descartados += g.length; continue }
    if (ativos.length === 1) {
      manter.push({ row: ativos[0], conflitoCom: null })
      stats.umAtivo++; stats.descartados += g.length - 1
      continue
    }
    const ordenados = [...ativos].sort((a, b) => b.id - a.id) // id maior vence
    const vencedor = ordenados[0]
    const perdedores = ordenados.slice(1)
    manter.push({ row: vencedor, conflitoCom: null })

    const nomes = new Set(ativos.map(c => normNome(c.cad_cli_razao)))
    if (nomes.size === 1) {
      stats.mergeMesmoNome++; stats.descartados += g.length - 1
      continue
    }
    stats.divergentes++
    stats.descartados += g.length - ativos.length
    for (const p of perdedores) {
      manter.push({ row: p, conflitoCom: vencedor })
      conflitos.push({ documento: doc, vencedor, perdedor: p })
    }
  }

  for (const c of semDocumento) manter.push({ row: c, conflitoCom: null })
  return { manter, conflitos, stats, semDocumento: semDocumento.length }
}

/** ger_cad_cli (832) → clientes */
async function faseClientes(conn) {
  // `grupo` e `origem` são texto livre no v2, mas FK numérica no legado — resolve
  // para o nome, senão o cadastro herda "1" e "3" no lugar de "JR GRUPO" e "RNC".
  const [grupos] = await conn.query(`SELECT ID, GRUPO FROM cad_gru`)
  const nomeGrupo = new Map(grupos.map(g => [String(g.ID), String(g.GRUPO ?? '').trim()]))
  const [origens] = await conn.query(`SELECT ID, ORIGEM FROM cad_ori`)
  const nomeOrigem = new Map(origens.map(o => [String(o.ID), String(o.ORIGEM ?? '').trim()]))
  // "Não Informado" no legado é ruído — no v2 o campo simplesmente fica vazio.
  const semRuido = (s) => (s && s.toUpperCase() !== 'NÃO INFORMADO' && s.toUpperCase() !== 'NAO INFORMADO') ? s : null

  const [rows] = await conn.query(`SELECT * FROM ger_cad_cli ORDER BY id`)
  const { manter, conflitos, stats, semDocumento } = dedupClientes(rows)

  const lines = cabecalho('JR Grupo — Clientes', 'ger_cad_cli')
  for (const { row: c, conflitoCom } of manter) {
    const doc = digits(c.cad_cli_cnpj)
    const tipoDoc = doc.length === 11 ? 'CPF' : 'CNPJ'

    const areas = []
    if (String(c.CAD_CLI_CON_CON) === '1') areas.push('Contabil')
    if (String(c.CAD_CLI_FIS_CON) === '1') areas.push('Fiscal')
    if (String(c.CAD_CLI_PES_CON) === '1') areas.push('Trabalhista')
    if (String(c.CAD_CLI_LEG_CON) === '1') areas.push('Legal')
    if (String(c.CAD_CLI_OUT_CON) === '1') areas.push('Outros')

    // Observações = obs geral + as 5 particularidades por área, cada uma rotulada.
    const obs = []
    if (conflitoCom) {
      obs.push(`[CONFLITO DE CNPJ — revisar] Este documento também está no cadastro ` +
        `"${String(conflitoCom.cad_cli_razao ?? '').trim()}" (id ${conflitoCom.id} no OneClick v1). ` +
        `Um dos dois tem o CNPJ errado. Cadastro importado como INATIVO até a correção.`)
    }
    const gerais = String(c.CAD_CLI_OBS ?? '').trim()
    if (gerais) obs.push(gerais)
    for (const [rotulo, campo] of [
      ['Comercial', c.CAD_CLI_COM_PAR], ['Contábil', c.CAD_CLI_CON_PAR],
      ['Fiscal', c.CAD_CLI_FIS_PAR], ['Trabalhista', c.CAD_CLI_PES_PAR],
      ['Legalização', c.CAD_CLI_LEG_PAR],
    ]) {
      const t = String(campo ?? '').trim()
      if (t) obs.push(`${rotulo}: ${t}`)
    }

    const situacao = SITUACAO_POR_ID[Number(c.CAD_CLI_SITUACAO)] ?? 'MENSAL'
    const tributacao = TRIBUTACAO_POR_ID[Number(c.CAD_CLI_REGIME)]
    const regime = REGIME_POR_ID[Number(c.CAD_CLI_REGIME2)]
    const grupo = semRuido(nomeGrupo.get(String(c.CAD_CLI_GRUPO)))
    const origem = semRuido(nomeOrigem.get(String(c.CAD_CLI_ORIGEM)))
    // Perdedor de conflito entra inativo; senão respeita a flag do legado.
    const ativo = conflitoCom ? 'false' : bool(c.CAD_CLI_ATIVO)
    // `documento` e `razao_social` são NOT NULL — 10 clientes não têm documento e
    // `esc('')` devolveria NULL, quebrando o INSERT. Entram como string vazia, que é
    // exatamente o que chaveDocumento() trata como "não identifica ninguém".
    const documento = `'${doc}'`
    const razaoSocial = esc(c.cad_cli_razao) === 'NULL' ? `'(sem razão social)'` : esc(c.cad_cli_razao)

    lines.push(
      `INSERT INTO clientes (id, id_oneclick, razao_social, documento, tipo_documento, situacao,` +
      ` status, grupo, origem, tributacao, regime, inscricao_estadual, inscricao_municipal,` +
      ` areas_contratadas, data_entrada, data_saida, observacoes, cep, logradouro, numero,` +
      ` complemento, bairro, cidade, uf, telefone, email, is_active, empresa_id, created_at, updated_at) VALUES (` +
      `'jrg-cli-${c.id}', 'jrgrupo-${c.id}', ${razaoSocial}, ${documento}, '${tipoDoc}', '${situacao}',` +
      ` ${ativo === 'true' ? "'ATIVA'" : "'INATIVA'"}, ${esc(grupo)}, ${esc(origem)},` +
      ` ${tributacao ? `'${tributacao}'` : 'NULL'}, ${regime ? `'${regime}'` : 'NULL'},` +
      ` ${esc(c.cad_cli_ie)}, ${esc(c.cad_cli_im)}, ${esc(areas.join(';'))},` +
      ` ${dateLit(c.CAD_CLI_DT_INI)}, ${dateLit(c.CAD_CLI_DT_FIM)}, ${esc(obs.join('\n\n'))},` +
      ` ${esc(c.CAD_CLI_CEP)}, ${esc(c.CAD_CLI_END)}, ${esc(c.CAD_CLI_NUM)}, ${esc(c.CAD_CLI_COMPLEMENTO)},` +
      ` ${esc(c.CAD_CLI_BAIRRO)}, ${esc(c.CAD_CLI_CIDADE)}, ${esc(normUf(c.CAD_CLI_ESTADO))},` +
      ` ${esc(c.CAD_CLI_TEL)}, ${esc(c.CAD_CLI_EMAIL)}, ${ativo}, ${EMP}, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET razao_social = EXCLUDED.razao_social,` +
      ` documento = EXCLUDED.documento, tipo_documento = EXCLUDED.tipo_documento,` +
      ` situacao = EXCLUDED.situacao, status = EXCLUDED.status, grupo = EXCLUDED.grupo,` +
      ` origem = EXCLUDED.origem, tributacao = EXCLUDED.tributacao, regime = EXCLUDED.regime,` +
      ` inscricao_estadual = EXCLUDED.inscricao_estadual, inscricao_municipal = EXCLUDED.inscricao_municipal,` +
      ` areas_contratadas = EXCLUDED.areas_contratadas, data_entrada = EXCLUDED.data_entrada,` +
      ` data_saida = EXCLUDED.data_saida, observacoes = EXCLUDED.observacoes, cep = EXCLUDED.cep,` +
      ` logradouro = EXCLUDED.logradouro, numero = EXCLUDED.numero, complemento = EXCLUDED.complemento,` +
      ` bairro = EXCLUDED.bairro, cidade = EXCLUDED.cidade, uf = EXCLUDED.uf,` +
      ` telefone = EXCLUDED.telefone, email = EXCLUDED.email, is_active = EXCLUDED.is_active,` +
      ` empresa_id = EXCLUDED.empresa_id, updated_at = now();`)
  }

  const f = gravar('jrgrupo-clientes.sql', lines)

  // CSV dos conflitos, pro JR Grupo apontar qual CNPJ está errado.
  const csv = ['﻿documento;id_v1_mantido;razao_mantida;id_v1_inativado;razao_inativada']
  for (const c of conflitos) {
    const campo = (s) => `"${String(s ?? '').trim().replace(/"/g, '""')}"`
    csv.push([c.documento, c.vencedor.id, campo(c.vencedor.cad_cli_razao),
      c.perdedor.id, campo(c.perdedor.cad_cli_razao)].join(';'))
  }
  const csvFile = path.join(__dirname, 'out', 'jrgrupo-conflitos-cnpj.csv')
  fs.writeFileSync(csvFile, csv.join('\n') + '\n', 'utf8')

  console.log(`  clientes: ${rows.length} lidos → ${manter.length} migrados (${stats.descartados} descartados na dedup)`)
  console.log(`     documentos únicos ${stats.unicos} · 1-ativo ${stats.umAtivo} · sem-ativo ${stats.semAtivo}` +
    ` · merge-mesmo-nome ${stats.mergeMesmoNome} · divergentes ${stats.divergentes} · sem documento ${semDocumento}`)
  console.log(`     ${f}`)
  console.log(`     ${conflitos.length} conflitos de CNPJ → ${csvFile}`)
  return manter.length
}

/** cad_cli_con (64) → cliente_contatos */
async function faseContatos(conn) {
  // Só migra contato cujo cliente sobreviveu à dedup — senão a FK quebra.
  const [clientes] = await conn.query(`SELECT * FROM ger_cad_cli ORDER BY id`)
  const { manter } = dedupClientes(clientes)
  const vivos = new Set(manter.map(m => m.row.id))
  // Contato de cliente descartado vai pro vencedor do grupo (plano, Fase 4).
  const redirect = new Map()
  const porDoc = new Map()
  for (const { row } of manter) {
    const d = digits(row.cad_cli_cnpj)
    if (d.length === 14 || d.length === 11) if (!porDoc.has(d)) porDoc.set(d, row.id)
  }
  for (const c of clientes) {
    if (vivos.has(c.id)) continue
    const d = digits(c.cad_cli_cnpj)
    const destino = porDoc.get(d)
    if (destino) redirect.set(c.id, destino)
  }

  const [rows] = await conn.query(
    `SELECT ID, CLIENTE, CONTATO, TEL, CEL, EMAIL, OBS, ATIVO FROM cad_cli_con ORDER BY ID`)
  const lines = cabecalho('JR Grupo — Contatos de cliente', 'cad_cli_con')
  let migrados = 0, orfaos = 0, redirecionados = 0
  for (const r of rows) {
    const nome = String(r.CONTATO ?? '').trim()
    if (!nome) continue // `nome` é NOT NULL
    let clienteId = r.CLIENTE
    if (!vivos.has(clienteId)) {
      const destino = redirect.get(clienteId)
      if (!destino) { orfaos++; continue }
      clienteId = destino; redirecionados++
    }
    migrados++
    lines.push(
      `INSERT INTO cliente_contatos (id, cliente_id, nome, telefone, email, observacoes,` +
      ` principal, created_at, updated_at) VALUES (` +
      `'jrg-cct-${r.ID}', 'jrg-cli-${clienteId}', ${esc(nome)},` +
      ` ${esc(String(r.TEL ?? '').trim() || r.CEL)}, ${esc(r.EMAIL)}, ${esc(r.OBS)}, false, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET cliente_id = EXCLUDED.cliente_id, nome = EXCLUDED.nome,` +
      ` telefone = EXCLUDED.telefone, email = EXCLUDED.email, observacoes = EXCLUDED.observacoes,` +
      ` updated_at = now();`)
  }
  const f = gravar('jrgrupo-contatos.sql', lines)
  console.log(`  contatos: ${rows.length} lidos → ${migrados} migrados` +
    `${redirecionados ? ` (${redirecionados} redirecionados p/ o vencedor da dedup)` : ''}` +
    `${orfaos ? ` · ${orfaos} órfãos ignorados` : ''} → ${f}`)
  return migrados
}

// CAD_USU_VINCULO → UserProfile
const PROFILE_POR_VINCULO = { 1: 'ADMIN', 2: 'GERENTE', 3: 'OPERADOR', 4: 'OPERADOR' }

/**
 * Módulos do v2 liberados conforme as flags do legado. Só o que este tenant usa —
 * todas as ~60 tabelas sgq_* estão zeradas, então nada do bloco Qualidade entra.
 */
function permissoesDoUsuario(u) {
  const on = (v) => v != null && String(v) !== '0' && String(v) !== ''
  const mods = new Set(['dashboard'])
  if (on(u.CAD_CLI)) mods.add('clientes')
  if (on(u.CRP_CTS)) mods.add('contatos')
  if (on(u.CRP_AGE)) mods.add('agenda')
  if (on(u.CAD_SER)) mods.add('servicos')
  // Cadastros estruturais só para quem administra.
  if (PROFILE_POR_VINCULO[Number(u.CAD_USU_VINCULO)] === 'ADMIN') {
    mods.add('areas'); mods.add('cargos'); mods.add('colaboradores'); mods.add('usuarios')
  } else {
    mods.add('colaboradores')
  }
  return [...mods]
}

/**
 * ger_cad_usu → users + accounts + user_permissions.
 *
 * Dos 508 "ativos" só ~79 são quadro interno: 423 não têm e-mail nenhum e os demais
 * são portal do cliente. Filtro exige e-mail E login E setor interno.
 *
 * E-mails colididos: `ademar.gerencia@jrgrupo.com.br` está em 18 contas de 18 PESSOAS
 * diferentes (o campo foi preenchido em lote com o endereço da gerência), e `email` é
 * UNIQUE no v2. Como cada uma tem login próprio, o default sintetiza <login>@dominio.
 * `--email-scheme=numerado` usa <base><N>@dominio, derivado do e-mail compartilhado.
 */
async function faseUsuarios(conn, emailScheme) {
  const { hashPassword } = await import('better-auth/crypto')

  const [areas] = await conn.query(`SELECT ID FROM ger_cad_set`)
  const areasValidas = new Set(areas.map(a => a.ID))
  const [cargos] = await conn.query(`SELECT ID FROM ger_cad_car`)
  const cargosValidos = new Set(cargos.map(c => c.ID))

  const [todos] = await conn.query(`SELECT * FROM ger_cad_usu WHERE CAD_USU_ATIVO = '1' ORDER BY CAD_USU_ID`)
  const elegiveis = todos.filter(u =>
    String(u.CAD_USU_EMAIL ?? '').trim() !== '' &&
    String(u.CAD_USU_LOGIN ?? '').trim() !== '' &&
    !SETORES_EXTERNOS.has(Number(u.CAD_USU_SETOR)) &&
    !ehEmailDaPlataforma(u.CAD_USU_EMAIL)) // conta de suporte da RNC, não do JR Grupo

  // Agrupa por e-mail para descobrir as colisões.
  const porEmail = new Map()
  for (const u of elegiveis) {
    const e = String(u.CAD_USU_EMAIL).trim().toLowerCase()
    if (!porEmail.has(e)) porEmail.set(e, [])
    porEmail.get(e).push(u)
  }

  const emailFinal = new Map() // CAD_USU_ID → e-mail
  const sintetizados = []
  const usados = new Set()
  for (const [email, grupo] of porEmail) {
    if (grupo.length === 1) {
      const u = grupo[0]
      // E-mail do legado às vezes vem sem domínio ("bianca.santos") — completa.
      const final = email.includes('@') ? email : `${email}@${DOMINIO}`
      emailFinal.set(u.CAD_USU_ID, final)
      if (final !== email) sintetizados.push({ u, de: email, para: final, motivo: 'sem domínio' })
      continue
    }
    const base = (email.split('@')[0] || 'user').split('.')[0]
    grupo.forEach((u, i) => {
      const login = String(u.CAD_USU_LOGIN).trim().toLowerCase()
      const final = emailScheme === 'numerado'
        ? `${base}${i + 1}@${DOMINIO}`
        : `${login}@${DOMINIO}`
      emailFinal.set(u.CAD_USU_ID, final)
      sintetizados.push({ u, de: email, para: final, motivo: `colisão (${grupo.length} contas)` })
    })
  }

  // Garante unicidade global depois da síntese — dois logins iguais quebrariam o UNIQUE.
  for (const u of elegiveis) {
    const original = emailFinal.get(u.CAD_USU_ID)
    if (!usados.has(original)) { usados.add(original); continue }
    let n = 2
    const [local, dom] = original.split('@')
    while (usados.has(`${local}${n}@${dom}`)) n++
    const desempatado = `${local}${n}@${dom}`
    emailFinal.set(u.CAD_USU_ID, desempatado); usados.add(desempatado)
    sintetizados.push({ u, de: original, para: desempatado, motivo: 'desempate de unicidade' })
  }

  const lines = cabecalho('JR Grupo — Usuários, credenciais e permissões', 'ger_cad_usu')
  for (const u of elegiveis) {
    const uid = `jrg-usu-${u.CAD_USU_ID}`
    const email = emailFinal.get(u.CAD_USU_ID)
    const nome = String(u.CAD_USU_NOME ?? '').trim() || String(u.CAD_USU_LOGIN).trim()
    const profile = PROFILE_POR_VINCULO[Number(u.CAD_USU_VINCULO)] ?? 'OPERADOR'
    const areaId = areasValidas.has(u.CAD_USU_SETOR) ? `'jrg-area-${u.CAD_USU_SETOR}'` : 'NULL'
    const cargoNum = Number(u.CAD_USU_CARGO)
    const cargoId = cargosValidos.has(cargoNum) ? `'jrg-cargo-${cargoNum}'` : 'NULL'
    // Senha do v1 é texto plano e não migra. Todos entram com a padrão + troca no 1º acesso.
    const hash = await hashPassword(SENHA_PADRAO)

    lines.push(
      `INSERT INTO users (id, id_oneclick, email, name, email_verified, role, profile,` +
      ` is_active, area_id, cargo_id, ramal, data_nascimento, empresa_id, created_at, updated_at) VALUES (` +
      `'${uid}', 'jrgrupo-${u.CAD_USU_ID}', ${esc(email)}, ${esc(nome)}, false,` +
      ` 'COLABORADOR_INTERNO', '${profile}', true, ${areaId}, ${cargoId}, ${esc(u.CAD_USU_RAMAL)},` +
      ` ${dateLit(u.cad_usu_dt_nas)}, ${EMP}, now(), now())` +
      ` ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,` +
      ` profile = EXCLUDED.profile, is_active = EXCLUDED.is_active, area_id = EXCLUDED.area_id,` +
      ` cargo_id = EXCLUDED.cargo_id, ramal = EXCLUDED.ramal, empresa_id = EXCLUDED.empresa_id,` +
      ` updated_at = now();`)

    lines.push(
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (` +
      `'${uid}-cred', '${uid}', '${uid}', 'credential', ${esc(hash)}, now(), now())` +
      ` ON CONFLICT (id) DO NOTHING;`) // não reescreve senha já trocada pelo usuário

    for (const slug of permissoesDoUsuario(u)) {
      // Leitura e escrita para todos (o v1 não separava os dois); exclusão só p/ ADMIN.
      lines.push(
        `INSERT INTO user_permissions (id, user_id, module_slug, can_read, can_write, can_delete, created_at) VALUES (` +
        `'${uid}-${slug}', '${uid}', '${slug}', true, true, ${profile === 'ADMIN' ? 'true' : 'false'}, now())` +
        ` ON CONFLICT (user_id, module_slug) DO UPDATE SET can_read = EXCLUDED.can_read,` +
        ` can_write = EXCLUDED.can_write, can_delete = EXCLUDED.can_delete;`)
    }
  }

  const f = gravar('jrgrupo-usuarios.sql', lines)
  console.log(`  usuários: ${todos.length} ativos no v1 → ${elegiveis.length} elegíveis (com e-mail, login e setor interno)`)
  console.log(`     ${sintetizados.length} e-mails sintetizados (esquema: ${emailScheme})`)
  for (const s of sintetizados.slice(0, 5)) {
    console.log(`       ${String(s.u.CAD_USU_NOME ?? '').trim()} → ${s.para}  [${s.motivo}]`)
  }
  if (sintetizados.length > 5) console.log(`       … e mais ${sintetizados.length - 5}`)
  console.log(`     ${f}`)
  return elegiveis.length
}

// ─────────────────────────── main ───────────────────────────

async function main() {
  const args = Object.fromEntries(process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)] }))

  const fase = args.fase || 'all'
  const emailScheme = args['email-scheme'] || 'login'
  if (!['login', 'numerado'].includes(emailScheme)) {
    throw new Error(`--email-scheme inválido: ${emailScheme}. Use "login" ou "numerado".`)
  }

  const env = readEnv()
  const conn = await mysql.createConnection({
    host: env.JRG_DB_HOST || env.OCK_V1_DB_HOST,
    port: Number(env.JRG_DB_PORT || env.OCK_V1_DB_PORT || 3306),
    user: env.JRG_DB_USER || env.OCK_V1_DB_USER,
    password: env.JRG_DB_PASSWORD || env.OCK_V1_DB_PASSWORD,
    database: env.JRG_DB_NAME || 'angular_jrgrupo',
    connectTimeout: 20000,
    dateStrings: true, // MySQL 5.0 tem '0000-00-00'; Date nativo quebraria na conversão
  })
  console.log(`Conectado em ${env.JRG_DB_HOST || env.OCK_V1_DB_HOST}/${env.JRG_DB_NAME || 'angular_jrgrupo'}\n`)

  const fases = {
    empresa: () => faseEmpresa(conn),
    areas: () => faseAreas(conn),
    cargos: () => faseCargos(conn),
    servicos: () => faseServicos(conn),
    clientes: () => faseClientes(conn),
    contatos: () => faseContatos(conn),
    usuarios: () => faseUsuarios(conn, emailScheme),
  }

  const aRodar = fase === 'all' ? Object.keys(fases) : [fase]
  for (const f of aRodar) {
    if (!fases[f]) throw new Error(`Fase desconhecida: ${f}. Use ${Object.keys(fases).join('|')}|all`)
    await fases[f]()
  }

  console.log('\nAplicar NESTA ORDEM (há FK entre elas):')
  console.log('  empresa → areas → cargos → servicos → clientes → contatos → usuarios')
  console.log('  docker exec -i saas-postgres psql -U postgres -d saas_erp < scripts/out/jrgrupo-<fase>.sql')
  await conn.end()
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1) })
