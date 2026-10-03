import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

test('plugin package has host and client entry sources', () => {
  assert.equal(existsSync(new URL('../src/index.ts', import.meta.url)), true)
  assert.equal(existsSync(new URL('../src/client/index.tsx', import.meta.url)), true)
})

test('package manifest supports Git dependency builds', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal(manifest.name, 'dsh-harmonyos-plugin')
  assert.equal(manifest.scripts.prepare, 'pnpm run build')
  assert.match(patch, /name:\s*['"]dsh-harmonyos-plugin['"]?/)
})
