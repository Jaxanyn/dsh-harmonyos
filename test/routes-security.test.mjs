import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'

test('preview routes reject cross-site and non-loopback requests', async () => {
  const { installHarmonyRoutes } = await import(new URL('../lib/index.mjs', import.meta.url))
  let handler
  const dispose = installHarmonyRoutes({ webServer: { register(route) { handler = route.handler; return () => {} } } })
  const call = async headers => {
    const req = Readable.from([])
    req.method = 'GET'
    req.url = '/_dsh/dsh-harmonyos/devices'
    req.headers = headers
    req.socket = { remoteAddress: headers.remoteAddress }
    let status
    const res = { writeHead(code) { status = code }, end() {} }
    await handler(req, res)
    return status
  }
  try {
    assert.equal(await call({ host: '127.0.0.1:3080', origin: 'http://evil.example', remoteAddress: '127.0.0.1' }), 409)
    assert.equal(await call({ host: '127.0.0.1:3080', remoteAddress: '10.0.0.8' }), 409)
    assert.equal(await call({ host: 'localhost:3080', origin: 'http://localhost:3080', remoteAddress: '::1' }), 200)
  } finally { dispose() }
})
