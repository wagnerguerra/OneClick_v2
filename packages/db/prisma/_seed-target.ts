// Helpers compartilhados pelos seeds de serviços.
//
// Contexto: o `Servico.categoria` (texto livre, casado com `Area.name`) foi
// migrado para `Servico.areaId` (FK -> Area) no commit cc9904c7. Os seeds
// antigos ainda traziam `categoria: '<nome da área>'`; aqui resolvemos esse
// nome para o id de uma Area (find-or-create), sempre escopada a uma empresa.
//
// Escopo: nada é global (empresaId null). O alvo é UMA empresa, resolvida por
// SEED_EMPRESA_ID (se setado) ou a empresa mais antiga do banco (útil em dev,
// onde existe só a sua).
import type { PrismaClient } from '../src/generated/client'

export async function resolveEmpresaId(prisma: PrismaClient): Promise<string> {
  const fromEnv = process.env.SEED_EMPRESA_ID?.trim()
  if (fromEnv) return fromEnv
  const emp = await prisma.empresa.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!emp) {
    throw new Error(
      'Seed: nenhuma empresa encontrada. Crie uma empresa (onboarding) ou defina SEED_EMPRESA_ID.',
    )
  }
  return emp.id
}

/**
 * Retorna uma função que resolve o nome de uma área para o id da Area
 * correspondente na empresa alvo, criando-a se não existir. Cacheia por nome
 * para não repetir consultas dentro do mesmo seed.
 */
export function makeAreaResolver(prisma: PrismaClient, empresaId: string) {
  const cache = new Map<string, string>()
  return async function areaIdFor(nome: string): Promise<string> {
    const cached = cache.get(nome)
    if (cached) return cached
    const found = await prisma.area.findFirst({ where: { name: nome, empresaId } })
    const area = found ?? (await prisma.area.create({ data: { name: nome, empresaId } }))
    cache.set(nome, area.id)
    return area.id
  }
}
