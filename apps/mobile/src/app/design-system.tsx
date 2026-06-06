import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text as RNText, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ListItem } from '@/components/ui/list-item'
import { SectionHeader } from '@/components/ui/section-header'
import { Spinner } from '@/components/ui/spinner'
import { StatCard } from '@/components/ui/stat-card'
import { SwitchRow } from '@/components/ui/switch-row'

/* ------------------------------------------------------------------ */
/* Dados estáticos da vitrine (legendas de cores/swatches)            */
/* ------------------------------------------------------------------ */

// Cada swatch mostra a classe de fundo + um hex de legenda (claro/escuro).
const SWATCHES: { name: string; className: string; hex: string }[] = [
  { name: 'primary', className: 'bg-primary', hex: '#0ea5e9' },
  { name: 'accent', className: 'bg-accent', hex: '#6366f1' },
  { name: 'success', className: 'bg-success', hex: '#10b981' },
  { name: 'warning', className: 'bg-warning', hex: '#f59e0b' },
  { name: 'destructive', className: 'bg-destructive', hex: '#f43f5e' },
  { name: 'muted', className: 'bg-muted', hex: '#f1f5f9' },
  { name: 'card', className: 'bg-card border border-border', hex: '#ffffff' },
  { name: 'elevated', className: 'bg-elevated', hex: '#f8fafc' },
]

/** Vitrine do Design System mobile — referência viva de tokens e componentes. */
export default function DesignSystem() {
  const router = useRouter()

  // Estado local dos switches (seção 10).
  const [notif, setNotif] = useState(true)
  const [biometria, setBiometria] = useState(false)

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-12"
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-auto w-full max-w-3xl gap-6 p-4">
          {/* Topo: voltar + título + subtítulo */}
          <View className="gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 self-start"
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={18} color="#0ea5e9" />
              <RNText className="text-base font-semibold text-primary">Voltar</RNText>
            </Button>
            <View className="gap-1">
              <RNText className="text-3xl font-bold text-foreground">Design System</RNText>
              <RNText className="text-sm text-muted-foreground">
                OneClick ERP · Android
              </RNText>
            </View>
          </View>

          {/* 1. MARCA ---------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Marca" />
            <View className="rounded-2xl bg-primary p-6">
              <RNText className="text-2xl font-bold text-primary-foreground">
                OneClick ERP
              </RNText>
              <RNText className="mt-1 text-base text-primary-foreground/90">
                Gestão contábil na palma da mão
              </RNText>
            </View>
          </View>

          {/* 2. CORES --------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Cores" />
            <View className="flex-row flex-wrap gap-3">
              {SWATCHES.map((s) => (
                <View key={s.name} className="gap-1.5">
                  <View className={`h-16 w-16 rounded-xl ${s.className}`} />
                  <View>
                    <RNText className="text-xs font-medium text-foreground">{s.name}</RNText>
                    <RNText
                      className="text-[10px] text-muted-foreground"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {s.hex}
                    </RNText>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* 3. TIPOGRAFIA ---------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Tipografia" />
            <View className="gap-2 rounded-2xl border border-border bg-card p-4">
              <RNText className="text-3xl font-bold text-foreground">Display</RNText>
              <RNText className="text-2xl font-bold text-foreground">Title</RNText>
              <RNText className="text-lg font-semibold text-foreground">Heading</RNText>
              <RNText className="text-base text-foreground">
                Body — texto corrido de parágrafo.
              </RNText>
              <RNText className="text-sm font-medium text-foreground">Label</RNText>
              <RNText className="text-xs text-muted-foreground">Caption · metadado</RNText>
              <View className="mt-1 flex-row items-baseline gap-4 border-t border-border pt-2">
                <RNText
                  className="text-xl font-bold text-foreground"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  R$ 12.345,67
                </RNText>
                <RNText
                  className="text-xl font-bold text-muted-foreground"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  1.234
                </RNText>
              </View>
            </View>
          </View>

          {/* 4. ELEVAÇÃO & SUPERFÍCIES ---------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Elevação & superfícies" />
            <View className="flex-row gap-3">
              <View className="flex-1 items-center justify-center rounded-2xl bg-muted p-5">
                <RNText className="text-sm font-medium text-muted-foreground">muted</RNText>
              </View>
              <View className="flex-1 items-center justify-center rounded-2xl border border-border bg-card p-5">
                <RNText className="text-sm font-medium text-foreground">card</RNText>
              </View>
              <View className="flex-1 items-center justify-center rounded-2xl border border-border bg-elevated p-5">
                <RNText className="text-sm font-medium text-foreground">elevated</RNText>
              </View>
            </View>
          </View>

          {/* 5. KPIs ---------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="KPIs" />
            <View className="gap-3 md:flex-row">
              <StatCard
                label="Eventos hoje"
                value="8"
                delta={{ value: '+2', up: true }}
                icon="calendar"
                className="md:flex-1"
              />
              <StatCard
                label="Tarefas abertas"
                value="14"
                delta={{ value: '-3', up: false }}
                icon="checkbox"
                className="md:flex-1"
              />
              <StatCard
                label="Clientes"
                value="252"
                icon="people"
                className="md:flex-1"
              />
            </View>
          </View>

          {/* 6. BOTÕES -------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Botões" />
            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              {/* Variantes */}
              <View className="flex-row flex-wrap gap-2">
                <Button size="sm">Default</Button>
                <Button size="sm" variant="outline">
                  Outline
                </Button>
                <Button size="sm" variant="ghost">
                  Ghost
                </Button>
                <Button size="sm" variant="success">
                  Success
                </Button>
                <Button size="sm" variant="destructive">
                  Excluir
                </Button>
              </View>
              {/* Tamanhos */}
              <View className="flex-row flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="default">Default</Button>
                <Button size="lg">Large</Button>
              </View>
              {/* Estados */}
              <View className="flex-row flex-wrap gap-2">
                <Button loading>Carregando</Button>
                <Button disabled variant="outline">
                  Desabilitado
                </Button>
              </View>
            </View>
          </View>

          {/* 7. INPUTS & FORM ------------------------------------------ */}
          <View className="gap-3">
            <SectionHeader title="Inputs & Form" />
            <View className="gap-4 rounded-2xl border border-border bg-card p-4">
              <View className="gap-1.5">
                <Label>Nome</Label>
                <Input defaultValue="Wagner Guerra" />
              </View>
              <View className="gap-1.5">
                <Label>E-mail</Label>
                <Input placeholder="voce@empresa.com" keyboardType="email-address" />
              </View>
              <View className="gap-1.5">
                <Label>CNPJ</Label>
                <Input
                  defaultValue="00.000.000/0001-00"
                  className="border-destructive"
                />
                <RNText className="text-sm text-destructive">CNPJ inválido.</RNText>
              </View>
            </View>
          </View>

          {/* 8. BADGES ------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Badges" />
            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge>Default</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="secondary">Secondary</Badge>
              </View>
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge className="bg-success/10">
                  <RNText className="text-xs font-semibold text-success">Ativo</RNText>
                </Badge>
                <Badge className="bg-warning/10">
                  <RNText className="text-xs font-semibold text-warning">Pendente</RNText>
                </Badge>
                <Badge className="bg-destructive/10">
                  <RNText className="text-xs font-semibold text-destructive">Vencido</RNText>
                </Badge>
              </View>
            </View>
          </View>

          {/* 9. LISTA -------------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Lista" />
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <ListItem
                icon="calendar"
                title="Agenda fiscal"
                subtitle="8 eventos hoje"
                onPress={() => {}}
              />
              <View className="mx-3 h-px bg-border" />
              <ListItem
                icon="checkbox"
                title="Minhas obrigações"
                subtitle="14 tarefas abertas"
                onPress={() => {}}
              />
              <View className="mx-3 h-px bg-border" />
              <ListItem
                icon="person"
                title="Perfil"
                subtitle="Conta e preferências"
                onPress={() => {}}
              />
            </View>
          </View>

          {/* 10. SWITCHES --------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Switches" />
            <View className="overflow-hidden rounded-2xl border border-border bg-card">
              <SwitchRow
                label="Notificações push"
                description="Avisos de vencimentos e prazos"
                value={notif}
                onValueChange={setNotif}
              />
              <View className="mx-3 h-px bg-border" />
              <SwitchRow
                label="Login por biometria"
                description="Usar digital ou Face ID"
                value={biometria}
                onValueChange={setBiometria}
              />
            </View>
          </View>

          {/* 11. SPINNER ---------------------------------------------- */}
          <View className="gap-3">
            <SectionHeader title="Spinner" />
            <View className="flex-row items-center gap-6 rounded-2xl border border-border bg-card p-4">
              <Spinner size="small" color="#0ea5e9" />
              <Spinner size="large" color="#0ea5e9" />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
