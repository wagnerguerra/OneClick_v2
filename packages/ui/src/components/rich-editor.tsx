'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import {
  Bold, Italic, Underline as UnderlineIcon,
  List, ListOrdered, Quote, Link as LinkIcon, RemoveFormatting, ImageIcon,
} from 'lucide-react'
import { cn } from '../lib/utils'

interface RichEditorProps {
  value?: string
  onChange?: (html: string) => void
  placeholder?: string
  className?: string
}

export function RichEditor({ value, onChange, placeholder, className }: RichEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-primary underline' },
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: { class: 'max-w-full rounded', style: 'max-height: 400px;' },
      }),
    ],
    content: value ?? '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none px-3 py-2 min-h-[250px] focus:outline-none text-sm',
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

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
          ? (window as Record<string, unknown>).__NEXT_PUBLIC_API_URL as string || 'http://localhost:4000'
          : 'http://localhost:4000'
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const { url } = await res.json()
          editor?.chain().focus().setImage({ src: url }).run()
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
    <div className={cn('rounded-[2px] border border-input bg-card transition-colors duration-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 border-b border-border/40 px-1.5 py-1">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Negrito"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Itálico"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Sublinhado"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border/60" />

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

        <div className="mx-1 h-4 w-px bg-border/60" />

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
      </div>

      {/* Editor content */}
      <EditorContent editor={editor} />

      {/* Placeholder visual quando vazio */}
      {editor.isEmpty && placeholder && (
        <div className="pointer-events-none absolute px-3 py-2 text-sm text-muted-foreground/50">
          {/* placeholder handled by CSS/Tiptap */}
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-150',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
