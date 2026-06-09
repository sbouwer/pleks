"use client"

/**
 * components/dev/DevTierToggle.tsx — DEV-ONLY tools in the header (REMOVE BEFORE LAUNCH)
 *
 * Auth:   renders only for DEV_TIER_EMAIL (client gate); devSetTier/devSetRole re-check the email server-side.
 * Notes:  Temporary testing aid — an icon that opens a modal to (1) swap the org's subscription tier and
 *         (2) swap your own role, to exercise tier- + role/capability-gated behaviour. To remove: delete
 *         lib/dev/, this file, and the <DevTierToggle/> line in TopBar.
 */
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { FlaskConical } from "lucide-react"
import { Modal, ActionButton } from "@/components/ui/actions"
import { createClient } from "@/lib/supabase/client"
import { useUser } from "@/hooks/useUser"
import { useTier } from "@/hooks/useTier"
import { useOrg } from "@/hooks/useOrg"
import { devSetTier } from "@/lib/dev/devTier"
import { devSetRole } from "@/lib/dev/devRole"
import { devSetSubStatus, type DevSubStatus } from "@/lib/dev/devSubStatus"
import { DEV_TIER_EMAIL } from "@/lib/dev/devTierConfig"
import { type Tier } from "@/lib/constants"
import { BUILTIN_ROLES, ROLE_GROUP_ORDER } from "@/lib/auth/capabilities"

const TIERS: { slug: Tier; label: string }[] = [
  { slug: "owner", label: "Owner (free)" },
  { slug: "steward", label: "Steward" },
  { slug: "growth", label: "Growth" },
  { slug: "portfolio", label: "Portfolio" },
  { slug: "firm", label: "Firm" },
  { slug: "bespoke", label: "Bespoke" },
]

const ROLE_GROUPS = ROLE_GROUP_ORDER
  .map((g) => ({ group: g, roles: BUILTIN_ROLES.filter((r) => r.group === g) }))
  .filter((g) => g.roles.length > 0)

const SELECT_CLS = "w-full rounded-[var(--r-button)] border border-border bg-card px-3 py-2 text-sm"
const LABEL_CLS = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

export function DevTierToggle() {
  const { user } = useUser()
  const { tier, status } = useTier()
  const { orgId } = useOrg()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState("")

  const isDev = (user?.email ?? "").toLowerCase() === DEV_TIER_EMAIL

  // Reflect the caller's current role in the select.
  useEffect(() => {
    if (!isDev || !orgId || !user?.id) return
    const supa = createClient()
    supa.from("user_orgs").select("role").eq("user_id", user.id).eq("org_id", orgId).is("deleted_at", null).maybeSingle()
      .then(({ data }) => { if (data?.role) setRole(data.role as string) })
  }, [isDev, orgId, user?.id])

  if (!isDev) return null

  async function applyTier(next: string) {
    setBusy(true)
    const res = await devSetTier(next as Tier)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success(`Tier → ${next}`)
    globalThis.location.reload()
  }

  async function applyRole(next: string) {
    setBusy(true)
    const res = await devSetRole(next)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success(`Role → ${next}`)
    globalThis.location.reload()
  }

  async function applySubStatus(next: string) {
    setBusy(true)
    const res = await devSetSubStatus(next as DevSubStatus)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success(`Subscription → ${next}`)
    globalThis.location.reload()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
        title="Dev tools: switch tier / role"
      >
        <FlaskConical size={12} />
        <span className="uppercase tracking-wide">{tier}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Dev tools"
        icon={<FlaskConical className="size-5" />}
        actions={<ActionButton onClick={() => setOpen(false)}>Close</ActionButton>}
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted-foreground">
            Writes your org&apos;s tier / your role and reloads, so the app behaves as that tier + role.
            Dev-only; remove before launch.
          </p>

          <div>
            <label htmlFor="dev-tier" className={LABEL_CLS}>Tier</label>
            <select id="dev-tier" value={tier} disabled={busy} className={SELECT_CLS}
              onChange={(e) => applyTier(e.target.value)}>
              {TIERS.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="dev-role" className={LABEL_CLS}>Your role</label>
            <select id="dev-role" value={role} disabled={busy} className={SELECT_CLS}
              onChange={(e) => applyRole(e.target.value)}>
              <option value="owner">Owner (full access)</option>
              {ROLE_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.roles.map((r) => <option key={r.slug} value={r.slug}>{r.label}</option>)}
                </optgroup>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Non-owner roles drop your is_admin so capability gating reflects the role.
            </p>
          </div>

          <div>
            <label htmlFor="dev-substatus" className={LABEL_CLS}>Subscription state</label>
            <select id="dev-substatus" value={status ?? "active"} disabled={busy} className={SELECT_CLS}
              onChange={(e) => applySubStatus(e.target.value)}>
              <option value="active">Active (normal)</option>
              <option value="past_due">Past due (arrears — advisory)</option>
              <option value="paused">Paused (writes locked)</option>
              <option value="cancelled">Cancelled (closing)</option>
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Paused / cancelled block new writes (requireAgentWriteAccess) — reads &amp; exports stay open.
            </p>
          </div>
        </div>
      </Modal>
    </>
  )
}
