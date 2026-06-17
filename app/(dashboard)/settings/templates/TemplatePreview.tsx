"use client"

/**
 * app/(dashboard)/settings/templates/TemplatePreview.tsx — branded, kind-aware preview of a template
 *
 * Notes:  Shows what actually goes out. Letter/notice → branded A4 paper with the agent's injected
 *         signature block; email → email-client mock; whatsapp → phone bubble. {{tokens}} render as
 *         merge-field chips (showFields) or sample fill values (off). System templates follow the
 *         selected flavour (body_variants[tone]). dangerouslySetInnerHTML is agent-authored template
 *         HTML shown only to the authoring agent (same content the send path renders).
 */
import { useLayoutEffect, useRef, useState, useCallback } from "react"
import { MERGE_FIELDS, type DocumentTemplate, type LetterheadBranding, type ToneId, type AgentSignature } from "./types"

const FILLED_RE = /\{\{[^{}]{1,120}\}\}/g

function resolveBody(raw: string, showFields: boolean): string {
  let html = raw
  for (const f of MERGE_FIELDS) {
    const rep = showFields ? `<span class="tpl-mf">${f.label}</span>` : `<span class="tpl-mf-filled">${f.sample}</span>`
    html = html.split(f.token).join(rep)
  }
  return html.replace(FILLED_RE, (m) =>
    showFields ? `<span class="tpl-mf">${m.replace(/[{}]/g, "")}</span>` : `<span class="tpl-mf-filled">${m}</span>`)
}

function bodyFor(t: DocumentTemplate, tone: ToneId): string {
  const v = t.body_variants
  if (v && typeof v[tone] === "string" && v[tone]) return v[tone]
  if (t.template_type === "whatsapp") return t.whatsapp_body ?? ""
  return t.body_html ?? (v ? v.professional ?? Object.values(v)[0] ?? "" : "")
}

function Letterhead({ b, right }: Readonly<{ b: LetterheadBranding; right?: string }>) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2.5">
        {b.logoUrl
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL; preview only
          ? <img src={b.logoUrl} alt="" className="h-9 w-auto max-w-[120px] object-contain" />
          : <span className="grid size-9 place-items-center rounded-[5px] text-[15px] font-semibold text-white" style={{ background: b.accentColor }}>{b.orgName.charAt(0) || "P"}</span>}
        <div>
          <div className="text-[13px] font-bold tracking-tight" style={{ color: b.accentColor }}>{b.orgName}</div>
          <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[#7a6f60]">
            {b.ffcNumber ? <>PPRA FFC <span className="tpl-mf-filled">{b.ffcNumber}</span></> : "Registered estate agency"}
            {b.address ? ` · ${b.address}` : ""}
          </div>
        </div>
      </div>
      {right && <div className="text-right font-mono text-[9px] text-[#7a6f60]">{right}</div>}
    </div>
  )
}

/** Injected agent signature block (correspondence/statutory letters). */
function SignatureBlock({ sig }: Readonly<{ sig: AgentSignature }>) {
  return (
    <div className="mt-7">
      {sig.signedUrl
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL; preview only
        ? <img src={sig.signedUrl} alt="Signature" className="h-12 w-auto max-w-[180px] object-contain object-left" />
        : <div className="h-12 w-44 rounded-[3px] border border-dashed border-[#d9d0c2]" />}
      <div className="mt-1 border-t border-[#ece7dc] pt-1 font-mono text-[9px] uppercase tracking-wider text-[#7a6f60]">
        Authorised signatory · <span className="tpl-mf-filled">Agent name</span>
      </div>
    </div>
  )
}

function LetterPaper({ t, b, html, sig }: Readonly<{ t: DocumentTemplate; b: LetterheadBranding; html: string; sig: AgentSignature }>) {
  return (
    <div className="tpl-paper" style={{ width: 560 }}>
      <Letterhead b={b} right={`Date · ${new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })}`} />
      <div className="mt-4 h-px w-full" style={{ background: b.accentColor }} />
      <h1 className="mt-5 text-[17px] font-bold tracking-tight text-[#16110a]">{t.name}</h1>
      {t.description && <div className="mt-0.5 font-mono text-[9px] text-[#7a6f60]">{t.description}</div>}
      <div className="tpl-body mt-4 text-[12px] leading-relaxed text-[#2c2418]" dangerouslySetInnerHTML={{ __html: html }} />
      <SignatureBlock sig={sig} />
    </div>
  )
}

function EmailMock({ b, html, subjectHtml, sig }: Readonly<{ b: LetterheadBranding; html: string; subjectHtml: string; sig: AgentSignature }>) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-[#e3ddd1] bg-white" style={{ width: 560 }}>
      <div className="border-b border-[#e3ddd1] bg-[#f6f2ea] px-5 py-3">
        <div className="font-mono text-[9px] uppercase tracking-wider text-[#9a8f7d]">From · {b.orgName}</div>
        <div className="mt-1 text-[14px] font-semibold text-[#16110a]" dangerouslySetInnerHTML={{ __html: subjectHtml || "(no subject)" }} />
      </div>
      <div className="px-6 py-5">
        <Letterhead b={b} />
        <div className="tpl-body mt-4 text-[12px] leading-relaxed text-[#2c2418]" dangerouslySetInnerHTML={{ __html: html }} />
        <SignatureBlock sig={sig} />
      </div>
    </div>
  )
}

function WhatsAppMock({ b, html }: Readonly<{ b: LetterheadBranding; html: string }>) {
  return (
    <div className="overflow-hidden rounded-[20px] border-4 border-[#1f2630] bg-[#e6ddd3]" style={{ width: 300 }}>
      <div className="flex items-center gap-2 bg-[#1f6e5e] px-4 py-3 text-white">
        <span className="grid size-7 place-items-center rounded-full bg-white/20 text-[12px] font-semibold">{b.orgName.charAt(0) || "P"}</span>
        <span className="text-[12px] font-medium">{b.orgName}</span>
      </div>
      <div className="px-3 py-5">
        <div className="max-w-[85%] rounded-[10px] rounded-tl-[2px] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#1f2630] shadow-sm">
          <span className="tpl-body whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  )
}

interface Props {
  template: DocumentTemplate
  branding: LetterheadBranding
  tone: ToneId
  showFields: boolean
  fit: boolean
  /** Injected on letter/email previews; absent for service (whatsapp). */
  agentSignature?: AgentSignature
}

export function TemplatePreview({ template, branding, tone, showFields, fit, agentSignature }: Readonly<Props>) {
  const matRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  const recompute = useCallback(() => {
    const mat = matRef.current, paper = paperRef.current
    if (!mat || !paper) return
    if (!fit) { setScale(1); return }
    const pad = 40
    const s = Math.min(1, (mat.clientHeight - pad) / paper.scrollHeight, (mat.clientWidth - pad) / paper.offsetWidth)
    setScale(s > 0 ? s : 1)
  }, [fit])

  useLayoutEffect(() => { recompute() }, [recompute, template.id, tone, showFields])
  useLayoutEffect(() => {
    const mat = matRef.current
    if (!mat || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(() => recompute())
    ro.observe(mat)
    return () => ro.disconnect()
  }, [recompute])

  const html = resolveBody(bodyFor(template, tone), showFields)
  const subjectHtml = resolveBody(template.subject ?? "", showFields)
  const sig: AgentSignature = agentSignature ?? { signedUrl: null }

  let surface
  if (template.template_type === "email") surface = <EmailMock b={branding} html={html} subjectHtml={subjectHtml} sig={sig} />
  else if (template.template_type === "whatsapp") surface = <WhatsAppMock b={branding} html={html} />
  else surface = <LetterPaper t={template} b={branding} html={html} sig={sig} />

  return (
    <div ref={matRef} className="grid flex-1 place-items-center overflow-auto p-5">
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
        <div ref={paperRef}>{surface}</div>
      </div>
    </div>
  )
}
