import type { ClauseNode } from "./parseClauseBody"

/**
 * Renders parsed ClauseNodes to HTML string.
 *
 * Each numbered node becomes a <p class="clause-para" data-depth="N"> with a
 * <span class="clause-number"> prefix. CSS handles depth-based indentation and
 * hanging indent via padding-left + negative text-indent.
 *
 * node.text is used as-is (not HTML-escaped) because it may contain resolved
 * token spans (e.g. <span class="token-ref">…</span>).
 */
export function renderClauseBodyToHtml(nodes: ClauseNode[]): string {
  return nodes
    .map((node) => {
      if (node.number !== undefined) {
        // dotLevel: "8.1" → 1, "8.3.1" → 2
        const dotLevel = node.number.split(".").length - 1
        // data-depth: 0 for first sub-level, 1 for second, etc.
        const dataDepth = Math.max(0, dotLevel - 1)
        return `<p class="clause-para" data-depth="${dataDepth}"><span class="clause-number">${node.number}</span> ${node.text}</p>`
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
