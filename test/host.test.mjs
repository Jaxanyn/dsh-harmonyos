import test from 'node:test'
import assert from 'node:assert/strict'

test('host registers and disposes every HarmonyOS tool', async () => {
  const { apply, harmonyTools } = await import(new URL('../lib/index.mjs', import.meta.url))
  const registered = []
  const disposed = []
  const ctx = { tools: { register(tool) { registered.push(tool.name); return () => disposed.push(tool.name) } } }
  const dispose = apply(ctx)
  assert.deepEqual(registered, harmonyTools.map(tool => tool.name))
  dispose()
  assert.deepEqual(disposed, registered)
})
