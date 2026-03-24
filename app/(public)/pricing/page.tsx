import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import Link from "next/link"

const tiers = [
  {
    name: "Owner",
    price: "Free",
    units: "1 unit",
    users: "1 user",
    features: ["Lease management", "Basic inspections", "Tenant portal", "Maintenance log"],
  },
  {
    name: "Steward",
    price: "R 599",
    units: "10 units",
    users: "2 users",
    features: [
      "Everything in Owner",
      "Bank reconciliation",
      "Owner statements",
      "Unlimited inspections",
      "Basic reports",
      "FitScore screening",
    ],
  },
  {
    name: "Portfolio",
    price: "R 999",
    units: "30 units",
    users: "5 users",
    popular: true,
    features: [
      "Everything in Steward",
      "DebiCheck collections",
      "Arrears automation",
      "Application pipeline",
      "Municipal bills",
      "Full reporting",
      "Lease automation",
    ],
  },
  {
    name: "Firm",
    price: "R 2,499",
    units: "Unlimited",
    users: "Unlimited",
    features: [
      "Everything in Portfolio",
      "HOA / body corporate",
      "Contractor portal",
      "AI legal documents",
      "Custom templates",
      "EAAB tools",
    ],
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen px-4 py-16">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="font-heading text-4xl md:text-5xl mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-muted-foreground text-lg">
            No onboarding fees. No hidden costs. Cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <Card
              key={tier.name}
              className={tier.popular ? "border-brand" : undefined}
            >
              <CardHeader>
                <CardTitle className="font-heading text-xl">{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="font-heading text-3xl">{tier.price}</span>
                  {tier.price !== "Free" && (
                    <span className="text-muted-foreground text-sm">/month</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {tier.units} &middot; {tier.users}
                </p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-success mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button className="w-full" variant={tier.popular ? "default" : "outline"} render={<Link href="/login" />}>
                  Get Started
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
