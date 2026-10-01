/**
 * Two-way mapping between the search text and the filter controls.
 *
 * Only three qualifiers are understood: `language:`, `stars:` and `archived:`. Everything else
 * (free text, other qualifiers, operators, spacing) is preserved verbatim. Edits replace, insert
 * or remove a single token in place; they never re-serialise the whole query. This is a small
 * quote-aware tokeniser, not a GitHub search grammar.
 */

/** A whitespace-separated term; whitespace inside a closed pair of double quotes belongs to it. */
export type QueryToken = { start: number; end: number; text: string }

export type FilterKind = 'language' | 'stars' | 'archived'

export type StarsRange =
  | { op: '>' | '>=' | '<' | '<=' | '='; value: number }
  /** `N..M`; `*` (unbounded) is null. */
  | { op: '..'; min: number | null; max: number | null }

export type LanguageValue = {
  /** What to show: a known language's canonical name, otherwise the value as typed (unquoted). */
  label: string
  /** The value without quotes, as written in the query. */
  raw: string
}

export type LockReason = 'duplicate' | 'complex'

/**
 * - `absent`: no such qualifier.
 * - `empty`: a lone qualifier without a value yet (`language:`, `stars:>` while typing); filling
 *   it edits in place.
 * - `set`: exactly one qualifier with a valid value.
 * - `invalid`: exactly one qualifier whose value cannot be understood (`stars:>abc`). It can be removed.
 * - `locked`: more than one (`duplicate`), or next to AND/OR or inside brackets (`complex`).
 *   The text stays authoritative; controls must not edit it.
 */
export type FilterSlot<T> =
  | { status: 'absent' }
  | { status: 'empty'; token: QueryToken }
  | { status: 'set'; value: T; token: QueryToken }
  | { status: 'invalid'; token: QueryToken }
  | { status: 'locked'; reason: LockReason; tokens: QueryToken[] }

export type QueryFilters = {
  language: FilterSlot<LanguageValue>
  stars: FilterSlot<StarsRange>
  archived: FilterSlot<boolean>
}

const QUALIFIER = /^(-?)(language|stars|archived):([\s\S]*)$/i
/** Binary operators; `NOT` only negates the term after it. */
const OPERATORS = new Set(['AND', 'OR'])
/** `stars:>` or `stars:10..` while the number is still being typed. */
const UNFINISHED_STARS = /^(?:[<>]=?|(?:\d+|\*)\.\.)$/

/** Splits on whitespace, keeping `"quoted phrases"` whole. An unclosed quote is literal text. */
export function tokenize(query: string): QueryToken[] {
  const tokens: QueryToken[] = []
  let index = 0
  while (index < query.length) {
    if (/\s/.test(query[index])) {
      index++
      continue
    }
    const start = index
    let quoted = false
    while (index < query.length && (quoted || !/\s/.test(query[index]))) {
      if (query[index] === '"') quoted = !quoted
      index++
    }
    if (quoted) {
      // The quote never closed: treat it as an ordinary character so it cannot swallow the rest.
      index = start
      while (index < query.length && !/\s/.test(query[index])) index++
    }
    tokens.push({ start, end: index, text: query.slice(start, index) })
  }
  return tokens
}

type Occurrence = {
  kind: FilterKind
  token: QueryToken
  /** The qualifier name as written, e.g. `Language:`. */
  name: string
  value: string
  negated: boolean
  complex: boolean
}

function occurrences(query: string): Occurrence[] {
  const tokens = tokenize(query)
  const found: Occurrence[] = []
  let depth = 0
  tokens.forEach((token, index) => {
    const opening = /^\(+/.exec(token.text)?.[0].length ?? 0
    depth += opening
    const inner = token.text.slice(opening)
    const closing = /\)+$/.exec(inner)?.[0].length ?? 0
    const body = inner.slice(0, inner.length - closing)
    const grouped = depth > 0
    depth = Math.max(0, depth - closing)

    const match = QUALIFIER.exec(body)
    if (!match) return
    const [, minus, name, value] = match
    const previous = tokens[index - 1]?.text
    const next = tokens[index + 1]?.text
    found.push({
      kind: name.toLowerCase() as FilterKind,
      token,
      name: `${name}:`,
      value,
      negated: minus === '-' || previous === 'NOT',
      complex: grouped || (previous !== undefined && OPERATORS.has(previous)) || (next !== undefined && OPERATORS.has(next)),
    })
  })
  return found
}

function unquote(value: string): string | null {
  if (!value.includes('"')) return value
  const match = /^"([^"]*)"$/.exec(value)
  return match ? match[1] : null
}

const INTEGER = /^\d+$/

function toCount(text: string): number | null {
  if (!INTEGER.test(text)) return null
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : null
}

export function parseStars(value: string): StarsRange | null {
  const comparison = /^(>=|<=|>|<)?(\d+)$/.exec(value)
  if (comparison) {
    const count = toCount(comparison[2])
    if (count === null) return null
    return { op: (comparison[1] ?? '=') as '>' | '>=' | '<' | '<=' | '=', value: count }
  }
  const range = /^(\d+|\*)\.\.(\d+|\*)$/.exec(value)
  if (!range) return null
  const min = range[1] === '*' ? null : toCount(range[1])
  const max = range[2] === '*' ? null : toCount(range[2])
  if ((min === null && range[1] !== '*') || (max === null && range[2] !== '*')) return null
  if (min === null && max === null) return null
  return { op: '..', min, max }
}

function parseValue(kind: FilterKind, value: string, languages: readonly string[]) {
  if (kind === 'language') {
    const raw = unquote(value)
    if (raw === null || !raw.trim()) return null
    const known = languages.find((language) => language.toLowerCase() === raw.toLowerCase())
    return { label: known ?? raw, raw } satisfies LanguageValue
  }
  if (kind === 'stars') return parseStars(value)
  const lower = value.toLowerCase()
  return lower === 'true' ? true : lower === 'false' ? false : null
}

function slotFor<T>(kind: FilterKind, all: Occurrence[], languages: readonly string[]): FilterSlot<T> {
  const mine = all.filter((occurrence) => occurrence.kind === kind && !occurrence.negated)
  if (mine.length === 0) {
    // A negated qualifier inside a group still makes the positive one ambiguous to edit.
    const groupedNegation = all.filter((occurrence) => occurrence.kind === kind && occurrence.complex)
    return groupedNegation.length
      ? { status: 'locked', reason: 'complex', tokens: groupedNegation.map(({ token }) => token) }
      : { status: 'absent' }
  }
  if (mine.some(({ complex }) => complex)) return { status: 'locked', reason: 'complex', tokens: mine.map(({ token }) => token) }
  if (mine.length > 1) return { status: 'locked', reason: 'duplicate', tokens: mine.map(({ token }) => token) }
  const [{ token, value }] = mine
  if (value === '' || (kind === 'stars' && UNFINISHED_STARS.test(value))) return { status: 'empty', token }
  const parsed = parseValue(kind, value, languages)
  return parsed === null ? { status: 'invalid', token } : { status: 'set', value: parsed as T, token }
}

/**
 * Reads the supported filters from the query. `languages` supplies canonical display names
 * (for example `typescript` shows as `TypeScript`).
 */
export function parseFilters(query: string, languages: readonly string[] = []): QueryFilters {
  const all = occurrences(query)
  return {
    language: slotFor<LanguageValue>('language', all, languages),
    stars: slotFor<StarsRange>('stars', all, languages),
    archived: slotFor<boolean>('archived', all, languages),
  }
}

/* ---------- Editing ---------- */

function replaceToken(query: string, token: QueryToken, text: string): string {
  return query.slice(0, token.start) + text + query.slice(token.end)
}

function appendToken(query: string, text: string): string {
  if (query === '' || /\s$/.test(query)) return query + text
  return `${query} ${text}`
}

/** Removes a token and the whitespace that separated it from its neighbour. */
export function removeToken(query: string, token: QueryToken): string {
  const before = query.slice(0, token.start)
  const after = query.slice(token.end)
  // Last token: drop the separator before it, keep any trailing whitespace the user typed.
  if (after.trim() === '') return before.trimEnd() + after
  return before + after.replace(/^\s+/, '')
}

/** The occurrence behind a slot, so edits can keep the qualifier's original spelling. */
function occurrenceAt(query: string, token: QueryToken): Occurrence | undefined {
  return occurrences(query).find((occurrence) => occurrence.token.start === token.start)
}

/** Rewrites the value of an editable token, keeping any surrounding parentheses and the name's case. */
function withValue(query: string, token: QueryToken, value: string): string {
  const occurrence = occurrenceAt(query, token)
  const name = occurrence?.name ?? ''
  const at = token.text.indexOf(name)
  const prefix = token.text.slice(0, at + name.length)
  const suffix = token.text.slice(at + name.length + (occurrence?.value.length ?? 0))
  return replaceToken(query, token, prefix + value + suffix)
}

function formatLanguage(language: string, quote: boolean): string {
  const value = language.toLowerCase()
  return quote || /\s/.test(value) ? `"${value}"` : value
}

/**
 * Sets (or with null, removes) the single `language:` filter. A locked slot, or setting the
 * value already present (ignoring case and quotes), returns the query unchanged.
 */
export function setLanguage(query: string, language: string | null): string {
  const slot = parseFilters(query).language
  if (slot.status === 'locked') return query
  if (language === null || !language.trim()) return slot.status === 'absent' ? query : removeToken(query, slot.token)
  if (slot.status === 'absent') return appendToken(query, `language:${formatLanguage(language, false)}`)
  if (slot.status === 'set' && slot.value.raw.toLowerCase() === language.toLowerCase()) return query
  const quoted = slot.status === 'set' && (occurrenceAt(query, slot.token)?.value.startsWith('"') ?? false)
  return withValue(query, slot.token, formatLanguage(language, quoted))
}

/** True when the stars filter is a lower bound the minimum-stars control can edit. */
export function isMinStars(range: StarsRange): range is { op: '>' | '>='; value: number } {
  return range.op === '>' || range.op === '>='
}

/**
 * Sets (or with null, removes) a minimum-stars filter. A new filter is written `stars:>=N`;
 * an existing `>N` keeps its operator. Upper bounds, exact values, ranges, invalid and locked
 * values are only removable, so they return the query unchanged.
 */
export function setMinStars(query: string, min: number | null): string {
  const slot = parseFilters(query).stars
  if (slot.status === 'locked' || slot.status === 'invalid') return query
  if (min === null) return slot.status === 'absent' || (slot.status === 'set' && !isMinStars(slot.value)) ? query : removeToken(query, slot.token)
  if (!Number.isSafeInteger(min) || min < 0) return query
  if (slot.status === 'absent') return appendToken(query, `stars:>=${min}`)
  if (slot.status === 'empty') return withValue(query, slot.token, `>=${min}`)
  const range = slot.value
  if (!isMinStars(range)) return query
  if (range.value === min) return query
  return withValue(query, slot.token, `${range.op}${min}`)
}

/**
 * Adds or removes `archived:false`. `archived:true`, invalid and locked values are only
 * removable, so they return the query unchanged.
 */
export function setExcludeArchived(query: string, exclude: boolean): string {
  const slot = parseFilters(query).archived
  if (slot.status === 'locked' || slot.status === 'invalid') return query
  if (slot.status === 'set' && slot.value) return query
  if (exclude) {
    if (slot.status === 'absent') return appendToken(query, 'archived:false')
    if (slot.status === 'empty') return withValue(query, slot.token, 'false')
    return query
  }
  return slot.status === 'absent' ? query : removeToken(query, slot.token)
}

/* ---------- Presentation ---------- */

const count = new Intl.NumberFormat('en')

/** Compact, faithful symbols: `≥ 100`, `> 100`, `10–100`. */
export function formatStars(range: StarsRange): string {
  switch (range.op) {
    case '>=':
      return `≥ ${count.format(range.value)}`
    case '<=':
      return `≤ ${count.format(range.value)}`
    case '=':
      return `= ${count.format(range.value)}`
    case '..':
      if (range.min === null) return `≤ ${count.format(range.max!)}`
      if (range.max === null) return `≥ ${count.format(range.min)}`
      return `${count.format(range.min)}–${count.format(range.max)}`
    case '>':
    case '<':
      return `${range.op} ${count.format(range.value)}`
  }
}

/** Words for screen readers: `at least 100`, `more than 100`, `10 to 100`. */
export function describeStars(range: StarsRange): string {
  switch (range.op) {
    case '>=':
      return `at least ${count.format(range.value)}`
    case '>':
      return `more than ${count.format(range.value)}`
    case '<=':
      return `at most ${count.format(range.value)}`
    case '<':
      return `fewer than ${count.format(range.value)}`
    case '=':
      return `exactly ${count.format(range.value)}`
    case '..':
      if (range.min === null) return `at most ${count.format(range.max!)}`
      if (range.max === null) return `at least ${count.format(range.min)}`
      return `${count.format(range.min)} to ${count.format(range.max)}`
  }
}
