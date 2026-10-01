import { describe, expect, it } from 'vitest'
import { applySuggestion, suggest, termAt } from './qualifiers'

const labels = (value: string, caret = value.length) => suggest(value, caret).suggestions.map(({ label }) => label)

describe('termAt', () => {
  it('finds the whitespace-separated term around the caret', () => {
    expect(termAt('react stars:>10 vite', 9)).toEqual({ start: 6, end: 15, text: 'stars:>10' })
    expect(termAt('react ', 6)).toEqual({ start: 6, end: 6, text: '' })
  })
})

describe('suggest', () => {
  it('lists every qualifier in an empty query', () => {
    expect(labels('')).toEqual(['language:', 'stars:', 'topic:'])
  })

  it('stays quiet between plain words', () => {
    expect(labels('react ')).toEqual([])
    expect(labels('react vite', 3)).toEqual([])
  })

  it('completes a qualifier name as it is typed', () => {
    expect(labels('react s')).toEqual(['stars:'])
    expect(labels('react LANG')).toEqual(['language:'])
    expect(labels('state')).toEqual([])
  })

  it('offers values once the colon is in, filtered by what follows it', () => {
    expect(labels('stars:')).toEqual(['>100', '>1000', '>10000', '100..1000'])
    expect(labels('language:ja')).toEqual(['JavaScript', 'Java'])
    expect(labels('language:jupyter')).toEqual(['Jupyter Notebook'])
  })

  it('drops a value that is already typed out in full', () => {
    expect(labels('language:rust')).toEqual([])
  })

  it('caps the list', () => {
    expect(labels('language:')).toHaveLength(8)
  })

  it('ignores unknown qualifiers', () => {
    expect(labels('user:')).toEqual([])
  })

  it('keeps negation and quotes multi-word values', () => {
    const [js] = suggest('-language:javas', 15).suggestions
    expect(js).toMatchObject({ insert: '-language:javascript', color: expect.any(String) })
    expect(suggest('language:jup', 12).suggestions[0].insert).toBe('language:"jupyter notebook"')
  })
})

describe('applySuggestion', () => {
  it('keeps the caret after the colon of a bare qualifier', () => {
    expect(applySuggestion('react s', termAt('react s', 7), 'stars:')).toEqual({ value: 'react stars:', caret: 12 })
  })

  it('follows a finished qualifier with a space and leaves the rest intact', () => {
    expect(applySuggestion('language:ru vite', termAt('language:ru vite', 11), 'language:rust')).toEqual({
      value: 'language:rust vite',
      caret: 14,
    })
    expect(applySuggestion('stars:', termAt('stars:', 6), 'stars:>100')).toEqual({ value: 'stars:>100 ', caret: 11 })
  })
})
