/**
 * app/(public)/privacy/processing-purposes/page.tsx — POPIA processing-purpose register
 *
 * Route:  /privacy/processing-purposes
 * Auth:   public, SEO-indexed
 * Data:   static — canonical source is brief/legal/PROCESSING_PURPOSES.md
 * Notes:  D-POPIA-18: published publicly. Describes Pleks's own processing;
 *         agency disclaimer at top clarifies each agency remains Responsible Party
 *         for data it collects and must maintain its own register.
 *         Phase 8 will inject the full markdown content; this is the structural scaffold.
 */
import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Processing purposes register — Pleks",
  description: "Pleks's POPIA processing-purpose register: lawful basis, data categories, recipients, retention, and cross-border transfers for all 27 processing purposes.",
}

export default function ProcessingPurposesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-8">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
          POPIA s17 · Accountability · Processing Register
        </p>
        <h1 className="text-3xl font-heading font-semibold mb-3">Processing purposes register</h1>
        <p className="text-muted-foreground text-sm">
          This register lists every purpose for which Pleks processes personal information,
          as required by POPIA s17 (accountability) and s18 (notification).
        </p>
      </div>

      {/* Agency disclaimer — D-POPIA-18 */}
      <div className="p-4 border rounded-lg bg-muted/30 text-sm space-y-2">
        <p className="font-medium">Agency disclaimer</p>
        <p className="text-muted-foreground">
          This register describes Pleks&apos;s own processing as Responsible Party (platform
          account data) and as Operator for agency-managed data. Each agency is the Responsible
          Party for personal information it collects from its own tenants, landlords, and
          contractors. Agencies must maintain their own POPIA register — this document does not
          discharge their accountability obligation. Pleks provides this register so agencies
          can reference it accurately in their own documentation.
        </p>
      </div>

      {/* Placeholder — Phase 8 replaces with full PROCESSING_PURPOSES.md content */}
      <div className="prose prose-sm max-w-none text-muted-foreground">
        <p>
          The full processing-purpose register will be published here. It covers 27 processing
          purposes across:
        </p>
        <ul>
          <li>B1 — Platform account creation and authentication</li>
          <li>B4 — Rental application screening (credit, income, identity)</li>
          <li>B5 — Commercial credit composite (FitScore for juristic applicants)</li>
          <li>B9 — Payment processing (application fees)</li>
          <li>B22 — Bank statement analysis</li>
          <li>B26 — Criminal background screening</li>
          <li>B27 — Property intelligence (Deeds Office, Lightstone, CIPC)</li>
          <li>And 20 additional purposes across leasing, trust, operations, and compliance</li>
        </ul>
        <p>
          For each purpose the register lists: lawful basis (POPIA s11), categories of personal
          data processed, categories of data subjects, categories of recipients and operators,
          cross-border transfer schedule (s72 basis), retention period per D-POPIA-02, and whether
          a DPIA is required.
        </p>
      </div>

      <div className="flex gap-4 text-sm">
        <Link href="/privacy" className="underline text-muted-foreground hover:text-foreground">
          Privacy policy
        </Link>
        <Link href="/privacy/information-officer" className="underline text-muted-foreground hover:text-foreground">
          Information Officer
        </Link>
        <Link href="/privacy/versions" className="underline text-muted-foreground hover:text-foreground">
          Version history
        </Link>
      </div>
    </div>
  )
}
