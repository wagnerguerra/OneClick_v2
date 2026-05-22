// Seed: cláusulas e templates extras de contrato.
//
// Já existe o template "Presumido/Real COM IE — Padrão Central".
// Este seed cria 5 variações para cobrir os cenários mais comuns em
// escritório contábil:
//
//   1. Simples Nacional COM IE
//   2. Simples Nacional SEM IE (serviços/profissionais)
//   3. Presumido/Real SEM IE (somente serviços)
//   4. Sem Movimento (com ou sem IE)
//   5. Filial ES — Somente Fiscal (matriz em outro estado)
//
// Estratégia: as cláusulas 2-10 são COMUNS (responsabilidades,
// obrigações, LGPD, honorários, extras, vigência, foro). Só a 1ª
// (OBJETO) muda conforme regime/IE/movimento. Por isso criamos
// variantes do OBJETO e cada template combina:
//
//   [OBJ raiz] → [áreas específicas conforme regime] +
//   [RESP, OBR, DISP, DOC, LGPD, HON, EXT, VIG, FORO comuns]
//
// Executar (após seed-clausulas-contrato.ts):
//   pnpm --filter @saas/db exec tsx prisma/seed-templates-extras.ts

import { PrismaClient } from '../src/generated/client'

const prisma = new PrismaClient()

const html = (s: string) => s.trim()

// ════════════════════════════════════════════════════════════
// CLÁUSULAS NOVAS DE OBJETO (variantes)
// As cláusulas-mãe já existem (OBJ, OBJ.CONTABIL, OBJ.FISCAL,
// OBJ.TRABALHISTA, OBJ.LEGALIZACAO). Aqui criamos VARIANTES da
// área Fiscal e Contábil conforme regime + cenários especiais.
// ════════════════════════════════════════════════════════════

type ClausulaSeed = {
  codigo: string
  titulo: string
  conteudo: string
  categoria: string
  parentCodigo?: string
  ordem: number
}

const clausulasNovas: ClausulaSeed[] = [
  // ─── Simples Nacional ───────────────────────────────────────
  {
    codigo: 'OBJ.FISCAL.SN.IE',
    titulo: '1.2 — Área Fiscal-Tributária (Simples Nacional COM IE)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 2,
    conteudo: html(`
      <ul>
        <li>Orientação e consultoria na aplicação dos dispositivos legais vigentes para empresas optantes do Simples Nacional;</li>
        <li>Elaboração e emissão mensal do DAS (Documento de Arrecadação do Simples Nacional);</li>
        <li>Apuração mensal do ICMS de Substituição Tributária quando aplicável;</li>
        <li>Apuração mensal e elaboração de guias do ISS — Imposto sobre Serviços (caso incida);</li>
        <li>Transmissão mensal do SPED Fiscal (com base nos arquivos magnéticos enviados pela CONTRATANTE, gerados pelo sistema de gestão);</li>
        <li>Transmissão mensal dos eventos da EFD-Reinf;</li>
        <li>Elaboração e entrega anual da DEFIS (Declaração de Informações Socioeconômicas e Fiscais);</li>
        <li>Acompanhamento dos limites de receita bruta para enquadramento e desenquadramento.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>Não incluso a geração dos arquivos SPED Fiscal por parte da Contratada. O arquivo deverá ser gerado no sistema de gestão da Contratante.</li>
        <li>Os serviços fiscais contemplados serão prestados com base na Legislação do ES e seus municípios.</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.FISCAL.SN.SEM_IE',
    titulo: '1.2 — Área Fiscal-Tributária (Simples Nacional SEM IE)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 2,
    conteudo: html(`
      <ul>
        <li>Orientação e consultoria na aplicação dos dispositivos legais vigentes para empresas optantes do Simples Nacional sem Inscrição Estadual;</li>
        <li>Elaboração e emissão mensal do DAS (Documento de Arrecadação do Simples Nacional);</li>
        <li>Apuração mensal e elaboração de guias do ISS — Imposto sobre Serviços (caso incida);</li>
        <li>Transmissão mensal dos eventos da EFD-Reinf;</li>
        <li>Elaboração e entrega anual da DEFIS (Declaração de Informações Socioeconômicas e Fiscais);</li>
        <li>Acompanhamento dos limites de receita bruta para enquadramento e desenquadramento.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>A CONTRATANTE não possui Inscrição Estadual e, portanto, não há obrigações relativas a ICMS, SPED Fiscal nem SINTEGRA.</li>
        <li>Caso a CONTRATANTE venha a iniciar atividade que exija Inscrição Estadual, este contrato deverá ser revisto via termo aditivo, com os honorários reajustados conforme a CLÁUSULA 7ª.</li>
      </ul>
    `),
  },

  // ─── Presumido/Real SEM IE ───────────────────────────────────
  {
    codigo: 'OBJ.FISCAL.PR.SEM_IE',
    titulo: '1.2 — Área Fiscal-Tributária (Presumido/Real SEM IE)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ',
    ordem: 2,
    conteudo: html(`
      <ul>
        <li>Orientação e consultoria na aplicação dos dispositivos legais vigentes (Federal e Municipal);</li>
        <li>Elaboração das guias de informação e de recolhimento dos tributos devidos pela CONTRATANTE de acordo com sua forma de tributação, compreendendo: IRPJ, CSLL, COFINS, PIS, ISSQN;</li>
        <li>Elaboração e entrega da Declaração de Débitos e Créditos Tributários Federais (DCTF/DCTFWeb);</li>
        <li>Apuração, elaboração e entrega do ISS — Imposto sobre Serviços (caso incida);</li>
        <li>Transmissão mensal do SPED Contribuições, sempre com base nos arquivos magnéticos enviados pela CONTRATANTE;</li>
        <li>Transmissão mensal dos eventos da EFD-Reinf.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>A CONTRATANTE não possui Inscrição Estadual e, portanto, não há obrigações relativas a ICMS, SPED Fiscal nem SINTEGRA.</li>
        <li>Não incluso a geração do arquivo SPED Contribuições por parte da Contratada. O arquivo deverá ser gerado no sistema de gestão da Contratante.</li>
        <li>Caso a CONTRATANTE venha a iniciar atividade que exija Inscrição Estadual, este contrato deverá ser revisto via termo aditivo, com os honorários reajustados conforme a CLÁUSULA 7ª.</li>
      </ul>
    `),
  },

  // ─── Sem Movimento ──────────────────────────────────────────
  {
    codigo: 'OBJ.SM.AREAS',
    titulo: '1 — Objeto (Empresa Sem Movimento)',
    categoria: 'OBJETO',
    ordem: 0,
    conteudo: html(`
      <p>É objeto do presente contrato a manutenção das obrigações acessórias da CONTRATANTE durante o período de inatividade operacional, conforme descrições abaixo:</p>
      <ul>
        <li>Área Contábil (com escrituração simplificada)</li>
        <li>Área Fiscal-Tributária (declarações zeradas)</li>
        <li>Área Trabalhista (somente pró-labore, se houver)</li>
        <li>Consultoria nas Áreas Contratadas</li>
      </ul>
      <p><strong>Importante:</strong> A CONTRATANTE declara que se encontra em situação de inatividade operacional, sem emissão de notas fiscais, sem movimentação financeira que gere fato gerador de tributos, e sem empregados regidos pela CLT (admite-se apenas pró-labore de sócios).</p>
      <p>Caso a empresa volte a apresentar movimento operacional, este contrato deverá ser imediatamente revisto via termo aditivo, com os honorários reajustados conforme a CLÁUSULA 7ª.</p>
    `),
  },
  {
    codigo: 'OBJ.SM.CONTABIL',
    titulo: '1.1 — Área Contábil (Sem Movimento)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ.SM.AREAS',
    ordem: 1,
    conteudo: html(`
      <ul>
        <li>Escrituração contábil simplificada (apenas movimentações de capital social, pró-labore e demais lançamentos não-operacionais, quando houver);</li>
        <li>Elaboração do Balanço Anual com Demonstrativo de Resultados (mesmo zerado, é obrigatório);</li>
        <li>SPED contábil ou ECD quando obrigatório (em geral, devido à distribuição de lucros isentos ou outros critérios legais).</li>
      </ul>
    `),
  },
  {
    codigo: 'OBJ.SM.FISCAL',
    titulo: '1.2 — Área Fiscal-Tributária (Sem Movimento)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ.SM.AREAS',
    ordem: 2,
    conteudo: html(`
      <ul>
        <li>Envio mensal/anual das declarações zeradas: DCTFWeb, EFD-Reinf, SPED Contribuições;</li>
        <li>Para empresas do Simples Nacional: emissão do DAS zerado quando aplicável e DEFIS anual;</li>
        <li>Para empresas com Inscrição Estadual: SPED Fiscal sem movimentação;</li>
        <li>Acompanhamento da situação fiscal junto aos órgãos.</li>
      </ul>
      <p><strong>Observação:</strong> Quando a empresa retomar atividades, surgindo obrigações de apuração de impostos, deverá comunicar imediatamente à CONTRATADA para revisão deste contrato, conforme CLÁUSULA 7ª (reajuste de honorários por aumento de volume).</p>
    `),
  },
  {
    codigo: 'OBJ.SM.TRABALHISTA',
    titulo: '1.3 — Área Trabalhista (Sem Movimento)',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ.SM.AREAS',
    ordem: 3,
    conteudo: html(`
      <ul>
        <li>Envio dos eventos do eSocial, mesmo sem movimento;</li>
        <li>Elaboração da folha de pró-labore dos sócios (quando houver);</li>
        <li>Emissão da DCTFWeb mensal e anual.</li>
      </ul>
      <p><strong>Importante:</strong> Caso a CONTRATANTE venha a contratar empregados, deverá comunicar imediatamente à CONTRATADA. A admissão de qualquer empregado regido pela CLT enseja revisão dos honorários, conforme CLÁUSULA 7ª.</p>
    `),
  },

  // ─── Filial ES — Somente Fiscal ─────────────────────────────
  {
    codigo: 'OBJ.FILIAL.ES.AREAS',
    titulo: '1 — Objeto (Filial ES — Somente Serviços Fiscais)',
    categoria: 'OBJETO',
    ordem: 0,
    conteudo: html(`
      <p>É objeto do presente contrato a prestação de serviços fiscais EXCLUSIVOS para a filial localizada no Estado do Espírito Santo, conforme descrições abaixo:</p>
      <ul>
        <li>Área Fiscal-Tributária Estadual (ES) e Municipal (do município sede da filial)</li>
        <li>Atendimento a fiscalizações relativas à filial ES</li>
      </ul>
      <p><strong>Importante:</strong> Os serviços contábeis, trabalhistas e de legalização da matriz e demais filiais são de responsabilidade do escritório contábil principal da CONTRATANTE. A CONTRATADA atua exclusivamente na esfera fiscal-tributária do ES.</p>
    `),
  },
  {
    codigo: 'OBJ.FILIAL.ES.FISCAL',
    titulo: '1.1 — Área Fiscal-Tributária Estadual ES e Municipal',
    categoria: 'OBJETO',
    parentCodigo: 'OBJ.FILIAL.ES.AREAS',
    ordem: 1,
    conteudo: html(`
      <ul>
        <li>Apuração mensal do ICMS (próprio e Substituição Tributária quando aplicável);</li>
        <li>Apuração mensal do ISS — Imposto sobre Serviços, quando incidente no município de localização da filial ES;</li>
        <li>Transmissão mensal do SPED Fiscal (com base nos arquivos magnéticos enviados pela CONTRATANTE);</li>
        <li>Acompanhamento de obrigações acessórias estaduais (DESTDA, DIEF, GIA-ST quando aplicável);</li>
        <li>Solicitação e renovação de Inscrição Estadual e enquadramentos especiais (Compete, Invest, Substituição Tributária);</li>
        <li>Acompanhamento da situação fiscal estadual da filial junto à SEFAZ-ES;</li>
        <li>Atendimento a fiscalizações estaduais e municipais relativas à filial ES.</li>
      </ul>
      <p><strong>Observações:</strong></p>
      <ul>
        <li>Não incluso a geração dos arquivos SPED Fiscal pela CONTRATADA. O arquivo deverá ser gerado no sistema de gestão da CONTRATANTE.</li>
        <li>Toda comunicação com a Receita Federal e tributos federais (PIS, COFINS, IRPJ, CSLL) é de responsabilidade do escritório contábil principal da CONTRATANTE.</li>
        <li>A consolidação dos resultados da filial ES nas demonstrações contábeis e fiscais federais é de responsabilidade do escritório contábil principal.</li>
      </ul>
    `),
  },
]

// ════════════════════════════════════════════════════════════
// TEMPLATES NOVOS
// Cada template lista os CÓDIGOS de cláusulas que devem entrar.
// As cláusulas comuns (RESP, OBR, DISP, DOC, LGPD, HON, EXT, VIG, FORO)
// são reutilizadas — referenciadas com versão flutuante (sempre a mais
// recente publicada).
// ════════════════════════════════════════════════════════════

// Cláusulas comuns que entram em TODOS os templates de prestação mensal
const clausulasComunsMensal = [
  // Não inclui cabeçalhos OBJ raiz porque cada template tem seu próprio
  'RESP', 'RESP.1', 'RESP.2', 'RESP.3', 'RESP.4', 'RESP.5', 'RESP.6', 'RESP.7',
  'OBR', 'OBR.1', 'OBR.2', 'OBR.3', 'OBR.4', 'OBR.5', 'OBR.6', 'OBR.7', 'OBR.8',
  'OBR.9', 'OBR.10', 'OBR.11', 'OBR.12', 'OBR.13', 'OBR.14', 'OBR.15',
  'DISP', 'DISP.1', 'DISP.4.8', 'DISP.4.9', 'DISP.4.13', 'DISP.4.14', 'DISP.4.15',
  'DOC', 'DOC.CONTABIL', 'DOC.FISCAL', 'DOC.TRABALHISTA',
  'LGPD', 'LGPD.1', 'LGPD.2', 'LGPD.5', 'LGPD.6',
  'HON', 'HON.1', 'HON.2', 'HON.4', 'HON.6', 'HON.7', 'HON.8', 'HON.10',
  'EXT', 'EXT.LEGAL', 'EXT.TRAB', 'EXT.FISCAL', 'EXT.PF',
  'VIG', 'VIG.1', 'VIG.2', 'VIG.4', 'VIG.10',
  'FORO',
]

type TemplateSeed = {
  nome: string
  descricao: string
  regimeTributario: string | null
  temIE: boolean | null
  comMovimento: boolean | null
  // Códigos das cláusulas em ordem (templates substituem OBJ pelas variantes corretas)
  clausulas: string[]
}

const templatesNovos: TemplateSeed[] = [
  {
    nome: 'Simples Nacional COM IE',
    descricao: 'Empresas optantes do Simples Nacional com Inscrição Estadual (comércio/indústria, prestadores com substituição tributária ICMS).',
    regimeTributario: 'SIMPLES',
    temIE: true,
    comMovimento: true,
    clausulas: [
      // OBJETO completo: raiz + 4 áreas (Fiscal específica para SN COM IE)
      'OBJ', 'OBJ.CONTABIL', 'OBJ.FISCAL.SN.IE', 'OBJ.TRABALHISTA', 'OBJ.LEGALIZACAO',
      ...clausulasComunsMensal,
    ],
  },
  {
    nome: 'Simples Nacional SEM IE',
    descricao: 'Empresas optantes do Simples Nacional sem Inscrição Estadual (prestadores de serviços puros, profissionais liberais).',
    regimeTributario: 'SIMPLES',
    temIE: false,
    comMovimento: true,
    clausulas: [
      'OBJ', 'OBJ.CONTABIL', 'OBJ.FISCAL.SN.SEM_IE', 'OBJ.TRABALHISTA', 'OBJ.LEGALIZACAO',
      ...clausulasComunsMensal,
    ],
  },
  {
    nome: 'Presumido/Real SEM IE',
    descricao: 'Empresas no Lucro Presumido ou Real sem Inscrição Estadual (sociedades de serviços, holdings operacionais).',
    regimeTributario: 'PRESUMIDO',
    temIE: false,
    comMovimento: true,
    clausulas: [
      'OBJ', 'OBJ.CONTABIL', 'OBJ.FISCAL.PR.SEM_IE', 'OBJ.TRABALHISTA', 'OBJ.LEGALIZACAO',
      ...clausulasComunsMensal,
    ],
  },
  {
    nome: 'Sem Movimento — COM IE',
    descricao: 'Empresas inativas com Inscrição Estadual ainda ativa. Apenas declarações zeradas e SPED sem movimento.',
    regimeTributario: 'SEM_MOVIMENTO',
    temIE: true,
    comMovimento: false,
    clausulas: [
      // Usa OBJ.SM (variante específica) em vez de OBJ raiz comum
      'OBJ.SM.AREAS', 'OBJ.SM.CONTABIL', 'OBJ.SM.FISCAL', 'OBJ.SM.TRABALHISTA',
      ...clausulasComunsMensal,
    ],
  },
  {
    nome: 'Sem Movimento — SEM IE',
    descricao: 'Empresas inativas sem Inscrição Estadual. Apenas declarações zeradas federais (DCTFWeb, EFD-Reinf).',
    regimeTributario: 'SEM_MOVIMENTO',
    temIE: false,
    comMovimento: false,
    clausulas: [
      'OBJ.SM.AREAS', 'OBJ.SM.CONTABIL', 'OBJ.SM.FISCAL', 'OBJ.SM.TRABALHISTA',
      ...clausulasComunsMensal,
    ],
  },
  {
    nome: 'Filial ES — Somente Fiscal',
    descricao: 'Para empresas com matriz fora do ES que contratam apenas o serviço fiscal-tributário estadual da filial localizada no ES.',
    regimeTributario: null,
    temIE: true,
    comMovimento: true,
    clausulas: [
      // Objeto reduzido (só fiscal) + cláusulas comuns
      'OBJ.FILIAL.ES.AREAS', 'OBJ.FILIAL.ES.FISCAL',
      // Pula OBR.10/11 (alvarás — responsabilidade da matriz)
      // Mantém o resto das comuns
      'RESP', 'RESP.1', 'RESP.2', 'RESP.3', 'RESP.4', 'RESP.5', 'RESP.6', 'RESP.7',
      'OBR', 'OBR.1', 'OBR.2', 'OBR.3', 'OBR.4', 'OBR.5', 'OBR.6', 'OBR.7', 'OBR.8',
      'OBR.9', 'OBR.12', 'OBR.13', 'OBR.14', 'OBR.15',  // sem 10 e 11
      'DISP', 'DISP.1', 'DISP.4.8', 'DISP.4.9', 'DISP.4.13', 'DISP.4.14', 'DISP.4.15',
      'DOC', 'DOC.FISCAL',  // só fiscal aqui
      'LGPD', 'LGPD.1', 'LGPD.2', 'LGPD.5', 'LGPD.6',
      'HON', 'HON.1', 'HON.2', 'HON.4', 'HON.6', 'HON.7', 'HON.8', 'HON.10',
      'EXT', 'EXT.FISCAL',  // só extras fiscais
      'VIG', 'VIG.1', 'VIG.2', 'VIG.4', 'VIG.10',
      'FORO',
    ],
  },
]

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  // 1. Cria/atualiza cláusulas novas (variantes de OBJETO)
  console.log(`\nCadastrando ${clausulasNovas.length} cláusulas novas...\n`)
  const codigoToId = new Map<string, string>()
  for (const c of clausulasNovas) {
    const existing = await (prisma as any).clausula.findFirst({
      where: { codigo: c.codigo, empresaId: null },
      orderBy: { versao: 'desc' },
    })
    let saved: any
    if (existing) {
      saved = await (prisma as any).clausula.update({
        where: { id: existing.id },
        data: {
          titulo: c.titulo,
          conteudo: c.conteudo,
          categoria: c.categoria,
          ordem: c.ordem,
          publicada: true,
          publicadaEm: existing.publicadaEm || new Date(),
        },
      })
    } else {
      saved = await (prisma as any).clausula.create({
        data: {
          codigo: c.codigo,
          versao: 1,
          titulo: c.titulo,
          conteudo: c.conteudo,
          categoria: c.categoria,
          ordem: c.ordem,
          publicada: true,
          publicadaEm: new Date(),
          empresaId: null,
        },
      })
    }
    codigoToId.set(c.codigo, saved.id)
    console.log(`  ${existing ? 'UPD' : 'NEW'}  ${c.codigo.padEnd(28)} ${c.titulo.slice(0, 60)}`)
  }

  // Aplica hierarquia (parent)
  for (const c of clausulasNovas) {
    if (!c.parentCodigo) continue
    const id = codigoToId.get(c.codigo)
    // parent pode ser uma cláusula existente (já no banco) ou recém-criada
    let parentId = codigoToId.get(c.parentCodigo)
    if (!parentId) {
      const parent = await (prisma as any).clausula.findFirst({
        where: { codigo: c.parentCodigo, empresaId: null },
        orderBy: { versao: 'desc' },
      })
      parentId = parent?.id
    }
    if (id && parentId) {
      await (prisma as any).clausula.update({ where: { id }, data: { parentId } })
    }
  }

  // 2. Cria/atualiza templates
  console.log(`\nCriando ${templatesNovos.length} templates de contrato...\n`)
  for (const t of templatesNovos) {
    let template = await (prisma as any).contratoTemplate.findFirst({
      where: { nome: t.nome, empresaId: null },
    })
    if (template) {
      template = await (prisma as any).contratoTemplate.update({
        where: { id: template.id },
        data: {
          descricao: t.descricao,
          regimeTributario: t.regimeTributario,
          temIE: t.temIE,
          comMovimento: t.comMovimento,
          ativo: true,
        },
      })
      console.log(`  UPD  ${t.nome}`)
    } else {
      template = await (prisma as any).contratoTemplate.create({
        data: {
          nome: t.nome,
          descricao: t.descricao,
          regimeTributario: t.regimeTributario,
          temIE: t.temIE,
          comMovimento: t.comMovimento,
          ativo: true,
          empresaId: null,
        },
      })
      console.log(`  NEW  ${t.nome}`)
    }

    // Resolve cada código de cláusula → id (usa versão publicada mais recente)
    await (prisma as any).contratoTemplateClausula.deleteMany({ where: { templateId: template.id } })
    let ordem = 0
    let resolved = 0
    let missing = 0
    for (const codigo of t.clausulas) {
      const cl = await (prisma as any).clausula.findFirst({
        where: { codigo, publicada: true, empresaId: null },
        orderBy: { versao: 'desc' },
      })
      if (!cl) {
        console.warn(`       ⚠️  cláusula "${codigo}" não encontrada (publicada). Ignorando.`)
        missing++
        continue
      }
      await (prisma as any).contratoTemplateClausula.create({
        data: {
          templateId: template.id,
          clausulaId: cl.id,
          ordem: ordem++,
          fixaVersao: false,
        },
      })
      resolved++
    }
    console.log(`       ${resolved} cláusulas vinculadas${missing > 0 ? ` (${missing} faltando — rode seed-clausulas-contrato.ts primeiro)` : ''}`)
  }

  console.log(`\n✓ Pronto! ${templatesNovos.length} templates disponíveis em /contrato-templates.\n`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
