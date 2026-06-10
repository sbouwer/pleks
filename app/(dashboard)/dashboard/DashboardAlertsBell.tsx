"use client"

/**
 * app/(dashboard)/dashboard/DashboardAlertsBell.tsx — categorised dashboard alerts bell (header)
 *
 * Notes:  Dashboard-only alerts centre behind one header WarningBell, grouped into three categories:
 *           • System     — account/config gaps (deposit/trust setup)
 *           • Plan        — subscription limits (near/at/over the tier's lease cap → upgrade)
 *           • Operations  — surrendered mandatory comms awaiting manual dispatch
 *         Other pages' bells stay page-specific; this categorisation is dashboard-only. Renders nothing
 *         when there are no alerts.
 */
import { useState, type ReactNode } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { AlertTriangle, Mail } from "lucide-react"
import { WarningBell } from "@/components/ui/WarningBell"
import { Modal } from "@/components/ui/actions"
import { TIER_LIMITS, type Tier } from "@/lib/constants"
import { sendEmailVerification } from "@/lib/actions/emailVerification"
import { SurrenderedCommsWidget, type SurrenderedCommRow } from "./SurrenderedCommsWidget"

const UPGRADE_CTA: Partial<Record<Tier, string>> = {
  owner: "See Steward", steward: "See Growth", growth: "See Portfolio", portfolio: "See Firm", firm: "Talk to the founder",
}

function Section({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

export function DashboardAlertsBell({
  surrendered, showDepositSetup, tier, leaseCount, emailVerify,
}: Readonly<{
  surrendered: SurrenderedCommRow[]; showDepositSetup: boolean; tier: Tier; leaseCount: number
  emailVerify: { pending: boolean; overdue: boolean }
}>) {
  const [open, setOpen] = useState(false)
  const [sendingVerify, setSendingVerify] = useState(false)

  const cap = TIER_LIMITS[tier]?.leases ?? null
  // Surface from ~90% of the cap up (Steward 13/15, Growth 27/30, …) and while at/over it.
  const nearLimit = cap != null && leaseCount > 0 && leaseCount >= cap - Math.ceil(cap * 0.1)
  const atLimit = cap != null && leaseCount >= cap

  const groupKeys = new Set(surrendered.map((s) => `${s.template_key}|${s.recipient_email ?? s.recipient_name ?? "—"}`))
  const count = (showDepositSetup ? 1 : 0) + (emailVerify.pending ? 1 : 0) + (nearLimit ? 1 : 0) + groupKeys.size
  if (count === 0) return null

  async function handleSendVerify() {
    setSendingVerify(true)
    const res = await sendEmailVerification()
    setSendingVerify(false)
    if ("error" in res) toast.error(res.error)
    else toast.success("Verification link sent — check your inbox.")
  }

  return (
    <>
      <WarningBell count={count} label={`${count} item${count === 1 ? "" : "s"} need attention`} onClick={() => setOpen(true)} />
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Needs your attention">
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {(showDepositSetup || emailVerify.pending) && (
              <Section label="System">
                {emailVerify.pending && (
                  <div className={`flex items-start gap-2.5 rounded-[var(--r-button)] border p-3 ${emailVerify.overdue ? "border-red-500/40 bg-red-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
                    <Mail className={`mt-0.5 h-4 w-4 shrink-0 ${emailVerify.overdue ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground">{emailVerify.overdue ? "Email still unverified" : "Verify your email"}</p>
                      <p className="text-xs text-muted-foreground">
                        {emailVerify.overdue
                          ? "Please confirm your email so we can reach you about your account."
                          : "Confirm your email address — tap to send the link."}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={sendingVerify}
                      onClick={handleSendVerify}
                      className="shrink-0 rounded-[var(--r-button)] bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-primary disabled:opacity-50"
                    >
                      {sendingVerify ? "Sending…" : "Send link"}
                    </button>
                  </div>
                )}
                {showDepositSetup && (
                  <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-amber-500/40 bg-amber-500/10 p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground">Deposit management restricted</p>
                      <p className="text-xs text-muted-foreground">Add your trust account to unlock deposit &amp; trust management.</p>
                    </div>
                    <Link
                      href="/settings/compliance"
                      onClick={() => setOpen(false)}
                      className="shrink-0 rounded-[var(--r-button)] bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-primary"
                    >
                      Set up →
                    </Link>
                  </div>
                )}
              </Section>
            )}

            {nearLimit && (
              <Section label="Plan">
                <div className="flex items-start gap-2.5 rounded-[var(--r-button)] border border-primary/35 bg-primary/10 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">{atLimit ? "Lease limit reached" : "Approaching your lease limit"}</p>
                    <p className="text-xs text-muted-foreground">{leaseCount} of {cap} leases on your current plan.</p>
                  </div>
                  <Link
                    href="/settings/subscription"
                    onClick={() => setOpen(false)}
                    className="shrink-0 rounded-[var(--r-button)] bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-primary"
                  >
                    {UPGRADE_CTA[tier] ?? "Upgrade"} →
                  </Link>
                </div>
              </Section>
            )}

            {surrendered.length > 0 && (
              <Section label="Operations">
                <SurrenderedCommsWidget items={surrendered} />
              </Section>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
