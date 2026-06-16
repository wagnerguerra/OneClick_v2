// Tela de DETALHE de um evento da Agenda (rota /agenda/[id]).
//
// Casca fina: lê o `id` da rota e delega todo o conteúdo ao componente reusável
// `EventoDetalhe` (que, no modo não-embutido, renderiza o próprio botão "voltar"
// e as ações de Editar/Excluir). O SafeAreaView do chrome fica aqui no pai.

import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'

import { EventoDetalhe } from '@/features/agenda/evento-detalhe'

export default function AgendaEventoDetalheScreen() {
  // `origem` (opcional) diz de onde o usuário veio — usado pelo "Voltar" do
  // detalhe pra retornar ao lugar certo (ex.: 'dashboard').
  const { id, origem } = useLocalSearchParams<{ id: string; origem?: string }>()

  return (
    <SafeAreaView className="flex-1 bg-background">
      <EventoDetalhe id={id} origem={origem} />
    </SafeAreaView>
  )
}
