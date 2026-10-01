import assert from 'node:assert/strict'
import net from 'node:net'
import test from 'node:test'
import { selectE2EPort, resolveE2EPort } from './e2e-port.mjs'

test('selects a usable loopback port', async () => {
  const port = await selectE2EPort()
  assert.ok(port > 0 && port <= 65535)
})
test('rejects invalid explicit ports', async () => {
  for (const value of ['', '0', '-1', '65536', '4.2', 'abc', ' 4173']) {
    await assert.rejects(selectE2EPort(value), /E2E_PORT/)
  }
})
test('rejects an occupied explicit port', async () => {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    await assert.rejects(selectE2EPort(String(server.address().port)), { code: 'EADDRINUSE' })
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})


test('config reloads and workers reuse the runner port while its server is listening', async () => {
  const runnerEnv = {}
  const port = await resolveE2EPort(runnerEnv)
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  try {
    assert.equal(await resolveE2EPort(runnerEnv), port)
    assert.equal(await resolveE2EPort({ ...runnerEnv }), port)
    assert.equal(await resolveE2EPort({ ...runnerEnv, E2E_PORT: String(port) }), port)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
test('config validates inherited ports and rejects explicit-port disagreement', async () => {
  await assert.rejects(resolveE2EPort({ REPO_FINDER_E2E_SELECTED_PORT: 'invalid' }), /integer/)
  await assert.rejects(resolveE2EPort({ REPO_FINDER_E2E_SELECTED_PORT: '4173', E2E_PORT: '0' }), /E2E_PORT/)
  await assert.rejects(resolveE2EPort({ REPO_FINDER_E2E_SELECTED_PORT: '4173', E2E_PORT: '4174' }), /differs/)
})
