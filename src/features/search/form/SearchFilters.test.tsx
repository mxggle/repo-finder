import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { SearchForm } from './SearchForm'

/** Stands in for the URL: a search replaces the query the form follows. */
function Harness({ initial, searches }: { initial: string; searches: string[] }) {
  const [query, setQuery] = useState(initial)
  return (
    <SearchForm
      query={query}
      onSearch={(next) => {
        searches.push(next)
        setQuery(next)
      }}
    />
  )
}

function setup(initial = '') {
  const searches: string[] = []
  const user = userEvent.setup()
  render(<Harness initial={initial} searches={searches} />)
  const input = screen.getByRole<HTMLInputElement>('combobox', { name: 'Search repositories' })
  return { user, searches, input, filters: screen.getByRole('group', { name: 'Filters' }) }
}

const language = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Language' })
const status = () => document.querySelector<HTMLElement>('.search-filters__status[aria-live="polite"]')!

describe('SearchFilters', () => {
  it('shows the supported qualifiers typed into the search as filters', async () => {
    const { user, input, filters } = setup()

    await user.type(input, 'react language:typescript stars:>100 archived:false topic:cli')

    expect(language()).toHaveValue('TypeScript')
    expect(within(filters).getByRole('textbox', { name: 'Stars more than' })).toHaveValue('100')
    expect(within(filters).getByRole('checkbox', { name: 'Exclude archived' })).toBeChecked()
    expect(within(filters).getByRole('button', { name: 'Remove language filter TypeScript' })).toBeInTheDocument()
    expect(within(filters).getByRole('button', { name: 'Remove stars filter more than 100' })).toBeInTheDocument()
    // Unknown qualifiers get no control.
    expect(within(filters).queryByText(/topic/)).not.toBeInTheDocument()
  })

  it('rewrites only the language token and leaves searching to the Search button', async () => {
    const { user, input, searches } = setup('react  language:go   topic:cli -language:rust')

    await user.selectOptions(language(), 'Jupyter Notebook')

    expect(input).toHaveValue('react  language:"jupyter notebook"   topic:cli -language:rust')
    expect(searches).toEqual([])
    expect(status()).toHaveTextContent('Language filter set to Jupyter Notebook. Press Search to apply.')

    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(searches).toEqual(['react  language:"jupyter notebook"   topic:cli -language:rust'])
    expect(status()).toBeEmptyDOMElement()
  })

  it('adds a language to a query without one', async () => {
    const { user, input } = setup('react')
    await user.selectOptions(language(), 'C++')
    expect(input).toHaveValue('react language:c++')
    await user.selectOptions(language(), '')
    expect(input).toHaveValue('react')
  })

  it('removes a chip, keeps the rest of the text, and moves focus to its control', async () => {
    const { user, input } = setup('user:octo language:typescript NOT topic:x')

    await user.click(screen.getByRole('button', { name: 'Remove language filter TypeScript' }))

    expect(input).toHaveValue('user:octo NOT topic:x')
    expect(language()).toHaveValue('')
    expect(language()).toHaveFocus()
    expect(status()).toHaveTextContent('Language filter removed. Press Search to apply.')
  })

  it('applies minimum stars on blur and searches once on Enter', async () => {
    const { user, input, searches } = setup('react stars:>100 topic:cli')
    const stars = screen.getByRole('textbox', { name: 'Stars more than' })

    await user.clear(stars)
    await user.type(stars, '250')
    // Typing a number does not rewrite the text on every keystroke.
    expect(input).toHaveValue('react stars:>100 topic:cli')
    await user.tab()
    expect(input).toHaveValue('react stars:>250 topic:cli')
    expect(searches).toEqual([])

    await user.clear(stars)
    await user.type(stars, '500{Enter}')
    expect(input).toHaveValue('react stars:>500 topic:cli')
    expect(searches).toEqual(['react stars:>500 topic:cli'])
  })

  it('writes a new minimum as >= and removes it when the field is cleared', async () => {
    const { user, input } = setup('react')
    const stars = screen.getByRole('textbox', { name: 'Minimum stars' })

    await user.type(stars, '1,000')
    await user.tab()
    expect(input).toHaveValue('react stars:>=1000')
    expect(stars).toHaveValue('1000')

    await user.clear(screen.getByRole('textbox', { name: 'Minimum stars' }))
    await user.tab()
    expect(input).toHaveValue('react')
  })

  it('leaves an unfinished stars qualifier alone when the field is only passed through', async () => {
    const { user, input, searches } = setup('react stars:>')
    const stars = screen.getByRole('textbox', { name: 'Minimum stars' })

    await user.click(stars)
    await user.tab()
    expect(input).toHaveValue('react stars:>')
    expect(status()).toBeEmptyDOMElement()

    // Enter on the untouched field still searches the text as it stands.
    await user.type(stars, '{Enter}')
    expect(searches).toEqual(['react stars:>'])
  })

  it('accepts full-width digits from an IME', async () => {
    const { user, input } = setup('react')
    await user.type(screen.getByRole('textbox', { name: 'Minimum stars' }), '１００')
    await user.tab()
    expect(input).toHaveValue('react stars:>=100')
  })

  it('rejects a minimum that is not a whole number without touching the text', async () => {
    const { user, input, searches } = setup('react stars:>=5')
    const stars = screen.getByRole('textbox', { name: 'Minimum stars' })

    await user.clear(stars)
    await user.type(stars, 'lots{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('whole number')
    expect(stars).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveValue('react stars:>=5')
    expect(searches).toEqual([])
  })

  it('does not submit from the Enter that confirms an IME conversion in the stars field', () => {
    const { searches } = setup('react')
    const stars = screen.getByRole('textbox', { name: 'Minimum stars' })
    fireEvent.change(stars, { target: { value: '１０' } })
    fireEvent.keyDown(stars, { key: 'Enter', keyCode: 229 })
    fireEvent.keyDown(stars, { key: 'Enter', keyCode: 13, isComposing: true })
    expect(searches).toEqual([])
  })

  it('shows other star forms as read-only chips that can be removed', async () => {
    const { user, input } = setup('react stars:10..100 cli')

    expect(screen.queryByRole('textbox', { name: /stars/i })).not.toBeInTheDocument()
    expect(screen.getByText('10–100')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove stars filter 10 to 100' }))

    expect(input).toHaveValue('react cli')
    expect(screen.getByRole('textbox', { name: 'Minimum stars' })).toHaveFocus()
  })

  it('offers to remove a malformed value but never edits it', async () => {
    const { user, input } = setup('react stars:>abc')

    expect(screen.getByText('not understood')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove invalid stars filter stars:>abc' }))

    expect(input).toHaveValue('react')
    expect(screen.getByRole('textbox', { name: 'Minimum stars' })).toHaveFocus()
  })

  it('locks duplicated or combined qualifiers and leaves their text alone', () => {
    setup('language:go language:rust topic:a OR stars:>5')

    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument()
    expect(screen.getByText(/appears more than once/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /stars/i })).not.toBeInTheDocument()
    expect(screen.getByText(/combined with AND, OR or brackets/)).toBeInTheDocument()
  })

  it('toggles archived:false and shows archived:true as a removable chip', async () => {
    const { user, input } = setup('react')
    const toggle = screen.getByRole('checkbox', { name: 'Exclude archived' })

    await user.click(toggle)
    expect(input).toHaveValue('react archived:false')
    await user.click(toggle)
    expect(input).toHaveValue('react')

    await user.clear(input)
    await user.type(input, 'react archived:true')
    expect(screen.queryByRole('checkbox', { name: 'Exclude archived' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove archived filter archived only' }))
    expect(input).toHaveValue('react')
    expect(screen.getByRole('checkbox', { name: 'Exclude archived' })).toHaveFocus()
  })

  it('does not rewrite the text while an IME composition is active', () => {
    const { input } = setup('react')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: 'react にほん' } })

    fireEvent.change(language(), { target: { value: 'Go' } })
    expect(input).toHaveValue('react にほん')

    fireEvent.compositionEnd(input)
    fireEvent.change(language(), { target: { value: 'Go' } })
    expect(input).toHaveValue('react にほん language:go')
  })

  it('follows the query when the URL changes underneath the form', () => {
    const { rerender } = render(<SearchForm query="language:go stars:>=10" onSearch={() => {}} />)
    expect(language()).toHaveValue('Go')

    rerender(<SearchForm query="language:rust stars:>=20" onSearch={() => {}} />)

    expect(language()).toHaveValue('Rust')
    expect(screen.getByRole('textbox', { name: 'Minimum stars' })).toHaveValue('20')
  })

  it('stays in step with a value picked from the qualifier suggestions', async () => {
    const { user, input } = setup()
    await user.type(input, 'cli language:ru{ArrowDown}{Enter}')
    expect(input).toHaveValue('cli language:rust ')
    expect(language()).toHaveValue('Rust')
  })
})
