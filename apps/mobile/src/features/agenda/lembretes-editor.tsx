// Editor de LEMBRETES de um evento da agenda.
//
// Componente 100% controlado: recebe a lista atual via `value` e propaga
// alterações via `onChange`. Não fala com o backend — quem salva é a tela que
// o usa (novo.tsx), via `agenda.lembrete.save`.
//
// Cada lembrete tem um canal (POPUP/EMAIL) e um "quando" em minutos antes do
// evento. Pra o "quando" usamos chips de presets comuns (mais simples num
// celular que digitar minutos na unha). Limite de 10 lembretes (igual ao back).

import { Pressable, View } from 'react-native'

import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'

// Shape de um lembrete — espelha o item esperado pelo `lembrete.save` do back.
export type LembreteItem = { canal: 'POPUP' | 'EMAIL'; minutosAntes: number }

const MAX_LEMBRETES = 10

// Canais disponíveis (rótulos em pt-BR).
const CANAIS: Array<{ valor: LembreteItem['canal']; rotulo: string }> = [
  { valor: 'POPUP', rotulo: 'Notificação' },
  { valor: 'EMAIL', rotulo: 'E-mail' },
]

// Presets de "quando" — minutos antes do evento e seus rótulos amigáveis.
const PRESETS_QUANDO: Array<{ minutos: number; rotulo: string }> = [
  { minutos: 0, rotulo: 'No horário' },
  { minutos: 5, rotulo: '5 min antes' },
  { minutos: 15, rotulo: '15 min antes' },
  { minutos: 30, rotulo: '30 min antes' },
  { minutos: 60, rotulo: '1 hora antes' },
  { minutos: 120, rotulo: '2 horas antes' },
  { minutos: 1440, rotulo: '1 dia antes' },
]

// Chip genérico (usado tanto pro canal quanto pro "quando"). Ativo = cor primária.
function Chip({
  rotulo,
  ativo,
  onPress,
}: {
  rotulo: string
  ativo: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'h-8 px-3 items-center justify-center rounded-full border active:opacity-80',
        ativo ? 'bg-primary border-primary' : 'bg-transparent border-border',
      )}
    >
      <Text
        className={cn(
          'text-xs font-medium',
          ativo ? 'text-primary-foreground' : 'text-foreground',
        )}
      >
        {rotulo}
      </Text>
    </Pressable>
  )
}

export function LembretesEditor({
  value,
  onChange,
}: {
  value: LembreteItem[]
  onChange: (v: LembreteItem[]) => void
}) {
  // Atualiza um lembrete na posição `index` mesclando os campos passados.
  function atualizar(index: number, patch: Partial<LembreteItem>) {
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  // Remove o lembrete da posição `index`.
  function remover(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  // Adiciona um lembrete padrão (Notificação, 30 min antes) — respeita o limite.
  function adicionar() {
    if (value.length >= MAX_LEMBRETES) return
    onChange([...value, { canal: 'POPUP', minutosAntes: 30 }])
  }

  const noLimite = value.length >= MAX_LEMBRETES

  return (
    <View className="gap-2">
      {/* Estado vazio — orienta o usuário a adicionar o primeiro lembrete. */}
      {value.length === 0 ? (
        <Text className="text-sm text-muted-foreground">Nenhum lembrete configurado.</Text>
      ) : null}

      {/* Lista de lembretes — um cartão por item. */}
      {value.map((item, index) => (
        <Card key={index}>
          <CardContent className="p-3 pt-3 gap-3">
            {/* Cabeçalho do item: índice + botão remover. */}
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-semibold text-foreground">
                Lembrete {index + 1}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover lembrete ${index + 1}`}
                onPress={() => remover(index)}
                className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
              >
                <Text className="text-base text-muted-foreground">×</Text>
              </Pressable>
            </View>

            {/* Seletor de canal. */}
            <View className="gap-1.5">
              <Label>Canal</Label>
              <View className="flex-row flex-wrap gap-2">
                {CANAIS.map((canal) => (
                  <Chip
                    key={canal.valor}
                    rotulo={canal.rotulo}
                    ativo={item.canal === canal.valor}
                    onPress={() => atualizar(index, { canal: canal.valor })}
                  />
                ))}
              </View>
            </View>

            {/* Seletor de "quando" (presets em chips). */}
            <View className="gap-1.5">
              <Label>Quando</Label>
              <View className="flex-row flex-wrap gap-2">
                {PRESETS_QUANDO.map((preset) => (
                  <Chip
                    key={preset.minutos}
                    rotulo={preset.rotulo}
                    ativo={item.minutosAntes === preset.minutos}
                    onPress={() => atualizar(index, { minutosAntes: preset.minutos })}
                  />
                ))}
              </View>
            </View>
          </CardContent>
        </Card>
      ))}

      {/* Adicionar — desabilita ao atingir o limite. */}
      <Button
        variant="outline"
        size="sm"
        onPress={adicionar}
        disabled={noLimite}
        className="mt-1"
      >
        {noLimite ? `Limite de ${MAX_LEMBRETES} lembretes` : '+ Adicionar lembrete'}
      </Button>
    </View>
  )
}
