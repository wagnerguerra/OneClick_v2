// Renderiza uma string HTML (ex.: descrição de evento vinda do editor rich text
// da agenda) num WebView leve, com tipografia/cor seguindo o tema e ALTURA
// automática (o conteúdo reporta a própria altura via postMessage).
//
// Usado no detalhe do evento — antes a descrição HTML era exibida como texto cru
// (tags <h3>, <strong>, <br> aparecendo literalmente).

import { useState } from 'react'
import { View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { WebView } from 'react-native-webview'

import { foregroundFor, mutedForegroundFor, primaryFor } from '@/lib/theme-colors'

/** Monta o documento HTML com CSS de tema injetado + script de auto-altura. */
function montarDocumento(html: string, isDark: boolean): string {
  const fg = foregroundFor(isDark)
  const muted = mutedForegroundFor(isDark)
  const link = primaryFor(isDark)
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  body {
    color: ${fg};
    font-family: -apple-system, Roboto, system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  h1,h2,h3,h4 { font-size: 15px; margin: 8px 0 4px; font-weight: 700; }
  p { margin: 6px 0; }
  ul, ol { margin: 6px 0; padding-left: 20px; }
  a { color: ${link}; }
  strong, b { font-weight: 700; }
  small, .muted { color: ${muted}; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${html}
<script>
  function reportar() {
    var h = document.body.scrollHeight;
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(String(h));
  }
  window.addEventListener('load', reportar);
  setTimeout(reportar, 60);
  new ResizeObserver(reportar).observe(document.body);
</script>
</body>
</html>`
}

export function HtmlView({ html }: { html: string }) {
  const isDark = useColorScheme().colorScheme === 'dark'
  const [altura, setAltura] = useState(40)

  return (
    <View style={{ height: altura }}>
      <WebView
        originWhitelist={['*']}
        source={{ html: montarDocumento(html, isDark) }}
        style={{ backgroundColor: 'transparent', flex: 1 }}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        // O documento reporta a própria altura — ajustamos a View pra caber tudo.
        onMessage={(e) => {
          const h = Number(e.nativeEvent.data)
          if (Number.isFinite(h) && h > 0) setAltura(Math.ceil(h))
        }}
        // Abre links externos no navegador, não dentro do WebView.
        setSupportMultipleWindows={false}
      />
    </View>
  )
}
