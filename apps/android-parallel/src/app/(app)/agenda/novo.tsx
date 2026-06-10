import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button, Card, Input, Label, Screen, colors } from '@/components/ui'
import { toISODate } from '@/lib/date'
import { trpc } from '@/lib/trpc'

export default function NovoEventoScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const hoje = useMemo(() => toISODate(new Date()), [])
  const [titulo, setTitulo] = useState('')
  const [data, setData] = useState(hoje)
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFim, setHoraFim] = useState('')
  const [local, setLocal] = useState('')
  const [descricao, setDescricao] = useState('')
  const [diaInteiro, setDiaInteiro] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const tipos = trpc.agenda.listTipos.useQuery()
  const createEvento = trpc.agenda.create.useMutation({
    async onSuccess() {
      await utils.agenda.listEventos.invalidate()
      router.back()
    },
    onError(error: { message: string }) {
      setErro(error.message)
    },
  })

  const tipo = tipos.data?.[0]

  async function salvar() {
    if (!tipo) {
      setErro('Nenhum tipo de agenda encontrado.')
      return
    }

    setErro(null)
    createEvento.mutate({
      titulo: titulo.trim(),
      data,
      diaInteiro,
      descricao: descricao.trim() || null,
      horaInicio: diaInteiro ? null : horaInicio.trim() || null,
      horaFim: diaInteiro ? null : horaFim.trim() || null,
      local: local.trim() || null,
      tipoId: tipo.id,
    })
  }

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Novo evento</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.form}>
            {tipos.isPending ? (
              <View style={styles.loadingTipos}>
                <ActivityIndicator />
                <Text style={styles.muted}>Carregando tipos...</Text>
              </View>
            ) : null}

            <View>
              <Label>Titulo</Label>
              <Input onChangeText={setTitulo} placeholder="Reuniao, prazo ou visita" value={titulo} />
            </View>

            <View>
              <Label>Data</Label>
              <Input
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                onChangeText={setData}
                placeholder="YYYY-MM-DD"
                value={data}
              />
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.switchTitle}>Dia inteiro</Text>
                <Text style={styles.switchSubtitle}>Oculta os horarios do evento.</Text>
              </View>
              <Switch value={diaInteiro} onValueChange={setDiaInteiro} />
            </View>

            {!diaInteiro ? (
              <View style={styles.row}>
                <View style={styles.rowItem}>
                  <Label>Inicio</Label>
                  <Input
                    keyboardType="numbers-and-punctuation"
                    onChangeText={setHoraInicio}
                    placeholder="09:00"
                    value={horaInicio}
                  />
                </View>
                <View style={styles.rowItem}>
                  <Label>Fim</Label>
                  <Input
                    keyboardType="numbers-and-punctuation"
                    onChangeText={setHoraFim}
                    placeholder="10:00"
                    value={horaFim}
                  />
                </View>
              </View>
            ) : null}

            <View>
              <Label>Local</Label>
              <Input onChangeText={setLocal} placeholder="Sala, cliente ou link" value={local} />
            </View>

            <View>
              <Label>Descricao</Label>
              <Input
                multiline
                onChangeText={setDescricao}
                placeholder="Observacoes"
                style={styles.textArea}
                value={descricao}
              />
            </View>

            {tipo ? (
              <Text style={styles.muted}>Tipo usado nesta versao: {tipo.nome}</Text>
            ) : null}
            {erro ? <Text style={styles.error}>{erro}</Text> : null}

            <Button
              disabled={!titulo.trim() || !data || createEvento.isPending}
              loading={createEvento.isPending}
              onPress={salvar}
            >
              Salvar evento
            </Button>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  content: {
    padding: 18,
    paddingTop: 0,
  },
  form: {
    gap: 16,
  },
  loadingTipos: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  switchSubtitle: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  textArea: {
    height: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
})
