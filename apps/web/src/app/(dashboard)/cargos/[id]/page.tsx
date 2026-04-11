'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Briefcase } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { CargoForm } from '../_components/cargo-form'

interface LinkedUser { id: string; name: string; email: string; profile: string; image: string | null }
interface CargoEventItem {
  id: string; type: string; version: number
  changes: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
  user: { id: string; name: string } | null
}

export default function EditCargoPage() {
  const params = useParams<{ id: string }>()
  const [loading, setLoading] = useState(true)
  const [cargo, setCargo] = useState<Record<string, unknown> | null>(null)
  const [users, setUsers] = useState<LinkedUser[]>([])
  const [events, setEvents] = useState<CargoEventItem[]>([])

  useEffect(() => {
    if (!params.id) return
    Promise.all([
      trpc.cargo.getById.query({ id: params.id }),
      trpc.cargo.getEvents.query({ cargoId: params.id }),
    ])
      .then(([d, evts]) => {
        setCargo({
          code: d.code,
          name: d.name,
          isActive: d.isActive,
          areaId: d.areaId ?? '',
          showInOrgChart: d.showInOrgChart,
          descricaoSumaria: d.descricaoSumaria ?? '',
          responsabilidades: d.responsabilidades ?? '',
          habilidades: d.habilidades ?? '',
          autoridades: d.autoridades ?? '',
          experiencias: d.experiencias ?? '',
          treinamentos: d.treinamentos ?? '',
          educacao: d.educacao ?? '',
        })
        setUsers((d.users ?? []) as LinkedUser[])
        setEvents(evts as CargoEventItem[])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5ea3cb] border-t-transparent" />
      </div>
    )
  }

  if (!cargo) return <div className="py-12 text-center text-muted-foreground">Cargo não encontrado</div>

  return (
    <CargoForm
      mode="edit"
      cargoId={params.id}
      title="Editar Cargo"
      description={`#${cargo.code} — ${cargo.name}`}
      icon={<Briefcase className="h-6 w-6" />}
      defaultValues={cargo as any}
      linkedUsers={users}
      events={events}
    />
  )
}
