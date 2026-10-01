export type PageItem = { type: 'page'; page: number } | { type: 'gap'; key: string }

/**
 * Page links to show: always the first and last page, plus a window around the
 * current page. A gap that would hide a single page shows that page instead.
 */
export function pageItems(current: number, last: number, siblings = 1): PageItem[] {
  const pages = new Set<number>([1, last])
  for (let page = current - siblings; page <= current + siblings; page++) {
    if (page >= 1 && page <= last) pages.add(page)
  }
  const sorted = [...pages].sort((a, b) => a - b)

  const items: PageItem[] = []
  let previous = 0
  for (const page of sorted) {
    if (page - previous === 2) items.push({ type: 'page', page: previous + 1 })
    else if (page - previous > 2) items.push({ type: 'gap', key: `gap-${previous}` })
    items.push({ type: 'page', page })
    previous = page
  }
  return items
}
