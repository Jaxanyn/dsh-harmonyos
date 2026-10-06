import test from 'node:test'
import assert from 'node:assert/strict'

test('registers the current HarmonyOS tool surface', async () => {
  const { harmonyTools } = await import(new URL('../lib/index.mjs', import.meta.url))
  assert.deepEqual(harmonyTools.map(tool => tool.name), [
    'harmony_devices',
    'harmony_list_apps',
    'harmony_launch_app',
    'harmony_preview_start',
    'harmony_preview_stop',
    'harmony_preview_info',
    'harmony_screenshot',
    'harmony_interact',
    'harmony_build_run',
  ])
})
