// Seletor de PARTICIPANTES de um evento (usuários do tenant), espelhando o
// multi-select da agenda web: chips com avatar dos já selecionados + busca que
// revela a lista de usuários pra adicionar. Valor = array de IDs de usuário.

import { useMemo, useState } from 'react'
import { Image, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

import { Text } from '@/components/ui/text'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'

type Usuario = { id: string; name: string | null; image?: string | null }

/** Iniciais (até 2 letras) — fallback do avatar. */
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

function Avatar({ nome, image, size = 24 }: { nome: string | null; image?: string | null; size?: number }) {
  const uri = resolveAssetUrl(image)
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="bg-muted"
      />
    )
  }
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center bg-primary"
    >
      <Text className="text-[10px] font-bold text-primary-foreground">{iniciais(nome)}</Text>
    </View>
  )
}

export function ParticipantesPicker({
  value,
  onChange,
}: {
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { data: usuarios, isPending } = trpc.agenda.listUsuarios.useQuery()
  const [busca, setBusca] = useState('')

  const lista = (usuarios ?? []) as Usuario[]
  const selecionados = lista.filter((u) => value.includes(u.id))

  // Só mostra resultados quando há busca — evita lista gigante e scroll aninhado.
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (q === '') return []
    return lista
      .filter((u) => !value.includes(u.id) && (u.name ?? '').toLowerCase().includes(q))
      .slice(0, 8)
  }, [lista, value, busca])

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else onChange([...value, id])
    setBusca('')
  }

  return (
    <View className="gap-2">
      {/* Chips dos selecionados (toque pra remover). */}
      {selecionados.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {selecionados.map((u) => (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              accessibilityLabel={`Remover ${u.name}`}
              onPress={() => toggle(u.id)}
              className="flex-row items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-1 pr-2 active:opacity-80"
            >
              <Avatar nome={u.name} image={u.image} size={22} />
              <Text className="text-xs font-medium text-foreground">{u.name}</Text>
              <Ionicons name="close" size={14} color="#94a3b8" />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Busca. */}
      {isPending ? (
        <View className="h-11 justify-center">
          <Spinner size="small" />
        </View>
      ) : (
        <Input value={busca} onChangeText={setBusca} placeholder="Buscar usuário para adicionar…" />
      )}

      {/* Resultados (só com busca ativa). */}
      {filtrados.length > 0 ? (
        <View className="rounded-md border border-border overflow-hidden">
          {filtrados.map((u, i) => (
            <Pressable
              key={u.id}
              accessibilityRole="button"
              onPress={() => toggle(u.id)}
              className={`flex-row items-center gap-2 px-3 py-2 active:bg-muted ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <Avatar nome={u.name} image={u.image} size={26} />
              <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                {u.name}
              </Text>
              <Ionicons name="add" size={18} color="#94a3b8" />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
