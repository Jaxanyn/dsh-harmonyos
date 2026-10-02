import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

const deviceId = process.env.HARMONY_DEVICE

test('preview routes issue scoped token and serve latest frame', { skip: !deviceId }, async () => {
  const { installHarmonyRoutes } = await import(new URL('../lib/index.mjs', import.meta.url))
  let handler
  const dispose = installHarmonyRoutes({ webServer: { register(route) { handler = route.handler; return () => {} } } })
  const call = async (method, path, body, headers = {}) => {
    const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)])
    req.method = method
    req.url = path
    req.headers = headers
    let status; let responseHeaders; let chunks = []
    const res = { writeHead(code, values) { status = code; responseHeaders = values }, end(value) { if (value) chunks.push(Buffer.from(value)) } }
    await handler(req, res)
    const buffer = Buffer.concat(chunks)
    const contentType = String(responseHeaders?.['content-type'] ?? '')
    return { status, headers: responseHeaders ?? {}, body: buffer, json: contentType.includes('json') && buffer.length ? JSON.parse(buffer.toString('utf8')) : undefined }
  }
  try {
    const devices = await call('GET', '/_dsh/dsh-harmonyos/devices')
    assert.ok(devices.json.devices.some(item => item.serial === deviceId))
    const started = await call('POST', '/_dsh/dsh-harmonyos/start', { deviceId })
    assert.equal(started.status, 200)
    const sessionId = started.json.sessionId
    const grant = await call('POST', '/_dsh/dsh-harmonyos/grant', { sessionId })
    assert.equal(grant.status, 200)
    const frame = await call('GET', '/_dsh/dsh-harmonyos/frame?sessionId=' + sessionId + '&token=' + encodeURIComponent(grant.json.token))
    assert.equal(frame.status, 200)
    assert.deepEqual([...frame.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
    assert.ok(Number(frame.headers['x-frame-id']) > 0)
    const denied = await call('GET', '/_dsh/dsh-harmonyos/status?sessionId=' + sessionId + '&token=bad')
    assert.equal(denied.status, 409)
    await call('POST', '/_dsh/dsh-harmonyos/stop', { sessionId }, { authorization: 'Bearer ' + grant.json.token })
  } finally { dispose() }
})
