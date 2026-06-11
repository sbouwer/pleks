/**
 * lib/docuseal/client.ts — minimal DocuSeal API client (self-hosted, sign.pleks.co.za)
 *
 * Auth:   X-Auth-Token: DOCUSEAL_API_TOKEN against DOCUSEAL_URL. Both env-gated — isDocusealConfigured() is false
 *         until they're set, so callers can fall back (e.g. sendForSigning stays at "manual" signing pre-go-live).
 * Notes:  Hand-rolled (no @docuseal/api dep) — only two endpoints needed. The lease is generated as a .docx with
 *         {{…;type=signature}} field tags (generateDocument.ts), so we create a per-lease template FROM that docx
 *         (DocuSeal converts to PDF + auto-places fields), then a submission with send_email:false (Pleks sends
 *         the signing link via its own Resend pipeline). Data residency: this instance is SA-hosted (POPIA).
 */

const DOCUSEAL_URL = process.env.DOCUSEAL_URL
const DOCUSEAL_API_TOKEN = process.env.DOCUSEAL_API_TOKEN

export function isDocusealConfigured(): boolean {
  return Boolean(DOCUSEAL_URL && DOCUSEAL_API_TOKEN)
}

export interface DocusealSubmitter {
  role: string
  email: string
  name?: string
}

export interface DocusealSubmitterResult {
  id: number
  submission_id: number
  role: string
  email: string
  slug: string
}

async function docusealFetch<T>(path: string, body: unknown): Promise<T> {
  if (!DOCUSEAL_URL || !DOCUSEAL_API_TOKEN) {
    throw new Error("DocuSeal not configured (DOCUSEAL_URL / DOCUSEAL_API_TOKEN unset)")
  }
  const res = await fetch(`${DOCUSEAL_URL}${path}`, {
    method: "POST",
    headers: {
      "X-Auth-Token": DOCUSEAL_API_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`DocuSeal ${path} ${res.status}: ${text.slice(0, 500)}`)
  }
  return res.json() as Promise<T>
}

/** Create a per-lease template from the generated .docx (base64). Field tags in the doc become fillable fields. */
export async function createTemplateFromDocx(name: string, docxBase64: string): Promise<{ id: number }> {
  const result = await docusealFetch<{ id: number }>("/api/templates/docx", {
    name,
    documents: [{ name, file: docxBase64 }],
  })
  return { id: result.id }
}

/**
 * Create a submission for a template. send_email:false — Pleks emails the signing link itself (better
 * deliverability + branding than DocuSeal's SMTP). Returns the submitters, each carrying its signing slug.
 */
export async function createSubmission(
  templateId: number,
  submitters: DocusealSubmitter[],
): Promise<DocusealSubmitterResult[]> {
  return docusealFetch<DocusealSubmitterResult[]>("/api/submissions", {
    template_id: templateId,
    send_email: false,
    submitters,
  })
}

/** The hosted signing URL a submitter visits to sign (from their slug). */
export function signingUrl(slug: string): string {
  return `${DOCUSEAL_URL}/s/${slug}`
}
