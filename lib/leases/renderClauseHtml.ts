import type { ClauseNode } from "./parseClauseBody"

/**
 * Renders parsed ClauseNodes to HTML string.
 *
 * Each numbered node uses a flex layout: <span class="clause-number"> is
 * flex-shrink:0 (any length number stays on one line) and <span class="clause-text">
 * fills the remaining width with justified text. Depth is expressed via
 * data-depth for CSS padding-left — no hanging text-indent tricks needed.
 *
 * node.text is used as-is (not HTML-escaped) because it may contain resolved
 * token spans (e.g. <span class="token-ref">…</span>).
 */
export function renderClauseBodyToHtml(nodes: ClauseNode[]): string {
  return nodes
    .map((node) => {
      if (node.number !== undefined) {
        // dotLevel: "8.1" → 1, "8.3.1" → 2, "13.3.1.4.1" → 4
        const dotLevel = node.number.split(".").length - 1
        // data-depth drives padding-left; 0 = first sub-level
        const dataDepth = Math.max(0, dotLevel - 1)
        return `<p class="clause-para" data-depth="${dataDepth}"><span class="clause-number">${node.number}</span><span class="clause-text">${node.text}</span></p>`
      } else if (node.isIntro) {
        // Unnumbered intro (first line ending with "–" or "-")
        return `<p class="clause-para clause-intro">${node.text}</p>`
      } else {
        // Single-para clause (no sub-numbering)
        return `<p class="clause-para">${node.text}</p>`
      }
    })
    .join("\n")
}
