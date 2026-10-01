// Local build-size and performance measurement for the production build.
//
//   pnpm build && node scripts/perf.mjs [--runs 7] [--cpu 4] [--port 4312] [--json]
//
// Serves dist/ with `vite preview`, then measures in Playwright Chromium with a fixed
// 1280x720 viewport, CDP CPU throttling and GitHub responses mocked (answered
// immediately, so timings are the app's own work). Each run uses a fresh browser
// context (cold HTTP cache and storage). Results are local and machine-dependent:
// compare runs on the same machine, do not treat them as field data.
// Not part of `pnpm check`; see docs/quality-report.md for recorded results.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import zlib from 'node:zlib'
import { chromium } from '@playwright/test'

const root = path.resolve(import.meta.dirname, '..')
const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '7' },
    cpu: { type: 'string', default: '4' },
    port: { type: 'string', default: process.env.PERF_PORT ?? '4312' },
    json: { type: 'boolean', default: false },
  },
})
const RUNS = Number(args.runs)
const CPU = Number(args.cpu)
const BASE = `http://127.0.0.1:${args.port}`

// ---------- Build output ----------

function buildSizes() {
  const dist = path.join(root, 'dist')
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('dist/ is missing; run `pnpm build` first')
  const files = ['index.html', ...fs.readdirSync(path.join(dist, 'assets')).map((name) => `assets/${name}`)]
  return files
    .filter((file) => /\.(html|js|css)$/.test(file))
    .map((file) => {
      const content = fs.readFileSync(path.join(dist, file))
      return {
        file,
        raw: content.length,
        gzip: zlib.gzipSync(content, { level: 9 }).length,
        brotli: zlib.brotliCompressSync(content).length,
      }
    })
}

// ---------- Mocked API ----------

function searchBody(page, total = 95) {
  const start = (page - 1) * 20
  const count = Math.max(0, Math.min(20, total - start))
  return {
    total_count: total,
    incomplete_results: false,
    items: Array.from({ length: count }, (_, index) => {
      const id = start + index + 1
      return {
        id,
        full_name: `octo-org/project-${id}`,
        owner: { login: 'octo-org', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
        html_url: `https://github.com/octo-org/project-${id}`,
        description: `Description for project-${id}`,
        language: 'TypeScript',
        stargazers_count: 1000 + id,
        forks_count: 100 + id,
        topics: ['search', 'react'],
        license: { spdx_id: 'MIT', name: 'MIT License' },
        updated_at: '2026-09-01T12:00:00Z',
        archived: false,
        fork: false,
      }
    }),
  }
}

// ---------- In-page instrumentation ----------

function instrument() {
  const perf = { lcp: 0, cls: 0, longTasks: [], resultsAt: null, heading21At: null, submitAt: null, clickAt: null }
  window.__perf = perf
  const observe = (type, callback) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(callback)).observe({ type, buffered: true })
    } catch {
      // Unsupported entry type.
    }
  }
  observe('largest-contentful-paint', (entry) => (perf.lcp = entry.startTime))
  observe('layout-shift', (entry) => !entry.hadRecentInput && (perf.cls += entry.value))
  observe('longtask', (entry) => perf.longTasks.push([entry.startTime, entry.duration]))
  addEventListener('submit', () => (perf.submitAt = performance.now()), true)
  addEventListener('click', (event) => event.target.closest?.('.pagination') && (perf.clickAt = performance.now()), true)
  new MutationObserver(() => {
    if (perf.resultsAt === null && document.querySelectorAll('.repo-list > li > article').length >= 20)
      perf.resultsAt = performance.now()
    if (perf.heading21At === null && document.querySelector('.results__heading')?.textContent.includes('21–40'))
      perf.heading21At = performance.now()
  }).observe(document, { subtree: true, childList: true, characterData: true })
}

const blockingTime = (tasks, from, to = Infinity) =>
  tasks.filter(([start]) => start >= from && start <= to).reduce((sum, [, duration]) => sum + Math.max(0, duration - 50), 0)

// ---------- Scenarios ----------

async function newPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  await page.addInitScript(instrument)
  await page.route('https://avatars.githubusercontent.com/**', (route) => route.abort())
  await page.route('https://api.github.com/**', (route) => {
    const page = Number(new URL(route.request().url()).searchParams.get('page') ?? '1')
    return route.fulfill({ json: searchBody(page) })
  })
  return { context, page }
}

async function measureRun(browser) {
  const result = {}

  // 1. Cold load of the landing page.
  {
    const { context, page } = await newPage(browser)
    await page.goto(BASE, { waitUntil: 'load' })
    await page.waitForTimeout(1_500) // let LCP and long tasks settle
    const data = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0]
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
      const bytes = performance.getEntriesByType('resource').reduce((sum, entry) => sum + entry.encodedBodySize, 0)
      return { ...window.__perf, fcp, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, bytes: bytes + nav.encodedBodySize }
    })
    Object.assign(result, {
      'Landing FCP': data.fcp,
      'Landing LCP': data.lcp,
      'Landing DOMContentLoaded': data.dcl,
      'Landing load event': data.load,
      'Landing TBT (after FCP)': blockingTime(data.longTasks, data.fcp),
      // TBT ignores work before FCP, which is where script evaluation happens.
      'Landing long tasks, total (incl. before FCP)': data.longTasks.reduce((sum, [, duration]) => sum + duration, 0),
      'Landing CLS': data.cls,
      'Landing transferred bytes': data.bytes,
    })

    // 2. Submit a search on the loaded page until 20 result cards are in the DOM.
    const input = page.getByRole('combobox', { name: 'Search repositories' })
    await input.fill('react')
    await input.press('Enter')
    await page.waitForFunction(() => window.__perf.resultsAt !== null)
    await page.waitForTimeout(500)
    const submit = await page.evaluate(() => window.__perf)
    result['Submit → 20 results rendered'] = submit.resultsAt - submit.submitAt
    result['Submit blocking time (>50 ms parts)'] = blockingTime(submit.longTasks, submit.submitAt)

    // 3. Next page until the heading shows the new range.
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: /Next/ }).click()
    await page.waitForFunction(() => window.__perf.heading21At !== null)
    const next = await page.evaluate(() => window.__perf)
    result['Next page → new range rendered'] = next.heading21At - next.clickAt
    await context.close()
  }

  // 4. Cold load of a shared results URL until 20 cards are in the DOM.
  {
    const { context, page } = await newPage(browser)
    await page.goto(`${BASE}/?q=react`, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__perf.resultsAt !== null)
    await page.waitForTimeout(1_000)
    const data = await page.evaluate(() => window.__perf)
    result['Results URL: navigation → 20 results rendered'] = data.resultsAt
    result['Results URL LCP'] = data.lcp
    result['Results URL CLS'] = data.cls
    await context.close()
  }
  return result
}

// ---------- Runner ----------

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function waitForServer(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview server did not start at ${url}`)
}

const sizes = buildSizes()
const server = spawn(
  path.join(root, 'node_modules/.bin/vite'),
  ['preview', '--host', '127.0.0.1', '--port', args.port, '--strictPort'],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
)
let browser
try {
  await waitForServer(BASE)
  browser = await chromium.launch()
  await measureRun(browser) // warm-up run, discarded (first-launch and disk effects)
  const runs = []
  for (let run = 0; run < RUNS; run++) runs.push(await measureRun(browser))

  const environment = {
    date: new Date().toISOString(),
    os: `${os.type()} ${os.release()} (${os.arch()})`,
    cpu: `${os.cpus()[0].model}, ${os.cpus().length} logical cores`,
    memoryGiB: Math.round(os.totalmem() / 2 ** 30),
    node: process.version,
    browser: `Chromium ${browser.version()} (Playwright, headless)`,
    conditions: `viewport 1280x720 @1x, CPU throttling ${CPU}x (CDP), no network throttling, local vite preview, ` +
      `GitHub API mocked (instant), fresh context per run, ${RUNS} runs + 1 discarded warm-up`,
  }
  const metrics = Object.keys(runs[0]).map((name) => {
    const values = runs.map((run) => run[name])
    return { name, median: median(values), min: Math.min(...values), max: Math.max(...values) }
  })

  if (args.json) {
    console.log(JSON.stringify({ environment, sizes, metrics, runs }, null, 2))
  } else {
    const kb = (bytes) => `${(bytes / 1000).toFixed(2)} kB` // as Vite reports
    const fmt = (name, value) =>
      name.includes('CLS') ? value.toFixed(3) : name.includes('bytes') ? kb(value) : `${Math.round(value)} ms`
    console.log('Environment')
    for (const [key, value] of Object.entries(environment)) console.log(`  ${key}: ${value}`)
    console.log('\n| File | Raw | gzip -9 | brotli |\n| --- | --- | --- | --- |')
    for (const size of sizes) console.log(`| ${size.file} | ${kb(size.raw)} | ${kb(size.gzip)} | ${kb(size.brotli)} |`)
    console.log('\n| Metric | Median | Min | Max |\n| --- | --- | --- | --- |')
    for (const metric of metrics)
      console.log(`| ${metric.name} | ${fmt(metric.name, metric.median)} | ${fmt(metric.name, metric.min)} | ${fmt(metric.name, metric.max)} |`)
  }
} finally {
  await browser?.close()
  server.kill()
}
