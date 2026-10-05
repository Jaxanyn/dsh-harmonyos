import test from 'node:test'
import assert from 'node:assert/strict'

const modulePath = new URL('../lib/index.mjs', import.meta.url)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+WAAAAABJRU5ErkJggg==', 'base64')

function fake(stdout = '') {
  const calls = []
  const executor = async (_file, args, options) => { calls.push({ args, options }); return { stdout, stderr: '' } }
  return { calls, executor }
}

test('HDC adapter validates inputs and uses explicit target plus remote quoting', async () => {
  const { tap, inputText, keyEvent } = await import(modulePath)
  const f = fake()
  await tap('5KLBB25A13202598', 1, 2, { executor: f.executor })
  assert.deepEqual(f.calls[0].args.slice(0, 2), ['-t', '5KLBB25A13202598'])
  assert.match(f.calls[0].args.at(-1), /click.*1.*2/)
  await inputText('5KLBB25A13202598', "a'b; echo pwned", { executor: f.executor })
  assert.match(f.calls[1].args.at(-1), /a.*pwned/)
  await keyEvent('5KLBB25A13202598', 'Back', { executor: f.executor })
  await assert.rejects(() => tap('', 1, 2, { executor: f.executor }), /explicit valid/)
  await assert.rejects(() => keyEvent('5KLBB25A13202598', 'KEY_HOME', { executor: f.executor }), /numeric/)
})

test('uitest contract rejects unsupported long press duration and validates swipe velocity', async () => {
  const { longPress, swipe } = await import(modulePath)
  await assert.rejects(() => longPress('5KLBB25A13202598', 1, 2, 700), /not supported/)
  await assert.rejects(() => swipe('5KLBB25A13202598', 1, 2, 3, 4, 100), /200 to 40000/)
})

test('semantic HDC errors fail despite executor success', async () => {
  const { tap } = await import(modulePath)
  const f = fake('Missing parameter')
  await assert.rejects(() => tap('5KLBB25A13202598', 1, 2, { executor: f.executor }), /command failure/)
})

test('uitest success output "No Error" is accepted', async () => {
  const { tap } = await import(modulePath)
  const f = fake('No Error')
  await tap('5KLBB25A13202598', 1, 2, { executor: f.executor })
})

test('screen capture decodes the single-process base64 stream', async () => {
  const { capture } = await import(modulePath)
  const streamPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  const executor = async (_file, args) => {
    assert.match(args.at(-1), /screenCap.*base64/)
    return { stdout: 'ScreenCap saved\n' + streamPng.toString('base64'), stderr: '' }
  }
  const frame = await capture('5KLBB25A13202598', { executor })
  assert.equal(frame.mimeType, 'image/png')
  assert.equal(frame.width, 1)
  assert.equal(frame.height, 1)
})
