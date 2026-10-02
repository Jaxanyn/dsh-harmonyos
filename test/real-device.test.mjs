import test from 'node:test'
import assert from 'node:assert/strict'

const modulePath = new URL('../lib/index.mjs', import.meta.url)
const device = process.env.HARMONY_DEVICE

test('opt-in device can be listed and captured', { skip: !device }, async () => {
  const { listDevices, capture } = await import(modulePath)
  const devices = await listDevices()
  assert.ok(devices.some(item => item.serial === device), 'HARMONY_DEVICE is not connected')
  const frame = await capture(device)
  assert.equal(frame.mimeType, 'image/png')
  assert.ok(frame.width > 0 && frame.height > 0)
  assert.deepEqual([...frame.data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
})
