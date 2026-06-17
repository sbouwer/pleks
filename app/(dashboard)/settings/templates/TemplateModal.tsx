"use client"

/**
 * app/(dashboard)/settings/templates/TemplateModal.tsx — create / edit an org document template
 *
 * Auth:   server actions create/updateDocumentTemplate (agent write gate + documents capability)
 * Notes:  Canonical Modal + form fields (not the old shadcn Dialog). Only ORG templates are editable —
 *         system templates are view-only (the manager opens this for New or for editing a custom one).
 *         Letter/email kinds only (the actions persist body_html/subject); WhatsApp is Meta-managed.
 */
import { useState, useTransition, useRef } from "react"
import { toast } from "sonner"
import { Modal, ActionButton } from "@/components/ui/actions"
import { TextField, Field, SelectField } from "@/components/forms/fields"
import { createDocumentTemplate, updateDocumentTemplate } from "@/lib/actions/templates"
import { MERGE_FIELDS, type DocumentTemplate } from "./types"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onClose: () => void
  editing: DocumentTemplate | null
  existingCategories: string[]
  onSaved: () => void
}

const TYPE_OPTIONS = [
  { value: "letter", label: "Letter" },
  { value: "email", label: "Email" },
]

export function TemplateModal({ open, onClose, editing, existingCategories, onSaved }: Readonly<Props>) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(editing?.name ?? "")
  const [category, setCategory] = useState(editing?.category ?? "")
  const [type, setType] = useState<string>(editing?.template_type ?? "letter")
  const [subject, setSubject] = useState(editing?.subject ?? "")
  const [body, setBody] = useState(editing?.body_html ?? "")
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const isEmail = type === "email"
  let saveLabel = "Create template"
  if (editing) saveLabel = "Save changes"
  if (pending) saveLabel = "Saving…"

  function insertToken(token: string) {
    const el = bodyRef.current
    const pos = el?.selectionStart ?? body.length
    setBody(body.slice(0, pos) + token + body.slice(pos))
  }

  function handleSave() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set("name", name.trim())
      fd.set("category", category.trim())
      fd.set("body_html", body)
      fd.set("template_type", type)
      if (isEmail) fd.set("subject", subject)
      const result = editing ? await updateDocumentTemplate(editing.id, fd) : await createDocumentTemplate(fd)
      if (result?.error) { toast.error(result.error); return }
      toast.success(editing ? "Template updated" : "Template created")
      onSaved()
      onClose()
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit template" : "New template"}
      actions={
        <div className="flex w-full items-center justify-between gap-3">
          <ActionButton type="button" tone="secondary" onClick={onClose} disabled={pending}>Cancel</ActionButton>
          <ActionButton type="button" tone="primary" onClick={handleSave} disabled={pending || !name.trim() || !category.trim()}>
            {saveLabel}
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-4">
        <TextField label="Name" value={name} onChange={setName} required placeholder="e.g. Rent arrears reminder" span />
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <Field label="Category" required>
            <input
              className="h-9 w-full rounded-[var(--r-button)] border border-input bg-transparent px-3 text-sm transition-colors focus:border-primary focus:outline-none"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. notices, correspondence"
              list="tpl-category-suggestions"
            />
            <datalist id="tpl-category-suggestions">
              {existingCategories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          {!editing && <SelectField label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />}
        </div>
        {isEmail && <TextField label="Subject" value={subject} onChange={setSubject} placeholder="e.g. Rent arrears notice — {{property.name}}" span />}
        <Field label="Body" span>
          <textarea
            ref={bodyRef}
            className="w-full resize-none rounded-[var(--r-button)] border border-input bg-transparent px-3 py-2 font-mono text-sm transition-colors focus:border-primary focus:outline-none"
            rows={8}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="<p>Dear {{tenant.full_name}},</p>"
          />
        </Field>
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">Insert merge field</p>
          <div className="flex flex-wrap gap-1.5">
            {MERGE_FIELDS.map((f) => (
              <button
                key={f.token}
                type="button"
                onClick={() => insertToken(f.token)}
                className={cn(
                  "rounded-[var(--r-button)] border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors",
                  "hover:border-primary/40 hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
