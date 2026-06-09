"use client"

/**
 * components/dev/DevTierToggle.tsx — DEV-ONLY tier switcher in the header (REMOVE BEFORE LAUNCH)
 *
 * Auth:   renders only for DEV_TIER_EMAIL (client gate); devSetTier re-checks the email server-side.
 * Notes:  Temporary testing aid — swap the org's subscription tier to exercise tier-gated features
 *         (e.g. the role library ramp). To remove: delete lib/dev/, this file, and the <DevTierToggle/>
 *         line in TopBar.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FlaskConical } from "lucide-react"
import { Modal, ActionButton } from "@/components/ui/actions"
import { useUser } from "@/hooks/useUser"
import { useTier } from "@/hooks/useTier"
import { devSetTier } from "@/lib/dev/devTier"
import { DEV_TIER_EMAIL } from "@/lib/dev/devTierConfig"

const TIERS: { slug: "owner" | "steward" | "growth" | "portfolio" | "firm" | "bespoke"; label: string }[] = [
  { slug: "owner", label: "Owner (free)" },
  { slug: "steward", label: "Steward" },
  { slug: "growth", label: "Growth" },
  { slug: "portfolio", label: "Portfolio" },
  { slug: "firm", label: "Firm" },
  { slug: "bespoke", label: "Bespoke" },
]

export function DevTierToggle() {
  const { user } = useUser()
  const { tier } = useTier()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if ((user?.email ?? "").toLowerCase() !== DEV_TIER_EMAIL) return null

  async function pick(next: typeof TIERS[number]["slug"]) {
    setBusy(true)
    const res = await devSetTier(next)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success(`Tier → ${next}`)
    setOpen(false)
    router.refresh()
    // Full reload so the cookie fast-path + all tier reads pick up the change.
    globalThis.location.reload()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-button)] border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
        title="Dev: switch subscription tier"
      >
        <FlaskConical size={12} />
        <span className="uppercase tracking-wide">{tier}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Switch tier (dev)"
        icon={<FlaskConical className="size-5" />}
        actions={<ActionButton onClick={() => setOpen(false)}>Close</ActionButton>}
      >
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-muted-foreground">
            Writes your org&apos;s subscription tier and reloads. Dev-only; remove before launch.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TIERS.map((t) => (
              <button
                key={t.slug}
                type="button"
                disabled={busy}
                onClick={() => pick(t.slug)}
                className={`rounded-[var(--r-button)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                  tier === t.slug
                    ? "border-primary bg-primary/10 font-semibold text-foreground"
                    : "border-border text-foreground hover:bg-muted/40"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  )
}
