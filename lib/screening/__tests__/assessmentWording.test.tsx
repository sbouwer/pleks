/**
 * lib/screening/__tests__/assessmentWording.test.tsx — the closing sentence is one constant, rendered by the page and the email
 *
 * Notes:  Counsel 2026-10-05 (approved-comms §4a): the closing sentence is identical on the credit check policy and in
 *         the N6 email — no shortened variant. The page must render the constant (v1.5.1), and the superseded §03
 *         sentence ("not disclosed between applicants") must be gone, since the policy now shares the consolidated
 *         assessment with the parties.
 */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import CreditCheckPolicyPage from "@/app/(public)/credit-check-policy/page"
import { ASSESSMENT_CLOSING_SENTENCE } from "../assessmentWording"
import { outcomeCopy } from "../milestoneNotices"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"

const text = (html: string) => html.replaceAll("&#x27;", "'").replaceAll("&#39;", "'").replaceAll("’", "'")

describe("the closing sentence — one constant, two renderers", () => {
  const page = text(renderToStaticMarkup(<CreditCheckPolicyPage />))

  it("the policy page renders it, at v1.5.1 or later", () => {
    expect(page).toContain(ASSESSMENT_CLOSING_SENTENCE)
    expect(LEGAL_VERSIONS.creditCheckPolicy).toBe("v1.5.1")
  })

  it("PLANTED: the superseded §03 sentence is gone", () => {
    expect(page).not.toContain("not disclosed between applicants")
    expect(page).not.toContain("higher bundled fee")
  })

  it("the N6 email renders the same constant", () => {
    const html = text(outcomeCopy({ firstName: "F", propertyLabel: "P", completedNames: ["A"], completed: 1, total: 2, link: null }).html)
    expect(html).toContain(ASSESSMENT_CLOSING_SENTENCE)
  })
})
