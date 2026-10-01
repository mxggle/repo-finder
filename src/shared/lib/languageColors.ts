// Dot colours for the most common languages, taken from GitHub's linguist palette.
// Anything else falls back to a neutral colour in CSS.
const LANGUAGE_COLORS: Record<string, string> = {
  C: '#555555',
  'C#': '#178600',
  'C++': '#f34b7d',
  CSS: '#663399',
  Dart: '#00b4ab',
  Elixir: '#6e4a7e',
  Go: '#00add8',
  HTML: '#e34c26',
  Java: '#b07219',
  JavaScript: '#f1e05a',
  'Jupyter Notebook': '#da5b0b',
  Kotlin: '#a97bff',
  Lua: '#000080',
  PHP: '#4f5d95',
  Python: '#3572a5',
  Ruby: '#701516',
  Rust: '#dea584',
  Scala: '#c22d40',
  Shell: '#89e051',
  Swift: '#f05138',
  TypeScript: '#3178c6',
  Vue: '#41b883',
  Zig: '#ec915c',
}

export function languageColor(language: string): string | undefined {
  return LANGUAGE_COLORS[language]
}
