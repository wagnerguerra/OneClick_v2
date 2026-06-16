// Editor de texto RICO (HTML) para a descrição do evento — espelha o RichEditor
// da agenda do sistema web. Usa react-native-pell-rich-editor (WebView editável)
// + uma toolbar com as formatações essenciais. O valor é HTML puro (string).
//
// Uso (controlado por valor inicial): o conteúdo inicial é aplicado uma vez ao
// montar (via editorInitializedCallback). Em modo edição, monte o editor só
// depois que o evento carregar (passe `initialValue` já preenchido).

import { useRef } from 'react'
import { View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor'

import { cardFor, foregroundFor, mutedForegroundFor, primaryFor } from '@/lib/theme-colors'

export function HtmlEditor({
  initialValue,
  onChange,
  placeholder = 'Detalhes do evento…',
}: {
  initialValue: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const isDark = useColorScheme().colorScheme === 'dark'
  const richRef = useRef<RichEditor>(null)

  const cardBg = cardFor(isDark)
  const fg = foregroundFor(isDark)
  const muted = mutedForegroundFor(isDark)
  const primary = primaryFor(isDark)
  const borda = isDark ? '#22304a' : '#e2e8f0'

  return (
    <View style={{ borderWidth: 1, borderColor: borda, borderRadius: 8, overflow: 'hidden' }}>
      <RichToolbar
        editor={richRef}
        actions={[
          actions.setBold,
          actions.setItalic,
          actions.setUnderline,
          actions.insertBulletsList,
          actions.insertOrderedList,
          actions.insertLink,
          actions.undo,
          actions.redo,
        ]}
        iconTint={muted}
        selectedIconTint={primary}
        style={{ backgroundColor: cardBg, borderBottomWidth: 1, borderBottomColor: borda }}
      />
      <RichEditor
        ref={richRef}
        initialContentHTML={initialValue}
        onChange={onChange}
        placeholder={placeholder}
        initialHeight={140}
        useContainer
        editorStyle={{
          backgroundColor: cardBg,
          color: fg,
          placeholderColor: muted,
          contentCSSText:
            'font-size: 14px; line-height: 1.5; padding: 8px 10px; min-height: 120px;',
        }}
        editorInitializedCallback={() => {
          if (initialValue) richRef.current?.setContentHTML(initialValue)
        }}
      />
    </View>
  )
}
