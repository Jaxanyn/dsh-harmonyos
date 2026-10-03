import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

const { buildAndRun } = await import(new URL('../lib/index.mjs', import.meta.url))

async function project() {
  const root = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'dsh-build-'))
  await writeFile(join(root, 'build-profile.json5'), '{}')
  await writeFile(join(root, 'hvigorw.js'), '')
  return root
}
const base = { deviceId: 'device-1', bundleName: 'com.example.app', abilityName: 'EntryAbility', module: 'entry', product: 'default', target: 'default' }

test('build invokes node hvigor with exact arguments and installs then launches fresh signed HAP', async () => {
  const root = await project(); const calls = []
  try {
    const result = await buildAndRun({ ...base, projectPath: root, runner: async (file, args, options) => { calls.push(['build', file, args, options]); await writeFile(join(root, 'entry-default-signed.hap'), 'hap') }, install: async (...args) => calls.push(['install', ...args]), launch: async (...args) => calls.push(['launch', ...args]) })
    assert.equal(result.built, true); assert.deepEqual(calls.map(x => x[0]), ['build', 'install', 'launch'])
    assert.deepEqual(calls[0][2], ['assembleHap', '--mode', 'module', '-p', 'product=default', '-p', 'module=entry@default', '-p', 'buildMode=debug'])
    assert.equal(calls[0][3].cwd, root)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('build failure never installs', async () => {
  const root = await project(); let installed = false
  try { await assert.rejects(() => buildAndRun({ ...base, projectPath: root, runner: async () => { throw Object.assign(new Error('failed'), { stderr: 'useful tail' }) }, install: async () => { installed = true } }), /build failed.*useful tail/s); assert.equal(installed, false) }
  finally { await rm(root, { recursive: true, force: true }) }
})

test('explicit artifact must be an existing signed HAP inside project', async () => {
  const root = await project(); const outside = join(root, '..', 'unsigned.hap')
  try { await writeFile(outside, 'x'); await assert.rejects(() => buildAndRun({ ...base, projectPath: root, hapPath: outside, install: async () => {}, launch: async () => {} }), /signed .hap/) }
  finally { await rm(root, { recursive: true, force: true }); await rm(outside, { force: true }) }
})
