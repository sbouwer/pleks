"use client"

import { useEffect, useImperativeHandle, forwardRef } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Placeholder from "@tiptap/extension-placeholder"
import { cn } from "@/lib/utils"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Heading3,
} from "lucide-react"

export interface RichTextEditorHandle {
  insertText: (text: string) => void
}

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  className?: string
  minHeight?: string
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ value, onChange, placeholder, className, minHeight = "200px" }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit,
        Underline,
        Placeholder.configure({
          placeholder: placeholder ?? "Start typing…",
        }),
      ],
      content: value,
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm leading-relaxed",
            "[&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h2]:my-2 [&>h3]:my-2"
          ),
        },
      },
      onUpdate({ editor: ed }) {
        onChange(ed.getHTML())
      },
    })

    // Sync external value changes (e.g. template load)
    useEffect(() => {
      if (!editor) return
      const current = editor.getHTML()
      if (current !== value) {
        editor.commands.setContent(value || "")
      }
    // Only run when value changes externally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    // Expose insertText to parent via ref
    useImperativeHandle(ref, () => ({
      insertText(text: string) {
        if (!editor) return
        editor.commands.focus()
        editor.commands.insertContent(text)
      },
    }))

    return (
      <div className={cn("flex flex-col rounded-md border border-border overflow-hidden", className)}>
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 flex-wrap">
          <ToolbarButton
            active={editor?.isActive("bold") ?? false}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("italic") ?? false}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("underline") ?? false}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            active={editor?.isActive("heading", { level: 2 }) ?? false}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("heading", { level: 3 }) ?? false}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-border mx-1" />
          <ToolbarButton
            active={editor?.isActive("bulletList") ?? false}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            active={editor?.isActive("orderedList") ?? false}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {/* Editor area */}
        <EditorContent
          editor={editor}
          style={{ minHeight }}
          className="flex-1 overflow-auto bg-background"
        />
      </div>
    )
  }
)

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: Readonly<{
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors",
        active
          ? "bg-brand/15 text-brand"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}
