import type { MouseEvent } from 'react'
import { isPlainClick } from '../lib/links'
import { pageItems } from '../lib/pagination'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

type Props = {
  current: number
  last: number
  hrefFor: (page: number) => string
  onChange: (page: number) => void
}

export function Pagination({ current, last, hrefFor, onChange }: Props) {
  if (last <= 1) return null

  function link(page: number) {
    return {
      href: hrefFor(page),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!isPlainClick(event)) return
        event.preventDefault()
        onChange(page)
      },
    }
  }

  return (
    <nav className="pagination" aria-label="Pagination">
      {current > 1 ? (
        <a className="pagination__step" rel="prev" {...link(current - 1)}>
          <ChevronLeftIcon />
          Previous
        </a>
      ) : (
        <span className="pagination__step" aria-disabled="true">
          <ChevronLeftIcon />
          Previous
        </span>
      )}

      <ol className="pagination__pages">
        {pageItems(current, last).map((item) =>
          item.type === 'gap' ? (
            <li key={item.key} className="pagination__gap" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item.page}>
              {item.page === current ? (
                <a className="pagination__page" aria-current="page" aria-label={`Page ${item.page}`} {...link(item.page)}>
                  {item.page}
                </a>
              ) : (
                <a className="pagination__page" aria-label={`Page ${item.page}`} {...link(item.page)}>
                  {item.page}
                </a>
              )}
            </li>
          ),
        )}
      </ol>

      <p className="pagination__compact">
        Page {current} of {last}
      </p>

      {current < last ? (
        <a className="pagination__step" rel="next" {...link(current + 1)}>
          Next
          <ChevronRightIcon />
        </a>
      ) : (
        <span className="pagination__step" aria-disabled="true">
          Next
          <ChevronRightIcon />
        </span>
      )}
    </nav>
  )
}
