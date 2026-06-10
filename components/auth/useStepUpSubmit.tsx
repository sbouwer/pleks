"use client"

/**
 * components/auth/useStepUpSubmit.tsx — client half of a step-up-gated mutation (ADDENDUM_AUTH_HARDENING)
 *
 * Single source for the 401 → StepUpModal → retry-with-token flow. A step-up'd route returns
 * `401 { challengeToken }` when re-auth is needed; this runs the mutation, surfaces StepUpModal on that 401,
 * and retries with `stepUpToken` on success. Used by every step-up surface (bank details, team roles, passkey
 * revoke) so they can't drift. `submit(doFetch, onOk)` — `doFetch(stepUpToken?)` builds the request (spread
 * `stepUpToken` into the body when present); `onOk` runs on final success.
 */
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { StepUpModal } from "@/components/auth/StepUpModal"

export type StepUpSubmit = (doFetch: (stepUpToken?: string) => Promise<Response>, onOk: () => void) => Promise<void>

async function failMsg(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({})) as { error?: string }
  return data.error ?? "Action failed"
}

export function useStepUpSubmit(actionLabel: string): { submit: StepUpSubmit; stepUpModal: ReactNode } {
  const [pending, setPending] = useState<{ token: string; doFetch: (t: string) => Promise<Response>; onOk: () => void } | null>(null)

  const submit: StepUpSubmit = async (doFetch, onOk) => {
    let res: Response
    try { res = await doFetch() } catch { toast.error("Action failed"); return }
    if (res.status === 401) {
      const data = await res.clone().json().catch(() => ({})) as { challengeToken?: string }
      if (data.challengeToken) { setPending({ token: data.challengeToken, doFetch, onOk }); return }
    }
    if (!res.ok) { toast.error(await failMsg(res)); return }
    onOk()
  }

  async function afterStepUp() {
    if (!pending) return
    const { doFetch, onOk, token } = pending
    setPending(null)
    let res: Response
    try { res = await doFetch(token) } catch { toast.error("Action failed"); return }
    if (res.ok) onOk()
    else toast.error(await failMsg(res))
  }

  const stepUpModal = pending ? (
    <StepUpModal open actionLabel={actionLabel} challengeToken={pending.token} onSuccess={() => { void afterStepUp() }} onCancel={() => setPending(null)} />
  ) : null

  return { submit, stepUpModal }
}
