'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import { ResizableImage } from './resizable-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { useEffect, useRef, useState } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Quote, Link as LinkIcon, RemoveFormatting, ImageIcon,
  Heading1, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Minus, Undo, Redo, Highlighter, Palette, Code2,
} from 'lucide-react'
import { cn } from '../lib/utils'

const TEXT_COLORS = [
  { value: 'inherit', label: 'Padrão', bg: '#94a3b8' },
  { value: '#000000', label: 'Preto',  bg: '#000000' },
  { value: '#475569', label: 'Cinza',  bg: '#475569' },
  { value: '#dc2626', label: 'Vermelho', bg: '#dc2626' },
  { value: '#ea580c', label: 'Laranja',  bg: '#ea580c' },
  { value: '#ca8a04', label: 'Amarelo',  bg: '#ca8a04' },
  { value: '#16a34a', label: 'Verde',    bg: '#16a34a' },
  { value: '#0284c7', label: 'Azul',     bg: '#0284c7' },
  { value: '#7c3aed', label: 'Roxo',     bg: '#7c3aed' },
]
const HIGHLIGHT_COLORS = [
  { value: 'unset',   label: 'Remover',  bg: '#ffffff' },
  { value: '#fef08a', label: 'Amarelo',  bg: '#fef08a' },
  { value: '#bef264', label: 'Verde',    bg: '#bef264' },
  { value: '#bae6fd', label: 'Azul',     bg: '#bae6fd' },
  { value: '#fecaca', label: 'Vermelho', bg: '#fecaca' },
  { value: '#fed7aa', label: 'Laranja',  bg: '#fed7aa' },
]

interface RichEditorProps {
  value?: string
  onChange?: (html: string) => void
  placeholder?: string
  className?: string
  /** Callback chamado quando o editor está pronto — expõe a instância pra que
   *  o pai possa executar comandos (ex: inserir tag dinâmica no cursor). */
  onReady?: (editor: Editor) => void
  /** Altura máxima da área de conteúdo antes de rolar verticalmente. Aceita
   *  número (px) ou string CSS. Default 420px — mantém o toolbar à mão quando
   *  o texto é longo. Passe `0`/undefined-equivalente via string 'none' p/ ilimitado. */
  maxHeight?: number | string
}

export function RichEditor({ value, onChange, placeholder, className, onReady, maxHeight = 420 }: RichEditorProps) {
  // Último HTML que ESTE editor emitiu via onChange. Usado pra distinguir um
  // eco do próprio onChange (não deve re-setar o conteúdo) de uma mudança
  // externa de `value` (deve sincronizar). Sem isso, o setContent de eco
  // reposiciona o cursor pro fim enquanto o usuário digita (#bug "pula p/ fim").
  const lastEmittedRef = useRef<string>(value ?? '')
  const maxH = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Heading habilitado (níveis 1-3) — útil pra títulos em e-mails.
      // Demais features (bold/italic/strike/code/blockquote/lists/HR/history) vêm
      // do StarterKit por padrão. HTMLAttributes nas listas garantem marker visível
      // mesmo sem @tailwindcss/typography (o `prose` no editor não está ativo).
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList:  { HTMLAttributes: { class: 'list-disc pl-6 my-2' } },
        orderedList: { HTMLAttributes: { class: 'list-decimal pl-6 my-2' } },
        listItem:    { HTMLAttributes: { class: 'my-0.5' } },
        // TipTap v3 inclui Link e Underline no StarterKit — desabilita
        // pra usar nossas versões customizadas abaixo (Link com openOnClick:false).
        link: false,
        underline: false,
      }),
      Underline,
      // TextStyle é dependência de Color (TipTap exige).
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      // inline:true coloca a imagem como filha de <p>, permitindo que o TextAlign
      // (configurado pra 'paragraph') centralize/alinhe a imagem via text-align
      // do parágrafo pai. Com inline:false ela vira block isolada e não responde
      // aos botões de alinhamento.
      // ResizableImage adiciona NodeView com handles de redimensionamento nos
      // cantos quando a imagem está selecionada.
      ResizableImage.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded inline-block', style: 'max-height: 400px;' },
      }),
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[250px] focus:outline-none text-sm',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      lastEmittedRef.current = html
      onChange?.(html)
    },
  })

  // Expõe a instância do editor pro pai assim que estiver pronta — útil pra
  // inserções programáticas (tags dinâmicas, snippets, etc).
  useEffect(() => {
    if (editor && onReady) onReady(editor)
  }, [editor, onReady])

  // Sincroniza o conteúdo do editor quando o pai muda `value` externamente
  // (ex.: setNovaMsg('') após enviar mensagem — #HLP0064). emitUpdate=false
  // evita disparar onChange em cascata.
  //
  // ⚠️ Detalhe TipTap: quando o usuário digita e depois envia, o pai chama
  // setNovaMsg('') → value vira '' → useEffect roda. Mas o editor mantém
  // '<p></p>' no DOM, e a comparação `current === next` ('<p></p>' vs '')
  // dava false e a limpeza acontecia. PORÉM se o re-render acontece em
  // janela em que o getHTML() ainda retorna '' (editor não-montado ou em
  // estado intermediário), o early-return evita o clear. Usamos um check
  // dedicado de "está vazio" pelo isEmpty pra cobrir os dois casos.
  useEffect(() => {
    if (!editor) return
    const next = value ?? ''
    // 🔑 Se o `value` que chegou é exatamente o que NÓS acabamos de emitir,
    // é só o eco do nosso onChange voltando pelo pai — NÃO re-setar o conteúdo
    // (senão o setContent move o cursor pro fim no meio da digitação).
    if (next === lastEmittedRef.current) return
    if (next === '') {
      // Só zera se já não está vazio — o isEmpty do TipTap considera
      // '<p></p>' como vazio, então não causa flicker.
      if (!editor.isEmpty) {
        editor.commands.clearContent(false)
      }
      lastEmittedRef.current = ''
      return
    }
    const current = editor.getHTML()
    if (current !== next) {
      // Mudança genuinamente externa (ex.: carregar template, trocar registro).
      editor.commands.setContent(next, { emitUpdate: false })
      lastEmittedRef.current = next
    }
  }, [value, editor])

  // Modo de edição de HTML cru — toggle no toolbar troca o EditorContent
  // por uma textarea com o source. Ao desligar, o HTML é re-injetado no editor.
  const [htmlMode, setHtmlMode] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')

  function toggleHtmlMode() {
    if (!editor) return
    if (!htmlMode) {
      // Entrando no modo HTML — captura snapshot atual
      setHtmlSource(editor.getHTML())
      setHtmlMode(true)
    } else {
      // Saindo — aplica HTML editado de volta no editor
      editor.commands.setContent(htmlSource, { emitUpdate: true })
      setHtmlMode(false)
    }
  }

  if (!editor) return null

  function addLink() {
    const url = window.prompt('URL do link:')
    if (url) {
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  function addImage() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Tentar upload para o servidor
      try {
        const formData = new FormData()
        formData.append('file', file)
        const apiUrl = typeof window !== 'undefined'
          ? ((window as unknown as Record<string, unknown>).__NEXT_PUBLIC_API_URL as string) || 'http://localhost:4000'
          : 'http://localhost:4000'
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const { url } = await res.json()
          // URL retornada é relativa ('/api/upload/<filename>') — precisa virar
          // absoluta apontando pro backend, senão o browser tenta carregar do
          // origin do frontend (porta 3000) e a imagem aparece quebrada.
          const absoluteUrl = url.startsWith('http') ? url : `${apiUrl}${url}`
          editor?.chain().focus().setImage({ src: absoluteUrl }).run()
          return
        }
      } catch { /* fallback para base64 */ }

      // Fallback: base64
      const reader = new FileReader()
      reader.onload = () => {
        if (reader.result) {
          editor?.chain().focus().setImage({ src: reader.result as string }).run()
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  }

  return (
    <div className={cn('rich-editor-root rounded-[2px] border border-input bg-card transition-colors duration-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary', className)}>
      {/* CSS escopado por `.rich-editor-root` — garante marker visível em listas
          mesmo sem @tailwindcss/typography (o `prose` aplicado no editor é só
          uma classe sem efeito quando o plugin não está instalado).
          Usa <style> regular (sem jsx) pra ser portável fora do Next.js. */}
      <style dangerouslySetInnerHTML={{ __html: `
        .rich-editor-root ul { list-style: disc; padding-left: 1.5rem; margin: 0.5rem 0; }
        .rich-editor-root ol { list-style: decimal; padding-left: 1.5rem; margin: 0.5rem 0; }
        .rich-editor-root li > p { margin: 0; }
        .rich-editor-root blockquote { border-left: 3px solid var(--color-border); padding-left: 0.75rem; color: var(--color-muted-foreground); margin: 0.5rem 0; }
        .rich-editor-root h1 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
        .rich-editor-root h2 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0 0.3em; }
        .rich-editor-root h3 { font-size: 1.1em; font-weight: 600; margin: 0.4em 0 0.2em; }
        .rich-editor-root hr { border: 0; border-top: 1px solid var(--color-border); margin: 0.75rem 0; }
      ` }} />
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border/40 px-1.5 py-1 flex-wrap">
        {/* Histórico (undo/redo) */}
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Desfazer (Ctrl+Z)"
        >
          <Undo className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Refazer (Ctrl+Shift+Z)"
        >
          <Redo className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Títulos (H1, H2, H3) */}
        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Título 1"
        >
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Título 2"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Título 3"
        >
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Inline formatting */}
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrito (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Itálico (Ctrl+I)"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Sublinhado (Ctrl+U)"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Riscado"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Cor de texto + Highlight (marca-texto) */}
        <ColorPicker
          icon={<Palette className="h-3.5 w-3.5" />}
          title="Cor do texto"
          colors={TEXT_COLORS}
          onPick={(c) => {
            if (c === 'inherit') editor.chain().focus().unsetColor().run()
            else editor.chain().focus().setColor(c).run()
          }}
        />
        <ColorPicker
          icon={<Highlighter className="h-3.5 w-3.5" />}
          title="Marca-texto"
          colors={HIGHLIGHT_COLORS}
          onPick={(c) => {
            if (c === 'unset') editor.chain().focus().unsetHighlight().run()
            else editor.chain().focus().toggleHighlight({ color: c }).run()
          }}
        />

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Alinhamento */}
        <ToolbarButton
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          title="Centralizar"
        >
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          title="Alinhar à direita"
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          title="Justificar"
        >
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Blocos */}
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Lista"
        >
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Lista numerada"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Citação"
        >
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="Linha divisória"
        >
          <Minus className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Links + imagens */}
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={addLink}
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={addImage}
          title="Inserir imagem"
        >
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          title="Limpar formatação"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

        {/* Toggle HTML source — útil pra ajustes finos no markup
            (estilos inline, atributos, etc). */}
        <ToolbarButton
          active={htmlMode}
          onClick={toggleHtmlMode}
          title={htmlMode ? 'Voltar ao editor visual' : 'Editar código HTML'}
        >
          <Code2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Editor content / HTML source — modo controlado por htmlMode.
          Quando ligado, a textarea mostra o HTML cru com fonte mono; o conteúdo
          é re-aplicado no editor TipTap ao desligar o modo. */}
      {htmlMode ? (
        <textarea
          value={htmlSource}
          onChange={(e) => {
            setHtmlSource(e.target.value)
            // Propaga pro pai imediatamente — mesmo no modo HTML o onChange
            // continua refletindo o conteúdo atual do template.
            onChange?.(e.target.value)
          }}
          className="w-full min-h-[250px] resize-y bg-card px-3 py-2 text-xs font-mono focus:outline-none"
          style={maxH !== 'none' ? { maxHeight: maxH } : undefined}
          spellCheck={false}
        />
      ) : (
        // Container rolável — quando o texto cresce além de `maxHeight`, o
        // conteúdo rola internamente e o toolbar continua visível/à mão.
        <div
          className="overflow-y-auto nice-scrollbar"
          style={maxH !== 'none' ? { maxHeight: maxH } : undefined}
        >
          <EditorContent editor={editor} />
        </div>
      )}

      {/* Placeholder visual quando vazio */}
      {editor.isEmpty && placeholder && (
        <div className="pointer-events-none absolute px-3 py-2 text-sm text-muted-foreground/50">
          {/* placeholder handled by CSS/Tiptap */}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ active, onClick, title, children, disabled }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Popover de cores — usado pra "Cor do texto" e "Marca-texto" no toolbar.
 *  Lista grid de swatches; clique aplica e fecha. */
function ColorPicker({ icon, title, colors, onPick }: {
  icon: React.ReactNode
  title: string
  colors: Array<{ value: string; label: string; bg: string }>
  onPick: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={title}
        className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {icon}
      </button>
      {open && (
        <>
          {/* Backdrop pra fechar ao clicar fora */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 rounded-md border border-foreground/15 bg-popover shadow-lg p-2 grid grid-cols-3 gap-1.5">
            {colors.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => { onPick(c.value); setOpen(false) }}
                title={c.label}
                className="h-6 w-6 rounded-sm border border-border/40 hover:scale-110 transition-transform"
                style={{ background: c.bg }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
