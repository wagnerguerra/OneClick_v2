import { ModelEditor } from '../../_components/model-editor'

export default async function EditarModeloPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string }>
}) {
  const { id } = await params
  const { from } = await searchParams
  return <ModelEditor mode="edit" modelId={id} backTo={from} />
}
