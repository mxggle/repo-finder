import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { SearchForm } from './SearchForm'

const HINT = 'Enter a keyword to search.'

describe('SearchForm empty-query hint', () => {
  it('goes away when typing', async () => {
    const user = userEvent.setup()
    render(<SearchForm query="" onSearch={() => {}} />)
    const input = screen.getByRole('combobox', { name: 'Search repositories' })

    await user.type(input, '{Enter}')
    expect(screen.getByText(HINT)).toBeInTheDocument()

    await user.type(input, 'language:rust stars:>5000')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('goes away when the query changes from outside, e.g. a recent search or back/forward', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<SearchForm query="" onSearch={() => {}} />)
    await user.type(screen.getByRole('combobox', { name: 'Search repositories' }), '{Enter}')
    expect(screen.getByText(HINT)).toBeInTheDocument()

    rerender(<SearchForm query="language:rust stars:>5000" onSearch={() => {}} />)

    expect(screen.getByRole('combobox', { name: 'Search repositories' })).toHaveValue('language:rust stars:>5000')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('goes away when a filter fills in the query', async () => {
    const user = userEvent.setup()
    render(<SearchForm query="" onSearch={() => {}} />)
    await user.type(screen.getByRole('combobox', { name: 'Search repositories' }), '{Enter}')
    expect(screen.getByText(HINT)).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Language' }), 'Rust')

    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })
})
