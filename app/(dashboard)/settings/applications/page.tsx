import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatZAR, APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

export default function ApplicationSettingsPage() {
  return (
    <div className="space-y-6">
      <h2 className="font-heading text-xl">Application Pipeline Settings</h2>

      {/* Stage 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stage 1 — Free Pre-Screen
            <Badge variant="secondary">Free</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Required documents:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> SA ID or valid passport</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 3 recent payslips</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> 3-month bank statement</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Employment letter</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Stage 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Stage 2 — Credit Screening
            <Badge>{formatZAR(APPLICATION_FEE_CENTS)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Single fee</p>
              <p className="font-semibold">{formatZAR(APPLICATION_FEE_CENTS)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Joint fee</p>
              <p className="font-semibold">{formatZAR(JOINT_APPLICATION_FEE_CENTS)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Non-refundable</p>
              <p className="font-semibold">Yes (once check has run)</p>
            </div>
            <div>
              <p className="text-muted-foreground">Invitation expiry</p>
              <p className="font-semibold">7 days</p>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Searchworx bundle:</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> TransUnion credit check</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> XDS credit cross-reference</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> ID verification (Home Affairs)</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> TPN rental profile</li>
              <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Adverse listings check</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            Screening fees are managed by Pleks and are not editable. This ensures
            consistent pricing and compliance across all applications.
          </p>
        </CardContent>
      </Card>

      {/* Listing defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Listing Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Default lease term</p>
              <p className="font-semibold">12 months</p>
            </div>
            <div>
              <p className="text-muted-foreground">Default deposit</p>
              <p className="font-semibold">1 month rent</p>
            </div>
            <div>
              <p className="text-muted-foreground">Min income multiple</p>
              <p className="font-semibold">3.33× (30% rule)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Decline communications */}
      <Card>
        <CardHeader>
          <CardTitle>Decline Communications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <span className="text-green-500 mt-0.5">✓</span>
            <div>
              <p className="text-sm font-medium">Standard template (recommended)</p>
              <p className="text-xs text-muted-foreground mt-1">
                Declined applicants receive a standard email with no specific reasons.
                This protects against PEPUDA (Promotion of Equality and Prevention of
                Unfair Discrimination Act) complaints. Internal reasons are logged to
                the audit trail only.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
