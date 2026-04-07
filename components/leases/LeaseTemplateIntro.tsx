"use client"

import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Props {
  tier: string | null
  onDismiss: () => void
}

const CONTENT: Record<string, { subtitle: string; layers: { label: string; body: string }[]; example: string }> = {
  owner: {
    subtitle: "Your lease is assembled from three layers — most of the work is already done for you.",
    layers: [
      {
        label: "\u2460 Your lease template (you\u2019re here)",
        body: "Standard clauses that apply to your lease. Required clauses like deposit handling and maintenance obligations are always included. You choose which optional clauses to add \u2014 things like pet policies or parking rules.",
      },
      {
        label: "\u2461 Property rules (on your property\u2019s edit page)",
        body: "House rules specific to your property \u2014 quiet hours, braai rules, garden maintenance. These become an annexure to the lease. Choose from our library or write your own.",
      },
      {
        label: "\u2462 Unit features (on your unit\u2019s detail page)",
        body: "Features like 'Pool' or 'Garden' automatically suggest relevant clauses and rules. Toggle a feature, and the lease adjusts.",
      },
    ],
    example:
      "You rent out your garden flat. You toggle on the pet policy clause (because you allow small dogs), add 'quiet hours after 22:00' from the rules library, and the pool maintenance clause is already included because your unit has 'Pool' as a feature. When you create the lease, Pleks combines everything into one professional document.",
  },
  steward: {
    subtitle: "Your lease is assembled from three layers \u2014 set it up once, and every new lease starts from your defaults.",
    layers: [
      {
        label: "\u2460 Organisation defaults (you\u2019re here)",
        body: "Set the standard clauses for all your leases. Required clauses are always included. Toggle optional clauses on or off \u2014 these become your baseline for every property.",
      },
      {
        label: "\u2461 Property rules (on each property\u2019s edit page)",
        body: "House rules specific to each property. One property might allow pets, another might not. Choose from our pre-written library or write your own \u2014 AI formatting available.",
      },
      {
        label: "\u2462 Unit overrides (on each unit\u2019s detail page)",
        body: "Override specific clauses for individual units if needed. Most units just use your org defaults \u2014 you only set overrides for the exceptions.",
      },
    ],
    example:
      "You manage 3 rental houses for different landlords. Your org defaults include the standard deposit, maintenance, and notice clauses. On the Paarl house you add 'garden maintenance' and 'braai area' rules because it has a big garden. On the Stellenbosch flat you toggle on the pet policy clause because the landlord allows cats. When you create a lease for either property, Pleks pulls your defaults plus that property\u2019s specific rules into one document \u2014 no copy-pasting between templates.",
  },
}

// Portfolio and firm share the same content
const PORTFOLIO_CONTENT = {
  subtitle: "Your lease is assembled from three layers \u2014 set your organisation defaults once, then manage exceptions per property and unit.",
  layers: [
    {
      label: "\u2460 Organisation defaults (you\u2019re here)",
      body: "Your baseline clause set that applies to every lease across your portfolio. Required clauses are locked in. Toggle optional clauses to set your standard \u2014 this covers the majority of your leases without per-property work.",
    },
    {
      label: "\u2461 Property rules (on each property\u2019s edit page)",
      body: "Rules specific to each property or complex. For sectional title properties, upload the BC conduct rules as a PDF \u2014 it attaches as a lease annexure automatically. For freestanding properties, add house rules from our library or write custom rules with AI formatting.",
    },
    {
      label: "\u2462 Unit overrides (on each unit\u2019s detail page)",
      body: "Override clauses for specific units \u2014 a ground floor unit with a garden gets the garden maintenance clause even if your org default has it off. Only set overrides where a unit genuinely differs from your standard.",
    },
  ],
  example:
    "You manage a 12-unit complex in Table View (sectional title) and 5 freestanding houses across the Northern Suburbs. Your org defaults handle the common clauses. The complex gets the BC conduct rules PDF uploaded once \u2014 it applies to all 12 units. The freestanding houses each get their own property rules (one has a pool, another has a borehole). Unit 3 in the complex is ground floor with exclusive-use garden \u2014 you add a garden maintenance override on that unit only. Every lease pulls the right combination automatically.",
}

function resolveContent(tier: string | null) {
  if (tier === "owner") return CONTENT.owner
  if (tier === "steward") return CONTENT.steward
  return PORTFOLIO_CONTENT
}

export function LeaseTemplateIntro({ tier, onDismiss }: Readonly<Props>) {
  const content = resolveContent(tier)

  return (
    <div className="relative border rounded-lg bg-surface p-5 mb-6 text-sm">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>

      <p className="font-semibold mb-1">How your lease is built</p>
      <p className="text-muted-foreground mb-4">{content.subtitle}</p>

      <div className="space-y-3 mb-4">
        {content.layers.map((layer) => (
          <div key={layer.label}>
            <p className="font-medium text-foreground">{layer.label}</p>
            <p className="text-muted-foreground mt-0.5">{layer.body}</p>
          </div>
        ))}
      </div>

      <div className="bg-surface-elevated rounded-md px-4 py-3 text-muted-foreground mb-4">
        <span className="font-medium text-foreground">Example: </span>
        {content.example}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={onDismiss}>
          Got it, let&rsquo;s go
        </Button>
      </div>
    </div>
  )
}
