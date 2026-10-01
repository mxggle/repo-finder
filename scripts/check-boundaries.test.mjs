import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { checkBoundaries } from './check-boundaries.mjs'

function check(files, paths) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-'))
  try {
    fs.writeFileSync(path.join(root, 'tsconfig.app.json'), JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'esnext', paths } }))
    for (const [name, text] of Object.entries(files)) {
      const file = path.join(root, 'src', name)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text)
    }
    return checkBoundaries(root)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
const base = {
  'features/search/index.ts': "export { search } from './search'",
  'features/search/search.ts': 'export const search = 1',
  'features/compare/index.ts': "export { compare } from './compare'",
  'features/compare/compare.ts': 'export const compare = 1',
  'domain/repository/index.ts': "export { model } from './model'",
  'domain/repository/model.ts': 'export const model = 1',
  'shared/lib/format.ts': 'export const format = 1',
}
test('allows public APIs, feature peers, pure domain APIs, and cross-layer tests', () => {
  assert.deepEqual(check({ ...base,
    'app/App.ts': "import { search } from '../features/search'; import { model } from '../domain/repository'",
    'features/search/peer.ts': "import { search } from './search'",
    'domain/repository/url.ts': "import { format } from '../../shared/lib/format'; export const url = new URL('https://example.com')",
    'features/compare/compare.test.ts': "import { search } from '../search/search'",
  }), [])
})
test('rejects feature peers across features, app back edges, and shared back edges', () => {
  const errors = check({ ...base,
    'app/App.ts': 'export const app = 1',
    'features/search/bad.ts': "export { compare } from '../compare'; import '../../app/App'",
    'shared/lib/bad.ts': "import '../../domain/repository'",
  }).join('\n')
  assert.match(errors, /feature cannot import app or another feature/)
  assert.match(errors, /shared cannot import/)
})
test('catches relative, resolved alias, re-export, and dynamic public API bypasses', () => {
  const errors = check({ ...base,
    'app/relative.ts': "export { model } from '../domain/repository/model'",
    'app/alias.ts': "import { search } from '@feature/search/search'",
    'app/dynamic.ts': "import('../features/search/search')",
  }, { '@feature/*': ['./src/features/*'] }).join('\n')
  assert.match(errors, /external domain imports/)
  assert.equal((errors.match(/external feature imports/g) ?? []).length, 2)
})
test('rejects unresolved aliases, computed imports, Node imports, and production test dependencies', () => {
  const errors = check({ ...base,
    'features/search/testing.ts': 'export const fixture = 1',
    'app/bad.ts': "import '@/missing'; import('node:fs'); import('../features/search/testing'); import(variable)",
  }).join('\n')
  for (const pattern of [/unresolved internal/, /Node module/, /production source cannot import tests/, /computed module/]) assert.match(errors, pattern)
})
test('keeps domain runtime-neutral while permitting standard language APIs', () => {
  const errors = check({ ...base,
    'shared/ui/Button.ts': 'export const Button = 1',
    'domain/repository/bad.ts': "import '../../shared/ui/Button'; export const load = () => window.fetch('x'); globalThis.fetch('x')",
  }).join('\n')
  assert.match(errors, /domain cannot import/)
  assert.match(errors, /runtime global window/)
  assert.match(errors, /runtime global fetch/)
})
test('requires explicit feature public reexports', () => {
  const errors = check({ ...base,
    'features/search/index.ts': "export * from './search'; export const hidden = 1",
  }).join('\n')
  assert.match(errors, /name its exports explicitly/)
  assert.match(errors, /only explicit re-exports/)
})


test('domain rejects UI runtimes including subpaths and type imports obey boundaries', () => {
  const errors = check({ ...base,
    'domain/repository/bad.ts': "import 'react'; import 'react-dom/client'; import '@tanstack/react-query'; import 'react/jsx-runtime'",
    'app/type.ts': "type Internal = import('../features/search/search').Internal",
  }).join('\n')
  assert.equal((errors.match(/domain cannot import React/g) ?? []).length, 4)
  assert.match(errors, /external feature imports/)
})
