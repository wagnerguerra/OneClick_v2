'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import type { CreateAreaInput } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { AreaForm } from '../_components/area-form'

export default function EditAreaPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [area, setArea] = useState<(Partial<CreateAreaInput> & { code?: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!params.id) return
    trpc.area.getById
      .query({ id: params.id })
      .then((data) => {
        setArea({
          code: data.code,
          name: data.name,
          isActive: data.isActive,
          availableForHiring: data.availableForHiring,
          showInOrgChart: data.showInOrgChart,
          email: data.email ?? '',
          leaderId: data.leaderId ?? '',
          parentId: data.parentId ?? '',
          costType: data.costType as 'DIRECT' | 'INDIRECT',
          costWeight: Number(data.costWeight),
          excludeFromCosting: data.excludeFromCosting,
        })
      })
      .catch(() => setError('Área não encontrada'))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !area) {
    return <div className="py-12 text-center text-muted-foreground">{error ?? 'Área não encontrada'}</div>
  }

  return (
    <AreaForm
      mode="edit"
      areaId={params.id}
      title="Editar Área"
      description={`Altere os dados da área #${area.code}`}
      icon={<LayoutGrid className="h-6 w-6" />}
      defaultValues={area}
    />
  )
}
