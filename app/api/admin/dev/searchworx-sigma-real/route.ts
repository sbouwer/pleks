/**
 * app/api/admin/dev/searchworx-sigma-real/route.ts — Dev-only Experian Sigma end-to-end test
 *
 * Route:  GET /api/admin/dev/searchworx-sigma-real?id=eva|goofy
 * Auth:   NODE_ENV !== "production" guard + ADMIN_SECRET header
 * Notes:  ADDENDUM_14H Phase 2 dev route. Replaces the Phase 2 spike route.
 *         Calls the real experianSigma product module end-to-end: auth → Sigma → PDF download → Storage.
 *         Returns the parsed SigmaParsed shape plus storage path for manual verification.
 *         Do NOT call this from production — it writes to the screening-reports bucket.
 */
import { NextRequest, NextResponse } from "next/server"
import { runExperianSigma } from "@/lib/searchworx/products/experianSigma"
import { downloadAndStoreSearchworxArtefact } from "@/lib/searchworx/storage"

const TEST_SUBJECTS = {
  eva: {
    idNumber:  "6002100560184",
    surname:   "COMMERCE",
    firstName: "EVA",
  },
  goofy: {
    idNumber:  "8001015009087",
    surname:   "DUCK",
    firstName: "GOOFY",
  },
} as const

type TestId = keyof typeof TEST_SUBJECTS

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dev-only route" }, { status: 403 })
  }

  const secret = req.headers.get("x-admin-secret")
  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const id     = (req.nextUrl.searchParams.get("id") ?? "eva") as TestId
  const subject = TEST_SUBJECTS[id] ?? TEST_SUBJECTS.eva

  const started = Date.now()

  const result = await runExperianSigma({
    reference:     `DEV-SIGMA-${id.toUpperCase()}-${Date.now()}`,
    enquiryReason: "Affordability Assessment",
    idNumber:      subject.idNumber,
    surname:       subject.surname,
    firstName:     subject.firstName,
  })

  if (!result.ok) {
    return NextResponse.json({
      ok:       false,
      error:    result.error.message,
      category: result.error.category,
      elapsed:  Date.now() - started,
    })
  }

  // Download and store the Searchworx PDF (dev: use "dev-test" as orgId)
  const DEV_ORG_ID  = "dev-test"
  const DEV_REF_ID  = `dev-sigma-${id}-${Date.now()}`
  const searchToken = result.parsed.search.searchToken

  let storagePath: string | null = null
  let pdfByteSize: number | null = null
  let pdfError: string | null    = null

  if (result.pdfCopyUrl) {
    try {
      const pdfResult = await downloadAndStoreSearchworxArtefact({
        vendorUrl:    result.pdfCopyUrl,
        orgId:        DEV_ORG_ID,
        refId:        DEV_REF_ID,
        searchToken,
        artefactKind: "pdf",
        mimeType:     "application/pdf",
      })
      storagePath  = pdfResult.storagePath
      pdfByteSize  = pdfResult.byteSize
    } catch (err) {
      pdfError = err instanceof Error ? err.message : String(err)
    }
  }

  return NextResponse.json({
    ok:          true,
    elapsed_ms:  Date.now() - started,
    testSubject: id,
    parsed:      result.parsed,
    pdf: {
      vendorUrlPresent: Boolean(result.pdfCopyUrl),
      storagePath,
      byteSize:    pdfByteSize,
      error:       pdfError,
    },
  })
}
