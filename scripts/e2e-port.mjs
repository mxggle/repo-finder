import net from 'node:net'

/** The probe releases its port before Vite starts; strictPort turns a race into a failure. */
export async function selectE2EPort(value = process.env.E2E_PORT) {
  if (value !== undefined && (!/^[1-9]\d*$/.test(value) || Number(value) > 65535)) {
    throw new Error('E2E_PORT must be an integer between 1 and 65535')
  }
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(value === undefined ? 0 : Number(value), '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

const selectedPortKey = 'REPO_FINDER_E2E_SELECTED_PORT'

/** Config reloads and Playwright workers inherit this value from the runner. */
export async function resolveE2EPort(env = process.env) {
  for (const key of ['E2E_PORT', selectedPortKey]) {
    if (env[key] !== undefined && (!/^[1-9]\d*$/.test(env[key]) || Number(env[key]) > 65535)) {
      throw new Error(`${key} must be an integer between 1 and 65535`)
    }
  }
  if (env[selectedPortKey] !== undefined) {
    if (env.E2E_PORT !== undefined && env.E2E_PORT !== env[selectedPortKey]) {
      throw new Error('E2E_PORT differs from the runner-selected port')
    }
    return Number(env[selectedPortKey])
  }
  const port = await selectE2EPort(env.E2E_PORT)
  env[selectedPortKey] = String(port)
  return port
}
