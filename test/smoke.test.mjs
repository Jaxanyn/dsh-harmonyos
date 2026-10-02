import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

test('plugin package has host and client entry sources', () => {
  assert.equal(existsSync(new URL('../src/index.ts', import.meta.url)), true)
  assert.equal(existsSync(new URL('../src/client/index.tsx', import.meta.url)), true)
})
