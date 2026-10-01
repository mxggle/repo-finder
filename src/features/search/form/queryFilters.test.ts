import { describe, expect, it } from 'vitest'
import {
  describeStars,
  formatStars,
  parseFilters,
  parseStars,
  removeToken,
  setExcludeArchived,
  setLanguage,
  setMinStars,
  tokenize,
  type FilterSlot,
} from './queryFilters'

const LANGUAGES = ['TypeScript', 'C++', 'C#', 'Jupyter Notebook', 'Go']

/** A slot without token offsets, for readable expectations. */
function summary<T>(slot: FilterSlot<T>) {
  if (slot.status === 'set') return { status: 'set', value: slot.value, text: slot.token.text }
  if (slot.status === 'empty' || slot.status === 'invalid') return { status: slot.status, text: slot.token.text }
  if (slot.status === 'locked') return { status: 'locked', reason: slot.reason, texts: slot.tokens.map(({ text }) => text) }
  return { status: 'absent' }
}

const filters = (query: string) => {
  const parsed = parseFilters(query, LANGUAGES)
  return { language: summary(parsed.language), stars: summary(parsed.stars), archived: summary(parsed.archived) }
}

describe('tokenize', () => {
  it.each([
    ['', []],
    ['   ', []],
    ['react', ['react']],
    ['  react   vite ', ['react', 'vite']],
    ['language:"jupyter notebook" cli', ['language:"jupyter notebook"', 'cli']],
    ['"exact phrase" x', ['"exact phrase"', 'x']],
    ['a"b c"d e', ['a"b c"d', 'e']],
    // An unclosed quote is literal and does not swallow the rest of the query.
    ['language:"c++ react', ['language:"c++', 'react']],
    ['react\tstars:>1\nvite', ['react', 'stars:>1', 'vite']],
  ])('%j → %j', (query, texts) => {
    expect(tokenize(query).map(({ text }) => text)).toEqual(texts)
  })

  it('reports offsets into the original string', () => {
    const query = ' ab  "c d" '
    for (const token of tokenize(query)) expect(query.slice(token.start, token.end)).toBe(token.text)
  })
})

describe('parseStars', () => {
  it.each([
    ['100', { op: '=', value: 100 }],
    ['>100', { op: '>', value: 100 }],
    ['>=100', { op: '>=', value: 100 }],
    ['<50', { op: '<', value: 50 }],
    ['<=50', { op: '<=', value: 50 }],
    ['10..100', { op: '..', min: 10, max: 100 }],
    ['10..*', { op: '..', min: 10, max: null }],
    ['*..100', { op: '..', min: null, max: 100 }],
    ['0', { op: '=', value: 0 }],
  ])('%s', (value, range) => {
    expect(parseStars(value)).toEqual(range)
  })

  it.each(['>abc', '', '>', '1k', '1,000', '-5', '>=-1', '*..*', '10..', '..10', '1.5', '99999999999999999999'])(
    'rejects %j',
    (value) => {
      expect(parseStars(value)).toBeNull()
    },
  )
})

describe('parseFilters', () => {
  it('reads the supported qualifiers and ignores everything else', () => {
    expect(filters('react language:typescript stars:>100 archived:false topic:cli')).toEqual({
      language: { status: 'set', value: { label: 'TypeScript', raw: 'typescript' }, text: 'language:typescript' },
      stars: { status: 'set', value: { op: '>', value: 100 }, text: 'stars:>100' },
      archived: { status: 'set', value: false, text: 'archived:false' },
    })
    expect(filters('react topic:cli user:octo in:name')).toEqual({
      language: { status: 'absent' },
      stars: { status: 'absent' },
      archived: { status: 'absent' },
    })
  })

  it.each([
    ['language:"c++"', { label: 'C++', raw: 'c++' }],
    ['language:c#', { label: 'C#', raw: 'c#' }],
    ['language:"jupyter notebook"', { label: 'Jupyter Notebook', raw: 'jupyter notebook' }],
    ['Language:GO', { label: 'Go', raw: 'GO' }],
    // Unknown languages keep the spelling from the query.
    ['language:Haskell', { label: 'Haskell', raw: 'Haskell' }],
  ])('language value in %s', (query, value) => {
    expect(filters(query).language).toMatchObject({ status: 'set', value })
  })

  it('treats qualifier names and boolean values case-insensitively', () => {
    expect(filters('STARS:>=5 Archived:TRUE').stars).toMatchObject({ status: 'set', value: { op: '>=', value: 5 } })
    expect(filters('STARS:>=5 Archived:TRUE').archived).toMatchObject({ status: 'set', value: true })
  })

  it.each([
    ['stars:>abc', 'stars', 'stars:>abc'],
    ['stars:1k', 'stars', 'stars:1k'],
    ['archived:maybe', 'archived', 'archived:maybe'],
    ['language:"c++', 'language', 'language:"c++'],
    ['language:""', 'language', 'language:""'],
  ] as const)('marks the malformed value in %s as invalid', (query, kind, text) => {
    expect(filters(query)[kind]).toEqual({ status: 'invalid', text })
  })

  it('reports a qualifier that is still waiting for its value as empty', () => {
    expect(filters('react language:').language).toEqual({ status: 'empty', text: 'language:' })
    expect(filters('stars:').stars).toEqual({ status: 'empty', text: 'stars:' })
    // A comparison or range whose number is not typed yet is unfinished, not invalid.
    expect(filters('stars:>').stars).toEqual({ status: 'empty', text: 'stars:>' })
    expect(filters('stars:<=').stars).toEqual({ status: 'empty', text: 'stars:<=' })
    expect(filters('stars:10..').stars).toEqual({ status: 'empty', text: 'stars:10..' })
  })

  it('locks duplicates instead of guessing which one to edit', () => {
    expect(filters('language:go language:rust').language).toEqual({
      status: 'locked',
      reason: 'duplicate',
      texts: ['language:go', 'language:rust'],
    })
    expect(filters('stars:>10 stars:<100').stars).toMatchObject({ status: 'locked', reason: 'duplicate' })
    // An unfinished second qualifier still counts.
    expect(filters('language:go language:').language).toMatchObject({ status: 'locked', reason: 'duplicate' })
  })

  it('locks qualifiers combined with AND/OR or inside a group', () => {
    expect(filters('language:go OR language:rust').language).toMatchObject({ status: 'locked', reason: 'complex' })
    expect(filters('topic:cli OR language:go').language).toMatchObject({ status: 'locked', reason: 'complex' })
    expect(filters('language:go AND topic:cli').language).toMatchObject({ status: 'locked', reason: 'complex' })
    expect(filters('(language:go topic:cli)').language).toMatchObject({ status: 'locked', reason: 'complex' })
    expect(filters('(topic:cli stars:>10)').stars).toMatchObject({ status: 'locked', reason: 'complex' })
    expect(filters('topic:cli OR -language:go').language).toMatchObject({ status: 'locked', reason: 'complex' })
    // NOT belongs to the term after it.
    expect(filters('language:go NOT topic:x').language).toMatchObject({ status: 'set' })
    // Lower-case words are search terms, not operators.
    expect(filters('react or language:go').language).toMatchObject({ status: 'set' })
    // A group elsewhere does not affect a qualifier outside it.
    expect(filters('(topic:a OR topic:b) language:go').language).toMatchObject({ status: 'set' })
  })

  it('ignores negated qualifiers, which the controls do not represent', () => {
    expect(filters('-language:go').language).toEqual({ status: 'absent' })
    expect(filters('NOT language:go').language).toEqual({ status: 'absent' })
    expect(filters('-language:go language:rust').language).toMatchObject({
      status: 'set',
      value: { label: 'rust', raw: 'rust' },
    })
    expect(filters('-stars:>10 -archived:true')).toMatchObject({ stars: { status: 'absent' }, archived: { status: 'absent' } })
  })

  it('does not mistake look-alike terms for qualifiers', () => {
    expect(filters('languages:go mystars:>1 "language:go"')).toEqual({
      language: { status: 'absent' },
      stars: { status: 'absent' },
      archived: { status: 'absent' },
    })
  })
})

describe('removeToken', () => {
  const remove = (query: string, text: string) => {
    const token = tokenize(query).find((candidate) => candidate.text === text)!
    return removeToken(query, token)
  }

  it.each([
    ['a language:go b', 'language:go', 'a b'],
    ['a  language:go   b', 'language:go', 'a  b'],
    ['language:go b', 'language:go', 'b'],
    ['a language:go', 'language:go', 'a'],
    ['a language:go ', 'language:go', 'a '],
    ['language:go', 'language:go', ''],
  ])('%j without %s → %j', (query, text, expected) => {
    expect(remove(query, text)).toBe(expected)
  })
})

describe('no-op edits return the identical string', () => {
  it.each([
    'react',
    '  react   language:TypeScript  stars:>100   topic:cli ',
    'Language:"C++" in:name',
    'language:c# -language:go NOT user:x',
    'stars:>=5 archived:false',
    'stars:<50',
    'stars:10..100 archived:true',
    'language:go language:rust stars:>1 stars:>2',
    'topic:cli OR language:go',
    'stars:>abc archived:maybe language:"c++',
    'react language: stars:',
    '(language:go topic:cli) "exact phrase"',
  ])('%j', (query) => {
    const parsed = parseFilters(query, LANGUAGES)
    const language = parsed.language.status === 'set' ? parsed.language.value.label : null
    const stars = parsed.stars.status === 'set' && 'value' in parsed.stars.value ? parsed.stars.value.value : null
    const archived = parsed.archived.status === 'set' && parsed.archived.value === false

    if (parsed.language.status === 'set' || parsed.language.status === 'absent') expect(setLanguage(query, language)).toBe(query)
    if (parsed.stars.status === 'set' || parsed.stars.status === 'absent') expect(setMinStars(query, stars)).toBe(query)
    if (parsed.archived.status === 'set' || parsed.archived.status === 'absent') expect(setExcludeArchived(query, archived)).toBe(query)
    expect(parseFilters(query, LANGUAGES)).toEqual(parsed)
  })
})

describe('setLanguage', () => {
  it.each([
    // Replaces only the value, keeping order, spacing and unknown qualifiers.
    ['react  language:go   topic:cli -language:rust', 'TypeScript', 'react  language:typescript   topic:cli -language:rust'],
    // Keeps the qualifier's spelling and the user's quoting style.
    ['Language:"go" x', 'Rust', 'Language:"rust" x'],
    ['language:go', 'Jupyter Notebook', 'language:"jupyter notebook"'],
    ['language:go', 'C++', 'language:c++'],
    ['language:go', 'C#', 'language:c#'],
    // Appends a new qualifier after the free text.
    ['react', 'Go', 'react language:go'],
    ['react ', 'Go', 'react language:go'],
    ['', 'Go', 'language:go'],
    // Fills an unfinished qualifier in place.
    ['react language: cli', 'Go', 'react language:go cli'],
    // Replaces a malformed value.
    ['language:"c++ x', 'C++', 'language:c++ x'],
    // Same value, different case: nothing to do.
    ['react language:TypeScript', 'typescript', 'react language:TypeScript'],
  ])('%j set to %s → %j', (query, language, expected) => {
    expect(setLanguage(query, language)).toBe(expected)
  })

  it.each([
    ['react language:go topic:cli', 'react topic:cli'],
    ['react language:', 'react'],
    ['react -language:go', 'react -language:go'],
  ])('%j cleared → %j', (query, expected) => {
    expect(setLanguage(query, null)).toBe(expected)
  })

  it('leaves locked queries alone', () => {
    for (const query of ['language:go language:rust', 'topic:x OR language:go']) {
      expect(setLanguage(query, 'Rust')).toBe(query)
      expect(setLanguage(query, null)).toBe(query)
    }
  })
})

describe('setMinStars', () => {
  it.each([
    ['react stars:>100 topic:cli', 250, 'react stars:>250 topic:cli'],
    ['react STARS:>=100', 5, 'react STARS:>=5'],
    ['react', 100, 'react stars:>=100'],
    ['react stars: cli', 10, 'react stars:>=10 cli'],
    ['react stars:> cli', 10, 'react stars:>=10 cli'],
    ['react stars:>100', 0, 'react stars:>0'],
  ])('%j set to %d → %j', (query, min, expected) => {
    expect(setMinStars(query, min)).toBe(expected)
  })

  it.each([
    ['react stars:>100 topic:cli', 'react topic:cli'],
    ['stars:>=1', ''],
    ['stars: x', 'x'],
  ])('%j cleared → %j', (query, expected) => {
    expect(setMinStars(query, null)).toBe(expected)
  })

  it.each(['stars:<50', 'stars:=5', 'stars:5', 'stars:10..100', 'stars:>abc', 'stars:>1 stars:>2', 'stars:>1 OR x'])(
    'only removes %j through its chip, never edits it',
    (query) => {
      expect(setMinStars(query, 7)).toBe(query)
      expect(setMinStars(query, null)).toBe(query)
    },
  )

  it('rejects negative or unsafe numbers', () => {
    expect(setMinStars('x', -1)).toBe('x')
    expect(setMinStars('x', 1.5)).toBe('x')
    expect(setMinStars('x', Number.MAX_SAFE_INTEGER + 1)).toBe('x')
  })
})

describe('setExcludeArchived', () => {
  it.each([
    ['react', true, 'react archived:false'],
    ['react archived: x', true, 'react archived:false x'],
    ['react archived:false topic:cli', false, 'react topic:cli'],
    ['react Archived:FALSE', true, 'react Archived:FALSE'],
    ['react', false, 'react'],
    // Only removable through their chip.
    ['react archived:true', true, 'react archived:true'],
    ['react archived:true', false, 'react archived:true'],
    ['react archived:maybe', true, 'react archived:maybe'],
    ['archived:false archived:true', false, 'archived:false archived:true'],
  ])('%j with exclude=%s → %j', (query, exclude, expected) => {
    expect(setExcludeArchived(query, exclude)).toBe(expected)
  })
})

describe('star wording', () => {
  it.each([
    ['>=1000', '≥ 1,000', 'at least 1,000'],
    ['>100', '> 100', 'more than 100'],
    ['<50', '< 50', 'fewer than 50'],
    ['<=50', '≤ 50', 'at most 50'],
    ['5', '= 5', 'exactly 5'],
    ['10..2000', '10–2,000', '10 to 2,000'],
    ['10..*', '≥ 10', 'at least 10'],
    ['*..10', '≤ 10', 'at most 10'],
  ])('%s', (value, short, words) => {
    const range = parseStars(value)!
    expect(formatStars(range)).toBe(short)
    expect(describeStars(range)).toBe(words)
  })
})
