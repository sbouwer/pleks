export interface ClauseNode {
  text: string
  depth: number        // 0 = top-level (or unnumbered intro), 1 = sub-clause, 2 = sub-sub-clause
  children: ClauseNode[]
  isIntro: boolean     // true if this line introduces children (ends with " –" or " -")
  number?: string      // e.g. "8.1", "15.3.2" — undefined for unnumbered intros and single-para clauses
}

interface DepthFrame {
  counter: number
  parentNum: string
  inSiblingBlock: boolean
}

/**
 * Parses a clause body template into a flat array of numbered ClauseNodes.
 *
 * Detection rules:
 * - Line ending with " –" or " -"  →  introduces children at next depth
 * - Lines ending with ";"           →  siblings at current depth
 * - Line ending with "." after ";" siblings  →  last sibling, closes the block
 * - Otherwise                       →  standalone paragraph at current depth
 *
 * Numbering:
 * - If the clause body is a single paragraph: no sub-number assigned.
 * - If the FIRST line is an intro (ends with " –"):
 *     that intro is UNNUMBERED; its children use the top-level counter
 *     (e.g. clause 8 → children become 8.1, 8.2 … not 8.1.1).
 * - Any intro that appears WITHIN a numbered sequence is itself numbered,
 *     and its children sub-number under it (e.g. 15.3 → 15.3.1, 15.3.2).
 */
export function parseClauseBody(body: string, clauseNum: number): ClauseNode[] {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)

  if (lines.length === 0) return []

  // Single paragraph → no sub-numbering
  if (lines.length === 1) {
    return [{ text: lines[0], depth: 0, children: [], isIntro: false, number: undefined }]
  }

  const nodes: ClauseNode[] = []

  // topCounter counts items at the "base" level (always uses clauseNum prefix)
  let topCounter = 0

  // baseDepth = 1 when the first line was an unnumbered intro (children sit at depth=1
  // but are numbered at the top-level counter)
  let baseDepth = 0
  let topIntroUnnumbered = false

  // Stack of frames for numbered intro nesting
  // stack[0] is the implicit top frame; we never pop it
  const stack: DepthFrame[] = [{ counter: 0, parentNum: String(clauseNum), inSiblingBlock: false }]

  function currentFrame(): DepthFrame {
    return stack[stack.length - 1]
  }

  function currentDepth(): number {
    return baseDepth + (stack.length - 1)
  }

  function nextNum(): string {
    if (stack.length === 1) {
      // Base frame: always uses top-level counter
      topCounter++
      return `${clauseNum}.${topCounter}`
    }
    const frame = currentFrame()
    frame.counter++
    return `${frame.parentNum}.${frame.counter}`
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isIntroLine = line.endsWith(" \u2013") || line.endsWith(" -") || line.endsWith(" \u2014")
    const endsWithSemicolon = line.endsWith(";")

    // Special case: very first line is an intro → unnumbered top-level intro
    if (i === 0 && isIntroLine) {
      topIntroUnnumbered = true
      baseDepth = 1
      nodes.push({ text: line, depth: 0, children: [], isIntro: true, number: undefined })
      continue
    }

    const depth = currentDepth()
    const frame = currentFrame()

    if (isIntroLine) {
      // Numbered intro — gets a number; children sub-number under it
      frame.inSiblingBlock = false
      const num = nextNum()
      nodes.push({ text: line, depth, children: [], isIntro: true, number: num })
      stack.push({ counter: 0, parentNum: num, inSiblingBlock: false })
    } else if (endsWithSemicolon) {
      // Sibling item (not the last in the block)
      const num = nextNum()
      frame.inSiblingBlock = true
      nodes.push({ text: line, depth, children: [], isIntro: false, number: num })
    } else {
      // Standalone paragraph OR last sibling (ends with "." after ";" siblings)
      const wasSiblingBlock = frame.inSiblingBlock
      frame.inSiblingBlock = false
      const num = nextNum()
      nodes.push({ text: line, depth, children: [], isIntro: false, number: num })

      // Close the depth level when this is the last sibling inside a nested intro block
      if (wasSiblingBlock && stack.length > 1) {
        stack.pop()
      }
    }
  }

  return nodes
}

/**
 * Builds a lookup from {{self:N}} index to the actual assigned sub-clause number.
 * N is 0-indexed over all numbered nodes in document order.
 *
 * Example: clause 14 with 10 numbered items →
 *   selfLookup["0"] = "14.1", selfLookup["7"] = "14.8", etc.
 */
export function buildSelfLookup(nodes: ClauseNode[]): Record<string, string> {
  const lookup: Record<string, string> = {}
  let idx = 0
  for (const node of nodes) {
    if (node.number !== undefined) {
      lookup[String(idx)] = node.number
      idx++
    }
  }
  return lookup
}
