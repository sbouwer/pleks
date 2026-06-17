/**
 * lib/comms/templates/blocks/render.test.tsx — ADDENDUM_70E pilot: blocks reproduce the legacy component
 *
 * Proves the central-store path (blocks → renderStoredEmail → EmailLayout) renders the SAME visible
 * email as the hand-written React-Email component it replaces (maintenance-logged.tsx). This is the
 * end-to-end de-risk before the cluster-by-cluster body migration (E3).
 */

import { describe, it, expect } from "vitest"
import { render } from "@react-email/components"
import { MaintenanceLoggedEmail } from "../tenant/maintenance/maintenance-logged"
import { renderStoredEmail, blocksToPlainText } from "./render"
import type { OrgBranding } from "../layout"
import type { TemplateBlock } from "./types"

const branding: OrgBranding = {
  orgName: "Acme Lettings",
  orgPhone: "021 000 0000",
  orgEmail: "hello@acme.test",
}

const merge = {
  tenantName: "Jane Smith",
  propertyLabel: "Unit 4, Oak Court",
  requestTitle: "Leaking kitchen tap",
  workOrderNumber: "WO-1024",
  senderName: "Acme Lettings",
}

// Same blocks seeded into document_templates in 011 §20.
const blocks: TemplateBlock[] = [
  { type: "salutation", text: "Dear {{tenantName}}," },
  { type: "heading", text: "Maintenance request received" },
  { type: "paragraph", text: "We have received a maintenance request for **{{propertyLabel}}** and it is now under review. Our team will be in touch to arrange the next steps." },
  { type: "dataBox", rows: [{ label: "Request", value: "{{requestTitle}}" }, { label: "Reference", value: "{{workOrderNumber}}" }] },
  { type: "paragraph", text: "Please keep this reference number for your records. Quote it in any correspondence about this request." },
  { type: "divider" },
  { type: "signoff", text: "Kind regards,\n{{senderName}}" },
]

const preview = `Maintenance request received — ref ${merge.workOrderNumber}`

/** Strip tags + entities + collapse whitespace → comparable visible text. */
function visibleText(html: string): string {
  return html
    // React separates adjacent {expr} text nodes with the literal <!-- --> comment (non-visible) —
    // it lands differently in the two render paths, so drop it to EMPTY before stripping tags.
    .replaceAll("<!-- -->", "")
    .replaceAll(/<[^>]{0,4096}>/g, " ")
    .replaceAll(/&amp;/g, "&")
    .replaceAll(/&#x27;|&#39;|&apos;/g, "'")
    .replaceAll(/&quot;/g, '"')
    .replaceAll(/&nbsp;/g, " ")
    .replaceAll(/[​-‍﻿]/g, "") // react-email Preview pads with zero-width chars
    .replaceAll(/\s+/g, " ")
    .trim()
}

describe("ADDENDUM_70E — stored blocks reproduce the legacy maintenance-logged email", () => {
  it("renders the same visible text as MaintenanceLoggedEmail", async () => {
    const legacyHtml = await render(
      MaintenanceLoggedEmail({
        branding,
        tenantName: merge.tenantName,
        propertyLabel: merge.propertyLabel,
        requestTitle: merge.requestTitle,
        workOrderNumber: merge.workOrderNumber,
        senderName: merge.senderName,
      }),
    )
    const storedHtml = await render(
      renderStoredEmail({ blocks, branding, ctx: { merge }, preview }),
    )

    expect(visibleText(storedHtml)).toBe(visibleText(legacyHtml))
  })

  it("flattens to clean plain text for SMS / the legal pack", () => {
    const text = blocksToPlainText(blocks, { merge })
    expect(text).toContain("Dear Jane Smith,")
    expect(text).toContain("Maintenance request received")
    expect(text).toContain("for Unit 4, Oak Court") // **bold** stripped, token filled
    expect(text).toContain("Request: Leaking kitchen tap")
    expect(text).toContain("Reference: WO-1024")
    expect(text).toContain("Kind regards,")
    expect(text).not.toContain("**") // no markup leaks
    expect(text).not.toContain("{{") // no unresolved tokens
  })
})
