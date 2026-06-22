/**
 * app/(dashboard)/listings/[slug]/applications/[id]/_components/FreeAssessmentCard.tsx
 * Agent-facing Step-1 free assessment card — wraps the shared administrative readiness checklist (agent audience,
 * so it includes the ID-validity/fraud line). Declared/unverified; the Step-2 verified ruling is separate.
 *
 * Auth:   rendered inside the agent application detail page (gatewaySSR-gated).
 * Data:   applications.free_assessment (jsonb) — computed at submit by lib/applications/freeAssessment.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Step1Checklist } from "@/components/applications/Step1Checklist"
import type { FreeAssessmentResult } from "@/lib/applications/freeAssessment"

export function FreeAssessmentCard({ assessment, rentCents }: Readonly<{ assessment: FreeAssessmentResult | null; rentCents: number }>) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Free assessment (Step 1)</CardTitle></CardHeader>
      <CardContent>
        {assessment?.rollup
          ? <Step1Checklist assessment={assessment} rentCents={rentCents} audience="agent" />
          : <p className="text-sm text-muted-foreground">No Step-1 checklist for this application (it predates the checklist) — see the verified ruling if present.</p>}
      </CardContent>
    </Card>
  )
}
