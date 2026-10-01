import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetRateLimitGate } from '../features/search/github'
import { server } from './server'

// jsdom has no layout engine, so it does not implement scrolling.
Element.prototype.scrollIntoView ??= () => {}

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  resetRateLimitGate()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterAll(() => server.close())
