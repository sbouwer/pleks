"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"

interface ClauseEditorProps {
  clauseKey: string
  title: string
  bodyTemplate: string
  customBody: string | null
  isRequired: boolean
  onSave: (clauseKey: string, customBody: string) => Promise<void>
  onReset: (clauseKey: string) => Promise<void>
  onCancel: () => void
}

const TOKEN_REGEX = /(\{\{(?:ref|self|var):[\w.]+\}\})/g

function tokenToHtml(body: string): string {
  return body.replace(TOKEN_REGEX, (match) => {
    let label = match
    let className = "token-var"
    if (match.startsWith("{{ref:")) {
      label = `clause [${match.slice(6, -2)}]`
      className = "token-ref"
    } else if (match.startsWith("{{self:")) {
      label = `[${match.slice(7, -2)}]`
      className = "token-self"
    } else if (match.startsWith("{{var:")) {
      label = `{${match.slice(6, -2)}}`
      className = "token-var"
    }
    return `<span class="${className}" data-token="${match}" contenteditable="false" title="${
      className === "token-ref" ? "Auto-numbered clause reference"
        : className === "token-self" ? "Sub-clause number"
        : "Filled from lease data"
    }">${label}</span>`
  })
}

function htmlToTokens(html: string): string {
  // Replace token spans with their data-token value
  let text = html.replace(
    /<span[^>]*data-token="([^"]*)"[^>]*>[^<]*<\/span>/g,
    (_, token: string) => token
  )
  // Strip remaining HTML tags
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/p>/gi, "\n")
  text = text.replace(/<\/div>/gi, "\n")
  text = text.replace(/<[^>]+>/g, "")
  // Decode HTML entities
  text = text.replace(/&amp;/g, "&")
  text = text.replace(/&lt;/g, "<")
  text = text.replace(/&gt;/g, ">")
  text = text.replace(/&quot;/g, '"')
  text = text.replace(/&#39;/g, "'")
  text = text.replace(/&nbsp;/g, " ")
  // Clean up excess newlines
  text = text.replace(/\n{3,}/g, "\n\n")
  return text.trim()
}

function getRequiredTokens(body: string): string[] {
  const matches = body.match(TOKEN_REGEX)
  return matches ? [...new Set(matches.filter((m) => m.startsWith("{{ref:") || m.startsWith("{{self:")))] : []
}

export function ClauseEditor({
  clauseKey,
  title,
  bodyTemplate,
  customBody,
  isRequired,
  onSave,
  onReset,
  onCancel,
}: Readonly<ClauseEditorProps>) {
  const [showEditor, setShowEditor] = useState(!isRequired)
  const [saving, setSaving] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)

  const currentBody = customBody ?? bodyTemplate
  const htmlContent = tokenToHtml(currentBody)
  const requiredTokens = getRequiredTokens(bodyTemplate)

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    const reconstructed = htmlToTokens(editorRef.current.innerHTML)

    // Validate required tokens are present
    const missing = requiredTokens.filter((t) => !reconstructed.includes(t))
    if (missing.length > 0) {
      toast.error("Required reference tokens are missing. Reset to standard and try again.")
      return
    }

    // Skip save if unchanged
    if (reconstructed === bodyTemplate) {
      toast.info("No changes — clause matches the standard wording")
      onCancel()
      return
    }

    setSaving(true)
    await onSave(clauseKey, reconstructed)
    setSaving(false)
    toast.success(`"${title}" wording saved`)
  }, [clauseKey, title, bodyTemplate, requiredTokens, onSave, onCancel])

  const handleReset = useCallback(async () => {
    setSaving(true)
    await onReset(clauseKey)
    setSaving(false)
    toast.success(`"${title}" reset to standard wording`)
  }, [clauseKey, title, onReset])

  return (
    <div className="mt-3 border border-border/50 rounded-lg p-4 bg-surface/50">
      {isRequired && !showEditor && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 p-3">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-200 leading-relaxed">
              This is a required clause and cannot be removed. Editing the wording
              of required clauses affects your legal position. We recommend consulting
              a property attorney before making changes.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEditor(true)}
          >
            I understand, edit anyway
          </Button>
        </div>
      )}

      {showEditor && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">Edit clause wording</p>
            <p className="text-xs text-muted-foreground">
              Edit the prose around the highlighted tokens. Highlighted tokens cannot
              be removed — they keep the numbering and data correct.
            </p>
          </div>

          {/* Token legend */}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="token-ref-preview inline-block px-1.5 py-0.5 rounded border border-brand/40 bg-brand/10 text-brand text-[10px]">clause [key]</span>
              Clause reference
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="token-self-preview inline-block px-1.5 py-0.5 rounded border border-blue-400/40 bg-blue-400/10 text-blue-400 text-[10px]">[N]</span>
              Sub-clause
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="token-var-preview inline-block px-1.5 py-0.5 rounded border border-green-400/40 bg-green-400/10 text-green-400 text-[10px]">{"{field}"}</span>
              Lease data
            </span>
          </div>

          {/* Editable area */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-md border border-border/50
                       bg-background p-3 text-sm font-mono leading-relaxed focus:outline-none
                       focus:ring-1 focus:ring-brand/40
                       [&_.token-ref]:inline-block [&_.token-ref]:px-1.5 [&_.token-ref]:py-0.5
                       [&_.token-ref]:rounded [&_.token-ref]:border [&_.token-ref]:border-brand/40
                       [&_.token-ref]:bg-brand/10 [&_.token-ref]:text-brand [&_.token-ref]:text-xs
                       [&_.token-ref]:select-none [&_.token-ref]:cursor-default [&_.token-ref]:mx-0.5
                       [&_.token-self]:inline-block [&_.token-self]:px-1.5 [&_.token-self]:py-0.5
                       [&_.token-self]:rounded [&_.token-self]:border [&_.token-self]:border-blue-400/40
                       [&_.token-self]:bg-blue-400/10 [&_.token-self]:text-blue-400 [&_.token-self]:text-xs
                       [&_.token-self]:select-none [&_.token-self]:cursor-default [&_.token-self]:mx-0.5
                       [&_.token-var]:inline-block [&_.token-var]:px-1.5 [&_.token-var]:py-0.5
                       [&_.token-var]:rounded [&_.token-var]:border [&_.token-var]:border-green-400/40
                       [&_.token-var]:bg-green-400/10 [&_.token-var]:text-green-400 [&_.token-var]:text-xs
                       [&_.token-var]:select-none [&_.token-var]:cursor-default [&_.token-var]:mx-0.5"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
            {customBody && (
              <Button size="sm" variant="outline" onClick={handleReset} disabled={saving}>
                Reset to standard
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
