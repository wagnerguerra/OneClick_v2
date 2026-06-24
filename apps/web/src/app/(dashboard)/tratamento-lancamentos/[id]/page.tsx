import { ModelEditor } from '../_components/model-editor'

export default async function EditarModeloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ModelEditor mode="edit" modelId={id} />
}
