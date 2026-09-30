import { describe, expect, it } from 'vitest'
import { pageItems } from './pagination'

const render = (current: number, last: number) =>
  pageItems(current, last)
    .map((item) => (item.type === 'gap' ? '…' : String(item.page)))
    .join(' ')

describe('pageItems', () => {
  it('lists every page when there are few', () => {
    expect(render(1, 1)).toBe('1')
    expect(render(2, 4)).toBe('1 2 3 4')
  })

  it('keeps first, last and neighbours of the current page', () => {
    expect(render(1, 50)).toBe('1 2 … 50')
    expect(render(25, 50)).toBe('1 … 24 25 26 … 50')
    expect(render(50, 50)).toBe('1 … 49 50')
  })

  it('shows a single hidden page instead of a gap', () => {
    expect(render(4, 50)).toBe('1 2 3 4 5 … 50')
  })
})
