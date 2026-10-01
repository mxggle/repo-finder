import { languageColor } from '../../../shared/lib/languageColors'

export type Suggestion = {
  label: string
  /** Replaces the term at the caret. Ends in ":" for a qualifier still waiting for its value. */
  insert: string
  description?: string
  /** Language dot colour. */
  color?: string
}

type Qualifier = {
  token: string
  description: string
  values: { value: string; description?: string }[]
}

// Most used first, so an empty `language:` offers the likeliest picks. The filter picker reuses it.
export const LANGUAGES = [
  'TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C++', 'C#', 'C', 'PHP', 'Ruby', 'Kotlin',
  'Swift', 'Dart', 'Shell', 'Scala', 'Elixir', 'Lua', 'Zig', 'Vue', 'HTML', 'CSS', 'Jupyter Notebook',
]

const QUALIFIERS: Qualifier[] = [
  {
    token: 'language:',
    description: 'Written in a language',
    values: LANGUAGES.map((value) => ({ value })),
  },
  {
    token: 'stars:',
    description: 'Number of stars',
    values: [
      { value: '>100', description: 'More than 100' },
      { value: '>1000', description: 'More than 1,000' },
      { value: '>10000', description: 'More than 10,000' },
      { value: '100..1000', description: 'Between 100 and 1,000' },
    ],
  },
  {
    token: 'topic:',
    description: 'Tagged with a topic',
    values: ['cli', 'react', 'machine-learning', 'llm', 'api', 'game-engine'].map((value) => ({ value })),
  },
]

const MAX_SUGGESTIONS = 8

/** The whitespace-separated term around `caret`; suggestions replace exactly this range. */
export type Term = { start: number; end: number; text: string }

export function termAt(value: string, caret: number): Term {
  const start = value.slice(0, caret).search(/\S*$/)
  const rest = value.slice(caret).search(/\s/)
  const end = rest === -1 ? value.length : caret + rest
  return { start, end, text: value.slice(start, end) }
}

/**
 * Suggestions for the term at the caret: qualifier names while one is being typed (all of
 * them in an empty query), then values once its colon is in. Other terms get none.
 */
export function suggest(value: string, caret: number): { term: Term; suggestions: Suggestion[] } {
  const term = termAt(value, caret)
  return { term, suggestions: suggestionsFor(term.text, value.trim() === '').slice(0, MAX_SUGGESTIONS) }
}

function suggestionsFor(text: string, queryIsEmpty: boolean): Suggestion[] {
  // A leading "-" negates a qualifier in GitHub search; keep it on whatever is inserted.
  const name = /^(-?)([a-z]*)$/i.exec(text)
  if (name) {
    const [, negation, typed] = name
    if (!typed && !queryIsEmpty) return []
    return QUALIFIERS.filter(({ token }) => token.startsWith(typed.toLowerCase())).map(({ token, description }) => ({
      label: token,
      insert: negation + token,
      description,
    }))
  }

  const withValue = /^(-?)([a-z]+:)(.*)$/i.exec(text)
  const qualifier = QUALIFIERS.find(({ token }) => token === withValue?.[2].toLowerCase())
  if (!withValue || !qualifier) return []
  const [, negation, , typed] = withValue
  const needle = typed.replace(/^"/, '').toLowerCase()
  return qualifier.values
    .filter(({ value }) => value.toLowerCase().startsWith(needle) && value.toLowerCase() !== needle)
    .map(({ value, description }) => ({
      label: value,
      insert: negation + qualifier.token + (/\s/.test(value) ? `"${value.toLowerCase()}"` : value.toLowerCase()),
      description,
      color: qualifier.token === 'language:' ? languageColor(value) : undefined,
    }))
}

/**
 * Replaces `term` with the suggestion. A finished qualifier is followed by a space so the
 * caret is ready for the next term; a bare qualifier name keeps the caret after its colon.
 */
export function applySuggestion(value: string, term: Term, insert: string) {
  const complete = !insert.endsWith(':')
  const after = value.slice(term.end)
  const head = value.slice(0, term.start) + insert
  if (!complete) return { value: head + after, caret: head.length }
  const spaced = /^\s/.test(after) ? after : ` ${after}`
  return { value: head + spaced, caret: head.length + 1 }
}
