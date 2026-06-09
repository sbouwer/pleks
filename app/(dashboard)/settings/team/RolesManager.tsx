"use client"

/**
 * app/(dashboard)/settings/team/RolesManager.tsx — owner role + capability editor (ADDENDUM_RBAC Phase 2)
 *
 * Auth:   rendered only for owners (page-gated); saveOrgRole / deleteOrgRole re-check owner server-side.
 * Data:   OrgRole[] from getOrgRoles. Edits persist via the audited server actions, then router.refresh().
 * Notes:  Built-in roles can be tuned (label + capabilities) or hidden (enabled), not deleted; custom roles
 *         are fully CRUD. Capabilities are the domain-level set from lib/auth/capabilities. Enforcement of
 *         these capabilities across the app is a later phase — here we only define them.
 */
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Pencil, EyeOff, Info } from "lucide-react"
import { Modal, ActionButton, DeleteButton } from "@/components/ui/actions"
import { AddButton } from "@/components/ui/add-button"
import { TextField, SelectField } from "@/components/forms/fields"
import { CAPABILITIES, ROLE_GROUP_ORDER } from "@/lib/auth/capabilities"
import { saveOrgRole, deleteOrgRole, type OrgRole } from "@/lib/auth/orgRoles"

interface Draft {
  slug: string
  label: string
  group: string
  capabilities: string[]
  enabled: boolean
  isSystem: boolean
  isNew: boolean
}

function slugify(s: string): string {
  // collapse runs of non-alphanumerics to a single "_", then trim the (at most one) edge "_"
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_/, "").replace(/_$/, "")
}

function capSummary(caps: string[]): string {
  if (caps.length === 0) return "No access yet"
  if (caps.length === CAPABILITIES.length) return "Full access"
  const labels = caps
    .map((c) => CAPABILITIES.find((x) => x.slug === c)?.label)
    .filter(Boolean) as string[]
  const shown = labels.slice(0, 3).join(", ")
  return labels.length > 3 ? `${shown} +${labels.length - 3}` : shown
}

function RoleCard({ role, onEdit }: Readonly<{ role: OrgRole; onEdit: () => void }>) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group flex flex-col gap-2 rounded-[var(--r-button)] border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[13.5px] font-semibold text-foreground">{role.label}</span>
        <span className="flex items-center gap-1.5">
          {!role.enabled && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <EyeOff className="h-3 w-3" /> Hidden
            </span>
          )}
          {!role.isSystem && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Custom</span>
          )}
          <Pencil className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{capSummary(role.capabilities)}</p>
    </button>
  )
}

/** Header action for the Roles tab — opens the add-role dialog in RolesManager via a window event. */
export function NewRoleButton() {
  return <AddButton label="Add role" onClick={() => globalThis.dispatchEvent(new CustomEvent("pleks:new-role"))} />
}

export function RolesManager({ roles, canAddCustom }: Readonly<{ roles: OrgRole[]; canAddCustom: boolean }>) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  // Group order: known department groups first, then any custom groups present.
  const present = new Set(roles.map((r) => r.group ?? "Custom"))
  const customGroups = [...present].filter((g) => !ROLE_GROUP_ORDER.includes(g))
  const groupOrder = [...ROLE_GROUP_ORDER.filter((g) => present.has(g)), ...customGroups]

  // "Add role" lives in the page header (NewRoleButton dispatches pleks:new-role), like the other tabs.
  // Only Firm/Bespoke may add custom roles, so the listener no-ops otherwise (defence; the header button is
  // also hidden on lower tiers).
  useEffect(() => {
    if (!canAddCustom) return
    const open = () => setDraft({ slug: "", label: "", group: "Custom", capabilities: [], enabled: true, isSystem: false, isNew: true })
    globalThis.addEventListener("pleks:new-role", open)
    return () => globalThis.removeEventListener("pleks:new-role", open)
  }, [canAddCustom])

  function openEdit(r: OrgRole) {
    setDraft({ slug: r.slug, label: r.label, group: r.group ?? "Custom", capabilities: [...r.capabilities], enabled: r.enabled, isSystem: r.isSystem, isNew: false })
  }
  function toggleCap(c: string) {
    setDraft((d) => d ? { ...d, capabilities: d.capabilities.includes(c) ? d.capabilities.filter((x) => x !== c) : [...d.capabilities, c] } : d)
  }

  async function save() {
    if (!draft) return
    const slug = draft.isNew ? slugify(draft.label) : draft.slug
    if (!slug || !draft.label.trim()) { toast.error("Give the role a name"); return }
    setSaving(true)
    const res = await saveOrgRole({ slug, label: draft.label.trim(), group: draft.group, capabilities: draft.capabilities, enabled: draft.enabled, isSystem: draft.isSystem })
    setSaving(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success("Role saved")
    setDraft(null)
    router.refresh()
  }

  async function removeCustom() {
    if (!draft || draft.isSystem) return
    const res = await deleteOrgRole(draft.slug)
    if ("error" in res) { toast.error(res.error); return }
    toast.success("Role removed")
    setDraft(null)
    router.refresh()
  }

  const groupOptions = [...ROLE_GROUP_ORDER, "Custom"].map((g) => ({ value: g, label: g }))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
      <p className="text-sm text-muted-foreground">
        Define the roles in your agency and what each can access. Tune or hide the built-in roles, or add
        your own with “Add role”.
      </p>

      <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-[13px] leading-relaxed text-foreground">
          <span className="font-semibold">Capabilities are configured here, not yet enforced.</span>{" "}
          Setting what a role can access shapes the role library — it does <span className="font-semibold">not</span> restrict
          members across the app yet. Enforcement ships in a later update.
        </p>
      </div>

      {groupOrder.map((group) => {
        const inGroup = roles.filter((r) => (r.group ?? "Custom") === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group}>
            <div className="mb-2.5 flex items-center gap-2.5">
              <span aria-hidden className="h-0.5 w-4 bg-primary" />
              <span className="font-heading text-sm font-semibold text-foreground">{group}</span>
              <span className="text-xs font-medium text-muted-foreground">{inGroup.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inGroup.map((r) => <RoleCard key={r.slug} role={r} onEdit={() => openEdit(r)} />)}
            </div>
          </section>
        )
      })}

      {draft && (
        <Modal
          open
          className="pa-modal-wide"
          onClose={() => setDraft(null)}
          title={draft.isNew ? "Add role" : `Edit ${draft.label || "role"}`}
          actions={
            <div className="flex w-full items-center justify-between gap-2">
              {!draft.isSystem && !draft.isNew
                ? <DeleteButton label={`Delete ${draft.label}`} onConfirm={removeCustom} />
                : <span />}
              <div className="flex items-center gap-2">
                <ActionButton onClick={() => setDraft(null)}>Cancel</ActionButton>
                <ActionButton tone="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</ActionButton>
              </div>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <TextField label="Role name" value={draft.label} onChange={(v) => setDraft((d) => d ? { ...d, label: v } : d)} required />
            {(draft.isNew || !draft.isSystem) && (
              <SelectField label="Department" value={draft.group} onChange={(v) => setDraft((d) => d ? { ...d, group: v } : d)} options={groupOptions} />
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Can access</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {CAPABILITIES.map((cap) => {
                  const on = draft.capabilities.includes(cap.slug)
                  return (
                    <button
                      key={cap.slug}
                      type="button"
                      onClick={() => toggleCap(cap.slug)}
                      className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-border p-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-[2px] border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                        {on && <span className="text-[10px] font-bold leading-none">✓</span>}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-foreground">{cap.label}</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">{cap.desc}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => d ? { ...d, enabled: e.target.checked } : d)} />
              Available when assigning roles
            </label>
          </div>
        </Modal>
      )}
    </div>
  )
}
