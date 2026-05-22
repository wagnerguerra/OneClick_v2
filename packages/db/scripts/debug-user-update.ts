/**
 * Debug — reproduz o user.update.mutate trocando senha pra capturar o erro real.
 * Pega o primeiro user não-master ativo e tenta alterar a senha.
 */
import { prisma } from '../src/client'
// @ts-ignore — better-auth está em apps/api, não em packages/db
import { hashPassword } from 'better-auth/crypto'

async function main() {
  const target = await prisma.user.findFirst({
    where: { isActive: true, isMaster: false },
    select: { id: true, name: true, email: true, role: true, profile: true, areaId: true, cargoId: true, empresaId: true },
  })
  if (!target) { console.log('Nenhum user disponível'); return }
  console.log('→ Target:', target)

  // Mock do payload que o form envia (todos os campos do updateUserSchema)
  const payload: Record<string, any> = {
    name: target.name,
    email: target.email,
    password: 'TesteSenha123',
    telefone: '', celular: '', ramal: '',
    role: target.role, profile: target.profile,
    empresaId: target.empresaId ?? '',
    areaId: target.areaId ?? '',
    cargoId: target.cargoId ?? '',
    salario: undefined,
    dataAdmissao: '',
    idOneClick: '',
    incluirFerias: true,
    isActive: true,
    exibirComoColaborador: false,
    cpf: '', rg: '', orgaoEmissor: '',
    dataNascimento: '', sexo: '', estadoCivil: '',
    nacionalidade: 'Brasileira', naturalidade: '',
    pis: '', ctps: '', ctpsSerie: '', tituloEleitor: '', reservista: '',
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    tipoContrato: 'CLT',
    dataDemissao: '',
    cargaHoraria: 44,
    observacoes: '',
    permissions: [],
  }

  console.log('\n→ Tentando reproduzir update...\n')
  try {
    const { permissions, password, empresaId, areaId, cargoId,
            dataAdmissao, dataNascimento, dataDemissao,
            salario, cpf, sexo, estadoCivil, tipoContrato,
            ...userData } = payload

    await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id: target.id } })
      console.log('  existing.isMaster:', existing.isMaster)

      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(userData)) {
        if (value !== undefined) {
          data[key] = typeof value === 'string' && value === '' ? null : value
        }
      }
      if (empresaId !== undefined) data.empresaId = empresaId || null
      if (areaId !== undefined) data.areaId = areaId || null
      if (cargoId !== undefined) data.cargoId = cargoId || null
      if (cpf !== undefined) data.cpf = cpf ? String(cpf).replace(/\D/g, '') : null
      if (sexo !== undefined) data.sexo = sexo || null
      if (estadoCivil !== undefined) data.estadoCivil = estadoCivil || null
      if (tipoContrato !== undefined) data.tipoContrato = tipoContrato || 'CLT'
      if (salario !== undefined) data.salario = salario != null && salario !== '' ? Number(salario) : null
      if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null
      if (dataNascimento !== undefined) data.dataNascimento = dataNascimento ? new Date(dataNascimento) : null
      if (dataDemissao !== undefined) data.dataDemissao = dataDemissao ? new Date(dataDemissao) : null

      console.log('\n→ data keys:', Object.keys(data).join(', '))
      console.log('→ data role/profile/isActive:', { role: data.role, profile: data.profile, isActive: data.isActive })
      console.log('→ data nacionalidade/observacoes:', { nacionalidade: data.nacionalidade, observacoes: data.observacoes })

      // SIMULAÇÃO — não comita o update, só faz dry-run via tx que damos rollback
      await tx.user.update({ where: { id: target.id }, data })
      console.log('\n  ✓ user.update OK')

      if (password) {
        const hashedPassword = await hashPassword(password)
        const r = await tx.account.updateMany({
          where: { userId: target.id, providerId: 'credential' },
          data: { password: hashedPassword },
        })
        console.log(`  ✓ account.updateMany — atualizadas: ${r.count}`)
      }

      throw new Error('ROLLBACK_INTENTIONAL') // garante rollback
    })
  } catch (e: any) {
    if (e?.message === 'ROLLBACK_INTENTIONAL') {
      console.log('\n  ✓ Tudo OK — rollback intencional executado.')
    } else {
      console.error('\n✗ ERRO REAL:', e.message)
      console.error('  Stack:', e.stack?.split('\n').slice(0, 5).join('\n'))
      if (e.code) console.error('  Prisma code:', e.code)
      if (e.meta) console.error('  Prisma meta:', JSON.stringify(e.meta, null, 2))
    }
  }
}

main().catch(e => { console.error('outer:', e); process.exit(1) }).finally(() => prisma.$disconnect())
