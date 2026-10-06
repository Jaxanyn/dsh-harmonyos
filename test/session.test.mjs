import assert from 'node:assert/strict'
import test from 'node:test'

test('preview refresh cadence is faster while a device is being controlled', async () => {
  const { previewRefreshDelayMs } = await import('../lib/index.mjs?session-test=' + Date.now())
  assert.equal(previewRefreshDelayMs(1000, 1200), 180)
  assert.equal(previewRefreshDelayMs(1200, 1200), 900)
  assert.equal(previewRefreshDelayMs(5000, 1200), 900)
})
