import { ModelEditor } from '../../_components/model-editor'

export default async function NovoModeloPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  return <ModelEditor mode="create" backTo={from} />
}
