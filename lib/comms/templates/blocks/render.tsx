/**
 * lib/comms/templates/blocks/render.tsx — block → channel renderers (ADDENDUM_70E D1/D2)
 *
 * Data:   TemplateBlock[] from the central store + a RenderContext (merge tokens + cpaApplies)
 * Notes:  The presentation layer. renderStoredEmail wraps blocks in the shared EmailLayout shell;
 *         blocksToPlainText is the SMS / legal-pack path (no markup). Paragraph/signoff support
 *         **bold** inline + {{tokens}}. Statutory slot blocks (signatureSlot/legalFooterSlot) take
 *         injected nodes via opts — wiring deferred to later phases; absent slots render nothing.
 *         Styles mirror the per-template React-Email components so migrated bodies render identically.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../layout"
import type { TemplateBlock, RenderContext } from "./types"

// Bounded merge-token matcher — same shape as orgTemplateOverride (avoids slow-regex on unbounded {{…}}).
const TOKEN_RE = /\{\{[^{}]{1,120}\}\}/g

/** Replace {{token}} with ctx.merge[token]; unknown tokens collapse to "". */
export function fillTokens(text: string, ctx: RenderContext): string {
  return text.replaceAll(TOKEN_RE, (m) => {
    const key = m.slice(2, -2).trim()
    return ctx.merge[key] ?? ""
  })
}

/** Resolve a cpaConditional block's text against the lease CPA snapshot. */
function cpaText(ifCpa: string, otherwise: string, ctx: RenderContext): string {
  return ctx.cpaApplies ? ifCpa : otherwise
}

/**
 * Render `**bold**` emphasis + tokens into React nodes for email. Splits on the bold delimiter
 * so the legal-reviewable plain string stays the source of truth.
 */
function renderInline(text: string, ctx: RenderContext, keyPrefix: string): React.ReactNode[] {
  const filled = fillTokens(text, ctx)
  const out: React.ReactNode[] = []
  const parts = filled.split(/\*\*([^*]+)\*\*/g) // odd indices = bolded
  parts.forEach((part, i) => {
    if (part === "") return
    if (i % 2 === 1) out.push(<strong key={`${keyPrefix}-b${i}`}>{part}</strong>)
    else out.push(<React.Fragment key={`${keyPrefix}-t${i}`}>{part}</React.Fragment>)
  })
  return out
}

/** Render `\n`-separated text into nodes with <br/> breaks (sign-off / data box rows). */
function renderMultiline(text: string, ctx: RenderContext, keyPrefix: string): React.ReactNode[] {
  const lines = text.split("\n")
  const out: React.ReactNode[] = []
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`${keyPrefix}-br${i}`} />)
    out.push(...renderInline(line, ctx, `${keyPrefix}-l${i}`))
  })
  return out
}

export interface RenderEmailOpts {
  /** Correspondence: the agent signature node injected at signatureSlot. */
  signatureNode?: React.ReactNode
  /** Statutory: the LegalFooter node injected at legalFooterSlot. */
  legalFooterNode?: React.ReactNode
  accentColor?: string
}

/** Render one block to a React-Email element. */
function renderEmailBlock(
  block: TemplateBlock,
  ctx: RenderContext,
  idx: number,
  opts: RenderEmailOpts,
): React.ReactNode {
  const key = `blk-${idx}`
  switch (block.type) {
    case "salutation":
      return <Text key={key} style={S.greet}>{renderInline(block.text, ctx, key)}</Text>
    case "heading":
      return <Text key={key} style={S.h1}>{fillTokens(block.text, ctx)}</Text>
    case "paragraph":
      return <Text key={key} style={S.para}>{renderInline(block.text, ctx, key)}</Text>
    case "list":
      return (
        <React.Fragment key={key}>
          {block.items.map((item, i) => (
            <Text key={`${key}-i${i}`} style={S.listItem}>
              {block.ordered ? `${i + 1}. ` : "• "}{renderInline(item, ctx, `${key}-i${i}`)}
            </Text>
          ))}
        </React.Fragment>
      )
    case "dataBox":
      return (
        <Text key={key} style={S.box}>
          {block.rows.map((r, i) => (
            <React.Fragment key={`${key}-r${i}`}>
              {i > 0 && <br />}
              <strong>{fillTokens(r.label, ctx)}:</strong> {fillTokens(r.value, ctx)}
            </React.Fragment>
          ))}
        </Text>
      )
    case "callout":
      return (
        <Text key={key} style={block.tone === "warn" ? S.calloutWarn : S.calloutInfo}>
          {renderInline(block.text, ctx, key)}
        </Text>
      )
    case "cta": {
      const href = fillTokens(block.href, ctx)
      if (!href) return null
      return <EmailButton key={key} href={href} accentColor={opts.accentColor}>{fillTokens(block.label, ctx)}</EmailButton>
    }
    case "divider":
      return <Hr key={key} style={S.divider} />
    case "signoff":
      return <Text key={key} style={S.sign}>{renderMultiline(block.text, ctx, key)}</Text>
    case "signatureSlot":
      return opts.signatureNode ? <React.Fragment key={key}>{opts.signatureNode}</React.Fragment> : null
    case "legalFooterSlot":
      return opts.legalFooterNode ? <React.Fragment key={key}>{opts.legalFooterNode}</React.Fragment> : null
    case "cpaConditional":
      return <Text key={key} style={S.legalLine}>{renderInline(cpaText(block.ifCpa, block.otherwise, ctx), ctx, key)}</Text>
    default: {
      // Exhaustiveness guard — a new block type must add a case here.
      const _never: never = block
      return _never
    }
  }
}

export interface RenderStoredEmailParams {
  blocks: TemplateBlock[]
  branding: OrgBranding
  ctx: RenderContext
  preview: string
  templateCategory?: string
  opts?: RenderEmailOpts
}

/** Render a stored block body inside the shared EmailLayout shell. */
export function renderStoredEmail(params: RenderStoredEmailParams): React.ReactElement {
  const { blocks, branding, ctx, preview, templateCategory, opts = {} } = params
  const accentColor = opts.accentColor ?? branding.accentColor
  return (
    <EmailLayout preview={preview} branding={branding} templateCategory={templateCategory}>
      {blocks.map((b, i) => renderEmailBlock(b, ctx, i, { ...opts, accentColor }))}
    </EmailLayout>
  )
}

/**
 * Flatten blocks to plain text — the SMS + legal-review-pack path. Strips **bold**, drops
 * slot blocks, resolves tokens + the CPA branch. (SMS truncation happens at the send layer,
 * but this gives the send path clean text to truncate from — ADDENDUM_70D PART D.)
 */
export function blocksToPlainText(blocks: TemplateBlock[], ctx: RenderContext): string {
  const lines: string[] = []
  const clean = (t: string) => fillTokens(t, ctx).replaceAll(/\*\*([^*]+)\*\*/g, "$1")
  for (const b of blocks) {
    switch (b.type) {
      case "salutation":
      case "heading":
      case "paragraph":
      case "signoff":
        lines.push(clean(b.text)); break
      case "list":
        b.items.forEach((it, i) => {
          const marker = b.ordered ? `${i + 1}.` : "•"
          lines.push(`${marker} ${clean(it)}`)
        })
        break
      case "dataBox":
        b.rows.forEach((r) => lines.push(`${clean(r.label)}: ${clean(r.value)}`)); break
      case "callout":
        lines.push(clean(b.text)); break
      case "cta":
        lines.push(`${clean(b.label)}: ${fillTokens(b.href, ctx)}`); break
      case "cpaConditional":
        lines.push(clean(cpaText(b.ifCpa, b.otherwise, ctx))); break
      case "divider":
      case "signatureSlot":
      case "legalFooterSlot":
        break
    }
  }
  return lines.filter((l) => l.trim() !== "").join("\n\n")
}

// Styles mirror the per-template React-Email components (e.g. maintenance-logged.tsx) so a body
// migrated into blocks renders identically to its legacy component (ADDENDUM_70E E3 byte-equivalence).
const S: Record<string, React.CSSProperties> = {
  greet:        { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" },
  h1:           { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" },
  para:         { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" },
  listItem:     { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 6px" },
  box:          { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", fontSize: 13, color: "#3f3f46", lineHeight: "2", whiteSpace: "pre-line" },
  calloutInfo:  { background: "#eff6ff", borderLeft: "3px solid #3b82f6", borderRadius: 4, padding: "12px 16px", margin: "0 0 16px", fontSize: 14, color: "#1e3a8a", lineHeight: "1.6" },
  calloutWarn:  { background: "#fffbeb", borderLeft: "3px solid #f59e0b", borderRadius: 4, padding: "12px 16px", margin: "0 0 16px", fontSize: 14, color: "#78350f", lineHeight: "1.6" },
  divider:      { borderColor: "#e4e4e7", margin: "24px 0" },
  sign:         { fontSize: 14, color: "#3f3f46", margin: "0" },
  legalLine:    { fontSize: 12, color: "#71717a", lineHeight: "1.6", margin: "0 0 12px" },
}
