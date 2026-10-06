/**
 * app/(applicant)/apply/result/[token]/page.tsx — a party's view of the application's consolidated assessment (14X N6 link)
 *
 * Route:  /apply/result/[token]
 * Auth:   the signed result token (lib/screening/resultLink.ts); every open re-checks the live rows (lib/screening/resultView.ts)
 * Data:   loadResultView — score, band, the completed parties' names, N of M; one audit NOTE per open
 * Notes:  Every open is recorded, including one made by a mail scanner following the link: the trail records opens of the
 *         link, not reads by a person, and says so by being keyed on nothing but the token's subject.
 *         `invalid` and `gone` render the same page on purpose — a stranger holding a forged or stale link learns nothing
 *         about whether an application ever existed.
 */
import type { Metadata } from "next"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"
import { loadResultView } from "@/lib/screening/resultView"
import { ApplyPortalShell, Eyebrow } from "../../applyPortalChrome"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your application's assessment", robots: { index: false, follow: false } }

interface Props { params: Promise<{ token: string }> }

export default async function ResultPage({ params }: Readonly<Props>) {
  const { token } = await params
  const h = await headers()
  const service = await createServiceClient()
  const outcome = await loadResultView(service, token, new Date(), {
    ipAddress: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent"),
  })

  if (outcome.status !== "ok") {
    return (
      <ApplyPortalShell stripTitle="Assessment" stripDetail="Link no longer available" begun={true}>
        <section className="mx-auto w-full max-w-[640px] border border-[var(--rule)] bg-[var(--paper-raised)] p-6">
          <Eyebrow>Assessment</Eyebrow>
          <p className="mt-3 text-sm">This link is no longer available. If you have a question about your application, please contact the agency.</p>
        </section>
      </ApplyPortalShell>
    )
  }

  const v = outcome.view
  return (
    <ApplyPortalShell stripTitle={v.propertyLabel} stripDetail={`Assessed on ${v.completed} of ${v.total} parties`} begun={true}>
      <section className="mx-auto w-full max-w-[640px] space-y-5 border border-[var(--rule)] bg-[var(--paper-raised)] p-6">
        <div>
          <Eyebrow>Consolidated assessment</Eyebrow>
          <p className="mt-2 text-sm">Hi {v.firstName}, this is the assessment for your application for {v.propertyLabel}.</p>
        </div>
        <div className="flex items-baseline gap-4">
          {v.score !== null && <span className="font-mono text-3xl">{v.score}</span>}
          {v.bandLabel && <span className="text-base">{v.bandLabel}</span>}
        </div>
        <div>
          <Eyebrow>Assessed on {v.completed} of {v.total} parties</Eyebrow>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {v.completedNames.map((name) => <li key={name}>{name}</li>)}
          </ul>
        </div>
        <p className="border-t border-[var(--rule)] pt-4 text-sm text-[var(--ink-mute)]">{v.closingSentence}</p>
      </section>
    </ApplyPortalShell>
  )
}
