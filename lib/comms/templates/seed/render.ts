/**
 * lib/comms/templates/seed/render.ts — seed → human-readable review text (ADDENDUM_70E D6/E5)
 *
 * Data:   a TemplateSeed (typed blocks)
 * Notes:  Renders a seed's body to the review form counsel reads — {{tokens}} PRESERVED (the template
 *         structure, not a sample fill), cpaConditional shows BOTH branches, slots expanded to their
 *         effect (signature, ECTA + issuing-basis). This is "legal review is a regenerate, not a
 *         transcription" (70E): one generator path feeds both this review doc and the seed SQL.
 */

import type { TemplateSeed } from "./types"
import type { TemplateBlock, TemplateBodyVariants, TemplateFlavour } from "../blocks/types"
import { ECTA_FOOTER_TEXT, popiaProcessingLine } from "../legalCitations"

/** One block → its review-text representation (tokens preserved). */
function blockToReview(b: TemplateBlock, seed: TemplateSeed): string {
  switch (b.type) {
    case "salutation":
    case "heading":
    case "paragraph":
    case "signoff":
      return b.text
    case "list":
      return b.items.map((i) => `  - ${i}`).join("\n")
    case "dataBox":
      return b.rows.map((r) => `  ${r.label}: ${r.value}`).join("\n")
    case "callout":
      return `[${b.tone.toUpperCase()}] ${b.text}`
    case "cta":
      return `[Button: ${b.label} → ${b.href}]`
    case "divider":
      return "———"
    case "signatureSlot":
      return "[Agent signature — injected from user_signatures]"
    case "legalFooterSlot":
      return [seed.issuedUnder, ECTA_FOOTER_TEXT].filter(Boolean).join("\n\n")
    case "popiaSlot":
      return popiaProcessingLine("{{branding.orgName}}")
    case "cpaConditional":
      return `‹if CPA applies›  ${b.ifCpa}\n‹if CPA does not apply›  ${b.otherwise}`
    default: {
      const _never: never = b
      return _never
    }
  }
}

function bodyToReview(blocks: TemplateBlock[], seed: TemplateSeed): string {
  return blocks.map((b) => blockToReview(b, seed)).join("\n\n")
}

/** Render a seed to a markdown review section for CD. */
export function renderSeedReview(seed: TemplateSeed): string {
  const head = [
    `### ${seed.name} — \`${seed.key}\` (${seed.channel})`,
    `**class:** ${seed.commsClass}` +
      (seed.subject ? `  ·  **subject:** "${seed.subject}"` : "  ·  **subject:** set at call-site") +
      (seed.legalReviewRef ? `  ·  **from:** ${seed.legalReviewRef}` : ""),
  ].join("\n")

  let bodySection: string
  if (seed.variants) {
    const flavours: TemplateFlavour[] = ["friendly", "professional", "firm"]
    bodySection = flavours
      .filter((f) => seed.variants?.[f])
      .map((f) => `**Flavour — ${f}:**\n\`\`\`\n${bodyToReview(seed.variants![f]!, seed)}\n\`\`\``)
      .join("\n\n")
  } else if (seed.body) {
    bodySection = "```\n" + bodyToReview(seed.body, seed) + "\n```"
  } else {
    bodySection = "_(no body)_"
  }

  return `${head}\n\n${bodySection}\n`
}

/** Variants helper exported for the generator's flavour iteration. */
export type { TemplateBodyVariants }
