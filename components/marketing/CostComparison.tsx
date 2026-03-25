import { Check, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const ROWS = [
  { fee: "Monthly software fee", typical: "Yes", pleks: "Yes (from R599)", pleksIncluded: true },
  { fee: "Onboarding / setup fee", typical: "Yes (up to R12k)", pleks: "None", pleksIncluded: false },
  { fee: "Credit check per applicant", typical: "Yes (R65–R310)", pleks: "Applicant pays", pleksIncluded: false },
  { fee: "Transaction fee per payment", typical: "Yes (R2–4 each)", pleks: "Included", pleksIncluded: false },
  { fee: "Disbursement fee to owner", typical: "Yes (R3–5 each)", pleks: "Included", pleksIncluded: false },
  { fee: "% of arrears notices", typical: "Yes (up to 15%)", pleks: "Included", pleksIncluded: false },
  { fee: "SMS charges", typical: "Yes (40c each)", pleks: "Included", pleksIncluded: false },
  { fee: "Bank lock-in contract", typical: "Some require it", pleks: "Your bank", pleksIncluded: false },
  { fee: "Hourly support fees", typical: "R500/hour", pleks: "Included", pleksIncluded: false },
  { fee: "Processing % of rent", typical: "Some (up to 1.25%)", pleks: "None", pleksIncluded: false },
]

export function CostComparison() {
  return (
    <section className="bg-surface/50 py-16 md:py-24">
      <div className="max-w-4xl mx-auto px-4">
        <h2 className="font-heading text-3xl md:text-4xl mb-4 text-center">
          How much are you actually paying?
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Most property management platforms charge separately for every service. Add it up.
        </p>

        {/* Desktop: unified comparison table */}
        <div className="hidden md:block rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Do you pay for...
                </th>
                <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                  Typical platforms
                </th>
                <th className="text-left py-3 px-4 font-semibold text-xs uppercase tracking-wider text-brand bg-brand/5">
                  Pleks
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.fee} className="border-b border-border/50 last:border-0">
                  <td className="py-3 px-4 font-medium">{row.fee}</td>
                  <td className="py-3 px-4 text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Check className="size-3.5 text-muted-foreground/50 shrink-0" />
                      {row.typical}
                    </span>
                  </td>
                  <td className="py-3 px-4 bg-brand/5">
                    <span className="flex items-center gap-2">
                      {row.pleksIncluded ? (
                        <Check className="size-3.5 text-brand shrink-0" />
                      ) : (
                        <X className="size-3.5 text-brand shrink-0" />
                      )}
                      <span className={row.pleksIncluded ? "" : "text-brand font-medium"}>
                        {row.pleks}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: two stacked cards */}
        <div className="md:hidden space-y-4">
          <Card className="bg-surface">
            <CardContent className="pt-5 space-y-3">
              <h3 className="font-heading text-lg text-muted-foreground">Typical platforms</h3>
              <ul className="space-y-2.5">
                {ROWS.map((row) => (
                  <li key={row.fee} className="flex items-start gap-2 text-sm">
                    <Check className="size-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="text-foreground">{row.fee}:</span> {row.typical}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-brand/50 bg-brand-dim/30">
            <CardContent className="pt-5 space-y-3">
              <h3 className="font-heading text-lg text-brand">Pleks</h3>
              <ul className="space-y-2.5">
                {ROWS.map((row) => (
                  <li key={row.fee} className="flex items-start gap-2 text-sm">
                    {row.pleksIncluded ? (
                      <Check className="size-3.5 text-brand mt-0.5 shrink-0" />
                    ) : (
                      <X className="size-3.5 text-brand mt-0.5 shrink-0" />
                    )}
                    <span>
                      <span className="text-foreground">{row.fee}:</span>{" "}
                      <span className={row.pleksIncluded ? "" : "text-brand font-medium"}>{row.pleks}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
