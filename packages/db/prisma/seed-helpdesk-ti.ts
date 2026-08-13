/**
 * Seed: catálogo de categorias do HelpDesk de TI.
 *
 * Roda 1x para popular o catálogo inicial. Idempotente — não recria categorias
 * cujo `nome` já existe na empresa-alvo.
 *
 * Uso:
 *   pnpm --filter @saas/db tsx prisma/seed-helpdesk-ti.ts
 */
import { PrismaClient } from '../src/generated/client'
import { resolveEmpresaId, makeAreaResolver } from './_seed-target'

const prisma = new PrismaClient()

interface CatSeed {
  nome: string
  descricao?: string
  slaPadraoHoras?: number
  cor?: string
  filhos?: Array<{ nome: string; descricao?: string }>
}

// SLA padrão por categoria (em horas, durante expediente — pode ser overridden
// no formulário de criação ou na config global por prioridade).
// Valores baseados em médias de Freshservice/Jira Service Management.
const CATEGORIAS: CatSeed[] = [
  {
    nome: 'Hardware',
    descricao: 'Equipamentos físicos: notebook, desktop, periféricos.',
    cor: '#0ea5e9',
    slaPadraoHoras: 24,
    filhos: [
      { nome: 'Notebook / Desktop' },
      { nome: 'Periféricos (teclado, mouse, headset)' },
      { nome: 'Impressora / Scanner' },
      { nome: 'Monitor' },
      { nome: 'Cabos / Adaptadores' },
    ],
  },
  {
    nome: 'Software',
    descricao: 'Aplicativos e sistemas operacionais.',
    cor: '#8b5cf6',
    slaPadraoHoras: 8,
    filhos: [
      { nome: 'Instalação / Atualização' },
      { nome: 'Erro ou travamento' },
      { nome: 'Licença / Ativação' },
      { nome: 'Office / Suíte produtividade' },
    ],
  },
  {
    nome: 'Rede',
    descricao: 'Conectividade interna e externa.',
    cor: '#f59e0b',
    slaPadraoHoras: 4,
    filhos: [
      { nome: 'Sem internet / instável' },
      { nome: 'Wi-Fi' },
      { nome: 'VPN' },
      { nome: 'Compartilhamento de pastas' },
    ],
  },
  {
    nome: 'Acesso',
    descricao: 'Senhas, permissões, contas.',
    cor: '#10b981',
    slaPadraoHoras: 4,
    filhos: [
      { nome: 'Reset de senha' },
      { nome: 'Solicitação de acesso' },
      { nome: 'MFA / Two-Factor' },
      { nome: 'Conta nova / desligamento' },
    ],
  },
  {
    nome: 'E-mail',
    descricao: 'Caixa postal corporativa.',
    cor: '#ec4899',
    slaPadraoHoras: 8,
    filhos: [
      { nome: 'Configuração / Setup' },
      { nome: 'Caixa cheia / Quota' },
      { nome: 'Spam / Phishing suspeito' },
      { nome: 'Lista de distribuição' },
    ],
  },
  {
    nome: 'Sistemas internos',
    descricao: 'ERP, sistema contábil, ponto, folha.',
    cor: '#06b6d4',
    slaPadraoHoras: 8,
    filhos: [
      { nome: 'ERP / Contábil (SCI)' },
      { nome: 'Ponto / Folha' },
      { nome: 'Acesso negado' },
      { nome: 'Erro funcional' },
    ],
  },
  {
    nome: 'Segurança',
    descricao: 'Incidentes de segurança da informação.',
    cor: '#ef4444',
    slaPadraoHoras: 2,
    filhos: [
      { nome: 'Phishing / Tentativa de fraude' },
      { nome: 'Vírus / Malware' },
      { nome: 'Vazamento / Acesso indevido' },
      { nome: 'LGPD' },
    ],
  },
  {
    nome: 'Outros',
    descricao: 'Solicitações que não se encaixam nas demais.',
    cor: '#6b7280',
    slaPadraoHoras: 48,
  },
]

async function main() {
  console.log('🌱 Seed HelpDesk — categorias TI')

  // Área "Tecnologia da Informação" (roteamento padrão do HelpDesk), escopada à
  // empresa alvo — find-or-create pelo mesmo helper dos demais seeds. É a área
  // associada a todas as categorias abaixo.
  const empresaId = await resolveEmpresaId(prisma)
  const areaIdFor = makeAreaResolver(prisma, empresaId)
  const areaTiId = await areaIdFor('Tecnologia da Informação')
  console.log(`  ✓ Área "Tecnologia da Informação" (id=${areaTiId})`)

  let ordem = 0
  for (const cat of CATEGORIAS) {
    ordem += 10
    const existing = await prisma.helpdeskCategoria.findFirst({
      where: { nome: cat.nome, parentId: null, empresaId },
    })

    let parentId: string
    if (existing) {
      parentId = existing.id
      console.log(`  ⏭️  ${cat.nome} (já existe)`)
    } else {
      const created = await prisma.helpdeskCategoria.create({
        data: {
          nome: cat.nome,
          descricao: cat.descricao,
          cor: cat.cor,
          slaPadraoHoras: cat.slaPadraoHoras,
          areaId: areaTiId,
          empresaId,
          ordem,
          ativo: true,
        },
      })
      parentId = created.id
      console.log(`  ➕ ${cat.nome}`)
    }

    if (cat.filhos) {
      let ordemFilho = 0
      for (const filho of cat.filhos) {
        ordemFilho += 10
        const existingFilho = await prisma.helpdeskCategoria.findFirst({
          where: { nome: filho.nome, parentId, empresaId },
        })
        if (existingFilho) {
          console.log(`    ⏭️  ${filho.nome}`)
        } else {
          await prisma.helpdeskCategoria.create({
            data: {
              nome: filho.nome,
              descricao: filho.descricao,
              parentId,
              areaId: areaTiId,
              empresaId,
              ordem: ordemFilho,
              ativo: true,
            },
          })
          console.log(`    ➕ ${filho.nome}`)
        }
      }
    }
  }

  const total = await prisma.helpdeskCategoria.count()
  console.log(`✅ Concluído. Total de categorias no catálogo: ${total}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
