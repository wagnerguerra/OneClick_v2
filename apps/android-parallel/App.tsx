import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

import { Providers } from './src/lib/providers'
import { authClient, useSession } from './src/lib/auth-client'
import {
  addDays,
  formatDateTitle,
  formatShortWeekday,
  formatTime,
  sameDay,
  toISODate,
  weekDays,
} from './src/lib/date'
import { trpc } from './src/lib/trpc'

type Screen = 'login' | 'twoFactor' | 'dashboard' | 'agenda' | 'eventDetail' | 'newEvent'
type Tab = 'dashboard' | 'agenda'

type Evento = {
  id: string
  titulo: string
  data: Date | string
  horaInicio?: string | null
  horaFim?: string | null
  diaInteiro?: boolean | null
  local?: string | null
  descricao?: string | null
  link?: string | null
  tipo?: { nome?: string | null; cor?: string | null } | null
}

const palette = {
  blue: '#3775f6',
  navy: '#20376f',
  text: '#121826',
  muted: '#7b8494',
  line: '#e4ebf6',
  pale: '#eaf0fa',
  bg: '#ffffff',
  darkBg: '#0f172a',
  darkCard: '#1e293b',
  danger: '#ef4444',
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Providers>
        <Shell />
      </Providers>
    </SafeAreaProvider>
  )
}

function Shell() {
  const scheme = useColorScheme()
  const dark = scheme === 'dark'
  const [screen, setScreen] = useState<Screen>('login')
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  function goTab(tab: Tab) {
    setActiveTab(tab)
    setScreen(tab)
  }

  const appStyle = [styles.app, dark && styles.appDark]

  if (screen === 'login') {
    return (
      <View style={appStyle}>
        <StatusBar style={dark ? 'light' : 'light'} />
        <LoginScreen dark={dark} onDashboard={() => goTab('dashboard')} onTwoFactor={() => setScreen('twoFactor')} />
      </View>
    )
  }

  if (screen === 'twoFactor') {
    return (
      <View style={appStyle}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <TwoFactorScreen dark={dark} onBack={() => setScreen('login')} onDashboard={() => goTab('dashboard')} />
      </View>
    )
  }

  return (
    <View style={appStyle}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {screen === 'dashboard' ? <DashboardScreen dark={dark} /> : null}
      {screen === 'agenda' ? (
        <AgendaScreen
          dark={dark}
          onNew={() => setScreen('newEvent')}
          onOpen={(id) => {
            setSelectedEventId(id)
            setScreen('eventDetail')
          }}
        />
      ) : null}
      {screen === 'eventDetail' && selectedEventId ? (
        <EventDetailScreen dark={dark} eventId={selectedEventId} onBack={() => setScreen('agenda')} />
      ) : null}
      {screen === 'newEvent' ? <NewEventScreen dark={dark} onBack={() => setScreen('agenda')} /> : null}
      {screen === 'dashboard' || screen === 'agenda' ? (
        <BottomNav active={activeTab} dark={dark} onChange={goTab} />
      ) : null}
    </View>
  )
}

function LoginScreen({
  dark,
  onDashboard,
  onTwoFactor,
}: {
  dark: boolean
  onDashboard: () => void
  onTwoFactor: () => void
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function entrar() {
    if (loading) return
    setErro(null)
    setLoading(true)

    try {
      const { data, error } = await authClient.signIn.email({
        email: email.trim(),
        password: senha,
      })

      if (error) {
        setErro(error.message ?? 'Nao foi possivel entrar.')
        return
      }

      if (data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        onTwoFactor()
        return
      }

      onDashboard()
    } catch {
      setErro('Falha de conexao. Verifique a rede e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.hero}>
          <View style={styles.heroCenter}>
            <Text style={styles.heroTitle}>OneClick ERP</Text>
            <Text style={styles.heroSubtitle}>Acesse sua rotina em poucos toques</Text>
            <View style={styles.heroTools}>
              <CircleIcon icon="apps" />
              <View style={styles.heroPill}>
                <Text style={styles.heroPillText}>Area interna</Text>
                <Ionicons name="chevron-down" size={13} color="#fff" />
              </View>
              <CircleIcon icon="shield-checkmark" />
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.loginBody} keyboardShouldPersistTaps="handled">
          <Panel dark={dark} style={styles.loginPanel}>
            <Text style={[styles.formTitle, dark && styles.textDark]}>Entrar</Text>
            <Text style={[styles.formHint, dark && styles.mutedDark]}>Use o mesmo login do sistema web.</Text>

            <Field
              dark={dark}
              label="E-mail"
              onChangeText={setEmail}
              placeholder="voce@empresa.com"
              value={email}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              dark={dark}
              label="Senha"
              onChangeText={setSenha}
              onSubmitEditing={entrar}
              placeholder="********"
              value={senha}
              secureTextEntry
              autoCapitalize="none"
            />

            {erro ? <Text style={styles.error}>{erro}</Text> : null}

            <PrimaryButton disabled={!email || !senha || loading} loading={loading} onPress={entrar} text="Entrar" />
            <Pressable onPress={onDashboard}>
              <Text style={[styles.previewLink, dark && styles.mutedDark]}>Acessar previa</Text>
            </Pressable>
          </Panel>

          <Panel dark={dark} style={styles.loginQuick}>
            <View style={styles.smallIcon}>
              <Ionicons name="calendar" size={18} color={palette.blue} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.quickTitle, dark && styles.textDark]}>Agenda e tarefas</Text>
              <Text style={[styles.quickText, dark && styles.mutedDark]}>Dashboard, compromissos e pendencias no Android.</Text>
            </View>
          </Panel>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function TwoFactorScreen({
  dark,
  onBack,
  onDashboard,
}: {
  dark: boolean
  onBack: () => void
  onDashboard: () => void
}) {
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function verificar() {
    if (loading) return
    setErro(null)
    setLoading(true)

    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: codigo.trim() })
      if (error) {
        setErro(error.message ?? 'Codigo invalido.')
        return
      }
      onDashboard()
    } catch {
      setErro('Falha de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.centerBody}>
        <Text style={[styles.pageTitle, dark && styles.textDark]}>Verificacao</Text>
        <Text style={[styles.pageSubtitle, dark && styles.mutedDark]}>Digite o codigo do app autenticador.</Text>
        <Panel dark={dark} style={styles.authPanel}>
          <Field
            dark={dark}
            label="Codigo"
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={setCodigo}
            onSubmitEditing={verificar}
            placeholder="000000"
            value={codigo}
          />
          {erro ? <Text style={styles.error}>{erro}</Text> : null}
          <PrimaryButton disabled={codigo.length < 6 || loading} loading={loading} onPress={verificar} text="Verificar" />
          <Pressable onPress={onBack}>
            <Text style={[styles.previewLink, dark && styles.mutedDark]}>Voltar ao login</Text>
          </Pressable>
        </Panel>
      </View>
    </SafeAreaView>
  )
}

function DashboardScreen({ dark }: { dark: boolean }) {
  const { data: session } = useSession()
  const hoje = useMemo(() => toISODate(new Date()), [])
  const primeiroNome = session?.user?.name?.trim().split(/\s+/)[0]
  const eventos = trpc.agenda.listEventos.useQuery({ dataInicio: hoje, dataFim: hoje })
  const tarefas = trpc.agenda.tarefa.list.useQuery({ apenasAbertas: true })
  const loading = eventos.isPending || tarefas.isPending
  const refreshing = eventos.isRefetching || tarefas.isRefetching

  async function refetchAll() {
    await Promise.all([eventos.refetch(), tarefas.refetch()])
  }

  return (
    <SafeAreaView style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        <TopBar dark={dark} title={primeiroNome ? `Ola, ${primeiroNome}` : 'Ola'} subtitle="Resumo rapido para hoje." />
        {loading ? (
          <Panel dark={dark} style={styles.loadingPanel}>
            <ActivityIndicator />
            <Text style={[styles.formHint, dark && styles.mutedDark]}>Carregando indicadores...</Text>
          </Panel>
        ) : (
          <View style={styles.statGrid}>
            <StatCard dark={dark} icon="calendar-outline" label="Eventos hoje" value={String(eventos.isError ? 0 : eventos.data?.length ?? 0)} />
            <StatCard dark={dark} icon="checkbox-outline" label="Tarefas abertas" value={String(tarefas.isError ? 0 : tarefas.data?.length ?? 0)} />
          </View>
        )}
        <Panel dark={dark}>
          <Text style={[styles.panelTitle, dark && styles.textDark]}>Agenda</Text>
          <Text style={[styles.panelText, dark && styles.mutedDark]}>
            Consulta semanal, detalhe do evento e criacao simples de compromissos.
          </Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  )
}

function AgendaScreen({
  dark,
  onNew,
  onOpen,
}: {
  dark: boolean
  onNew: () => void
  onOpen: (id: string) => void
}) {
  const hoje = useMemo(() => new Date(), [])
  const [referencia, setReferencia] = useState(hoje)
  const [selecionado, setSelecionado] = useState(hoje)
  const dias = useMemo(() => weekDays(referencia), [referencia])
  const dataInicio = toISODate(dias[0]!)
  const dataFim = toISODate(dias[dias.length - 1]!)
  const selecionadoIso = toISODate(selecionado)
  const eventosQuery = trpc.agenda.listEventos.useQuery({ dataInicio, dataFim })
  const eventos = ((eventosQuery.data ?? []) as Evento[]).filter((evento) => {
    const data = evento.data instanceof Date ? evento.data : new Date(evento.data)
    return toISODate(data) === selecionadoIso
  })

  function moverSemana(delta: number) {
    setReferencia((current) => addDays(current, delta))
    setSelecionado((current) => addDays(current, delta))
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.agendaHeader}>
        <View>
          <Text style={styles.kicker}>Agenda</Text>
          <Text style={[styles.agendaTitle, dark && styles.textDark]}>{formatDateTitle(selecionado)}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onNew} style={styles.newButton}>
          <Ionicons name="add" color="#fff" size={24} />
        </Pressable>
      </View>
      <View style={styles.weekNav}>
        <IconButton dark={dark} icon="chevron-back" onPress={() => moverSemana(-7)} />
        <Text style={[styles.weekTitle, dark && styles.mutedDark]}>{toISODate(dias[0]!)} a {toISODate(dias[6]!)}</Text>
        <IconButton dark={dark} icon="chevron-forward" onPress={() => moverSemana(7)} />
      </View>
      <View style={styles.days}>
        {dias.map((dia) => {
          const active = sameDay(dia, selecionado)
          const today = sameDay(dia, hoje)
          return (
            <Pressable key={toISODate(dia)} onPress={() => setSelecionado(dia)} style={[styles.day, dark && styles.dayDark, active && styles.dayActive]}>
              <Text style={[styles.dayName, active && styles.dayTextActive]}>{formatShortWeekday(dia)}</Text>
              <Text style={[styles.dayNumber, dark && styles.textDark, active && styles.dayTextActive]}>{dia.getDate()}</Text>
              {today && !active ? <View style={styles.todayDot} /> : null}
            </Pressable>
          )
        })}
      </View>
      {eventosQuery.isPending ? (
        <View style={styles.centerFill}><ActivityIndicator /></View>
      ) : eventosQuery.isError ? (
        <Empty dark={dark} text="Nao foi possivel carregar a agenda." />
      ) : eventos.length === 0 ? (
        <Empty dark={dark} text="Nenhum evento neste dia." />
      ) : (
        <ScrollView
          contentContainerStyle={styles.eventList}
          refreshControl={<RefreshControl refreshing={eventosQuery.isRefetching} onRefresh={() => eventosQuery.refetch()} />}
        >
          {eventos.map((evento) => <EventoCard dark={dark} evento={evento} key={evento.id} onPress={() => onOpen(evento.id)} />)}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function EventDetailScreen({
  dark,
  eventId,
  onBack,
}: {
  dark: boolean
  eventId: string
  onBack: () => void
}) {
  const eventoQuery = trpc.agenda.getEvento.useQuery({ id: eventId })
  const evento = eventoQuery.data as Evento | undefined

  return (
    <SafeAreaView style={styles.flex}>
      <Header dark={dark} title="Detalhe do evento" onBack={onBack} />
      {eventoQuery.isPending ? (
        <View style={styles.centerFill}><ActivityIndicator /></View>
      ) : eventoQuery.isError || !evento ? (
        <Empty dark={dark} text="Evento nao encontrado." />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Panel dark={dark} style={[styles.detailPanel, { borderLeftColor: evento.tipo?.cor || palette.blue }]}>
            <Text style={[styles.detailTitle, dark && styles.textDark]}>{evento.titulo}</Text>
            <Detail dark={dark} icon="calendar-outline" label="Data" value={String(evento.data).slice(0, 10)} />
            <Detail dark={dark} icon="time-outline" label="Horario" value={evento.diaInteiro ? 'Dia inteiro' : [formatTime(evento.horaInicio), formatTime(evento.horaFim)].filter(Boolean).join(' - ') || 'Nao informado'} />
            <Detail dark={dark} icon="location-outline" label="Local" value={evento.local || 'Nao informado'} />
            {evento.descricao ? <Text style={[styles.panelText, dark && styles.mutedDark]}>{evento.descricao}</Text> : null}
          </Panel>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function NewEventScreen({ dark, onBack }: { dark: boolean; onBack: () => void }) {
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
  const tipo = tipos.data?.[0]
  const createEvento = trpc.agenda.create.useMutation({
    async onSuccess() {
      await utils.agenda.listEventos.invalidate()
      onBack()
    },
    onError(error: { message: string }) {
      setErro(error.message)
    },
  })

  function salvar() {
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
    <SafeAreaView style={styles.flex}>
      <Header dark={dark} title="Novo evento" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Panel dark={dark} style={styles.formStack}>
          {tipos.isPending ? <Text style={[styles.formHint, dark && styles.mutedDark]}>Carregando tipos...</Text> : null}
          <Field dark={dark} label="Titulo" onChangeText={setTitulo} placeholder="Reuniao, prazo ou visita" value={titulo} />
          <Field dark={dark} label="Data" keyboardType="numbers-and-punctuation" onChangeText={setData} placeholder="YYYY-MM-DD" value={data} />
          <View style={styles.switchRow}>
            <View>
              <Text style={[styles.switchTitle, dark && styles.textDark]}>Dia inteiro</Text>
              <Text style={[styles.switchSubtitle, dark && styles.mutedDark]}>Oculta os horarios do evento.</Text>
            </View>
            <Switch value={diaInteiro} onValueChange={setDiaInteiro} />
          </View>
          {!diaInteiro ? (
            <View style={styles.row}>
              <View style={styles.flex}><Field dark={dark} label="Inicio" keyboardType="numbers-and-punctuation" onChangeText={setHoraInicio} placeholder="09:00" value={horaInicio} /></View>
              <View style={styles.flex}><Field dark={dark} label="Fim" keyboardType="numbers-and-punctuation" onChangeText={setHoraFim} placeholder="10:00" value={horaFim} /></View>
            </View>
          ) : null}
          <Field dark={dark} label="Local" onChangeText={setLocal} placeholder="Sala, cliente ou link" value={local} />
          <Field dark={dark} label="Descricao" multiline onChangeText={setDescricao} placeholder="Observacoes" style={styles.textArea} value={descricao} />
          {tipo ? <Text style={[styles.formHint, dark && styles.mutedDark]}>Tipo usado nesta versao: {tipo.nome}</Text> : null}
          {erro ? <Text style={styles.error}>{erro}</Text> : null}
          <PrimaryButton disabled={!titulo.trim() || !data || createEvento.isPending} loading={createEvento.isPending} onPress={salvar} text="Salvar evento" />
        </Panel>
      </ScrollView>
    </SafeAreaView>
  )
}

function BottomNav({ active, dark, onChange }: { active: Tab; dark: boolean; onChange: (tab: Tab) => void }) {
  return (
    <View style={[styles.bottomNav, dark && styles.bottomNavDark]}>
      <NavItem active={active === 'dashboard'} icon="home" label="Inicio" onPress={() => onChange('dashboard')} />
      <NavItem active={active === 'agenda'} icon="calendar" label="Agenda" onPress={() => onChange('agenda')} />
      <NavItem active={false} icon="heart" label="Favoritos" onPress={() => undefined} />
      <NavItem active={false} icon="settings" label="Ajustes" onPress={() => undefined} />
    </View>
  )
}

function NavItem({ active, icon, label, onPress }: { active: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.navItem}>
      <Ionicons name={icon} size={22} color={active ? palette.blue : '#a9b6cc'} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  )
}

function TopBar({ dark, title, subtitle }: { dark: boolean; title: string; subtitle: string }) {
  return (
    <View style={styles.topBar}>
      <View>
        <Text style={styles.kicker}>OneClick ERP</Text>
        <Text style={[styles.pageTitle, dark && styles.textDark]}>{title}</Text>
        <Text style={[styles.pageSubtitle, dark && styles.mutedDark]}>{subtitle}</Text>
      </View>
      <CircleIcon icon="notifications-outline" />
    </View>
  )
}

function Panel({ children, dark, style }: { children: React.ReactNode; dark: boolean; style?: object }) {
  return <View style={[styles.panel, dark && styles.panelDark, style]}>{children}</View>
}

function Field({ dark, label, style, ...props }: React.ComponentProps<typeof TextInput> & { dark: boolean; label: string }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, dark && styles.textDark]}>{label}</Text>
      <TextInput
        placeholderTextColor={dark ? '#64748b' : '#a5adbc'}
        {...props}
        style={[styles.input, dark && styles.inputDark, style]}
      />
    </View>
  )
}

function PrimaryButton({ disabled, loading, onPress, text }: { disabled?: boolean; loading?: boolean; onPress: () => void; text: string }) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{text}</Text>}
    </Pressable>
  )
}

function CircleIcon({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.circleIcon}>
      <Ionicons name={icon} size={18} color={palette.blue} />
    </View>
  )
}

function IconButton({ dark, icon, onPress }: { dark: boolean; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.iconButton, dark && styles.iconButtonDark]}>
      <Ionicons name={icon} size={18} color={dark ? '#f8fafc' : palette.text} />
    </Pressable>
  )
}

function StatCard({ dark, icon, label, value }: { dark: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <Panel dark={dark} style={styles.statCard}>
      <View style={styles.statIcon}><Ionicons name={icon} size={20} color={palette.blue} /></View>
      <Text style={[styles.statValue, dark && styles.textDark]}>{value}</Text>
      <Text style={[styles.statLabel, dark && styles.mutedDark]}>{label}</Text>
    </Panel>
  )
}

function EventoCard({ dark, evento, onPress }: { dark: boolean; evento: Evento; onPress: () => void }) {
  const horario = evento.diaInteiro ? 'Dia inteiro' : [formatTime(evento.horaInicio), formatTime(evento.horaFim)].filter(Boolean).join(' - ')
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Panel dark={dark} style={[styles.eventCard, { borderLeftColor: evento.tipo?.cor || palette.blue }]}>
        <Text style={[styles.eventTitle, dark && styles.textDark]}>{evento.titulo}</Text>
        {horario ? <Text style={[styles.eventMeta, dark && styles.mutedDark]}>{horario}</Text> : null}
        {evento.local ? <Text style={[styles.eventMeta, dark && styles.mutedDark]}>{evento.local}</Text> : null}
        {evento.tipo?.nome ? <Text style={styles.eventType}>{evento.tipo.nome}</Text> : null}
      </Panel>
    </Pressable>
  )
}

function Header({ dark, title, onBack }: { dark: boolean; title: string; onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <IconButton dark={dark} icon="chevron-back" onPress={onBack} />
      <Text style={[styles.headerTitle, dark && styles.textDark]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  )
}

function Detail({ dark, icon, label, value }: { dark: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={18} color={palette.blue} />
      <View style={styles.flex}>
        <Text style={[styles.detailLabel, dark && styles.mutedDark]}>{label}</Text>
        <Text style={[styles.detailValue, dark && styles.textDark]}>{value}</Text>
      </View>
    </View>
  )
}

function Empty({ dark, text }: { dark: boolean; text: string }) {
  return (
    <View style={styles.centerFill}>
      <Text style={[styles.emptyText, dark && styles.mutedDark]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  app: { backgroundColor: palette.bg, flex: 1 },
  appDark: { backgroundColor: palette.darkBg },
  flex: { flex: 1 },
  hero: {
    backgroundColor: palette.navy,
    minHeight: 244,
    paddingHorizontal: 26,
  },
  heroCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 28,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    marginTop: 6,
  },
  heroTools: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  heroPill: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    justifyContent: 'center',
  },
  heroPillText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  circleIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  loginBody: {
    gap: 14,
    padding: 24,
    paddingBottom: 32,
  },
  loginPanel: {
    gap: 16,
    marginTop: -62,
  },
  loginQuick: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  panel: {
    backgroundColor: '#ffffff',
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  panelDark: {
    backgroundColor: palette.darkCard,
    borderColor: '#334155',
  },
  formTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '900',
  },
  formHint: {
    color: palette.muted,
    fontSize: 13,
  },
  field: { gap: 6 },
  label: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    backgroundColor: palette.pale,
    borderRadius: 14,
    color: palette.text,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  inputDark: {
    backgroundColor: palette.darkBg,
    color: '#f8fafc',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 24,
    height: 50,
    justifyContent: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  previewLink: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  error: {
    color: palette.danger,
    fontSize: 14,
  },
  smallIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  quickTitle: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '900',
  },
  quickText: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  centerBody: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  authPanel: {
    gap: 16,
    marginTop: 22,
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 104,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kicker: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: palette.text,
    fontSize: 30,
    fontWeight: '900',
  },
  pageSubtitle: {
    color: palette.muted,
    fontSize: 15,
    marginTop: 4,
  },
  loadingPanel: {
    alignItems: 'center',
    gap: 10,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    gap: 6,
    minHeight: 118,
  },
  statIcon: {
    alignItems: 'center',
    backgroundColor: '#e0ecff',
    borderRadius: 12,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  statValue: {
    color: palette.text,
    fontSize: 26,
    fontWeight: '900',
  },
  statLabel: {
    color: palette.muted,
    fontSize: 13,
  },
  panelTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '900',
  },
  panelText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  agendaHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
    paddingBottom: 12,
  },
  agendaTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  newButton: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  weekNav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: palette.line,
    borderRadius: 12,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconButtonDark: {
    backgroundColor: palette.darkCard,
    borderColor: '#334155',
  },
  weekTitle: {
    color: palette.muted,
    flex: 1,
    fontSize: 13,
    textAlign: 'center',
  },
  days: {
    flexDirection: 'row',
    gap: 8,
    padding: 18,
  },
  day: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: palette.line,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 64,
    justifyContent: 'center',
  },
  dayDark: {
    backgroundColor: palette.darkCard,
    borderColor: '#334155',
  },
  dayActive: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  dayName: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dayNumber: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '900',
  },
  dayTextActive: { color: '#ffffff' },
  todayDot: {
    backgroundColor: palette.blue,
    borderRadius: 2,
    height: 4,
    marginTop: 2,
    width: 4,
  },
  centerFill: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  eventList: {
    gap: 12,
    padding: 18,
    paddingBottom: 104,
    paddingTop: 0,
  },
  eventCard: {
    borderLeftWidth: 5,
    gap: 4,
  },
  eventTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '900',
  },
  eventMeta: {
    color: palette.muted,
    fontSize: 14,
  },
  eventType: {
    color: palette.blue,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  bottomNav: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopColor: palette.line,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    height: 76,
    justifyContent: 'space-around',
    left: 0,
    paddingBottom: 10,
    position: 'absolute',
    right: 0,
  },
  bottomNavDark: {
    backgroundColor: palette.darkCard,
    borderTopColor: '#334155',
  },
  navItem: {
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
    minWidth: 58,
  },
  navText: {
    color: '#a9b6cc',
    fontSize: 10,
    fontWeight: '800',
  },
  navTextActive: { color: palette.blue },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  headerTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: '900',
  },
  headerSpacer: { height: 40, width: 40 },
  detailPanel: {
    borderLeftWidth: 5,
    gap: 14,
  },
  detailTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '900',
  },
  detailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  detailLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  detailValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  formStack: { gap: 16 },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  switchTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '800',
  },
  switchSubtitle: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  textArea: {
    minHeight: 92,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  emptyText: {
    color: palette.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  textDark: { color: '#f8fafc' },
  mutedDark: { color: '#94a3b8' },
})
