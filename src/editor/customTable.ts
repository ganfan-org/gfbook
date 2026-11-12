import { Table } from '@tiptap/extension-table'

// Split inline content into text + hardBreak sequences for table cells
// Handles \x1f (legacy format) and <br> separators
function parseTableCellInline(tokens: any[], h: any) {
  const inline = h.parseInline(tokens)
  const result: any[] = []
  for (const node of inline) {
    if (node.type === 'text' && node.text) {
      // Split by \x1f (legacy) or <br>
      const parts = node.text.split(/[\x1f]|<br\s*\/?>/gi)
      if (parts.length > 1) {
        parts.forEach((part: string, i: number) => {
          if (i > 0) result.push({ type: 'hardBreak' })
          if (part) result.push({ ...node, text: part })
        })
      } else {
        result.push(node)
      }
    } else {
      result.push(node)
    }
  }
  return result
}

const originalTableRender = (Table.config as any).renderMarkdown as any

export const CustomTable = Table.extend({
  parseMarkdown(token: any, h: any) {
    const rows: any[] = []
    const alignments = Array.isArray(token.align) ? token.align : []
    if (token.header) {
      const headerCells: any[] = []
      token.header.forEach((cell: any, index: number) => {
        const align = cell.align || alignments[index]
        const attrs = align ? { align } : {}
        headerCells.push(
          h.createNode('tableHeader', attrs, [
            {
              type: 'paragraph',
              content: parseTableCellInline(cell.tokens, h),
            },
          ]),
        )
      })
      rows.push(h.createNode('tableRow', {}, headerCells))
    }
    if (token.rows) {
      token.rows.forEach((row: any) => {
        const bodyCells: any[] = []
        row.forEach((cell: any, index: number) => {
          const align = cell.align || alignments[index]
          const attrs = align ? { align } : {}
          bodyCells.push(
            h.createNode('tableCell', attrs, [
              {
                type: 'paragraph',
                content: parseTableCellInline(cell.tokens, h),
              },
            ]),
          )
        })
        rows.push(h.createNode('tableRow', {}, bodyCells))
      })
    }
    return h.createNode('table', undefined, rows)
  },
  renderMarkdown(node: any, h: any, ctx?: any) {
    if (!originalTableRender) return ''
    return originalTableRender(node, h, ctx)
      .replace(/\x1f/g, '<br>')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
  },
})
