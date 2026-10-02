import test from 'node:test'
import assert from 'node:assert/strict'

const modulePath = new URL('../lib/index.mjs', import.meta.url)

test('HDC adapter rejects invalid coordinates before dispatch', async () => {
  const { tap, inputText } = await import(modulePath)
  await assert.rejects(() => tap('device', -1, 0), /non-negative/)
  await assert.rejects(() => inputText('device', ''), /1 to 4096/)
})
