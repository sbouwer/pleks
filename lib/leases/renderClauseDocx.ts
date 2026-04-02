import type { ClauseNode } from "./parseClauseBody"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DocxClass = new (options: any) => any

interface DocxImports {
  Paragraph: DocxClass
  TextRun: DocxClass
  AlignmentType: { JUSTIFIED: string }
}

/**
 * Renders parsed ClauseNodes into DOCX Paragraph objects with:
 * - Justified alignment
 * - Depth-based indentation (left = dotLevel × 720 twips, capped at depth 3)
 * - Hanging indent (720 twips) so the number hangs at the left edge
 * - Explicit text numbering (no Word auto-numbering)
 */
export function renderClauseBodyToDocx(
  nodes: ClauseNode[],
  { Paragraph, TextRun, AlignmentType }: DocxImports
): unknown[] {
  return nodes.map((node) => {
    const isNumbered = node.number !== undefined

    let left = 0
    let hanging = 0

    if (isNumbered) {
      // dotLevel: "8.1" → 1, "8.3.1" → 2, "8.3.2.1" → 3
      const dotLevel = node.number!.split(".").length - 1
      left = Math.min(dotLevel, 3) * 720
      hanging = 720
    }

    const children: unknown[] = []

    if (isNumbered) {
      children.push(
        new TextRun({
          text: `${node.number}  `,
          bold: false,
          size: 22,
          font: "Calibri",
        })
      )
    }

    children.push(
      new TextRun({
        text: node.text,
        size: 22,
        font: "Calibri",
      })
    )

    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 120 },
      indent: { left, hanging },
      children,
    })
  })
}
