/**
 * lib/cron/settleSends.ts — make cron email sends fail loud, not silent (ADDENDUM_CRON_RELIABILITY C-1 belt)
 *
 * Notes: serverless freezes the instance once the response is sent, so a `void sendX()` floating promise may
 *        never complete AND a Resend failure is swallowed. trackSend collects each send (catch+log+mark so one
 *        failure can't abort the rest); settleSends awaits them all (allSettled) and returns { sent, failed } so
 *        a non-zero failure is visible to the cron-health surface. The retry net (the "buckle") is the follow-up.
 */

/** Collect a best-effort send: catches + logs its own failure and marks it, so the batch can't be aborted. */
export function trackSend(sends: Promise<unknown>[], label: string, send: Promise<unknown>): void {
  sends.push(
    send.catch((e) => {
      console.error(`[cron] ${label} send failed:`, e instanceof Error ? e.message : String(e))
      return { __failed: true }
    }),
  )
}

/** Await all collected sends (allSettled — one failure doesn't drop the rest) and report the outcome. */
export async function settleSends(sends: Promise<unknown>[]): Promise<{ sent: number; failed: number }> {
  const settled = await Promise.allSettled(sends)
  const failed = settled.filter(
    (r) => r.status === "rejected" || (r.value as { __failed?: boolean } | null)?.__failed === true,
  ).length
  return { sent: sends.length - failed, failed }
}
