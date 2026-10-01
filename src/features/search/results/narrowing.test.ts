import { describe, expect, it } from 'vitest'
import { makeRepository } from '../../../test/fixtures'
import { narrowingSuggestions } from './narrowing'

const repos = (...languages: (string | null)[]) => languages.map((language, index) => makeRepository(index + 1, { language }))

describe('narrowingSuggestions', () => {
  it('suggests the most common result languages, then stars and archived filters', () => {
    const items = repos('Python', 'Rust', 'Rust', null, 'Go', 'Python', 'Rust', 'C')
    expect(narrowingSuggestions('stars:<200', items)).toEqual([
      { token: 'language:rust', query: 'stars:<200 language:rust' },
      { token: 'language:python', query: 'stars:<200 language:python' },
      { token: 'language:go', query: 'stars:<200 language:go' },
      { token: 'archived:false', query: 'stars:<200 archived:false' },
    ])
  })

  it('quotes multi-word languages and suggests a minimum star count when stars are unset', () => {
    expect(narrowingSuggestions('notebook', repos('Jupyter Notebook')).map(({ token }) => token)).toEqual([
      'language:"jupyter notebook"',
      'stars:>=100',
      'archived:false',
    ])
  })

  it('leaves filters that are already set or locked alone', () => {
    expect(narrowingSuggestions('language:go stars:>10 archived:true', repos('Go'))).toEqual([])
    expect(narrowingSuggestions('(stars:>1 OR stars:<0) archived:false', repos())).toEqual([])
  })

  it('keeps the query text verbatim, including trailing whitespace', () => {
    expect(narrowingSuggestions('react  ', [])[0]).toEqual({ token: 'stars:>=100', query: 'react  stars:>=100' })
  })
})
