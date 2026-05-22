'use client'

/**
 * ResizableImage — extensão TipTap baseada em Image que permite redimensionar
 * a imagem arrastando os cantos. Acrescenta o atributo `width` (number, em px)
 * ao node Image padrão e renderiza um NodeView React com 4 handles nos cantos.
 *
 * Mantém compatibilidade total com Image: src/alt/title/imgs serializados igual.
 * Só adiciona o atributo `width` ao HTML (`<img width="320" ...>`).
 */

import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useRef, useState, useCallback } from 'react'
import { cn } from '../lib/utils'

/** Limites de largura — MIN evita resize negativo / imagem inacessível;
 *  MAX evita explodir o layout do editor.  */
const MIN_WIDTH = 20
const MAX_WIDTH = 1600

function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [resizing, setResizing] = useState(false)

  const startResize = useCallback((e: React.MouseEvent, corner: 'br' | 'bl' | 'tr' | 'tl') => {
    e.preventDefault()
    e.stopPropagation()
    const img = imgRef.current
    if (!img) return
    const startX = e.clientX
    const startWidth = img.offsetWidth
    setResizing(true)

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      // Cantos esquerdos invertem o sentido do drag
      const dir = corner === 'br' || corner === 'tr' ? 1 : -1
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + dx * dir))
      updateAttributes({ width: Math.round(next) })
    }
    const onUp = () => {
      setResizing(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [updateAttributes])

  const src = node.attrs.src as string
  const alt = node.attrs.alt as string | null
  const title = node.attrs.title as string | null
  const width = node.attrs.width as number | null

  // Editor desabilitado (readOnly) → não mostra handles
  const editable = editor.isEditable

  return (
    <NodeViewWrapper
      as="span"
      className="resizable-image-wrapper relative inline-block leading-none align-middle"
      data-drag-handle
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? undefined}
        title={title ?? undefined}
        width={width ?? undefined}
        className={cn(
          'max-w-full rounded inline-block',
          selected && editable && 'ring-2 ring-primary ring-offset-1',
        )}
        style={{ maxHeight: 400, ...(width ? { width: `${width}px` } : {}) }}
      />
      {/* Handles — só renderizam quando selected + editável */}
      {selected && editable && (
        <>
          <CornerHandle pos="tl" onMouseDown={(e) => startResize(e, 'tl')} />
          <CornerHandle pos="tr" onMouseDown={(e) => startResize(e, 'tr')} />
          <CornerHandle pos="bl" onMouseDown={(e) => startResize(e, 'bl')} />
          <CornerHandle pos="br" onMouseDown={(e) => startResize(e, 'br')} />
          {resizing && width && (
            <span
              className={cn(
                'absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums',
                width === MIN_WIDTH || width === MAX_WIDTH
                  ? 'bg-rose-600 text-white'
                  : 'bg-foreground text-background',
              )}
              title={width === MIN_WIDTH ? `Mínimo (${MIN_WIDTH}px)` : width === MAX_WIDTH ? `Máximo (${MAX_WIDTH}px)` : undefined}
            >
              {width}px
              {(width === MIN_WIDTH || width === MAX_WIDTH) && ' · limite'}
            </span>
          )}
        </>
      )}
    </NodeViewWrapper>
  )
}

function CornerHandle({ pos, onMouseDown }: {
  pos: 'tl' | 'tr' | 'bl' | 'br'
  onMouseDown: (e: React.MouseEvent) => void
}) {
  const posClass =
    pos === 'tl' ? '-top-1.5 -left-1.5 cursor-nw-resize'
      : pos === 'tr' ? '-top-1.5 -right-1.5 cursor-ne-resize'
        : pos === 'bl' ? '-bottom-1.5 -left-1.5 cursor-sw-resize'
          : '-bottom-1.5 -right-1.5 cursor-se-resize'
  return (
    <span
      onMouseDown={onMouseDown}
      className={cn(
        'absolute h-3 w-3 rounded-full border-2 border-primary bg-background shadow-sm',
        posClass,
      )}
    />
  )
}

export const ResizableImage = Image.extend({
  name: 'image', // mantém o mesmo nome — substitui o Image padrão
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width')
          return w ? parseInt(w, 10) || null : null
        },
        renderHTML: (attrs) => attrs.width ? { width: attrs.width } : {},
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },
})
