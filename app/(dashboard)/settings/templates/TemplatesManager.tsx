"use client"

/**
 * app/(dashboard)/settings/templates/TemplatesManager.tsx — editable Templates (correspondence + statutory)
 *
 * Route:  /settings/templates?tab=templates
 * Auth:   reads from the server page; mutations via lib/actions/templates (agent write gate)
 * Notes:  BUILD_70 Phase 1. comms_class drives behaviour: CORRESPONDENCE = editable signed letters/emails
 *         (system → "Customise" fork; org → Edit/Duplicate/Delete) with the agent's signature injected +
 *         a no-signature prompt; STATUTORY = view-only (Pleks-master; customisation + DocuSeal signing in
 *         Phase 3). No star (vestigial). Service/WhatsApp lives in the System notices tab.
 */
import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { FileText, Copy, Pencil, Lock, PenLine } from "lucide-react"
import { ActionButton, AddInline, IconButton, DeleteButton } from "@/components/ui/actions"
import { cn } from "@/lib/utils"
import { TemplatePreview } from "./TemplatePreview"
import { TemplateModal } from "./TemplateModal"
import { TONES, type DocumentTemplate, type LetterheadBranding, type ToneId, type AgentSignature } from "./types"
import { customiseSystemTemplate, duplicateTemplateToOrg, deleteDocumentTemplate } from "@/lib/actions/templates"

function humanise(cat: string): string {
  return cat.replaceAll("_", " ").replace(/\blod\b/i, "LOD").replaceAll(/(^|\s)\w/g, (c) => c.toUpperCase())
}
function kindLabel(t: DocumentTemplate["template_type"]): string {
  return t === "whatsapp" ? "WhatsApp" : t.charAt(0).toUpperCase() + t.slice(1)
}

function Segmented<T extends string>({ options, value, onChange, ariaLabel }: Readonly<{
  options: ReadonlyArray<{ id: T; label: string }>; value: T; onChange: (v: T) => void; ariaLabel: string
}>) {
  return (
    <div className="inline-flex rounded-[var(--r-button)] border border-border bg-muted/40 p-0.5" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={cn("rounded-[var(--r-button)] px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const TAG_TONE = {
  neutral: "border-border text-muted-foreground",
  amber: "border-primary/30 text-primary bg-primary/5",
  red: "border-destructive/30 text-destructive",
} as const
function Tag({ children, tone = "neutral" }: Readonly<{ children: React.ReactNode; tone?: keyof typeof TAG_TONE }>) {
  return <span className={cn("shrink-0 rounded-[var(--r-button)] border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.05em]", TAG_TONE[tone])}>{children}</span>
}

function scopeTag(t: DocumentTemplate) {
  if (t.comms_class === "statutory") return <Tag tone="amber">Statutory</Tag>
  return <Tag>{t.scope === "system" ? "System" : "Custom"}</Tag>
}

interface Props {
  templates: DocumentTemplate[]
  branding: LetterheadBranding
  agentSignature: AgentSignature
}

export function TemplatesManager({ templates, branding, agentSignature }: Readonly<Props>) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selId, setSelId] = useState<string>(() => templates.find((t) => t.comms_class === "correspondence")?.id ?? templates[0]?.id ?? "")
  const [tone, setTone] = useState<ToneId>("professional")
  const [showFields, setShowFields] = useState(true)
  const [fit, setFit] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; editing: DocumentTemplate | null }>({ open: false, editing: null })

  const groups = useMemo(() => {
    const map = new Map<string, DocumentTemplate[]>()
    for (const t of templates) {
      const arr = map.get(t.category) ?? []
      arr.push(t); map.set(t.category, arr)
    }
    return [...map.entries()].map(([cat, items]) => ({ cat, items }))
  }, [templates])

  const existingCategories = useMemo(
    () => [...new Set(templates.filter((t) => t.scope === "organisation").map((t) => t.category))], [templates])

  const sel = templates.find((t) => t.id === selId) ?? templates[0]

  function customise(id: string) {
    startTransition(async () => {
      const r = await customiseSystemTemplate(id)
      if (r?.error) { toast.error(r.error); return }
      toast.success("Customised — your editable copy is ready")
      if (r?.id) setSelId(r.id)
      router.refresh()
    })
  }
  function duplicate(id: string) {
    startTransition(async () => {
      const r = await duplicateTemplateToOrg(id)
      if (r?.error) { toast.error(r.error); return }
      toast.success("Duplicated")
      if (r?.id) setSelId(r.id)
      router.refresh()
    })
  }

  if (!sel) {
    return <div className="rounded-[var(--r-button)] border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-muted-foreground">No templates yet.</div>
  }

  const isStatutory = sel.comms_class === "statutory"
  const isSystem = sel.scope === "system"
  const editable = sel.comms_class === "correspondence" && sel.scope === "organisation"
  const variants = sel.body_variants && Object.keys(sel.body_variants).length > 0 ? sel.body_variants : null
  const fieldCount = sel.merge_fields?.length ?? 0
  const needsSignature = sel.comms_class === "correspondence" && !agentSignature.signedUrl

  let subLine = "Custom template"
  if (isStatutory) subLine = "Statutory · Pleks-managed — wording maintained for compliance"
  else if (isSystem) subLine = "System default — Customise to make it yours"

  return (
    <div className="grid h-[calc(100vh-13rem)] min-h-[440px] grid-cols-1 gap-4 lg:grid-cols-[268px_minmax(0,1fr)]">
      {/* ── Rail ── */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-button)] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Letters &amp; emails</span>
          <AddInline label="New" size="sm" onClick={() => setModal({ open: true, editing: null })} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g.cat}>
              <div className="px-2 pb-1 pt-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{humanise(g.cat)}</div>
              {g.items.map((it) => {
                const act = it.id === selId
                return (
                  <button key={it.id} type="button" onClick={() => setSelId(it.id)}
                    className={cn("relative grid w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[var(--r-button)] px-2 py-2 text-left transition-colors",
                      act ? "bg-primary/10" : "hover:bg-muted/50")}>
                    {act && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-primary" />}
                    <span className={cn("grid h-8 w-[30px] place-items-center rounded-[5px] border", act ? "border-primary/40 bg-card text-primary" : "border-border bg-muted/40 text-muted-foreground")}>
                      {it.comms_class === "statutory" ? <Lock className="size-[14px]" /> : <FileText className="size-[15px]" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-[12.5px]", act ? "font-semibold text-primary" : "font-medium text-foreground")}>{it.name}</span>
                      <span className="block truncate font-mono text-[9.5px] text-muted-foreground">{it.usage_count > 0 ? `Used ${it.usage_count}×` : kindLabel(it.template_type)}</span>
                    </span>
                    {scopeTag(it)}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Stage ── */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--r-button)] border border-border bg-card">
        {/* toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="truncate">{sel.name}</span>
              {scopeTag(sel)}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{subLine} · {kindLabel(sel.template_type)}</div>
          </div>
          {!isStatutory && isSystem && (
            <ActionButton tone="primary" size="sm" icon={<Pencil className="size-4" />} onClick={() => customise(sel.id)}>Customise</ActionButton>
          )}
          {editable && (
            <>
              <IconButton label="Duplicate" icon={<Copy className="size-4" />} onClick={() => duplicate(sel.id)} />
              {sel.is_deletable && (
                <DeleteButton itemName={sel.name} title="Delete template?" description="This removes the template for your whole organisation."
                  onConfirm={async () => {
                    const r = await deleteDocumentTemplate(sel.id)
                    if (r?.error) { toast.error(r.error); return { blocked: r.error } }
                    toast.success("Template deleted"); setSelId(templates.find((t) => t.id !== sel.id)?.id ?? ""); router.refresh()
                  }} />
              )}
              <ActionButton tone="primary" size="sm" icon={<Pencil className="size-4" />} onClick={() => setModal({ open: true, editing: sel })}>Edit</ActionButton>
            </>
          )}
        </div>

        {/* banners */}
        {isStatutory && (
          <div className="flex items-start gap-2 border-b border-border bg-primary/5 px-3.5 py-2 text-[11.5px] text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>Pleks maintains this notice&apos;s wording so it stays legally valid. Customising it (your lawyer&apos;s wording) and signing it via DocuSeal arrive in a later phase.</span>
          </div>
        )}
        {needsSignature && (
          <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-50 px-3.5 py-2 text-[11.5px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <span className="flex items-center gap-2"><PenLine className="size-3.5 shrink-0" /> This letter goes out under your signature — add one so it can be sent.</span>
            <Link href="/settings/profile?tab=signature" className="shrink-0 font-medium underline underline-offset-2">Add signature</Link>
          </div>
        )}

        {/* preview */}
        <TemplatePreview template={sel} branding={branding} tone={tone} showFields={showFields} fit={fit} agentSignature={agentSignature} />

        {/* footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3.5 py-2.5">
          {variants ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Flavour</span>
              <Segmented options={TONES} value={tone} onChange={setTone} ariaLabel="Tone flavour" />
              <span className="font-mono text-[9px] text-muted-foreground/70">preview</span>
            </div>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground"><b className="text-foreground">{fieldCount}</b> merge field{fieldCount === 1 ? "" : "s"}</span>
          )}
          <span className="flex-1" />
          <Segmented ariaLabel="Merge fields" value={showFields ? "on" : "off"} onChange={(v) => setShowFields(v === "on")}
            options={[{ id: "on", label: "Merge fields" }, { id: "off", label: "Filled in" }]} />
          <Segmented ariaLabel="Zoom" value={fit ? "fit" : "full"} onChange={(v) => setFit(v === "fit")}
            options={[{ id: "fit", label: "Fit" }, { id: "full", label: "100%" }]} />
        </div>
      </div>

      <TemplateModal open={modal.open} editing={modal.editing} existingCategories={existingCategories}
        onClose={() => setModal({ open: false, editing: null })} onSaved={() => router.refresh()} />
    </div>
  )
}
