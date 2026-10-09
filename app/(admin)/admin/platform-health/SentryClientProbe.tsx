"use client"
/**
 * app/(admin)/admin/platform-health/SentryClientProbe.tsx — throws one browser error on purpose, to prove browser Sentry
 *
 * Auth:   rendered only inside /admin/platform-health (requireAdminAuth); no data, no server call
 * Notes:  #363 moved browser Sentry to instrumentation-client.ts and #362 scrubs every event, but nothing had shown an
 *         event from a real browser on prod arriving scrubbed. The thrown message carries SYNTHETIC values of each
 *         shape the scrubber rewrites (email, 13-digit ID, SA mobile). The pass is [id-number] and [phone] in the
 *         Sentry issue — Sentry's own server-side scrubbing can also write [email], so that one cannot tell our
 *         scrubber ran (sentry-client-probe walker F1). The nonce finds the issue. The throw is UNHANDLED (setTimeout), so
 *         it also proves the global handler is wired, not only captureException. Nothing here is real PII.
 *         Browser Sentry is enabled only on the production Vercel environment, so preview and dev send nothing.
 */
import { useState } from "react"

/** The thrown message: one synthetic value per scrubbed shape, plus the nonce to search by. */
export function probeMessage(nonce: string): string {
  return `Sentry client probe ${nonce} — probe.person@example.com 8001015009087 0821234567`
}

export function SentryClientProbe() {
  const [nonce, setNonce] = useState<string | null>(null)

  function fire() {
    const n = `scp-${Date.now().toString(36)}`
    setNonce(n)
    setTimeout(() => { throw new Error(probeMessage(n)) }, 0)
  }

  return (
    <div className="rounded-[var(--r-button)] border border-border p-3 text-sm space-y-1">
      <p className="font-medium">Browser Sentry probe</p>
      <p className="text-xs text-muted-foreground">
        Throws one unhandled browser error carrying fake PII (production only — elsewhere nothing is sent). The
        pass is [id-number] and [phone] in the Sentry issue: Sentry can write [email] itself, so that one proves nothing.
      </p>
      <button type="button" onClick={fire} className="text-xs underline">Throw test error</button>
      {nonce && <p className="text-xs">Thrown — search Sentry for <code>{nonce}</code></p>}
    </div>
  )
}
