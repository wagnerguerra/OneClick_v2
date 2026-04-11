import type { PaginatedResponse, PaginationInput } from '@saas/types'

interface PaginateArgs<TWhereInput> {
  page: number
  limit: number
  where?: TWhereInput
  orderBy?: Record<string, 'asc' | 'desc'>
}

export function buildPaginationArgs<TWhereInput>(
  input: PaginationInput,
  where?: TWhereInput,
): PaginateArgs<TWhereInput> {
  const { page, limit, sortBy, sortDir } = input

  return {
    page,
    limit,
    where,
    orderBy: sortBy ? { [sortBy]: sortDir } : undefined,
  }
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit)

  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}

export function getPrismaSkipTake(page: number, limit: number) {
  return {
    skip: (page - 1) * limit,
    take: limit,
  }
}
