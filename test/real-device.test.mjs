import test from 'node:test'
import assert from 'node:assert/strict'

const modulePath = new URL('../lib/index.mjs', import.meta.url)

test('connected HarmonyOS device can be listed and captured', async () => {
  const { listDevices, capture } = await import(modulePath)
  const devices = await listDevices()
  assert.ok(devices.length > 0)
  const frame = await capture(devices[0].serial)
  assert.equal(frame.mimeType, 'image/png')
  assert.deepEqual([...frame.data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})
