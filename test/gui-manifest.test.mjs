import test from 'node:test'
import assert from 'node:assert/strict'

test('running DSH GUI boot manifest includes the HarmonyOS client', async () => {
  const response = await fetch(process.env.DSH_GUI_URL ?? 'http://127.0.0.1:3080/')
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /"id":"dsh-harmonyos-plugin"/)
})
