/**
 * Builds a print-ready HTML document for letters and correspondence.
 * Follows the same pattern as tenantStatement.ts — returns a full HTML page
 * that can be opened in a new tab and printed to PDF by the browser.
 */

export interface DocumentLetterData {
  orgName: string
  agentName: string
  signatureUrl?: string | null
  leaseRef?: string | null
  bodyHtml: string
  date?: string
}

/** Resolve {{key}} merge fields; strip any that remain unresolved. */
export function resolveMergeFields(
  body: string,
  values: Record<string, string>,
): string {
  let resolved = body
  for (const [key, value] of Object.entries(values)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value)
  }
  // Remove unresolved placeholders so they don't appear as raw {{...}} in print
  return resolved.replaceAll(/\{\{[^{}]+\}\}/g, "")
}

function buildPrintCSS(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 11pt;
      color: #1a1a1a;
      background: #fff;
      padding: 0;
    }
    .page {
      max-width: 170mm;
      margin: 0 auto;
      padding: 20mm 15mm;
    }

    /* Letterhead */
    .letterhead {
      border-bottom: 2px solid #1a3a5c;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .letterhead .org-name {
      font-size: 16pt;
      font-weight: bold;
      color: #1a3a5c;
    }
    .letterhead .meta {
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }

    /* Body */
    .body-content {
      line-height: 1.7;
      font-size: 11pt;
    }
    .body-content p { margin-bottom: 1em; }
    .body-content strong, .body-content b { font-weight: 700; }
    .body-content em, .body-content i { font-style: italic; }
    .body-content ul, .body-content ol { padding-left: 1.4em; margin-bottom: 1em; }
    .body-content li { margin-bottom: 0.3em; }
    .body-content table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1em;
    }
    .body-content th, .body-content td {
      border: 1px solid #ccc;
      padding: 5px 8px;
      font-size: 10pt;
    }

    /* Signature block */
    .signature-block {
      margin-top: 32px;
      font-size: 11pt;
    }
    .signature-block p { margin-bottom: 8px; }
    .signature-block img {
      display: block;
      height: 48px;
      max-width: 180px;
      margin-bottom: 4px;
      object-fit: contain;
    }
    .signature-block .sig-line {
      height: 1px;
      width: 160px;
      border-bottom: 1px solid #333;
      margin-bottom: 4px;
    }
    .signature-block .agent-name {
      font-weight: 600;
      font-size: 10pt;
    }

    @media print {
      @page {
        size: A4;
        margin: 0;
      }
      body { background: #fff; }
      .page { padding: 20mm 15mm; }
    }
  `
}

export function buildLetterHTML(data: DocumentLetterData): string {
  const date =
    data.date ??
    new Date().toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })

  const leaseRefHtml = data.leaseRef
    ? `<p class="meta">Re: ${escapeHtml(data.leaseRef)}</p>`
    : ""

  const sigHtml = data.signatureUrl
    ? `<img src="${escapeHtml(data.signatureUrl)}" alt="Signature" />`
    : `<div class="sig-line"></div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(data.orgName)} — Document</title>
  <style>${buildPrintCSS()}</style>
</head>
<body>
  <div class="page">
    <div class="letterhead">
      <p class="org-name">${escapeHtml(data.orgName)}</p>
      ${leaseRefHtml}
      <p class="meta">${escapeHtml(date)}</p>
    </div>

    <div class="body-content">
      ${data.bodyHtml}
    </div>

    <div class="signature-block">
      <p>Yours faithfully,</p>
      ${sigHtml}
      <p class="agent-name">${escapeHtml(data.agentName)}</p>
    </div>
  </div>
  <script>
    // Auto-print when opened from Pleks
    if (new URLSearchParams(location.search).get("print") === "1") {
      window.addEventListener("load", () => {
        setTimeout(() => window.print(), 400)
      })
    }
  </script>
</body>
</html>`
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
